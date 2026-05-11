# Review Plan Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a persistent review-plan workflow where admins choose the active unit scope and each student receives stable daily review tasks from that scope.

**Architecture:** Extend the current Express/EJS/SQLite app with review-plan tables, query helpers, an admin plan page, and plan-aware scheduling. Daily tasks are generated once per student per day and stored in `daily_review_tasks`, then reused by the existing practice exercise generator.

**Tech Stack:** Node.js, Express, EJS, better-sqlite3, Jest, plain CSS.

---

## File Structure

- Modify `db/init.js`: create `review_plans`, `review_plan_units`, and `daily_review_tasks` tables plus indexes.
- Modify `db/queries.js`: add active-plan, plan-unit, item-scope, and daily-task helpers.
- Modify `engine/scheduler.js`: add plan-aware persistent daily task generation while keeping existing cycle helpers.
- Modify `routes/admin.js`: add admin review-plan routes.
- Modify `routes/practice.js`: use saved daily tasks for student practice.
- Modify `views/layout.ejs`: add admin Review Plan navigation.
- Create `views/admin/review-plan.ejs`: review-plan configuration page.
- Modify `views/practice/dashboard.ejs`: show today's review summary and plan empty state.
- Modify `public/style.css` and/or `public/review.css`: add restrained review-plan layout styling if existing classes are insufficient.
- Modify `tests/db-init.test.js`: cover new schema.
- Create `tests/review-plan-queries.test.js`: cover plan activation and saved task helpers.
- Create `tests/review-plan-scheduler.test.js`: cover day 1, day 2-5, day 6/7, scope, mastery, and saved-task reuse.
- Modify `tests/server.test.js` or create `tests/review-plan-routes.test.js`: cover protected admin routes and student empty state.
- Modify `tests/ui-text.test.js`: include new view and required Chinese UI text.

---

### Task 1: Database Schema And Query Helpers

**Files:**
- Modify: `db/init.js`
- Modify: `db/queries.js`
- Modify: `tests/db-init.test.js`
- Create: `tests/review-plan-queries.test.js`

- [ ] **Step 1: Write failing schema tests**

Add these tests to `tests/db-init.test.js` after the existing table test:

```js
test('initDatabase creates review plan tables', () => {
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
  ).all().map(r => r.name);

  expect(tables).toContain('review_plans');
  expect(tables).toContain('review_plan_units');
  expect(tables).toContain('daily_review_tasks');
});

test('daily_review_tasks prevents duplicate item assignment for the same student and date', () => {
  const textbookId = db.prepare('INSERT INTO textbooks (name) VALUES (?)').run('Schema Book').lastInsertRowid;
  const unitId = db.prepare('INSERT INTO units (textbook_id, name) VALUES (?, ?)').run(textbookId, 'Unit 1').lastInsertRowid;
  const itemId = db.prepare(
    "INSERT INTO items (unit_id, type, english, chinese) VALUES (?, 'word', 'apple', '苹果')"
  ).run(unitId).lastInsertRowid;
  const planId = db.prepare("INSERT INTO review_plans (name, is_active) VALUES ('Plan', 1)").run().lastInsertRowid;

  db.prepare(
    "INSERT INTO daily_review_tasks (user_id, plan_id, task_date, item_id, source_type) VALUES (1, ?, '2026-05-11', ?, 'new')"
  ).run(planId, itemId);

  expect(() => {
    db.prepare(
      "INSERT INTO daily_review_tasks (user_id, plan_id, task_date, item_id, source_type) VALUES (1, ?, '2026-05-11', ?, 'new')"
    ).run(planId, itemId);
  }).toThrow();
});
```

- [ ] **Step 2: Run schema tests and verify failure**

Run:

```bash
cmd /c npx jest tests\db-init.test.js --runInBand --verbose
```

Expected: FAIL because `review_plans`, `review_plan_units`, and `daily_review_tasks` do not exist yet.

- [ ] **Step 3: Implement schema in `db/init.js`**

Inside the `db.exec` schema block, after `review_cycles` and before `config`, add:

```js
    CREATE TABLE IF NOT EXISTS review_plans (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL,
      is_active  INTEGER NOT NULL DEFAULT 0 CHECK(is_active IN (0, 1)),
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_review_plans_one_active
      ON review_plans(is_active)
      WHERE is_active = 1;

    CREATE TABLE IF NOT EXISTS review_plan_units (
      plan_id INTEGER NOT NULL REFERENCES review_plans(id) ON DELETE CASCADE,
      unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
      PRIMARY KEY (plan_id, unit_id)
    );
    CREATE INDEX IF NOT EXISTS idx_review_plan_units_unit ON review_plan_units(unit_id);

    CREATE TABLE IF NOT EXISTS daily_review_tasks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id),
      plan_id     INTEGER NOT NULL REFERENCES review_plans(id),
      task_date   TEXT    NOT NULL,
      item_id     INTEGER NOT NULL REFERENCES items(id),
      source_type TEXT    NOT NULL CHECK(source_type IN ('new', 'recent_review', 'cycle_review', 'wrong')),
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, task_date, item_id)
    );
    CREATE INDEX IF NOT EXISTS idx_daily_tasks_user_plan_date
      ON daily_review_tasks(user_id, plan_id, task_date);
    CREATE INDEX IF NOT EXISTS idx_daily_tasks_plan_item
      ON daily_review_tasks(plan_id, item_id);
```

- [ ] **Step 4: Run schema tests and verify pass**

Run:

```bash
cmd /c npx jest tests\db-init.test.js --runInBand --verbose
```

Expected: PASS.

- [ ] **Step 5: Write failing query helper tests**

Create `tests/review-plan-queries.test.js`:

```js
const Database = require('better-sqlite3');
const { initDatabase } = require('../db/init');
const queries = require('../db/queries');

describe('review plan query helpers', () => {
  let db;
  let textbookId;
  let unit1Id;
  let unit2Id;
  let word1Id;
  let word2Id;

  beforeEach(() => {
    db = new Database(':memory:');
    initDatabase(db);
    textbookId = queries.createTextbook(db, '七年级上册');
    unit1Id = queries.createUnit(db, textbookId, 'Unit 1');
    unit2Id = queries.createUnit(db, textbookId, 'Unit 2');
    word1Id = queries.createItem(db, { unitId: unit1Id, type: 'word', english: 'apple', chinese: '苹果' });
    word2Id = queries.createItem(db, { unitId: unit2Id, type: 'word', english: 'book', chinese: '书' });
  });

  afterEach(() => {
    db.close();
  });

  test('activateReviewPlan creates one active plan with selected units', () => {
    const planId = queries.activateReviewPlan(db, {
      name: 'Unit 1 Review',
      unitIds: [unit1Id],
    });

    const active = queries.getActiveReviewPlan(db);
    expect(active.id).toBe(planId);
    expect(active.name).toBe('Unit 1 Review');
    expect(active.units.map(u => u.id)).toEqual([unit1Id]);
  });

  test('activating a second plan deactivates the previous plan', () => {
    const firstPlanId = queries.activateReviewPlan(db, { name: 'First', unitIds: [unit1Id] });
    const secondPlanId = queries.activateReviewPlan(db, { name: 'Second', unitIds: [unit2Id] });

    const active = queries.getActiveReviewPlan(db);
    const first = db.prepare('SELECT * FROM review_plans WHERE id = ?').get(firstPlanId);

    expect(active.id).toBe(secondPlanId);
    expect(active.units.map(u => u.id)).toEqual([unit2Id]);
    expect(first.is_active).toBe(0);
  });

  test('getItemsForPlan returns only items inside selected units', () => {
    const planId = queries.activateReviewPlan(db, { name: 'Unit 1', unitIds: [unit1Id] });
    const items = queries.getItemsForPlan(db, planId);

    expect(items.map(i => i.id)).toEqual([word1Id]);
    expect(items.map(i => i.id)).not.toContain(word2Id);
  });

  test('daily task helpers save and load tasks for a user date', () => {
    const planId = queries.activateReviewPlan(db, { name: 'Unit 1', unitIds: [unit1Id] });
    queries.saveDailyReviewTasks(db, {
      userId: 1,
      planId,
      taskDate: '2026-05-11',
      tasks: [{ item_id: word1Id, source_type: 'new' }],
    });

    const tasks = queries.getDailyReviewTasks(db, 1, planId, '2026-05-11');

    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe(word1Id);
    expect(tasks[0].source_type).toBe('new');
  });
});
```

- [ ] **Step 6: Run query helper tests and verify failure**

Run:

```bash
cmd /c npx jest tests\review-plan-queries.test.js --runInBand --verbose
```

Expected: FAIL with `activateReviewPlan is not a function`.

- [ ] **Step 7: Implement query helpers in `db/queries.js`**

Add these functions before `module.exports`:

```js
function getActiveReviewPlan(db) {
  const plan = db.prepare('SELECT * FROM review_plans WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get();
  if (!plan) return null;

  const units = db.prepare(
    `SELECT units.*, textbooks.name AS textbook_name
     FROM review_plan_units
     JOIN units ON units.id = review_plan_units.unit_id
     JOIN textbooks ON textbooks.id = units.textbook_id
     WHERE review_plan_units.plan_id = ?
     ORDER BY textbooks.sort_order, textbooks.id, units.sort_order, units.id`
  ).all(plan.id);

  return { ...plan, units };
}

function activateReviewPlan(db, { name, unitIds }) {
  const cleanUnitIds = [...new Set((unitIds || []).map(id => parseInt(id, 10)).filter(Number.isFinite))];
  if (cleanUnitIds.length === 0) {
    throw new Error('At least one unit is required');
  }

  const tx = db.transaction(() => {
    db.prepare('UPDATE review_plans SET is_active = 0, updated_at = datetime(\'now\') WHERE is_active = 1').run();
    const result = db.prepare(
      'INSERT INTO review_plans (name, is_active) VALUES (?, 1)'
    ).run(name && name.trim() ? name.trim() : '复习计划');

    const insertUnit = db.prepare('INSERT INTO review_plan_units (plan_id, unit_id) VALUES (?, ?)');
    for (const unitId of cleanUnitIds) {
      insertUnit.run(result.lastInsertRowid, unitId);
    }

    return result.lastInsertRowid;
  });

  return tx();
}

function getItemsForPlan(db, planId) {
  return db.prepare(
    `SELECT items.*
     FROM review_plan_units
     JOIN items ON items.unit_id = review_plan_units.unit_id
     WHERE review_plan_units.plan_id = ?
     ORDER BY items.type, items.sort_order, items.id`
  ).all(planId);
}

function getPlanItemCounts(db, planId) {
  const rows = db.prepare(
    `SELECT items.type, COUNT(*) AS count
     FROM review_plan_units
     JOIN items ON items.unit_id = review_plan_units.unit_id
     WHERE review_plan_units.plan_id = ?
     GROUP BY items.type`
  ).all(planId);

  return rows.reduce((counts, row) => {
    counts[row.type] = row.count;
    return counts;
  }, { word: 0, phrase: 0, grammar: 0 });
}

function getDailyReviewTasks(db, userId, planId, taskDate) {
  return db.prepare(
    `SELECT items.*, daily_review_tasks.source_type, daily_review_tasks.task_date
     FROM daily_review_tasks
     JOIN items ON items.id = daily_review_tasks.item_id
     WHERE daily_review_tasks.user_id = ?
       AND daily_review_tasks.plan_id = ?
       AND daily_review_tasks.task_date = ?
     ORDER BY daily_review_tasks.id`
  ).all(userId, planId, taskDate);
}

function saveDailyReviewTasks(db, { userId, planId, taskDate, tasks }) {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO daily_review_tasks (user_id, plan_id, task_date, item_id, source_type)
     VALUES (?, ?, ?, ?, ?)`
  );

  const tx = db.transaction(() => {
    for (const task of tasks) {
      insert.run(userId, planId, taskDate, task.item_id, task.source_type);
    }
  });

  tx();
}

function getReviewTaskDates(db, userId, planId) {
  return db.prepare(
    `SELECT DISTINCT task_date
     FROM daily_review_tasks
     WHERE user_id = ? AND plan_id = ?
     ORDER BY task_date`
  ).all(userId, planId).map(row => row.task_date);
}

function getRecentReviewTaskItems(db, userId, planId, limitDays) {
  const dates = db.prepare(
    `SELECT DISTINCT task_date
     FROM daily_review_tasks
     WHERE user_id = ? AND plan_id = ?
     ORDER BY task_date DESC
     LIMIT ?`
  ).all(userId, planId, limitDays).map(row => row.task_date);

  if (dates.length === 0) return [];

  const placeholders = dates.map(() => '?').join(',');
  return db.prepare(
    `SELECT items.*, daily_review_tasks.source_type, daily_review_tasks.task_date
     FROM daily_review_tasks
     JOIN items ON items.id = daily_review_tasks.item_id
     WHERE daily_review_tasks.user_id = ?
       AND daily_review_tasks.plan_id = ?
       AND daily_review_tasks.task_date IN (${placeholders})
     ORDER BY daily_review_tasks.task_date DESC, daily_review_tasks.id`
  ).all(userId, planId, ...dates);
}
```

Add these names to `module.exports`:

```js
  getActiveReviewPlan,
  activateReviewPlan,
  getItemsForPlan,
  getPlanItemCounts,
  getDailyReviewTasks,
  saveDailyReviewTasks,
  getReviewTaskDates,
  getRecentReviewTaskItems,
```

- [ ] **Step 8: Run query helper tests and verify pass**

Run:

```bash
cmd /c npx jest tests\review-plan-queries.test.js --runInBand --verbose
```

Expected: PASS.

- [ ] **Step 9: Commit Task 1**

Run:

```bash
git add db/init.js db/queries.js tests/db-init.test.js tests/review-plan-queries.test.js
git commit -m "feat: add review plan persistence"
```

Expected: commit succeeds.

---

### Task 2: Admin Review Plan Page

**Files:**
- Modify: `routes/admin.js`
- Modify: `views/layout.ejs`
- Create: `views/admin/review-plan.ejs`
- Modify: `tests/ui-text.test.js`
- Create: `tests/review-plan-routes.test.js`

- [ ] **Step 1: Write route tests for admin plan page**

Create `tests/review-plan-routes.test.js`:

```js
const express = require('express');
const session = require('express-session');
const http = require('http');
const Database = require('better-sqlite3');
const { initDatabase } = require('../db/init');
const queries = require('../db/queries');

function buildApp(user) {
  const app = express();
  const db = new Database(':memory:');
  initDatabase(db);
  app.locals.db = db;
  app.set('view engine', 'ejs');
  app.set('views', require('path').join(__dirname, '..', 'views'));
  app.use(express.urlencoded({ extended: true }));
  app.use(session({ secret: 'test', resave: false, saveUninitialized: true }));
  app.use((req, res, next) => {
    req.session.user = user;
    res.locals.user = user;
    next();
  });
  app.use(require('../routes/admin'));
  app.cleanup = () => db.close();
  return app;
}

function requestApp(app, method, urlPath, formBody) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const payload = formBody ? new URLSearchParams(formBody).toString() : '';
      const headers = formBody
        ? {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(payload),
          }
        : {};

      const req = http.request({
        hostname: '127.0.0.1',
        port: server.address().port,
        method,
        path: urlPath,
        headers,
      }, (res) => {
        let text = '';
        res.on('data', chunk => { text += chunk; });
        res.on('end', () => {
          server.close(() => resolve({ statusCode: res.statusCode, headers: res.headers, text }));
        });
      });

      req.on('error', (err) => {
        server.close(() => reject(err));
      });

      if (payload) req.write(payload);
      req.end();
    });
  });
}

describe('admin review plan routes', () => {
  test('admin can open review plan page', async () => {
    const app = buildApp({ id: 1, username: 'admin', role: 'admin' });
    const res = await requestApp(app, 'GET', '/admin/review-plan');

    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('复习计划');
    expect(res.text).toContain('启用此复习计划');
    app.cleanup();
  });

  test('non-admin cannot open review plan page', async () => {
    const app = buildApp({ id: 2, username: 'student', role: 'user' });
    const res = await requestApp(app, 'GET', '/admin/review-plan');

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toMatch(/^\/login/);
    app.cleanup();
  });

  test('admin can activate selected units', async () => {
    const app = buildApp({ id: 1, username: 'admin', role: 'admin' });
    const db = app.locals.db;
    const textbookId = queries.createTextbook(db, '七年级上册');
    const unitId = queries.createUnit(db, textbookId, 'Unit 1');

    const res = await requestApp(app, 'POST', '/admin/review-plan', {
      name: 'Unit 1 复习',
      unit_ids: String(unitId),
    });

    const active = queries.getActiveReviewPlan(db);
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/admin/review-plan');
    expect(active.name).toBe('Unit 1 复习');
    expect(active.units.map(u => u.id)).toEqual([unitId]);
    app.cleanup();
  });
});
```

- [ ] **Step 2: Run route tests and verify failure**

Run:

```bash
cmd /c npx jest tests\review-plan-routes.test.js --runInBand --verbose
```

Expected: FAIL because `/admin/review-plan` is not implemented.

- [ ] **Step 3: Add admin routes**

In `routes/admin.js`, add after the `/admin` redirect:

```js
router.get('/admin/review-plan', (req, res) => {
  const db = req.app.locals.db;
  const textbooks = queries.getTextbooks(db).map(textbook => ({
    ...textbook,
    units: queries.getUnitsByTextbook(db, textbook.id),
  }));
  const activePlan = queries.getActiveReviewPlan(db);
  const config = queries.getConfig(db);
  const counts = activePlan ? queries.getPlanItemCounts(db, activePlan.id) : { word: 0, phrase: 0, grammar: 0 };

  renderWithLayout(res, 'admin/review-plan', {
    textbooks,
    activePlan,
    config,
    counts,
    error: null,
    success: null,
  }, '复习计划');
});

router.post('/admin/review-plan', (req, res) => {
  const db = req.app.locals.db;
  const rawUnitIds = req.body.unit_ids;
  const unitIds = Array.isArray(rawUnitIds) ? rawUnitIds : rawUnitIds ? [rawUnitIds] : [];

  if (unitIds.length === 0) {
    const textbooks = queries.getTextbooks(db).map(textbook => ({
      ...textbook,
      units: queries.getUnitsByTextbook(db, textbook.id),
    }));
    const activePlan = queries.getActiveReviewPlan(db);
    const config = queries.getConfig(db);
    const counts = activePlan ? queries.getPlanItemCounts(db, activePlan.id) : { word: 0, phrase: 0, grammar: 0 };

    return renderWithLayout(res, 'admin/review-plan', {
      textbooks,
      activePlan,
      config,
      counts,
      error: '请至少选择一个单元',
      success: null,
    }, '复习计划');
  }

  queries.activateReviewPlan(db, {
    name: req.body.name || '复习计划',
    unitIds,
  });
  res.redirect('/admin/review-plan');
});
```

- [ ] **Step 4: Create admin review plan view**

Create `views/admin/review-plan.ejs`:

```ejs
<h1>复习计划</h1>

<% if (typeof error !== 'undefined' && error) { %>
  <div class="alert alert-error"><%= error %></div>
<% } %>
<% if (typeof success !== 'undefined' && success) { %>
  <div class="alert alert-success"><%= success %></div>
<% } %>

<section class="panel mb-2">
  <h2 class="mb-1">当前启用计划</h2>
  <% if (activePlan) { %>
    <p><strong><%= activePlan.name %></strong></p>
    <p class="text-muted">
      <% activePlan.units.forEach((unit, index) => { %>
        <%= index > 0 ? '、' : '' %><%= unit.textbook_name %> <%= unit.name %>
      <% }) %>
    </p>
    <div class="metric-grid">
      <section class="metric-card"><strong><%= counts.word || 0 %></strong><span>单词</span></section>
      <section class="metric-card"><strong><%= counts.phrase || 0 %></strong><span>短语</span></section>
      <section class="metric-card"><strong><%= counts.grammar || 0 %></strong><span>语法点</span></section>
    </div>
  <% } else { %>
    <p class="text-muted">暂无启用的复习计划。</p>
  <% } %>
</section>

<section class="panel mb-2">
  <h2 class="mb-1">启用此复习计划</h2>
  <p class="text-muted">每日配额：<%= config.daily_words || 20 %> 个单词，<%= config.daily_phrases || 5 %> 个短语，<%= config.daily_grammar || 3 %> 个语法点。</p>

  <form method="POST" action="/admin/review-plan">
    <div class="form-group">
      <label>计划名称</label>
      <input type="text" name="name" value="<%= activePlan ? activePlan.name : '当前复习计划' %>" required>
    </div>

    <div class="unit-picker">
      <% textbooks.forEach(textbook => { %>
        <section class="unit-picker-group">
          <h3><%= textbook.name %></h3>
          <% if (textbook.units.length === 0) { %>
            <p class="text-muted">暂无单元</p>
          <% } %>
          <% textbook.units.forEach(unit => { %>
            <label class="check-row">
              <input
                type="checkbox"
                name="unit_ids"
                value="<%= unit.id %>"
                <%= activePlan && activePlan.units.some(activeUnit => activeUnit.id === unit.id) ? 'checked' : '' %>
              >
              <span><%= unit.name %></span>
            </label>
          <% }) %>
        </section>
      <% }) %>
    </div>

    <button type="submit" class="btn btn-primary">启用此复习计划</button>
  </form>
</section>

<p><a href="/admin/textbooks">&larr; 返回课本管理</a></p>
```

- [ ] **Step 5: Update layout admin navigation**

In `views/layout.ejs`, inside the admin branch, replace the single admin link with:

```ejs
<a href="/admin/textbooks">课本管理</a>
<a href="/admin/review-plan">复习计划</a>
<a href="/admin/settings">系统设置</a>
```

- [ ] **Step 6: Update UI text tests**

In `tests/ui-text.test.js`, add `views/admin/review-plan.ejs` to `filesWithUserFacingText`.

Add this expected text entry:

```js
  'views/admin/review-plan.ejs': ['复习计划', '当前启用计划', '启用此复习计划', '每日配额'],
```

Update `views/layout.ejs` expected text to include `课本管理`, `复习计划`, and `系统设置`.

- [ ] **Step 7: Run admin tests**

Run:

```bash
cmd /c npx jest tests\review-plan-routes.test.js tests\ui-text.test.js --runInBand --verbose
```

Expected: PASS.

- [ ] **Step 8: Commit Task 2**

Run:

```bash
git add routes/admin.js views/layout.ejs views/admin/review-plan.ejs tests/review-plan-routes.test.js tests/ui-text.test.js
git commit -m "feat: add admin review plan page"
```

Expected: commit succeeds.

---

### Task 3: Plan-Aware Scheduler

**Files:**
- Modify: `engine/scheduler.js`
- Create: `tests/review-plan-scheduler.test.js`

- [ ] **Step 1: Write scheduler tests**

Create `tests/review-plan-scheduler.test.js`:

```js
const Database = require('better-sqlite3');
const { initDatabase } = require('../db/init');
const queries = require('../db/queries');
const scheduler = require('../engine/scheduler');

function seedWordSet(db, unitId, prefix, count) {
  const ids = [];
  for (let i = 1; i <= count; i++) {
    ids.push(queries.createItem(db, {
      unitId,
      type: 'word',
      english: `${prefix}-${i}`,
      chinese: `${prefix}中文${i}`,
    }));
  }
  return ids;
}

function setup() {
  const db = new Database(':memory:');
  initDatabase(db);
  const textbookId = queries.createTextbook(db, '七年级上册');
  const unit1Id = queries.createUnit(db, textbookId, 'Unit 1');
  const unit2Id = queries.createUnit(db, textbookId, 'Unit 2');
  const unit1Words = seedWordSet(db, unit1Id, 'unit1', 20);
  const unit2Words = seedWordSet(db, unit2Id, 'unit2', 5);
  const planId = queries.activateReviewPlan(db, { name: 'Unit 1', unitIds: [unit1Id] });
  db.prepare("INSERT INTO users (username, password, role) VALUES ('student', 'hash', 'user')").run();
  return { db, planId, unit1Words, unit2Words, userId: 2 };
}

describe('plan-aware daily scheduler', () => {
  test('day 1 generates quota-limited new content from active plan scope', () => {
    const { db, planId, unit1Words, unit2Words, userId } = setup();

    const tasks = scheduler.getOrCreateDailyReviewTasks(db, userId, planId, '2026-05-11', {
      daily_words: 6,
      daily_phrases: 0,
      daily_grammar: 0,
    });

    expect(tasks.words).toHaveLength(6);
    expect(tasks.words.every(item => item.source_type === 'new')).toBe(true);
    expect(tasks.words.map(item => item.id).every(id => unit1Words.includes(id))).toBe(true);
    expect(tasks.words.map(item => item.id).some(id => unit2Words.includes(id))).toBe(false);
    db.close();
  });

  test('same-day calls reuse saved tasks', () => {
    const { db, planId, userId } = setup();

    const first = scheduler.getOrCreateDailyReviewTasks(db, userId, planId, '2026-05-11', {
      daily_words: 6,
      daily_phrases: 0,
      daily_grammar: 0,
    });
    const second = scheduler.getOrCreateDailyReviewTasks(db, userId, planId, '2026-05-11', {
      daily_words: 6,
      daily_phrases: 0,
      daily_grammar: 0,
    });

    expect(second.words.map(i => i.id)).toEqual(first.words.map(i => i.id));
    db.close();
  });

  test('day 2 uses one new word and five review words for quota six', () => {
    const { db, planId, userId } = setup();

    const day1 = scheduler.getOrCreateDailyReviewTasks(db, userId, planId, '2026-05-11', {
      daily_words: 6,
      daily_phrases: 0,
      daily_grammar: 0,
    });
    for (const item of day1.words) {
      queries.insertReviewRecord(db, {
        userId,
        itemId: item.id,
        exerciseType: 'en2cn',
        userAnswer: item.chinese,
        isCorrect: true,
      });
    }

    const day2 = scheduler.getOrCreateDailyReviewTasks(db, userId, planId, '2026-05-12', {
      daily_words: 6,
      daily_phrases: 0,
      daily_grammar: 0,
    });

    expect(day2.words.filter(item => item.source_type === 'new')).toHaveLength(1);
    expect(day2.words.filter(item => item.source_type === 'recent_review')).toHaveLength(5);
    db.close();
  });

  test('wrong items are prioritized as review tasks', () => {
    const { db, planId, userId } = setup();

    const day1 = scheduler.getOrCreateDailyReviewTasks(db, userId, planId, '2026-05-11', {
      daily_words: 6,
      daily_phrases: 0,
      daily_grammar: 0,
    });
    const wrongItem = day1.words[0];
    queries.insertReviewRecord(db, {
      userId,
      itemId: wrongItem.id,
      exerciseType: 'en2cn',
      userAnswer: 'wrong',
      isCorrect: false,
    });

    const day2 = scheduler.getOrCreateDailyReviewTasks(db, userId, planId, '2026-05-12', {
      daily_words: 6,
      daily_phrases: 0,
      daily_grammar: 0,
    });

    const selectedWrong = day2.words.find(item => item.id === wrongItem.id);
    expect(selectedWrong).toBeTruthy();
    expect(selectedWrong.source_type).toBe('wrong');
    db.close();
  });

  test('day 6 introduces no new content', () => {
    const { db, planId, userId } = setup();

    for (let day = 11; day <= 15; day++) {
      scheduler.getOrCreateDailyReviewTasks(db, userId, planId, `2026-05-${day}`, {
        daily_words: 6,
        daily_phrases: 0,
        daily_grammar: 0,
      });
    }

    const day6 = scheduler.getOrCreateDailyReviewTasks(db, userId, planId, '2026-05-16', {
      daily_words: 6,
      daily_phrases: 0,
      daily_grammar: 0,
    });

    expect(day6.words).toHaveLength(6);
    expect(day6.words.every(item => item.source_type === 'cycle_review')).toBe(true);
    db.close();
  });

  test('mastered items are excluded from new daily tasks', () => {
    const { db, planId, unit1Words, userId } = setup();
    queries.setItemKnown(db, userId, unit1Words[0], true);

    const tasks = scheduler.getOrCreateDailyReviewTasks(db, userId, planId, '2026-05-11', {
      daily_words: 6,
      daily_phrases: 0,
      daily_grammar: 0,
    });

    expect(tasks.words.map(item => item.id)).not.toContain(unit1Words[0]);
    db.close();
  });
});
```

- [ ] **Step 2: Run scheduler tests and verify failure**

Run:

```bash
cmd /c npx jest tests\review-plan-scheduler.test.js --runInBand --verbose
```

Expected: FAIL because `getOrCreateDailyReviewTasks` is not implemented.

- [ ] **Step 3: Add scheduler helpers**

In `engine/scheduler.js`, add these helpers above `module.exports`:

```js
function groupTasksByType(tasks) {
  return {
    words: tasks.filter(item => item.type === 'word'),
    phrases: tasks.filter(item => item.type === 'phrase'),
    grammar: tasks.filter(item => item.type === 'grammar'),
  };
}

function getReviewDayNumber(db, userId, planId) {
  const dates = queries.getReviewTaskDates(db, userId, planId);
  return (dates.length % 7) + 1;
}

function splitQuota(quota) {
  const parsed = parseInt(quota, 10) || 0;
  if (parsed <= 0) return { newTarget: 0, reviewTarget: 0 };
  if (parsed === 1) return { newTarget: 1, reviewTarget: 0 };
  const newTarget = Math.max(1, Math.floor(parsed * 0.3));
  return { newTarget, reviewTarget: parsed - newTarget };
}

function uniqueById(items) {
  const seen = new Set();
  return items.filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function getWrongItemIds(db, userId, itemIds) {
  const records = queries.getReviewRecordsForUser(db, userId, itemIds);
  const latest = new Map();
  for (const record of records) {
    if (!latest.has(record.item_id) || record.created_at > latest.get(record.item_id).created_at) {
      latest.set(record.item_id, record);
    }
  }
  return new Set(
    [...latest.values()]
      .filter(record => record.is_correct === 0)
      .map(record => record.item_id)
  );
}

function selectPlanItemsForType({ candidates, recentItems, wrongIds, knownIds, quota, dayNumber }) {
  const available = candidates.filter(item => !knownIds.has(item.id));
  if (quota <= 0 || available.length === 0) return [];

  const recentIds = new Set(recentItems.map(item => item.id));
  const newItems = available.filter(item => !recentIds.has(item.id));
  const wrongItems = available.filter(item => wrongIds.has(item.id));
  const reviewItems = uniqueById([
    ...wrongItems,
    ...recentItems.filter(item => item.type === available[0].type && !knownIds.has(item.id)),
  ]).filter(item => available.some(candidate => candidate.id === item.id));

  if (dayNumber === 1) {
    return newItems.slice(0, quota).map(item => ({ ...item, source_type: 'new' }));
  }

  if (dayNumber === 6 || dayNumber === 7) {
    return reviewItems.slice(0, quota).map(item => ({ ...item, source_type: 'cycle_review' }));
  }

  const { newTarget, reviewTarget } = splitQuota(quota);
  const selectedReview = reviewItems.slice(0, reviewTarget).map(item => ({
    ...item,
    source_type: wrongIds.has(item.id) ? 'wrong' : 'recent_review',
  }));
  const selectedIds = new Set(selectedReview.map(item => item.id));
  const selectedNew = newItems
    .filter(item => !selectedIds.has(item.id))
    .slice(0, newTarget)
    .map(item => ({ ...item, source_type: 'new' }));

  const fallback = uniqueById([
    ...reviewItems,
    ...newItems,
  ])
    .filter(item => !selectedIds.has(item.id) && !selectedNew.some(selected => selected.id === item.id))
    .slice(0, quota - selectedReview.length - selectedNew.length)
    .map(item => ({
      ...item,
      source_type: recentIds.has(item.id) ? (wrongIds.has(item.id) ? 'wrong' : 'recent_review') : 'new',
    }));

  return [...selectedNew, ...selectedReview, ...fallback].slice(0, quota);
}

function getOrCreateDailyReviewTasks(db, userId, planId, taskDate, quotas) {
  const existing = queries.getDailyReviewTasks(db, userId, planId, taskDate);
  if (existing.length > 0) {
    return groupTasksByType(existing);
  }

  const dayNumber = getReviewDayNumber(db, userId, planId);
  const planItems = queries.getItemsForPlan(db, planId);
  const knownIds = new Set(queries.getKnownItemIds(db, userId));
  const recentItems = queries.getRecentReviewTaskItems(db, userId, planId, dayNumber >= 6 ? 5 : 1);
  const wrongIds = getWrongItemIds(db, userId, planItems.map(item => item.id));

  const byType = {
    words: planItems.filter(item => item.type === 'word'),
    phrases: planItems.filter(item => item.type === 'phrase'),
    grammar: planItems.filter(item => item.type === 'grammar'),
  };

  const selected = {
    words: selectPlanItemsForType({
      candidates: byType.words,
      recentItems,
      wrongIds,
      knownIds,
      quota: parseInt(quotas.daily_words, 10) || 0,
      dayNumber,
    }),
    phrases: selectPlanItemsForType({
      candidates: byType.phrases,
      recentItems,
      wrongIds,
      knownIds,
      quota: parseInt(quotas.daily_phrases, 10) || 0,
      dayNumber,
    }),
    grammar: selectPlanItemsForType({
      candidates: byType.grammar,
      recentItems,
      wrongIds,
      knownIds,
      quota: parseInt(quotas.daily_grammar, 10) || 0,
      dayNumber,
    }),
  };

  const flatTasks = [...selected.words, ...selected.phrases, ...selected.grammar].map(item => ({
    item_id: item.id,
    source_type: item.source_type,
  }));

  queries.saveDailyReviewTasks(db, { userId, planId, taskDate, tasks: flatTasks });
  return groupTasksByType(queries.getDailyReviewTasks(db, userId, planId, taskDate));
}
```

Update `module.exports`:

```js
module.exports = { getDailyItems, getCycleItems, getActiveCycles, getOrCreateDailyReviewTasks };
```

- [ ] **Step 4: Run scheduler tests and verify pass**

Run:

```bash
cmd /c npx jest tests\review-plan-scheduler.test.js --runInBand --verbose
```

Expected: PASS.

- [ ] **Step 5: Run existing engine tests**

Run:

```bash
cmd /c npx jest tests\engine.test.js --runInBand --verbose
```

Expected: PASS. Existing `getDailyItems`, `getCycleItems`, and generator behavior remain intact.

- [ ] **Step 6: Commit Task 3**

Run:

```bash
git add engine/scheduler.js tests/review-plan-scheduler.test.js
git commit -m "feat: generate plan-aware daily tasks"
```

Expected: commit succeeds.

---

### Task 4: Student Dashboard And Practice Integration

**Files:**
- Modify: `routes/practice.js`
- Modify: `views/practice/dashboard.ejs`
- Modify: `tests/review-plan-routes.test.js`

- [ ] **Step 1: Add student route tests**

Append these tests to `tests/review-plan-routes.test.js`:

```js
describe('student review plan flow', () => {
  test('student dashboard shows empty state when no active plan exists', async () => {
    const app = buildApp({ id: 2, username: 'student', role: 'user' });
    app.use(require('../routes/practice'));

    const res = await requestApp(app, 'GET', '/practice');

    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('暂无复习计划');
    app.cleanup();
  });

  test('student start creates and reuses today review tasks', async () => {
    const app = buildApp({ id: 2, username: 'student', role: 'user' });
    const db = app.locals.db;
    const textbookId = queries.createTextbook(db, '七年级上册');
    const unitId = queries.createUnit(db, textbookId, 'Unit 1');
    for (let i = 1; i <= 6; i++) {
      queries.createItem(db, { unitId, type: 'word', english: `word-${i}`, chinese: `词${i}` });
    }
    const planId = queries.activateReviewPlan(db, { name: 'Unit 1', unitIds: [unitId] });
    queries.setConfig(db, 'daily_words', '3');
    queries.setConfig(db, 'daily_phrases', '0');
    queries.setConfig(db, 'daily_grammar', '0');
    app.use(require('../routes/practice'));

    const first = await requestApp(app, 'GET', '/practice/start');
    const savedAfterFirst = db.prepare('SELECT COUNT(*) AS count FROM daily_review_tasks WHERE user_id = 2 AND plan_id = ?').get(planId).count;
    const second = await requestApp(app, 'GET', '/practice/start');
    const savedAfterSecond = db.prepare('SELECT COUNT(*) AS count FROM daily_review_tasks WHERE user_id = 2 AND plan_id = ?').get(planId).count;

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(savedAfterFirst).toBe(3);
    expect(savedAfterSecond).toBe(3);
    app.cleanup();
  });
});
```

- [ ] **Step 2: Run student route tests and verify failure**

Run:

```bash
cmd /c npx jest tests\review-plan-routes.test.js --runInBand --verbose
```

Expected: FAIL because the practice route still uses global scheduling and does not pass review-plan dashboard data.

- [ ] **Step 3: Update practice dashboard route**

In `routes/practice.js`, inside `router.get('/practice')`, add active plan data:

```js
  const activePlan = queries.getActiveReviewPlan(db);
  const planCounts = activePlan ? queries.getPlanItemCounts(db, activePlan.id) : { word: 0, phrase: 0, grammar: 0 };
  const todayTasks = activePlan
    ? queries.getDailyReviewTasks(db, userId, activePlan.id, today)
    : [];
  const taskSummary = {
    words: todayTasks.filter(item => item.type === 'word').length,
    phrases: todayTasks.filter(item => item.type === 'phrase').length,
    grammar: todayTasks.filter(item => item.type === 'grammar').length,
    newContent: todayTasks.filter(item => item.source_type === 'new').length,
    reviewContent: todayTasks.filter(item => item.source_type !== 'new').length,
  };
```

Add these properties to the dashboard render data:

```js
    activePlan,
    planCounts,
    taskSummary,
```

- [ ] **Step 4: Update practice start route**

In `routes/practice.js`, replace the daily review branch:

```js
    const result = scheduler.getDailyItems(db, userId, config);
    items = [...result.words, ...result.phrases, ...result.grammar];
    title = '今日复习';
```

with:

```js
    const activePlan = queries.getActiveReviewPlan(db);
    if (!activePlan) {
      return res.redirect('/practice');
    }

    const today = new Date().toISOString().slice(0, 10);
    const result = scheduler.getOrCreateDailyReviewTasks(db, userId, activePlan.id, today, config);
    items = [...result.words, ...result.phrases, ...result.grammar];
    title = '今日复习';
```

- [ ] **Step 5: Update empty-result dashboard render in practice start route**

In the `items.length === 0` render data, add:

```js
      activePlan: queries.getActiveReviewPlan(db),
      planCounts: { word: 0, phrase: 0, grammar: 0 },
      taskSummary: { words: 0, phrases: 0, grammar: 0, newContent: 0, reviewContent: 0 },
```

- [ ] **Step 6: Update student dashboard view**

In `views/practice/dashboard.ejs`, add this block after the error block and before the no-items block:

```ejs
<% if (!activePlan) { %>
  <section class="panel mb-2">
    <h2>暂无复习计划</h2>
    <p class="text-muted">请先由管理员在后台启用复习计划。</p>
  </section>
<% } else { %>
  <section class="panel mb-2">
    <h2 class="mb-1">今日复习</h2>
    <p class="text-muted">
      当前范围：
      <% activePlan.units.forEach((unit, index) => { %>
        <%= index > 0 ? '、' : '' %><%= unit.textbook_name %> <%= unit.name %>
      <% }) %>
    </p>
    <div class="metric-grid">
      <section class="metric-card"><strong><%= taskSummary.words %></strong><span>今日单词</span></section>
      <section class="metric-card"><strong><%= taskSummary.phrases %></strong><span>今日短语</span></section>
      <section class="metric-card"><strong><%= taskSummary.grammar %></strong><span>今日语法</span></section>
      <section class="metric-card"><strong><%= taskSummary.newContent %></strong><span>新内容</span></section>
      <section class="metric-card"><strong><%= taskSummary.reviewContent %></strong><span>复习内容</span></section>
    </div>
  </section>
<% } %>
```

Change the start link to only show when `activePlan` exists:

```ejs
  <% if (activePlan) { %>
    <a href="/practice/start" class="primary-action mb-2">开始今日复习</a>
  <% } %>
```

- [ ] **Step 7: Run student route tests**

Run:

```bash
cmd /c npx jest tests\review-plan-routes.test.js --runInBand --verbose
```

Expected: PASS.

- [ ] **Step 8: Commit Task 4**

Run:

```bash
git add routes/practice.js views/practice/dashboard.ejs tests/review-plan-routes.test.js
git commit -m "feat: connect student practice to review plans"
```

Expected: commit succeeds.

---

### Task 5: UI Polish And Full Verification

**Files:**
- Modify: `public/style.css`
- Modify: `public/review.css` if the project already uses it for study-specific UI
- Modify: `tests/ui-text.test.js`
- Modify: `docs/mvp-test-guide.md`

- [ ] **Step 1: Add UI text expectations**

In `tests/ui-text.test.js`, update the dashboard expected text for `views/practice/dashboard.ejs`:

```js
  'views/practice/dashboard.ejs': ['复习主页', '今日进度', '今日复习', '新内容', '复习内容', '开始今日复习', '暂无复习计划'],
```

- [ ] **Step 2: Run UI text tests and verify failure if strings are missing**

Run:

```bash
cmd /c npx jest tests\ui-text.test.js --runInBand --verbose
```

Expected: PASS if Task 4 added all strings; otherwise FAIL naming the missing string.

- [ ] **Step 3: Add restrained layout styles**

Append to `public/style.css` if these classes are not already present:

```css
.unit-picker {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  margin: 1rem 0;
}

.unit-picker-group {
  border: 1px solid #d8e2dc;
  border-radius: 8px;
  padding: 1rem;
  background: #fbfdfc;
}

.unit-picker-group h3 {
  margin: 0 0 0.75rem;
  font-size: 1rem;
}

.check-row {
  align-items: center;
  display: flex;
  gap: 0.5rem;
  line-height: 1.5;
  margin: 0.4rem 0;
}

.check-row input {
  inline-size: 1rem;
  block-size: 1rem;
}
```

- [ ] **Step 4: Update desktop web test guide**

In `docs/mvp-test-guide.md`, add a section named `复习计划功能验证` with these manual checks:

```md
## 复习计划功能验证

1. 使用管理员账号登录。
2. 进入“课本管理”，创建课本、Unit，并添加单词、短语和语法点。
3. 进入“复习计划”，勾选一个或多个 Unit，点击“启用此复习计划”。
4. 使用学生账号登录。
5. 进入“开始复习”，确认页面显示“今日复习”、当前范围、新内容数量和复习内容数量。
6. 点击“开始今日复习”，完成题目。
7. 当天再次点击“开始今日复习”，确认题目数量不会重复增加。
8. 修改系统设置中的每日配额，再用新日期或新学生验证任务数量随配额变化。
```

- [ ] **Step 5: Run targeted tests**

Run:

```bash
cmd /c npx jest tests\db-init.test.js tests\review-plan-queries.test.js tests\review-plan-scheduler.test.js tests\review-plan-routes.test.js tests\ui-text.test.js --runInBand --verbose
```

Expected: PASS.

- [ ] **Step 6: Run full test suite**

Run:

```bash
cmd /c npx jest --runInBand --verbose
```

Expected: PASS.

- [ ] **Step 7: Run build or package verification**

Run:

```bash
cmd /c npm run build
```

Expected: PASS if the project has a build script. If the project does not define `build`, record the exact npm error in the final implementation notes and rely on Jest verification.

- [ ] **Step 8: Commit Task 5**

Run:

```bash
git add public/style.css public/review.css tests/ui-text.test.js docs/mvp-test-guide.md
git commit -m "docs: add review plan verification guide"
```

Expected: commit succeeds. If `public/review.css` was not changed, omit it from `git add`.

---

## Final Verification

After all tasks are complete, run:

```bash
cmd /c npx jest --runInBand --verbose
git status --short --branch
```

Expected:

- Jest reports all test suites passing.
- `git status` shows a clean working tree.

Then provide a concise summary of:

- New admin Review Plan page.
- Persistent daily task generation.
- Student dashboard and practice integration.
- Test commands run and results.
- Any build-script limitation if `npm run build` is unavailable.
