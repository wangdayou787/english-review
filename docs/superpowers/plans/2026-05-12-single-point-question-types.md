# Single Point Question Types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the first four SQLite-backed single-point question types: spelling fill, inflection fill, phrase distinction choice, and enhanced sentence ordering.

**Architecture:** Extend the existing `items` workflow with three supporting tables and focused query helpers. Reuse the current admin item editing flow, question type configuration, and practice routes; only generate a new question type when both the `question_types` setting and the supporting data are present.

**Tech Stack:** Node.js CommonJS, Express 5, EJS, better-sqlite3, Jest, existing CSS in `public/style.css` and `public/review.css`.

---

## File Structure

- Modify `db/init.js`: create `word_question_details`, `phrase_choice_questions`, and `sentence_order_details`.
- Modify `db/queries.js`: add CRUD helpers for the three supporting tables.
- Modify `engine/generator.js`: generate the four question types, route them through current exercises, and score them.
- Modify `routes/admin.js`: save and load supporting question-type data within the item edit flow.
- Modify [views/admin/item-edit.ejs](/C:/Users/dayou/english-review/views/admin/item-edit.ejs): add UI sections for word details, phrase distinction questions, and sentence ordering details.
- Modify [views/practice/exercise.ejs](/C:/Users/dayou/english-review/views/practice/exercise.ejs) and [views/practice/result.ejs](/C:/Users/dayou/english-review/views/practice/result.ejs): render new prompts and explanations.
- Modify `public/review.css`: add focused styles for new admin subforms and exercise hints.
- Modify tests: `tests/db-init.test.js`, `tests/question-type-queries.test.js`, `tests/question-type-generator.test.js`, `tests/question-type-routes.test.js`, `tests/ui-text.test.js`.
- Create `tests/single-point-score.test.js`: focused scoring cases for the four new question types.

---

### Task 1: Schema For Single-Point Supporting Tables

**Files:**
- Modify: `db/init.js`
- Test: `tests/db-init.test.js`

- [ ] **Step 1: Write the failing schema tests**

Append these tests inside the existing `describe('db/init.js — database initialization', ...)` block in `tests/db-init.test.js`.

```js
  test('initDatabase creates single-point question support tables', () => {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all().map(r => r.name);

    expect(tables).toContain('word_question_details');
    expect(tables).toContain('phrase_choice_questions');
    expect(tables).toContain('sentence_order_details');
  });

  test('word_question_details and sentence_order_details enforce one row per item', () => {
    const textbookId = db.prepare("INSERT INTO textbooks (name) VALUES ('Schema Book')").run().lastInsertRowid;
    const unitId = db.prepare("INSERT INTO units (textbook_id, name) VALUES (?, 'Unit 1')").run(textbookId).lastInsertRowid;
    const wordId = db.prepare(
      "INSERT INTO items (unit_id, type, english, chinese) VALUES (?, 'word', 'apple', '苹果')"
    ).run(unitId).lastInsertRowid;
    const grammarId = db.prepare(
      "INSERT INTO items (unit_id, type, english, chinese) VALUES (?, 'grammar', 'I am a student', '我是学生')"
    ).run(unitId).lastInsertRowid;

    db.prepare(
      "INSERT INTO word_question_details (item_id, base_form, inflections_json) VALUES (?, 'apple', '{}')"
    ).run(wordId);
    db.prepare(
      "INSERT INTO sentence_order_details (item_id, answer_sentence, tokens_json) VALUES (?, 'I am a student', '[\"I\",\"am\",\"a\",\"student\"]')"
    ).run(grammarId);

    expect(() => {
      db.prepare(
        "INSERT INTO word_question_details (item_id, base_form, inflections_json) VALUES (?, 'apple', '{}')"
      ).run(wordId);
    }).toThrow();

    expect(() => {
      db.prepare(
        "INSERT INTO sentence_order_details (item_id, answer_sentence, tokens_json) VALUES (?, 'I am a student', '[\"I\",\"am\",\"a\",\"student\"]')"
      ).run(grammarId);
    }).toThrow();
  });

  test('single-point supporting rows cascade delete with item removal', () => {
    const textbookId = db.prepare("INSERT INTO textbooks (name) VALUES ('Cascade Book')").run().lastInsertRowid;
    const unitId = db.prepare("INSERT INTO units (textbook_id, name) VALUES (?, 'Unit 1')").run(textbookId).lastInsertRowid;
    const phraseId = db.prepare(
      "INSERT INTO items (unit_id, type, english, chinese) VALUES (?, 'phrase', 'look after', '照顾')"
    ).run(unitId).lastInsertRowid;

    db.prepare(
      "INSERT INTO phrase_choice_questions (item_id, prompt_sentence, correct_phrase, distractor_a, distractor_b, distractor_c, explanation) VALUES (?, 'She often ___ her sister.', 'looks after', 'looks up', 'looks for', 'looks at', '固定搭配')"
    ).run(phraseId);

    db.prepare('DELETE FROM items WHERE id = ?').run(phraseId);

    const row = db.prepare('SELECT * FROM phrase_choice_questions WHERE item_id = ?').get(phraseId);
    expect(row).toBeUndefined();
  });
```

- [ ] **Step 2: Run the failing schema tests**

Run:

```bash
cmd /c npx jest tests\db-init.test.js --runInBand --verbose
```

Expected: FAIL because the three tables do not exist yet.

- [ ] **Step 3: Add the three tables to `db/init.js`**

Inside the existing `db.exec` schema block, add:

```sql
    CREATE TABLE IF NOT EXISTS word_question_details (
      item_id            INTEGER PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
      base_form          TEXT,
      first_letter_hint  TEXT,
      usage_note         TEXT,
      inflections_json   TEXT    NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS phrase_choice_questions (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id         INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      prompt_sentence TEXT    NOT NULL,
      correct_phrase  TEXT    NOT NULL,
      distractor_a    TEXT    NOT NULL,
      distractor_b    TEXT    NOT NULL,
      distractor_c    TEXT    NOT NULL,
      explanation     TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_phrase_choice_questions_item ON phrase_choice_questions(item_id, id);

    CREATE TABLE IF NOT EXISTS sentence_order_details (
      item_id          INTEGER PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
      answer_sentence  TEXT    NOT NULL,
      tokens_json      TEXT    NOT NULL DEFAULT '[]',
      hint_text        TEXT
    );
```

- [ ] **Step 4: Verify schema task and commit**

Run:

```bash
cmd /c npx jest tests\db-init.test.js --runInBand --verbose
```

Expected: PASS.

Commit:

```bash
git add db/init.js tests/db-init.test.js
git commit -m "feat: add single-point question tables"
```

---

### Task 2: Query Helpers For Supporting Data

**Files:**
- Modify: `db/queries.js`
- Modify: `tests/question-type-queries.test.js`

- [ ] **Step 1: Write the failing query tests**

Append these tests to `tests/question-type-queries.test.js`.

```js
  test('saveWordQuestionDetails upserts structured word fields', () => {
    const textbookId = queries.createTextbook(db, 'Word Book');
    const unitId = queries.createUnit(db, textbookId, 'Unit 1');
    const itemId = queries.createItem(db, { unitId, type: 'word', english: 'study', chinese: '学习' });

    queries.saveWordQuestionDetails(db, itemId, {
      baseForm: 'study',
      firstLetterHint: 's',
      usageNote: '动词原形',
      inflections: { past_tense: 'studied', present_participle: 'studying' },
    });

    const detail = queries.getWordQuestionDetails(db, itemId);
    expect(detail.base_form).toBe('study');
    expect(detail.first_letter_hint).toBe('s');
    expect(detail.usage_note).toBe('动词原形');
    expect(detail.inflections.past_tense).toBe('studied');
  });

  test('savePhraseChoiceQuestion and deletePhraseChoiceQuestion manage explicit phrase questions', () => {
    const textbookId = queries.createTextbook(db, 'Phrase Book');
    const unitId = queries.createUnit(db, textbookId, 'Unit 1');
    const itemId = queries.createItem(db, { unitId, type: 'phrase', english: 'look after', chinese: '照顾' });

    const questionId = queries.savePhraseChoiceQuestion(db, {
      itemId,
      promptSentence: 'She often ___ her sister after school.',
      correctPhrase: 'looks after',
      distractorA: 'looks up',
      distractorB: 'looks for',
      distractorC: 'looks at',
      explanation: 'look after 表示照顾。',
    });

    let rows = queries.getPhraseChoiceQuestionsByItem(db, itemId);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(questionId);

    queries.deletePhraseChoiceQuestion(db, questionId);
    rows = queries.getPhraseChoiceQuestionsByItem(db, itemId);
    expect(rows).toHaveLength(0);
  });

  test('saveSentenceOrderDetails stores normalized tokens', () => {
    const textbookId = queries.createTextbook(db, 'Sentence Book');
    const unitId = queries.createUnit(db, textbookId, 'Unit 1');
    const itemId = queries.createItem(db, { unitId, type: 'grammar', english: 'She likes music', chinese: '她喜欢音乐' });

    queries.saveSentenceOrderDetails(db, itemId, {
      answerSentence: 'She likes music',
      tokens: ['She', 'likes', 'music'],
      hintText: '先找主语。',
    });

    const detail = queries.getSentenceOrderDetails(db, itemId);
    expect(detail.answer_sentence).toBe('She likes music');
    expect(detail.tokens).toEqual(['She', 'likes', 'music']);
    expect(detail.hint_text).toBe('先找主语。');
  });
```

- [ ] **Step 2: Run the failing query tests**

Run:

```bash
cmd /c npx jest tests\question-type-queries.test.js --runInBand --verbose
```

Expected: FAIL with missing helper function errors.

- [ ] **Step 3: Add focused helpers in `db/queries.js`**

Add helpers with these signatures:

```js
function getWordQuestionDetails(db, itemId) { /* returns parsed inflections */ }
function saveWordQuestionDetails(db, itemId, { baseForm, firstLetterHint, usageNote, inflections }) { /* upsert */ }

function getPhraseChoiceQuestionsByItem(db, itemId) { /* returns authored rows */ }
function savePhraseChoiceQuestion(db, { itemId, promptSentence, correctPhrase, distractorA, distractorB, distractorC, explanation }) { /* insert */ }
function deletePhraseChoiceQuestion(db, id) { /* delete by id */ }

function getSentenceOrderDetails(db, itemId) { /* returns parsed tokens */ }
function saveSentenceOrderDetails(db, itemId, { answerSentence, tokens, hintText }) { /* upsert */ }
```

Implementation rules:

- parse `inflections_json` and `tokens_json` before returning records
- store empty JSON values as `'{}'` or `'[]'`
- `saveSentenceOrderDetails` must accept an explicit `tokens` array and not re-split it during retrieval

- [ ] **Step 4: Verify query task and commit**

Run:

```bash
cmd /c npx jest tests\question-type-queries.test.js tests\review-plan-queries.test.js --runInBand --verbose
```

Expected: PASS.

Commit:

```bash
git add db/queries.js tests/question-type-queries.test.js
git commit -m "feat: add single-point question detail queries"
```

---

### Task 3: Admin Editing For Supporting Data

**Files:**
- Modify: `routes/admin.js`
- Modify: [views/admin/item-edit.ejs](/C:/Users/dayou/english-review/views/admin/item-edit.ejs)
- Create: `tests/single-point-admin-routes.test.js`

- [ ] **Step 1: Write the failing admin route tests**

Create `tests/single-point-admin-routes.test.js` using the same helper pattern as `tests/question-type-routes.test.js`.

Add tests for:

```js
test('admin can save word question details from item edit', async () => {
  // POST /admin/items/:id/edit with word_detail fields
  // then assert getWordQuestionDetails returns stored values
});

test('admin can add and delete phrase choice questions from item edit', async () => {
  // POST /admin/items/:id/edit with one phrase_choice row
  // assert authored phrase choice exists
  // POST delete route and assert removal
});

test('admin can save sentence order details from item edit', async () => {
  // POST /admin/items/:id/edit with answer_sentence, tokens_text, hint_text
  // assert getSentenceOrderDetails returns parsed tokens
});
```

Use concrete field names in the form body:

```js
'word_detail[base_form]': 'study',
'word_detail[first_letter_hint]': 's',
'word_detail[usage_note]': '动词原形',
'word_detail[past_tense]': 'studied',
'word_detail[present_participle]': 'studying',

'phrase_choice[0][prompt_sentence]': 'She often ___ her sister.',
'phrase_choice[0][correct_phrase]': 'looks after',
'phrase_choice[0][distractor_a]': 'looks up',
'phrase_choice[0][distractor_b]': 'looks for',
'phrase_choice[0][distractor_c]': 'looks at',
'phrase_choice[0][explanation]': '固定搭配。',

'sentence_order[answer_sentence]': 'She likes music',
'sentence_order[tokens_text]': 'She likes music',
'sentence_order[hint_text]': '先找主语。',
```

- [ ] **Step 2: Run the failing admin route tests**

Run:

```bash
cmd /c npx jest tests\single-point-admin-routes.test.js --runInBand --verbose
```

Expected: FAIL because the edit route ignores the new form fields.

- [ ] **Step 3: Extend `routes/admin.js`**

Add small normalization helpers near the item edit route:

```js
function normalizeWordQuestionDetails(raw) {
  return {
    baseForm: raw?.base_form || '',
    firstLetterHint: raw?.first_letter_hint || '',
    usageNote: raw?.usage_note || '',
    inflections: {
      plural: raw?.plural || '',
      third_person_singular: raw?.third_person_singular || '',
      past_tense: raw?.past_tense || '',
      past_participle: raw?.past_participle || '',
      present_participle: raw?.present_participle || '',
      comparative: raw?.comparative || '',
      superlative: raw?.superlative || '',
      adverb: raw?.adverb || '',
      adjective: raw?.adjective || '',
      noun: raw?.noun || '',
    },
  };
}

function normalizeSentenceTokens(tokensText, answerSentence) {
  const source = String(tokensText || answerSentence || '').trim();
  return source ? source.split(/\s+/) : [];
}
```

Modify `GET /admin/items/:id/edit` so the view receives:

```js
wordQuestionDetail: queries.getWordQuestionDetails(db, item.id),
phraseChoiceQuestions: queries.getPhraseChoiceQuestionsByItem(db, item.id),
sentenceOrderDetail: queries.getSentenceOrderDetails(db, item.id),
```

Modify `POST /admin/items/:id/edit` so after the existing `queries.updateItem(...)` call it also:

- saves word details when `type === 'word'`
- saves each non-empty phrase choice row when `type === 'phrase'`
- saves sentence order details when `type === 'grammar'`

- [ ] **Step 4: Extend the item edit view**

In [views/admin/item-edit.ejs](/C:/Users/dayou/english-review/views/admin/item-edit.ejs), add three conditional sections below the base item fields:

- `word` section labeled `题型扩展信息`
- `phrase` section labeled `辨析题`
- `grammar` section labeled `连词成句增强版`

Use these concrete field names:

```ejs
name="word_detail[base_form]"
name="word_detail[first_letter_hint]"
name="word_detail[usage_note]"
name="word_detail[past_tense]"
name="word_detail[present_participle]"

name="phrase_choice[0][prompt_sentence]"
name="phrase_choice[0][correct_phrase]"
name="phrase_choice[0][distractor_a]"
name="phrase_choice[0][distractor_b]"
name="phrase_choice[0][distractor_c]"
name="phrase_choice[0][explanation]"

name="sentence_order[answer_sentence]"
name="sentence_order[tokens_text]"
name="sentence_order[hint_text]"
```

For existing phrase authored rows, render one editable block per row plus one empty new row.

- [ ] **Step 5: Verify admin task and commit**

Run:

```bash
cmd /c npx jest tests\single-point-admin-routes.test.js tests\question-type-routes.test.js --runInBand --verbose
```

Expected: PASS.

Commit:

```bash
git add routes/admin.js views/admin/item-edit.ejs tests/single-point-admin-routes.test.js
git commit -m "feat: add admin editing for single-point question data"
```

---

### Task 4: Generator And Scoring For The Four Question Types

**Files:**
- Modify: `engine/generator.js`
- Modify: [views/practice/exercise.ejs](/C:/Users/dayou/english-review/views/practice/exercise.ejs)
- Modify: [views/practice/result.ejs](/C:/Users/dayou/english-review/views/practice/result.ejs)
- Create: `tests/single-point-score.test.js`
- Modify: `tests/question-type-generator.test.js`

- [ ] **Step 1: Write the failing generator and scoring tests**

Add generator tests to `tests/question-type-generator.test.js` for:

- `vocab_spelling_fill` when `word_question_details` exists
- `vocab_form_transform` when `past_tense` exists
- `phrase_choice` only when explicit authored rows exist
- `sentence_ordering` enhanced mode only when `sentence_order_details` exists

Create `tests/single-point-score.test.js` with:

```js
const generator = require('../engine/generator');

describe('single-point scoring', () => {
  test('spelling answers are trim-safe and case-insensitive', () => {
    const item = { id: 1, type: 'word', english: 'Study', chinese: '学习' };
    const result = generator.scoreAnswer(item, 'spelling_fill', ' study ', 'Study');
    expect(result.is_correct).toBe(true);
  });

  test('inflection answers compare against the targeted inflection', () => {
    const item = { id: 2, type: 'word', english: 'study', chinese: '学习' };
    const result = generator.scoreAnswer(item, 'form_fill', 'studied', 'studied');
    expect(result.is_correct).toBe(true);
  });

  test('phrase choice compares selected option', () => {
    const item = { id: 3, type: 'phrase', english: 'look after', chinese: '照顾' };
    const result = generator.scoreAnswer(item, 'phrase_choice', 'looks after', 'looks after');
    expect(result.is_correct).toBe(true);
  });

  test('enhanced sentence ordering still uses exact trimmed match', () => {
    const item = { id: 4, type: 'grammar', english: 'She likes music', chinese: '她喜欢音乐' };
    const result = generator.scoreAnswer(item, 'sentence_plus', ' She likes music ', 'She likes music');
    expect(result.is_correct).toBe(true);
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run:

```bash
cmd /c npx jest tests\question-type-generator.test.js tests\single-point-score.test.js --runInBand --verbose
```

Expected: FAIL because the new exercise types and scoring branches do not exist.

- [ ] **Step 3: Extend `engine/generator.js`**

Add mappings:

```js
case 'vocab_spelling_fill': return item.type === 'word' ? 'spelling_fill' : null;
case 'vocab_form_transform': return item.type === 'word' ? 'form_fill' : null;
case 'phrase_choice': return item.type === 'phrase' ? 'phrase_choice' : null;
case 'sentence_ordering': return item.type === 'grammar' ? 'sentence_plus' : null;
```

Add helper lookups that use the new query functions:

```js
const wordDetail = queries.getWordQuestionDetails(db, item.id);
const phraseQuestions = queries.getPhraseChoiceQuestionsByItem(db, item.id);
const sentenceOrder = queries.getSentenceOrderDetails(db, item.id);
```

Generation rules:

- `spelling_fill`: question uses `item.chinese`, optional `first_letter_hint`, and correct answer from `base_form || item.english`
- `form_fill`: choose one available inflection key from `inflections`; expose a prompt label such as `past_tense`
- `phrase_choice`: use one authored phrase row and build four options
- `sentence_plus`: use stored tokens from `sentence_order_details.tokens`

Extend `scoreAnswer` with these branches:

```js
case 'spelling_fill':
case 'form_fill':
  isCorrect = (userAnswer || '').trim().toLowerCase() === (correctAnswer || '').trim().toLowerCase();
  break;
case 'phrase_choice':
  isCorrect = (userAnswer || '').trim() === (correctAnswer || '').trim();
  break;
case 'sentence_plus':
  isCorrect = (userAnswer || '').trim() === (correctAnswer || '').trim();
  break;
```

Update `scoreAnswers` so these exercise types resolve `correctAnswer` correctly.

- [ ] **Step 4: Render the new exercise and result states**

In [views/practice/exercise.ejs](/C:/Users/dayou/english-review/views/practice/exercise.ejs):

- add visible labels for the four new exercise types
- render spelling and inflection as text inputs
- render phrase distinction as radio options
- render enhanced sentence ordering with the existing token UI, but allow `sentence_plus`

In [views/practice/result.ejs](/C:/Users/dayou/english-review/views/practice/result.ejs):

- when a result row belongs to `phrase_choice` and includes `explanation`, render:

```ejs
<div class="text-muted">辨析说明：<%= r.explanation %></div>
```

- [ ] **Step 5: Verify generator/scoring task and commit**

Run:

```bash
cmd /c npx jest tests\question-type-generator.test.js tests\single-point-score.test.js tests\engine.test.js --runInBand --verbose
```

Expected: PASS.

Commit:

```bash
git add engine/generator.js views/practice/exercise.ejs views/practice/result.ejs tests/question-type-generator.test.js tests/single-point-score.test.js
git commit -m "feat: implement first single-point question types"
```

---

### Task 5: UI Text, Regression, And Manual Verification

**Files:**
- Modify: `tests/ui-text.test.js`
- Modify or Create: `docs/single-point-question-types-test-guide.md`

- [ ] **Step 1: Extend UI text coverage**

Update `tests/ui-text.test.js` so it checks these visible strings where appropriate:

```js
'views/admin/item-edit.ejs': ['编辑条目', '题型扩展信息', '辨析题', '连词成句增强版', '首字母提示', '提示文案'],
'views/practice/exercise.ejs': ['输入你的答案', '提交答案'],
'views/practice/result.ejs': ['练习结果', '获得积分', '正确率', '辨析说明'],
```

- [ ] **Step 2: Add manual verification guide**

Create `docs/single-point-question-types-test-guide.md` with:

```md
# Single Point Question Types Verification

## Preconditions

- Start the app with `cmd /c npm start`.
- Log in as admin.
- Make sure there is an active review plan containing at least one word, one phrase, and one grammar item.

## Admin Checks

1. Open an existing word item and save `题型扩展信息`.
2. Open an existing phrase item and add one `辨析题`.
3. Open an existing grammar item and save `连词成句增强版` details.
4. Confirm values persist after page reload.

## Student Checks

1. Open `学生端预览`.
2. Start today's review multiple times with supported question types enabled.
3. Confirm spelling fill can appear for a configured word item.
4. Confirm inflection fill can appear only when inflection data exists.
5. Confirm phrase distinction uses the authored prompt and options.
6. Confirm enhanced sentence ordering uses the stored tokens and hint.
7. Submit correct and incorrect answers and inspect result feedback.

## Regression Checks

- Review plan page still works.
- Question type settings page still works.
- Existing legacy question types still generate.
- Stats page still opens.
```

- [ ] **Step 3: Run focused and full verification**

Run:

```bash
cmd /c npx jest tests\db-init.test.js tests\question-type-queries.test.js tests\single-point-admin-routes.test.js tests\question-type-generator.test.js tests\single-point-score.test.js tests\ui-text.test.js --runInBand --verbose
```

Expected: PASS.

Run:

```bash
cmd /c npx jest --runInBand --verbose
```

Expected: PASS.

- [ ] **Step 4: Commit docs and final verification**

Commit:

```bash
git add tests/ui-text.test.js docs/single-point-question-types-test-guide.md
git commit -m "test: cover single-point question type workflow"
```

Then collect final status:

```bash
git status --short --branch
git log --oneline -6
```

Expected: only unrelated pre-existing untracked paths such as `.claude/` or `docs/new_vison_guide.md` may remain.

---

## Plan Self-Review

- Spec coverage: Task 1 covers schema. Task 2 covers supporting-table queries. Task 3 covers admin editing. Task 4 covers generation and scoring. Task 5 covers UI text, manual verification, and regression.
- Placeholder scan: all tasks include concrete file paths, commands, field names, and code snippets.
- Type consistency: the plan consistently uses `word_question_details`, `phrase_choice_questions`, `sentence_order_details`, `saveWordQuestionDetails`, `savePhraseChoiceQuestion`, `saveSentenceOrderDetails`, `spelling_fill`, `form_fill`, `phrase_choice`, and `sentence_plus`.
