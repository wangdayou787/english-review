# Wrong Answer Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a student-facing detail page for one current wrong item, including the last wrong answer, current correct answer metadata, and recent review history.

**Architecture:** Extend the existing wrong-answer notebook flow without adding tables. Query helpers in `db/queries.js` keep all user scoping and current-wrong eligibility checks in one place; `routes/practice.js` renders a new EJS view and uses `engine/exercise-builders.resolveAnswerMetadata` to derive current correct-answer metadata from live item data.

**Tech Stack:** Node.js, Express, EJS, SQLite via better-sqlite3, Jest.

---

## File Structure

- Modify `db/queries.js`: add `getWrongItemDetailForUser(db, userId, itemId)` and `getReviewHistoryForUserItem(db, userId, itemId, options = {})`; export both.
- Modify `routes/practice.js`: import `resolveAnswerMetadata`; add `parseItemId`; add `GET /wrong-items/:itemId` before `/practice/wrong`.
- Modify `views/wrong-items.ejs`: add a detail link for each wrong item row.
- Create `views/wrong-item-detail.ejs`: render item details, current correct answer metadata, and review history.
- Modify `tests/wrong-answer-queries.test.js`: cover detail and history query behavior.
- Modify `tests/wrong-answer-routes.test.js`: cover detail route, inaccessible items, and list link.
- Modify `tests/ui-text.test.js`: include the new detail view and expected Chinese labels.

## Implementation Notes

- Keep existing mojibake-looking literals in tests consistent with the repo's current encoded fixture strings. Do not perform a broad encoding cleanup.
- Use only current live item/support data for correct-answer metadata. The page does not reconstruct historical generated questions.
- User isolation belongs in SQL helpers, not only in route code.
- Resolved wrong items should redirect to `/wrong-items` from the detail route.

---

### Task 1: Query Helpers For Detail And History

**Files:**
- Modify: `tests/wrong-answer-queries.test.js`
- Modify: `db/queries.js`

- [ ] **Step 1: Add failing query tests**

Append these tests inside `describe('wrong answer query helpers', () => { ... })` in `tests/wrong-answer-queries.test.js`:

```js
  test('returns current wrong item detail for one user and item', () => {
    const { db, userId, wordId } = setupDb();
    record(db, userId, wordId, false, 'wrong detail answer');

    const detail = queries.getWrongItemDetailForUser(db, userId, wordId);

    expect(detail.item_id).toBe(wordId);
    expect(detail.type).toBe('word');
    expect(detail.english).toBe('study');
    expect(detail.wrong_count).toBe(1);
    expect(detail.last_user_answer).toBe('wrong detail answer');
    expect(detail.last_exercise_type).toBe('en2cn');
    db.close();
  });

  test('wrong item detail returns null after a later correct answer', () => {
    const { db, userId, wordId } = setupDb();
    record(db, userId, wordId, false, 'wrong');
    record(db, userId, wordId, true, '瀛︿範');

    expect(queries.getWrongItemDetailForUser(db, userId, wordId)).toBeNull();
    db.close();
  });

  test('wrong item detail is scoped to the current user', () => {
    const { db, wordId } = setupDb();
    db.prepare("INSERT INTO users (id, username, password, role) VALUES (3, 'other', 'hash', 'user')").run();
    record(db, 3, wordId, false, 'other wrong answer');

    expect(queries.getWrongItemDetailForUser(db, 2, wordId)).toBeNull();
    db.close();
  });

  test('review history returns recent records for only one user and item', () => {
    const { db, userId, wordId, phraseId } = setupDb();
    db.prepare("INSERT INTO users (id, username, password, role) VALUES (3, 'other', 'hash', 'user')").run();
    record(db, userId, wordId, false, 'first wrong');
    record(db, userId, wordId, true, '瀛︿範');
    record(db, userId, phraseId, false, 'wrong phrase');
    record(db, 3, wordId, false, 'other user answer');

    const history = queries.getReviewHistoryForUserItem(db, userId, wordId);

    expect(history).toHaveLength(2);
    expect(history.map(row => row.user_answer)).toEqual(['瀛︿範', 'first wrong']);
    expect(history.every(row => row.item_id === wordId)).toBe(true);
    expect(history.every(row => row.user_id === userId)).toBe(true);
    db.close();
  });
```

- [ ] **Step 2: Run query tests and verify failure**

Run:

```bash
cmd /c npx jest tests/wrong-answer-queries.test.js --verbose
```

Expected: FAIL because `queries.getWrongItemDetailForUser` and `queries.getReviewHistoryForUserItem` are not functions.

- [ ] **Step 3: Implement query helpers**

In `db/queries.js`, add this helper after `getWrongItemsForUser`:

```js
function getWrongItemDetailForUser(db, userId, itemId) {
  const parsedItemId = Number(itemId);
  if (!Number.isInteger(parsedItemId) || parsedItemId <= 0) return null;

  return db.prepare(
    `WITH latest_records AS (
       SELECT review_records.*
       FROM review_records
       JOIN (
         SELECT item_id, MAX(id) AS latest_id
         FROM review_records
         WHERE user_id = ? AND item_id = ?
         GROUP BY item_id
       ) latest ON latest.latest_id = review_records.id
     ),
     wrong_counts AS (
       SELECT item_id, COUNT(*) AS wrong_count
       FROM review_records
       WHERE user_id = ? AND item_id = ? AND is_correct = 0
       GROUP BY item_id
     )
     SELECT
       items.id AS item_id,
       items.id AS id,
       items.type,
       items.english,
       items.chinese,
       items.pos,
       items.example,
       wrong_counts.wrong_count,
       latest_records.created_at AS last_wrong_at,
       latest_records.user_answer AS last_user_answer,
       latest_records.exercise_type AS last_exercise_type
     FROM latest_records
     JOIN items ON items.id = latest_records.item_id
     JOIN wrong_counts ON wrong_counts.item_id = latest_records.item_id
     LEFT JOIN item_mastery
       ON item_mastery.user_id = latest_records.user_id
      AND item_mastery.item_id = latest_records.item_id
      AND item_mastery.known = 1
     WHERE latest_records.is_correct = 0
       AND item_mastery.item_id IS NULL`
  ).get(userId, parsedItemId, userId, parsedItemId) || null;
}
```

Then add this helper after `getWrongItemCountsForUser`:

```js
function getReviewHistoryForUserItem(db, userId, itemId, options = {}) {
  const parsedItemId = Number(itemId);
  if (!Number.isInteger(parsedItemId) || parsedItemId <= 0) return [];

  const limit = normalizePositiveLimit(options.limit) || 10;
  return db.prepare(
    `SELECT id, user_id, item_id, exercise_type, user_answer, is_correct, created_at
     FROM review_records
     WHERE user_id = ? AND item_id = ?
     ORDER BY id DESC
     LIMIT ?`
  ).all(userId, parsedItemId, limit);
}
```

Add both names to `module.exports` near the existing wrong-answer exports:

```js
  getWrongItemsForUser,
  getWrongItemDetailForUser,
  getWrongItemCountsForUser,
  getReviewHistoryForUserItem,
```

- [ ] **Step 4: Run query tests and verify pass**

Run:

```bash
cmd /c npx jest tests/wrong-answer-queries.test.js --verbose
```

Expected: PASS.

- [ ] **Step 5: Commit query helpers**

Run:

```bash
git add db/queries.js tests/wrong-answer-queries.test.js
git commit -m "feat: add wrong answer detail queries"
```

---

### Task 2: Detail Route And View

**Files:**
- Modify: `tests/wrong-answer-routes.test.js`
- Modify: `routes/practice.js`
- Create: `views/wrong-item-detail.ejs`

- [ ] **Step 1: Add failing route tests**

In `tests/wrong-answer-routes.test.js`, add this helper after `seedWordWrongItem`:

```js
function seedPhraseChoiceWrongItem(db, userId) {
  const textbookId = queries.createTextbook(db, '閿欓璇炬湰');
  const unitId = queries.createUnit(db, textbookId, 'Unit 1');
  const phraseId = queries.createItem(db, {
    unitId,
    type: 'phrase',
    english: 'look after',
    chinese: '鐓ч【',
  });
  queries.savePhraseChoiceQuestion(db, {
    itemId: phraseId,
    promptSentence: 'Please ___ your little sister.',
    correctPhrase: 'look after',
    distractorA: 'look up',
    distractorB: 'look for',
    distractorC: 'look into',
    explanation: 'look after means take care of someone.',
  });
  db.prepare(
    `INSERT INTO review_records (user_id, item_id, exercise_type, user_answer, is_correct)
     VALUES (?, ?, 'phrase_choice', 'look up', 0)`
  ).run(userId, phraseId);
  return { phraseId };
}
```

Append these tests inside `describe('wrong answer routes', () => { ... })`:

```js
  test('student can open wrong-answer detail with answer metadata and history', async () => {
    const app = buildApp({ id: 2, username: 'student', role: 'user' });
    const { phraseId } = seedPhraseChoiceWrongItem(app.locals.db, 2);

    const res = await requestApp(app, 'GET', `/wrong-items/${phraseId}`);

    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('閿欓璇︽儏');
    expect(res.text).toContain('look after');
    expect(res.text).toContain('look up');
    expect(res.text).toContain('look after means take care of someone.');
    expect(res.text).toContain('鏈€杩戜綔绛旇褰?);
    app.cleanup();
  });

  test('wrong-answer detail redirects after the item is resolved', async () => {
    const app = buildApp({ id: 2, username: 'student', role: 'user' });
    const { wordId } = seedWordWrongItem(app.locals.db, 2);
    app.locals.db.prepare(
      `INSERT INTO review_records (user_id, item_id, exercise_type, user_answer, is_correct)
       VALUES (?, ?, 'en2cn', '瀛︿範', 1)`
    ).run(2, wordId);

    const res = await requestApp(app, 'GET', `/wrong-items/${wordId}`);

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/wrong-items');
    app.cleanup();
  });

  test('wrong-answer detail does not expose another user item', async () => {
    const app = buildApp({ id: 2, username: 'student', role: 'user' });
    app.locals.db.prepare("INSERT INTO users (id, username, password, role) VALUES (3, 'other', 'hash', 'user')").run();
    const { wordId } = seedWordWrongItem(app.locals.db, 3);

    const res = await requestApp(app, 'GET', `/wrong-items/${wordId}`);

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/wrong-items');
    app.cleanup();
  });
```

- [ ] **Step 2: Run route tests and verify failure**

Run:

```bash
cmd /c npx jest tests/wrong-answer-routes.test.js --verbose
```

Expected: FAIL because `/wrong-items/:itemId` does not exist.

- [ ] **Step 3: Implement the route**

In `routes/practice.js`, add this import near the existing generator import:

```js
const { resolveAnswerMetadata } = require('../engine/exercise-builders');
```

Add this helper after `buildWrongFilterHref`:

```js
function parseItemId(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
```

Add this route after `router.get('/wrong-items', ...)` and before `router.get('/practice/wrong', ...)`:

```js
router.get('/wrong-items/:itemId', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.user.id;
  const itemId = parseItemId(req.params.itemId);

  if (!itemId) {
    return res.redirect('/wrong-items');
  }

  const wrongItem = queries.getWrongItemDetailForUser(db, userId, itemId);
  if (!wrongItem) {
    return res.redirect('/wrong-items');
  }

  const answerMetadata = resolveAnswerMetadata(
    { ...wrongItem, id: wrongItem.item_id },
    wrongItem.last_exercise_type,
    db
  );
  const history = queries.getReviewHistoryForUserItem(db, userId, itemId, { limit: 10 });

  renderWithLayout(res, 'wrong-item-detail', {
    wrongItem,
    answerMetadata,
    history,
  }, '閿欓璇︽儏');
});
```

- [ ] **Step 4: Create the detail view**

Create `views/wrong-item-detail.ejs`:

```ejs
<h1>閿欓璇︽儏</h1>

<p class="mb-2">
  <a href="/wrong-items" class="btn">杩斿洖閿欓鏈?/a>
  <a href="/practice/wrong" class="btn btn-primary">寮€濮嬮敊棰樹笓椤瑰涔?/a>
</p>

<section class="panel mb-2">
  <div class="flex-between">
    <div>
      <span class="status-pill status-planned">
        <%= wrongItem.type === 'word' ? '鍗曡瘝' : wrongItem.type === 'phrase' ? '鐭' : '璇硶' %>
      </span>
      <h2 class="mt-1"><%= wrongItem.english || wrongItem.chinese %></h2>
      <% if (wrongItem.chinese && wrongItem.english) { %>
        <p class="text-muted"><%= wrongItem.chinese %></p>
      <% } %>
      <% if (wrongItem.pos) { %>
        <p class="text-muted">璇嶆€э細<%= wrongItem.pos %></p>
      <% } %>
      <% if (wrongItem.example) { %>
        <p class="text-muted">渚嬪彞锛歕%= wrongItem.example %></p>
      <% } %>
    </div>
    <div class="wrong-item-meta">
      <strong><%= wrongItem.wrong_count %></strong>
      <span>閿欒娆℃暟</span>
    </div>
  </div>
</section>

<section class="panel mb-2">
  <h2>鏈€杩戦敊璇?/h2>
  <p>浣犵殑绛旀锛歕%= wrongItem.last_user_answer || '绌? %></p>
  <p>棰樺瀷锛歕%= wrongItem.last_exercise_type || '-' %></p>
  <p>鏃堕棿锛歕%= wrongItem.last_wrong_at || '-' %></p>
</section>

<section class="panel mb-2">
  <h2>姝ｇ‘绛旀</h2>
  <% if (answerMetadata && answerMetadata.correct_answer) { %>
    <p><%= answerMetadata.correct_answer %></p>
  <% } else { %>
    <p class="text-muted">鏆傛棤鍙樉绀虹殑姝ｇ‘绛旀銆?/p>
  <% } %>
  <% if (answerMetadata && answerMetadata.explanation) { %>
    <h3>瑙ｆ瀽</h3>
    <p><%= answerMetadata.explanation %></p>
  <% } %>
</section>

<section class="panel">
  <h2>鏈€杩戜綔绛旇褰?/h2>
  <% if (history.length === 0) { %>
    <p class="text-muted">鏆傛棤浣滅瓟璁板綍銆?/p>
  <% } else { %>
    <table>
      <thead>
        <tr>
          <th>鏃堕棿</th>
          <th>棰樺瀷</th>
          <th>浣犵殑绛旀</th>
          <th>缁撴灉</th>
        </tr>
      </thead>
      <tbody>
        <% history.forEach(record => { %>
          <tr>
            <td><%= record.created_at || '-' %></td>
            <td><%= record.exercise_type || '-' %></td>
            <td><%= record.user_answer || '绌? %></td>
            <td><%= record.is_correct ? '姝ｇ‘' : '閿欒' %></td>
          </tr>
        <% }) %>
      </tbody>
    </table>
  <% } %>
</section>
```

- [ ] **Step 5: Run route tests and verify pass**

Run:

```bash
cmd /c npx jest tests/wrong-answer-routes.test.js --verbose
```

Expected: PASS.

- [ ] **Step 6: Commit route and view**

Run:

```bash
git add routes/practice.js views/wrong-item-detail.ejs tests/wrong-answer-routes.test.js
git commit -m "feat: add wrong answer detail page"
```

---

### Task 3: Link Notebook Rows To Detail

**Files:**
- Modify: `tests/wrong-answer-routes.test.js`
- Modify: `views/wrong-items.ejs`

- [ ] **Step 1: Add failing list-link assertion**

In the existing test `student can open wrong-answer notebook with current wrong items`, add this assertion after the existing `study` assertion:

```js
    expect(res.text).toContain('href="/wrong-items/');
    expect(res.text).toContain('鏌ョ湅璇︽儏');
```

- [ ] **Step 2: Run route tests and verify failure**

Run:

```bash
cmd /c npx jest tests/wrong-answer-routes.test.js --verbose
```

Expected: FAIL because the notebook list does not yet render a detail link.

- [ ] **Step 3: Add detail link to list rows**

In `views/wrong-items.ejs`, inside `<div class="wrong-item-detail">`, add this link after the two existing metadata lines:

```ejs
          <div class="mt-1">
            <a class="btn" href="/wrong-items/<%= item.item_id %>">鏌ョ湅璇︽儏</a>
          </div>
```

- [ ] **Step 4: Run route tests and verify pass**

Run:

```bash
cmd /c npx jest tests/wrong-answer-routes.test.js --verbose
```

Expected: PASS.

- [ ] **Step 5: Commit notebook link**

Run:

```bash
git add views/wrong-items.ejs tests/wrong-answer-routes.test.js
git commit -m "feat: link wrong answer details"
```

---

### Task 4: UI Text Coverage And Full Verification

**Files:**
- Modify: `tests/ui-text.test.js`

- [ ] **Step 1: Add failing UI text coverage**

In `tests/ui-text.test.js`, add the new view to `filesWithUserFacingText` after `views/wrong-items.ejs`:

```js
  'views/wrong-item-detail.ejs',
```

Add this entry to `expectedText` after the `views/wrong-items.ejs` entry:

```js
  'views/wrong-item-detail.ejs': ['閿欓璇︽儏', '鏈€杩戦敊璇?, '姝ｇ‘绛旀', '鏈€杩戜綔绛旇褰?, '杩斿洖閿欓鏈?],
```

- [ ] **Step 2: Run UI text test and verify failure if the view text is incomplete**

Run:

```bash
cmd /c npx jest tests/ui-text.test.js --verbose
```

Expected: PASS if Task 2 used the exact labels above; otherwise FAIL with the missing label name.

- [ ] **Step 3: Fix missing labels if the UI text test fails**

If the test reports a missing label in `views/wrong-item-detail.ejs`, update the matching heading or link text in that view to use the exact expected string from Step 1. Do not change unrelated UI strings.

- [ ] **Step 4: Run focused tests**

Run:

```bash
cmd /c npx jest tests/wrong-answer-queries.test.js tests/wrong-answer-routes.test.js tests/ui-text.test.js --verbose
```

Expected: PASS.

- [ ] **Step 5: Run full suite**

Run:

```bash
cmd /c npx jest --verbose --testPathIgnorePatterns=.worktrees
```

Expected: PASS.

- [ ] **Step 6: Commit UI coverage**

Run:

```bash
git add tests/ui-text.test.js views/wrong-item-detail.ejs
git commit -m "test: cover wrong answer detail text"
```

---

## Final Review Checklist

- [ ] `getWrongItemDetailForUser` returns `null` for invalid ids, resolved items, mastered items, and other users' records.
- [ ] `getReviewHistoryForUserItem` returns newest-first history and never crosses user boundaries.
- [ ] `/wrong-items/:itemId` is registered before routes that could conflict and redirects to `/wrong-items` for inaccessible records.
- [ ] The detail page renders even when `answerMetadata.correct_answer` or `answerMetadata.explanation` is empty.
- [ ] The notebook list links each row to `/wrong-items/:itemId`.
- [ ] `cmd /c npx jest --verbose --testPathIgnorePatterns=.worktrees` passes.
