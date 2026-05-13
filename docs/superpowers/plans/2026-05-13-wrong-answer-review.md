# Wrong Answer Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a student wrong-answer notebook and wrong-answer专项复习 loop based on existing `review_records`.

**Architecture:** Keep `review_records` as the source of truth. Add narrow query helpers in `db/queries.js`, student routes in `routes/practice.js`, one new EJS view for the notebook, and small dashboard/navigation entry points. Reuse the existing exercise generator and `/practice/submit` scoring flow so a later correct answer automatically removes an item from the current wrong set.

**Tech Stack:** Node.js, Express, EJS, SQLite via `better-sqlite3`, Jest.

---

## File Structure

- Modify `db/queries.js`: add `normalizeWrongItemType`, `getWrongItemsForUser`, and `getWrongItemCountsForUser`.
- Modify `routes/practice.js`: add wrong-answer notebook route, wrong-answer practice route, and dashboard wrong count data.
- Create `views/wrong-items.ejs`: render filters, counts, wrong item rows, empty states, and practice action.
- Modify `views/layout.ejs`: add student navigation link to `/wrong-items`.
- Modify `views/practice/dashboard.ejs`: add compact wrong-answer entry panel.
- Modify `public/review.css` or `public/style.css`: add small wrong-answer list/filter styles only if existing utility classes are not enough.
- Create `tests/wrong-answer-queries.test.js`: query behavior tests.
- Create `tests/wrong-answer-routes.test.js`: student route behavior tests.
- Modify `tests/ui-text.test.js`: include wrong-answer visible copy.

---

### Task 1: Current Wrong Item Query Helpers

**Files:**
- Modify: `db/queries.js`
- Test: `tests/wrong-answer-queries.test.js`

- [ ] **Step 1: Write the failing query tests**

Create `tests/wrong-answer-queries.test.js`:

```javascript
const Database = require('better-sqlite3');
const { initDatabase } = require('../db/init');
const queries = require('../db/queries');

function setupDb() {
  const db = new Database(':memory:');
  initDatabase(db);
  const textbookId = queries.createTextbook(db, '错题测试课本');
  const unitId = queries.createUnit(db, textbookId, 'Unit 1');
  const wordId = queries.createItem(db, {
    unitId,
    type: 'word',
    english: 'study',
    chinese: '学习',
    pos: 'v.',
    example: 'I study English.',
  });
  const phraseId = queries.createItem(db, {
    unitId,
    type: 'phrase',
    english: 'look after',
    chinese: '照顾',
  });
  const grammarId = queries.createItem(db, {
    unitId,
    type: 'grammar',
    english: 'She likes music',
    chinese: '她喜欢音乐',
  });
  db.prepare("INSERT INTO users (id, username, password, role) VALUES (2, 'student', 'hash', 'user')").run();
  return { db, wordId, phraseId, grammarId, userId: 2 };
}

function record(db, userId, itemId, isCorrect, answer = 'answer') {
  db.prepare(
    `INSERT INTO review_records (user_id, item_id, exercise_type, user_answer, is_correct, created_at)
     VALUES (?, ?, 'en2cn', ?, ?, datetime('now'))`
  ).run(userId, itemId, answer, isCorrect ? 1 : 0);
}

describe('wrong answer query helpers', () => {
  test('returns items whose latest review record is wrong', () => {
    const { db, userId, wordId, phraseId } = setupDb();
    record(db, userId, wordId, false, 'wrong word');
    record(db, userId, phraseId, true, '照顾');

    const wrongItems = queries.getWrongItemsForUser(db, userId);

    expect(wrongItems.map(item => item.item_id)).toEqual([wordId]);
    expect(wrongItems[0].wrong_count).toBe(1);
    expect(wrongItems[0].last_user_answer).toBe('wrong word');
    db.close();
  });

  test('removes an item after a later correct answer', () => {
    const { db, userId, wordId } = setupDb();
    record(db, userId, wordId, false, 'wrong');
    record(db, userId, wordId, true, '学习');

    expect(queries.getWrongItemsForUser(db, userId)).toHaveLength(0);
    expect(queries.getWrongItemCountsForUser(db, userId)).toEqual({
      all: 0,
      word: 0,
      phrase: 0,
      grammar: 0,
    });
    db.close();
  });

  test('counts all wrong attempts while using latest record for current status', () => {
    const { db, userId, wordId } = setupDb();
    record(db, userId, wordId, false, 'wrong 1');
    record(db, userId, wordId, false, 'wrong 2');

    const [item] = queries.getWrongItemsForUser(db, userId);

    expect(item.item_id).toBe(wordId);
    expect(item.wrong_count).toBe(2);
    expect(item.last_user_answer).toBe('wrong 2');
    db.close();
  });

  test('filters current wrong items by item type', () => {
    const { db, userId, wordId, phraseId, grammarId } = setupDb();
    record(db, userId, wordId, false, 'wrong word');
    record(db, userId, phraseId, false, 'wrong phrase');
    record(db, userId, grammarId, false, 'wrong grammar');

    expect(queries.getWrongItemsForUser(db, userId, { type: 'word' }).map(item => item.item_id)).toEqual([wordId]);
    expect(queries.getWrongItemsForUser(db, userId, { type: 'phrase' }).map(item => item.item_id)).toEqual([phraseId]);
    expect(queries.getWrongItemCountsForUser(db, userId)).toEqual({
      all: 3,
      word: 1,
      phrase: 1,
      grammar: 1,
    });
    db.close();
  });

  test('excludes mastered items from the current wrong set', () => {
    const { db, userId, wordId } = setupDb();
    record(db, userId, wordId, false, 'wrong');
    queries.setItemKnown(db, userId, wordId, true);

    expect(queries.getWrongItemsForUser(db, userId)).toHaveLength(0);
    expect(queries.getWrongItemCountsForUser(db, userId).all).toBe(0);
    db.close();
  });
});
```

- [ ] **Step 2: Run the query tests and verify they fail**

Run:

```powershell
cmd /c npx jest tests/wrong-answer-queries.test.js --runInBand --verbose
```

Expected: FAIL because `queries.getWrongItemsForUser` is not a function.

- [ ] **Step 3: Implement the minimal query helpers**

In `db/queries.js`, add this near the Review / Stats helper section:

```javascript
function normalizeWrongItemType(type) {
  return ['word', 'phrase', 'grammar'].includes(type) ? type : null;
}

function getWrongItemsForUser(db, userId, options = {}) {
  const type = normalizeWrongItemType(options.type);
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : null;
  const params = [userId, userId, userId];
  const typeClause = type ? 'AND items.type = ?' : '';
  if (type) params.push(type);
  const limitClause = limit ? 'LIMIT ?' : '';
  if (limit) params.push(limit);

  return db.prepare(
    `WITH latest_records AS (
       SELECT review_records.*
       FROM review_records
       JOIN (
         SELECT item_id, MAX(id) AS latest_id
         FROM review_records
         WHERE user_id = ?
         GROUP BY item_id
       ) latest ON latest.latest_id = review_records.id
     ),
     wrong_counts AS (
       SELECT item_id, COUNT(*) AS wrong_count
       FROM review_records
       WHERE user_id = ? AND is_correct = 0
       GROUP BY item_id
     ),
     latest_wrong AS (
       SELECT review_records.*
       FROM review_records
       JOIN (
         SELECT item_id, MAX(id) AS latest_wrong_id
         FROM review_records
         WHERE user_id = ? AND is_correct = 0
         GROUP BY item_id
       ) latest ON latest.latest_wrong_id = review_records.id
     )
     SELECT items.id AS item_id,
            items.type,
            items.english,
            items.chinese,
            items.pos,
            items.example,
            wrong_counts.wrong_count,
            latest_wrong.created_at AS last_wrong_at,
            latest_wrong.user_answer AS last_user_answer,
            latest_wrong.exercise_type AS last_exercise_type
     FROM latest_records
     JOIN items ON items.id = latest_records.item_id
     JOIN wrong_counts ON wrong_counts.item_id = items.id
     JOIN latest_wrong ON latest_wrong.item_id = items.id
     LEFT JOIN item_mastery
       ON item_mastery.user_id = latest_records.user_id
      AND item_mastery.item_id = items.id
      AND item_mastery.known = 1
     WHERE latest_records.is_correct = 0
       AND item_mastery.item_id IS NULL
       ${typeClause}
     ORDER BY latest_records.created_at DESC, latest_records.id DESC
     ${limitClause}`
  ).all(...params);
}

function getWrongItemCountsForUser(db, userId) {
  const counts = { all: 0, word: 0, phrase: 0, grammar: 0 };
  for (const item of getWrongItemsForUser(db, userId)) {
    counts.all += 1;
    if (Object.prototype.hasOwnProperty.call(counts, item.type)) {
      counts[item.type] += 1;
    }
  }
  return counts;
}
```

Add the helpers to `module.exports`:

```javascript
  getWrongItemsForUser,
  getWrongItemCountsForUser,
```

- [ ] **Step 4: Run the query tests and verify they pass**

Run:

```powershell
cmd /c npx jest tests/wrong-answer-queries.test.js --runInBand --verbose
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Run nearby regression tests**

Run:

```powershell
cmd /c npx jest tests/review-plan-scheduler.test.js tests/engine.test.js --runInBand --verbose
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add db/queries.js tests/wrong-answer-queries.test.js
git commit -m "feat: add wrong answer query helpers"
```

---

### Task 2: Wrong-Answer Notebook And Practice Routes

**Files:**
- Modify: `routes/practice.js`
- Create: `views/wrong-items.ejs`
- Test: `tests/wrong-answer-routes.test.js`

- [ ] **Step 1: Write failing route tests**

Create `tests/wrong-answer-routes.test.js`:

```javascript
const express = require('express');
const session = require('express-session');
const http = require('http');
const path = require('path');
const Database = require('better-sqlite3');
const { initDatabase } = require('../db/init');
const queries = require('../db/queries');

function buildApp(user) {
  const app = express();
  const db = new Database(':memory:');
  initDatabase(db);
  db.prepare('INSERT OR IGNORE INTO users (id, username, password, role) VALUES (?, ?, ?, ?)')
    .run(user.id, user.username, 'hash', user.role);
  app.locals.db = db;
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.use(express.urlencoded({ extended: true }));
  app.use(session({ secret: 'test', resave: false, saveUninitialized: true }));
  app.use((req, res, next) => {
    req.session.user = user;
    res.locals.user = user;
    next();
  });
  app.use(require('../routes/practice'));
  app.use((err, req, res, next) => {
    res.status(500).send('Error: ' + err.message);
  });
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
        res.on('end', () => server.close(() => resolve({ statusCode: res.statusCode, headers: res.headers, text })));
      });
      req.on('error', err => server.close(() => reject(err)));
      if (payload) req.write(payload);
      req.end();
    });
  });
}

function seedWrongItems(db, userId) {
  const textbookId = queries.createTextbook(db, '错题课本');
  const unitId = queries.createUnit(db, textbookId, 'Unit 1');
  const wordId = queries.createItem(db, { unitId, type: 'word', english: 'study', chinese: '学习' });
  const phraseId = queries.createItem(db, { unitId, type: 'phrase', english: 'look after', chinese: '照顾' });
  db.prepare(
    `INSERT INTO review_records (user_id, item_id, exercise_type, user_answer, is_correct)
     VALUES (?, ?, 'en2cn', '错误答案', 0)`
  ).run(userId, wordId);
  db.prepare(
    `INSERT INTO review_records (user_id, item_id, exercise_type, user_answer, is_correct)
     VALUES (?, ?, 'cn2en', 'wrong phrase', 0)`
  ).run(userId, phraseId);
  return { wordId, phraseId };
}

describe('wrong answer routes', () => {
  test('student can open wrong-answer notebook with current wrong items', async () => {
    const app = buildApp({ id: 2, username: 'student', role: 'user' });
    seedWrongItems(app.locals.db, 2);

    const res = await requestApp(app, 'GET', '/wrong-items');

    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('错题本');
    expect(res.text).toContain('study');
    expect(res.text).toContain('错误答案');
    expect(res.text).toContain('开始错题专项复习');
    app.cleanup();
  });

  test('wrong-answer notebook filters by type', async () => {
    const app = buildApp({ id: 2, username: 'student', role: 'user' });
    seedWrongItems(app.locals.db, 2);

    const res = await requestApp(app, 'GET', '/wrong-items?type=phrase');

    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('look after');
    expect(res.text).not.toContain('study');
    app.cleanup();
  });

  test('wrong-answer practice renders exercises from current wrong items', async () => {
    const app = buildApp({ id: 2, username: 'student', role: 'user' });
    seedWrongItems(app.locals.db, 2);

    const res = await requestApp(app, 'GET', '/practice/wrong?type=word');

    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('错题专项复习');
    expect(res.text).toContain('study');
    expect(res.text).toContain('answers[0][item_id]');
    app.cleanup();
  });

  test('wrong-answer practice redirects safely when no wrong items exist', async () => {
    const app = buildApp({ id: 2, username: 'student', role: 'user' });

    const res = await requestApp(app, 'GET', '/practice/wrong');

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/wrong-items');
    app.cleanup();
  });
});
```

- [ ] **Step 2: Run the route tests and verify they fail**

Run:

```powershell
cmd /c npx jest tests/wrong-answer-routes.test.js --runInBand --verbose
```

Expected: FAIL with 404 or render failure because `/wrong-items`, `/practice/wrong`, and `views/wrong-items.ejs` do not exist.

- [ ] **Step 3: Add small route helper functions**

In `routes/practice.js`, add near the top after `renderWithLayout`:

```javascript
function normalizeWrongFilter(value) {
  return ['word', 'phrase', 'grammar'].includes(value) ? value : 'all';
}

function buildWrongFilterHref(type) {
  return type === 'all' ? '/wrong-items' : `/wrong-items?type=${type}`;
}
```

- [ ] **Step 4: Add the notebook route**

In `routes/practice.js`, before `/practice/start`, add:

```javascript
router.get('/wrong-items', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.user.id;
  const activeType = normalizeWrongFilter(req.query.type);
  const queryType = activeType === 'all' ? null : activeType;
  const wrongItems = queries.getWrongItemsForUser(db, userId, { type: queryType });
  const counts = queries.getWrongItemCountsForUser(db, userId);
  const filters = [
    { type: 'all', label: '全部', count: counts.all, href: buildWrongFilterHref('all') },
    { type: 'word', label: '单词', count: counts.word, href: buildWrongFilterHref('word') },
    { type: 'phrase', label: '短语', count: counts.phrase, href: buildWrongFilterHref('phrase') },
    { type: 'grammar', label: '语法', count: counts.grammar, href: buildWrongFilterHref('grammar') },
  ];

  renderWithLayout(res, 'wrong-items', {
    wrongItems,
    counts,
    filters,
    activeType,
  }, '错题本');
});
```

- [ ] **Step 5: Add the wrong-answer practice route**

In `routes/practice.js`, before `/practice/start`, add:

```javascript
router.get('/practice/wrong', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.user.id;
  const activeType = normalizeWrongFilter(req.query.type);
  const queryType = activeType === 'all' ? null : activeType;
  const items = queries.getWrongItemsForUser(db, userId, { type: queryType, limit: 20 });

  if (items.length === 0) {
    return res.redirect('/wrong-items');
  }

  const exercises = generator.generateExercises(items, db);
  renderWithLayout(res, 'practice/exercise', {
    exercises,
    title: '错题专项复习',
    cycleType: null,
    page: 1,
    totalPages: 1,
    totalItems: items.length,
  }, '错题专项复习');
});
```

- [ ] **Step 6: Create the wrong-answer notebook view**

Create `views/wrong-items.ejs`:

```ejs
<h1>错题本</h1>

<section class="panel mb-2">
  <div class="flex-between">
    <div>
      <h2 class="mb-1">当前错题</h2>
      <p class="text-muted">共有 <%= counts.all %> 个当前错题。答对后会自动移出错题本。</p>
    </div>
    <% if (counts.all > 0) { %>
      <a class="primary-action" href="/practice/wrong<%= activeType !== 'all' ? '?type=' + activeType : '' %>">开始错题专项复习</a>
    <% } %>
  </div>
</section>

<nav class="filter-tabs mb-2" aria-label="错题筛选">
  <% filters.forEach(filter => { %>
    <a class="filter-tab <%= activeType === filter.type ? 'active' : '' %>" href="<%= filter.href %>">
      <span><%= filter.label %></span>
      <strong><%= filter.count %></strong>
    </a>
  <% }) %>
</nav>

<% if (wrongItems.length === 0) { %>
  <section class="panel">
    <h2>暂无错题</h2>
    <p class="text-muted">当前筛选下没有需要专项复习的错题。</p>
    <p class="mt-2"><a href="/practice" class="btn">返回复习主页</a></p>
  </section>
<% } else { %>
  <div class="wrong-item-list">
    <% wrongItems.forEach(item => { %>
      <article class="wrong-item-row">
        <div class="wrong-item-main">
          <span class="status-pill status-planned">
            <%= item.type === 'word' ? '单词' : item.type === 'phrase' ? '短语' : '语法' %>
          </span>
          <h2><%= item.english || item.chinese %></h2>
          <p class="text-muted"><%= item.chinese && item.english ? item.chinese : (item.english || '-') %></p>
        </div>
        <div class="wrong-item-meta">
          <strong><%= item.wrong_count %></strong>
          <span>错误次数</span>
        </div>
        <div class="wrong-item-detail">
          <div class="text-muted">最近答案：<%= item.last_user_answer || '空' %></div>
          <div class="text-muted">最近错误：<%= item.last_wrong_at || '-' %></div>
        </div>
      </article>
    <% }) %>
  </div>
<% } %>
```

- [ ] **Step 7: Add minimal styles if needed**

Append to `public/review.css`:

```css
.filter-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.filter-tab {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text);
  display: inline-flex;
  gap: 0.45rem;
  min-height: 2.2rem;
  padding: 0.4rem 0.75rem;
}

.filter-tab.active {
  border-color: var(--primary);
  color: var(--primary);
}

.wrong-item-list {
  display: grid;
  gap: 0.75rem;
}

.wrong-item-row {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(0, 1fr) auto minmax(180px, 0.6fr);
  padding: 1rem;
}

.wrong-item-main h2 {
  font-size: 1rem;
  margin: 0.35rem 0 0.15rem;
}

.wrong-item-meta {
  text-align: center;
}

.wrong-item-meta strong {
  color: var(--danger);
  display: block;
  font-size: 1.5rem;
}

.wrong-item-meta span,
.wrong-item-detail {
  color: var(--muted);
  font-size: 0.85rem;
}

@media (max-width: 720px) {
  .wrong-item-row {
    align-items: stretch;
    grid-template-columns: 1fr;
  }

  .wrong-item-meta {
    text-align: left;
  }
}
```

- [ ] **Step 8: Run route tests and verify they pass**

Run:

```powershell
cmd /c npx jest tests/wrong-answer-routes.test.js --runInBand --verbose
```

Expected: PASS, 4 tests.

- [ ] **Step 9: Run query plus route tests together**

Run:

```powershell
cmd /c npx jest tests/wrong-answer-queries.test.js tests/wrong-answer-routes.test.js --runInBand --verbose
```

Expected: PASS.

- [ ] **Step 10: Commit**

Run:

```powershell
git add routes/practice.js views/wrong-items.ejs public/review.css tests/wrong-answer-routes.test.js
git commit -m "feat: add wrong answer notebook routes"
```

---

### Task 3: Dashboard, Navigation, And UI Text Coverage

**Files:**
- Modify: `routes/practice.js`
- Modify: `views/layout.ejs`
- Modify: `views/practice/dashboard.ejs`
- Modify: `tests/ui-text.test.js`
- Test: `tests/wrong-answer-routes.test.js`

- [ ] **Step 1: Add failing dashboard route test**

Append to `tests/wrong-answer-routes.test.js` inside the `describe('wrong answer routes', () => { ... })` block:

```javascript
  test('practice dashboard exposes wrong-answer entry point', async () => {
    const app = buildApp({ id: 2, username: 'student', role: 'user' });
    seedWrongItems(app.locals.db, 2);

    const res = await requestApp(app, 'GET', '/practice');

    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('错题本');
    expect(res.text).toContain('开始错题专项复习');
    expect(res.text).toContain('当前错题');
    app.cleanup();
  });
```

- [ ] **Step 2: Add failing UI text coverage**

Update `tests/ui-text.test.js`:

```javascript
const filesWithUserFacingText = [
  // keep existing entries
  'views/wrong-items.ejs',
];
```

Add expected strings:

```javascript
  'views/wrong-items.ejs': ['错题本', '当前错题', '开始错题专项复习', '暂无错题', '错误次数'],
```

Extend existing expected text for these files:

```javascript
  'views/layout.ejs': [
    // keep existing strings
    '错题本',
  ],
  'views/practice/dashboard.ejs': [
    // keep existing strings
    '当前错题',
    '开始错题专项复习',
  ],
```

Keep the existing expected strings in the file. Only add the new path and new copy.

- [ ] **Step 3: Run the focused tests and verify they fail**

Run:

```powershell
cmd /c npx jest tests/wrong-answer-routes.test.js tests/ui-text.test.js --runInBand --verbose
```

Expected: FAIL because dashboard and layout do not yet expose the new copy.

- [ ] **Step 4: Pass wrong counts into the dashboard**

In the `/practice` handler in `routes/practice.js`, add after `taskSummary`:

```javascript
  const wrongCounts = queries.getWrongItemCountsForUser(db, userId);
```

Add `wrongCounts` to `renderWithLayout` data:

```javascript
    wrongCounts,
```

- [ ] **Step 5: Add student navigation link**

In `views/layout.ejs`, in the normal student nav branch, add:

```ejs
          <a href="/wrong-items">错题本</a>
```

Place it between `/practice` and `/stats`.

- [ ] **Step 6: Add dashboard wrong-answer entry panel**

In `views/practice/dashboard.ejs`, after the score metric grid and before `今日进度`, add:

```ejs
  <section class="panel mb-2">
    <div class="flex-between">
      <div>
        <h2 class="mb-1">当前错题</h2>
        <p class="text-muted">错题本中共有 <%= wrongCounts ? wrongCounts.all : 0 %> 个需要复习的条目。</p>
      </div>
      <div class="action-row">
        <a href="/wrong-items" class="btn">查看错题本</a>
        <% if (wrongCounts && wrongCounts.all > 0) { %>
          <a href="/practice/wrong" class="btn btn-primary">开始错题专项复习</a>
        <% } %>
      </div>
    </div>
  </section>
```

- [ ] **Step 7: Run focused tests and verify they pass**

Run:

```powershell
cmd /c npx jest tests/wrong-answer-routes.test.js tests/ui-text.test.js --runInBand --verbose
```

Expected: PASS.

- [ ] **Step 8: Run related route regression tests**

Run:

```powershell
cmd /c npx jest tests/review-plan-routes.test.js tests/practice-routes.test.js --runInBand --verbose
```

Expected: PASS.

- [ ] **Step 9: Commit**

Run:

```powershell
git add routes/practice.js views/layout.ejs views/practice/dashboard.ejs tests/ui-text.test.js tests/wrong-answer-routes.test.js
git commit -m "feat: expose wrong answer review entry points"
```

---

### Task 4: Full Verification And Documentation Check

**Files:**
- Read: `docs/superpowers/specs/2026-05-13-wrong-answer-review-design.md`
- Read: `docs/superpowers/plans/2026-05-13-wrong-answer-review.md`

- [ ] **Step 1: Run the main test suite excluding worktrees**

Run:

```powershell
cmd /c npx jest --verbose --testPathIgnorePatterns=.worktrees
```

Expected: all project tests pass.

- [ ] **Step 2: Check git status**

Run:

```powershell
git status --short --branch
```

Expected:

```text
## phrase-multiple-examples...origin/phrase-multiple-examples [ahead N]
?? .claude/
?? docs/new_vison_guide.md
```

`N` can be different from this plan because prior commits may exist. No wrong-answer implementation files should remain unstaged.

- [ ] **Step 3: Verify spec coverage**

Open `docs/superpowers/specs/2026-05-13-wrong-answer-review-design.md` and confirm each MVP requirement maps to implementation:

```text
Query helpers: getWrongItemsForUser, getWrongItemCountsForUser
Wrong-answer page: GET /wrong-items and views/wrong-items.ejs
Filtering: type query and filter tabs
Wrong-answer practice: GET /practice/wrong
Reuse scoring: existing POST /practice/submit unchanged
No new table: db/init.js unchanged
Tests: wrong-answer query, route, and UI text tests
```

- [ ] **Step 4: Commit any missed test-only documentation updates**

If Step 3 reveals a small documentation clarification is needed, edit only the relevant doc and run:

```powershell
git add docs/superpowers/specs/2026-05-13-wrong-answer-review-design.md docs/superpowers/plans/2026-05-13-wrong-answer-review.md
git commit -m "docs: clarify wrong answer review verification"
```

If no clarification is needed, do not create an empty commit.

---

## Final Verification Checklist

- [ ] `tests/wrong-answer-queries.test.js` verifies current wrong item semantics.
- [ ] `tests/wrong-answer-routes.test.js` verifies notebook, filter, practice, empty state, and dashboard entry behavior.
- [ ] `tests/ui-text.test.js` includes wrong-answer visible copy.
- [ ] `cmd /c npx jest --verbose --testPathIgnorePatterns=.worktrees` passes.
- [ ] No new database table is introduced.
- [ ] `.claude/` and `docs/new_vison_guide.md` remain untouched unless the user separately asks to handle them.
