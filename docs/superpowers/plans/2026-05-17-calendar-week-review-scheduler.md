# Calendar Week Review Scheduler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate today's English review tasks from the real calendar week so Sunday/Saturday consolidation and weekday 70/30 review behavior work even when the active plan was just created.

**Architecture:** Keep scheduling in `engine/scheduler.js`, add one date-range query to `db/queries.js`, and make `/practice` use the same scheduler as `/practice/start` so the dashboard no longer appears empty when tasks can be generated. The scheduler derives weekday/weekend role from `taskDate`, uses current-week Monday-Friday task rows for weekend review, and falls back to eligible active-plan items when the weekly pool is empty.

**Tech Stack:** Node.js, Express, better-sqlite3, Jest, Supertest route harness.

---

## File Structure

- Modify `db/queries.js`
  - Add `getReviewTaskItemsBetweenDates(db, userId, planId, startDate, endDate)`.
  - Export the new query helper.
- Modify `engine/scheduler.js`
  - Replace generated-day counting with calendar-date helpers.
  - Keep `splitQuota`, but update weekday selection so new content stays near 30%.
  - Add weekend fallback to active plan items when the current week has no Monday-Friday task rows.
- Modify `routes/practice.js`
  - Reuse or create today's tasks on `/practice` before computing dashboard counts.
  - Keep `/practice/start` behavior stable and show real plan counts if no tasks can be generated.
- Modify `tests/review-plan-scheduler.test.js`
  - Update scheduler tests from day-number assumptions to calendar-date rules.
  - Add Sunday fallback and weekday review-shortage coverage.
- Modify `tests/review-plan-routes.test.js`
  - Add dashboard test proving `/practice` no longer shows all-zero counts when an active plan has eligible content.

---

### Task 1: Add a Current-Week Task Query

**Files:**
- Modify: `db/queries.js`
- Test indirectly in: `tests/review-plan-scheduler.test.js`

- [ ] **Step 1: Add the failing scheduler test that needs a Monday-Friday range**

Append this test to `tests/review-plan-scheduler.test.js` inside `describe('plan-aware daily scheduler', () => { ... })`:

```js
  test('sunday consolidates items from the current calendar week', () => {
    const { db, planId, userId } = setup();

    for (let day = 11; day <= 15; day++) {
      scheduler.getOrCreateDailyReviewTasks(db, userId, planId, `2026-05-${day}`, {
        daily_words: 6,
        daily_phrases: 0,
        daily_grammar: 0,
      });
    }

    const sunday = scheduler.getOrCreateDailyReviewTasks(db, userId, planId, '2026-05-17', {
      daily_words: 6,
      daily_phrases: 0,
      daily_grammar: 0,
    });

    expect(sunday.words).toHaveLength(6);
    expect(sunday.words.every(item => item.source_type === 'cycle_review')).toBe(true);
    expect(new Set(sunday.words.map(item => item.task_date))).toEqual(new Set(['2026-05-17']));
    db.close();
  });
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
cmd /c npx jest tests/review-plan-scheduler.test.js --runInBand
```

Expected: FAIL because Sunday is still treated according to generated task count, not calendar role.

- [ ] **Step 3: Add the date-range query**

In `db/queries.js`, add this function immediately after `getRecentReviewTaskItems`:

```js
function getReviewTaskItemsBetweenDates(db, userId, planId, startDate, endDate) {
  return db.prepare(
    `SELECT items.*, daily_review_tasks.source_type, daily_review_tasks.task_date
     FROM daily_review_tasks
     JOIN items ON items.id = daily_review_tasks.item_id
     WHERE daily_review_tasks.user_id = ?
       AND daily_review_tasks.plan_id = ?
       AND daily_review_tasks.task_date BETWEEN ? AND ?
     ORDER BY daily_review_tasks.task_date, daily_review_tasks.id`
  ).all(userId, planId, startDate, endDate);
}
```

In the `module.exports` object near the bottom of `db/queries.js`, add:

```js
  getReviewTaskItemsBetweenDates,
```

- [ ] **Step 4: Run the focused test again**

Run:

```powershell
cmd /c npx jest tests/review-plan-scheduler.test.js --runInBand
```

Expected: still FAIL until `engine/scheduler.js` uses the new helper.

---

### Task 2: Replace Generated-Day Logic with Calendar Roles

**Files:**
- Modify: `engine/scheduler.js`
- Test: `tests/review-plan-scheduler.test.js`

- [ ] **Step 1: Add date helper functions**

In `engine/scheduler.js`, delete `getReviewDayNumber` and add these helpers above `splitQuota`:

```js
function parseTaskDate(taskDate) {
  return new Date(`${taskDate}T00:00:00`);
}

function formatTaskDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(taskDate, days) {
  const date = parseTaskDate(taskDate);
  date.setDate(date.getDate() + days);
  return formatTaskDate(date);
}

function getDayRole(taskDate) {
  const day = parseTaskDate(taskDate).getDay();
  return day === 0 || day === 6 ? 'weekend' : 'weekday';
}

function getCalendarWeekdayRange(taskDate) {
  const date = parseTaskDate(taskDate);
  const day = date.getDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(date);
  monday.setDate(date.getDate() - daysSinceMonday);
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  return {
    startDate: formatTaskDate(monday),
    endDate: formatTaskDate(friday),
  };
}
```

- [ ] **Step 2: Replace the selector signature and weekend behavior**

Replace `selectPlanItemsForType` with:

```js
function selectPlanItemsForType({ candidates, reviewPoolItems, wrongIds, knownIds, quota, dayRole }) {
  const available = candidates.filter(item => !knownIds.has(item.id));
  if (quota <= 0 || available.length === 0) return [];

  const availableIds = new Set(available.map(item => item.id));
  const reviewPoolIds = new Set(reviewPoolItems.map(item => item.id));
  const newItems = available.filter(item => !reviewPoolIds.has(item.id));
  const wrongItems = available.filter(item => wrongIds.has(item.id));
  const reviewItems = uniqueById([
    ...wrongItems,
    ...reviewPoolItems.filter(item => availableIds.has(item.id)),
  ]);

  if (dayRole === 'weekend') {
    const weekendPool = reviewItems.length > 0 ? reviewItems : available;
    return weekendPool.slice(0, quota).map(item => ({ ...item, source_type: 'cycle_review' }));
  }

  if (reviewItems.length === 0) {
    return newItems.slice(0, quota).map(item => ({ ...item, source_type: 'new' }));
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

  return [...selectedNew, ...selectedReview].slice(0, quota);
}
```

This intentionally does not add extra new items when the review pool exists but is smaller than the 70% target.

- [ ] **Step 3: Update `getOrCreateDailyReviewTasks` to use calendar pools**

In `getOrCreateDailyReviewTasks`, replace the `dayNumber` and `recentItems` lines:

```js
  const dayRole = getDayRole(taskDate);
  const planItems = queries.getItemsForPlan(db, planId);
  const knownIds = new Set(queries.getKnownItemIds(db, userId));
  const reviewPoolItems = dayRole === 'weekend'
    ? queries.getReviewTaskItemsBetweenDates(
        db,
        userId,
        planId,
        getCalendarWeekdayRange(taskDate).startDate,
        getCalendarWeekdayRange(taskDate).endDate
      )
    : queries.getRecentReviewTaskItems(db, userId, planId, 1);
  const wrongIds = getWrongItemIds(db, userId, planItems.map(item => item.id));
```

Then update each selector call to pass `reviewPoolItems` and `dayRole`:

```js
    words: selectPlanItemsForType({
      candidates: byType.words,
      reviewPoolItems,
      wrongIds,
      knownIds,
      quota: parseInt(quotas.daily_words, 10) || 0,
      dayRole,
    }),
```

Repeat the same property changes for `phrases` and `grammar`.

- [ ] **Step 4: Run scheduler tests**

Run:

```powershell
cmd /c npx jest tests/review-plan-scheduler.test.js --runInBand
```

Expected: tests still fail where older test names or expectations assume generated day numbers. Update those tests in Task 3.

---

### Task 3: Lock the Adjusted Weekday and Sunday Fallback Rules with Tests

**Files:**
- Modify: `tests/review-plan-scheduler.test.js`

- [ ] **Step 1: Rename existing calendar-sensitive tests**

Rename:

```js
test('day 1 generates quota-limited new content from active plan scope', () => {
```

to:

```js
test('monday with no review pool generates quota-limited new content from active plan scope', () => {
```

Rename:

```js
test('day 2 uses one new word and five review words for quota six', () => {
```

to:

```js
test('weekday uses one new word and five review words for quota six when review pool is large enough', () => {
```

Rename:

```js
test('day 6 introduces no new content', () => {
```

to:

```js
test('saturday introduces no new content after monday to friday tasks exist', () => {
```

- [ ] **Step 2: Add a Sunday fallback test for a newly activated plan**

Append:

```js
  test('sunday falls back to active plan items when current week has no task history', () => {
    const { db, planId, unit1Words, userId } = setup();

    const sunday = scheduler.getOrCreateDailyReviewTasks(db, userId, planId, '2026-05-17', {
      daily_words: 6,
      daily_phrases: 0,
      daily_grammar: 0,
    });

    expect(sunday.words).toHaveLength(6);
    expect(sunday.words.every(item => item.source_type === 'cycle_review')).toBe(true);
    expect(sunday.words.map(item => item.id).every(id => unit1Words.includes(id))).toBe(true);
    db.close();
  });
```

- [ ] **Step 3: Add the weekday review-shortage test**

Append:

```js
  test('weekday does not replace a small review pool with extra new content', () => {
    const { db, planId, userId } = setup();

    scheduler.getOrCreateDailyReviewTasks(db, userId, planId, '2026-05-13', {
      daily_words: 2,
      daily_phrases: 0,
      daily_grammar: 0,
    });

    const thursday = scheduler.getOrCreateDailyReviewTasks(db, userId, planId, '2026-05-14', {
      daily_words: 6,
      daily_phrases: 0,
      daily_grammar: 0,
    });

    expect(thursday.words.filter(item => item.source_type === 'new')).toHaveLength(1);
    expect(thursday.words.filter(item => item.source_type === 'recent_review')).toHaveLength(2);
    expect(thursday.words).toHaveLength(3);
    db.close();
  });
```

- [ ] **Step 4: Run scheduler tests**

Run:

```powershell
cmd /c npx jest tests/review-plan-scheduler.test.js --runInBand
```

Expected: PASS for all scheduler tests.

- [ ] **Step 5: Commit scheduler changes**

Run:

```powershell
git add db/queries.js engine/scheduler.js tests/review-plan-scheduler.test.js
git commit -m "fix: schedule reviews by calendar week"
```

Expected: commit succeeds.

---

### Task 4: Make the Practice Dashboard Reflect Generated Daily Tasks

**Files:**
- Modify: `routes/practice.js`
- Test: `tests/review-plan-routes.test.js`

- [ ] **Step 1: Add route test for dashboard task generation**

Append this test inside `describe('student review plan flow', () => { ... })`:

```js
  test('student dashboard creates today review tasks when active plan has eligible content', async () => {
    const app = buildAppForRoute({ id: 2, username: 'student', role: 'user' }, require('../routes/practice'));
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

    const res = await requestApp(app, 'GET', '/practice');
    const savedAfterDashboard = db.prepare(
      'SELECT COUNT(*) AS count FROM daily_review_tasks WHERE user_id = 2 AND plan_id = ?'
    ).get(planId).count;

    expect(res.statusCode).toBe(200);
    expect(savedAfterDashboard).toBe(3);
    expect(res.text).not.toContain('暂无复习内容');
    app.cleanup();
  });
```

If the existing test file stores mojibake strings, keep the exact readable Chinese only in new assertions that must match newly rendered output. Prefer database-count assertions for stable behavior.

- [ ] **Step 2: Run route tests and verify failure**

Run:

```powershell
cmd /c npx jest tests/review-plan-routes.test.js --runInBand
```

Expected: FAIL because `/practice` reads existing tasks only.

- [ ] **Step 3: Update `/practice` dashboard task loading**

In `routes/practice.js`, replace:

```js
  const todayTasks = activePlan
    ? queries.getDailyReviewTasks(db, userId, activePlan.id, today)
    : [];
```

with:

```js
  const todayTaskGroups = activePlan
    ? scheduler.getOrCreateDailyReviewTasks(db, userId, activePlan.id, today, config)
    : { words: [], phrases: [], grammar: [] };
  const todayTasks = [...todayTaskGroups.words, ...todayTaskGroups.phrases, ...todayTaskGroups.grammar];
```

- [ ] **Step 4: Preserve real plan counts in the `/practice/start` empty branch**

In the empty branch of `/practice/start`, replace:

```js
      planCounts: { word: 0, phrase: 0, grammar: 0 },
```

with:

```js
      planCounts: queries.getActiveReviewPlan(db)
        ? queries.getPlanItemCounts(db, queries.getActiveReviewPlan(db).id)
        : { word: 0, phrase: 0, grammar: 0 },
```

If editing this branch, it is cleaner to assign `const emptyActivePlan = queries.getActiveReviewPlan(db);` before `renderWithLayout` and reuse it for both `activePlan` and `planCounts`.

- [ ] **Step 5: Run route tests**

Run:

```powershell
cmd /c npx jest tests/review-plan-routes.test.js --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit route changes**

Run:

```powershell
git add routes/practice.js tests/review-plan-routes.test.js
git commit -m "fix: populate practice dashboard tasks"
```

Expected: commit succeeds.

---

### Task 5: Full Verification and PR Update

**Files:**
- No code edits expected.

- [ ] **Step 1: Run the full Jest suite**

Run:

```powershell
cmd /c npx jest --runInBand
```

Expected: all test suites pass.

- [ ] **Step 2: Inspect changed files**

Run:

```powershell
git status --short
git diff --stat HEAD~2..HEAD
```

Expected: only scheduler, queries, practice route, and related tests changed after the plan commit.

- [ ] **Step 3: Push the branch**

Run:

```powershell
git push origin phrase-multiple-examples
```

Expected: PR #2 updates with the scheduler fix commits.

- [ ] **Step 4: Manual verification**

Restart the local server if it is still running old code, then open:

```text
http://localhost:3000/practice
```

Expected on Sunday with an active plan:

- `今日单词`, `今日短语`, and `今日语法` reflect generated task counts according to configured quotas and available items.
- The red `暂无复习内容` alert does not appear when the active plan has eligible items.
- `开始复习` opens a generated exercise page instead of returning to the empty dashboard.

---

## Self-Review Notes

- Spec coverage:
  - Calendar weekday/weekend role: Task 2.
  - Sunday with no weekly history fallback: Task 3.
  - Weekday review shortage does not inflate new content: Task 3.
  - Same-day reuse remains stable: existing test remains in Task 3 run.
  - Dashboard no longer empty when generation is possible: Task 4.
  - Mastered-item exclusion: existing scheduler test remains in Task 3 run.
- Red-flag scan:
  - No deferred work markers or unspecified test steps remain.
- Type consistency:
  - New query helper name is `getReviewTaskItemsBetweenDates`.
  - Scheduler selector uses `reviewPoolItems` and `dayRole`.
  - Public scheduler API remains `getOrCreateDailyReviewTasks(db, userId, planId, taskDate, quotas)`.
