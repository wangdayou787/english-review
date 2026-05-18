# Grammar Example Question Bank Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build grammar-specific knowledge storage and generate grammar review questions directly from stored grammar examples.

**Architecture:** Keep `items.type = 'grammar'` as the scheduler-facing grammar point, and add grammar-specific detail/example tables behind it. Admin routes save grammar metadata through `services/admin-item-support.js`; exercise generation reads grammar examples through `engine/question-type-selection.js` and `engine/exercise-builders.js`.

**Tech Stack:** Node.js, Express, EJS, better-sqlite3, Jest.

---

## File Structure

- Modify: `db/init.js`
  - Create `grammar_details` and `grammar_examples`.
  - Add grammar-only triggers.
  - Expand the item type guard so type changes are blocked while grammar support rows exist.

- Modify: `db/queries.js`
  - Add grammar detail/example query helpers.
  - Export the new helpers.

- Modify: `services/admin-item-support.js`
  - Normalize grammar detail and example form data.
  - Save grammar detail and examples for grammar items.
  - Clear grammar support rows when item type changes.

- Modify: `routes/admin.js`
  - Keep the existing create/update item routes, but pass grammar form data through support saving.
  - Preserve validation for word and phrase while allowing grammar-specific fields.

- Modify: `views/admin/item-edit.ejs`
  - Replace the primary grammar edit panel with grammar title, description, usage notes, and repeatable examples.
  - Keep the existing sentence-ordering area as a legacy compatibility section.

- Modify: `data/question-types.js`
  - Mark `grammar_choice`, `grammar_completion`, and `grammar_sentence_transform` as available.
  - Keep old unsupported grammar/sentence types planned unless already implemented.

- Modify: `engine/exercise-types.js`
  - Add `grammar_choice`, `grammar_completion`, and `grammar_sentence_transform` exercise types.

- Modify: `engine/question-type-selection.js`
  - Map grammar question type codes to new grammar exercise types.
  - Load grammar examples into single-point support.
  - Only consider grammar question types usable when matching examples exist.

- Modify: `engine/exercise-builders.js`
  - Build grammar choice, completion, and sentence transformation exercises from `grammar_examples`.
  - Repeat valid examples through deterministic selection when needed.

- Modify: `engine/generator.js`
  - Score grammar fill/transform answers case-insensitively after trimming.
  - Preserve explanation output for grammar example feedback.

- Modify: `views/practice/exercise.ejs`
  - Render grammar choice as radio options.
  - Render grammar completion and sentence transformation as text inputs.
  - Display new exercise type labels.

- Modify: `views/practice/result.ejs`
  - Show grammar example explanations when present.

- Tests:
  - Create: `tests/grammar-example-queries.test.js`
  - Create: `tests/grammar-example-generator.test.js`
  - Modify: `tests/db-init.test.js`
  - Modify: `tests/single-point-admin-routes.test.js`
  - Modify: `tests/question-type-generator.test.js`
  - Modify: `tests/question-type-status.test.js`
  - Modify: `tests/ui-text.test.js`

---

### Task 1: Database Tables And Query Helpers

**Files:**
- Modify: `db/init.js`
- Modify: `db/queries.js`
- Create: `tests/grammar-example-queries.test.js`
- Modify: `tests/db-init.test.js`

- [ ] **Step 1: Write failing database tests**

Create `tests/grammar-example-queries.test.js`:

```js
const Database = require('better-sqlite3');
const { initDatabase } = require('../db/init');
const queries = require('../db/queries');

function setup() {
  const db = new Database(':memory:');
  initDatabase(db);
  const textbookId = queries.createTextbook(db, 'Book');
  const unitId = queries.createUnit(db, textbookId, 'Unit 1');
  const grammarId = queries.createItem(db, {
    unitId,
    type: 'grammar',
    english: 'Present continuous',
    chinese: '现在进行时',
  });
  const wordId = queries.createItem(db, {
    unitId,
    type: 'word',
    english: 'study',
    chinese: '学习',
  });
  return { db, grammarId, wordId };
}

describe('grammar example queries', () => {
  test('saves and loads grammar details', () => {
    const { db, grammarId } = setup();

    queries.saveGrammarDetails(db, grammarId, {
      title: '现在进行时',
      description: '表示正在发生的动作。',
      usageNotes: '常与 now 和 look 搭配。',
    });

    expect(queries.getGrammarDetails(db, grammarId)).toMatchObject({
      item_id: grammarId,
      title: '现在进行时',
      description: '表示正在发生的动作。',
      usage_notes: '常与 now 和 look 搭配。',
    });
  });

  test('replaces grammar examples in sort order', () => {
    const { db, grammarId } = setup();

    queries.replaceGrammarExamples(db, grammarId, [
      {
        exampleType: 'choice',
        promptText: 'Look! The children ____ football.',
        options: ['play', 'plays', 'are playing', 'played'],
        answerText: 'are playing',
        explanation: 'Look 表示正在发生，用现在进行时。',
      },
      {
        exampleType: 'completion',
        promptText: 'He ____ (buy) a bike yesterday.',
        options: [],
        answerText: 'bought',
        explanation: 'yesterday 表示一般过去时。',
      },
    ]);

    const examples = queries.getGrammarExamplesByItem(db, grammarId);
    expect(examples).toHaveLength(2);
    expect(examples[0]).toMatchObject({
      item_id: grammarId,
      example_type: 'choice',
      prompt_text: 'Look! The children ____ football.',
      answer_text: 'are playing',
      explanation: 'Look 表示正在发生，用现在进行时。',
      sort_order: 1,
    });
    expect(examples[0].options).toEqual(['play', 'plays', 'are playing', 'played']);
    expect(examples[1].example_type).toBe('completion');
  });

  test('rejects grammar support rows for non-grammar items', () => {
    const { db, wordId } = setup();

    expect(() => {
      queries.saveGrammarDetails(db, wordId, {
        title: 'Invalid',
        description: 'Invalid',
        usageNotes: '',
      });
    }).toThrow('grammar_details requires a grammar item');
  });
});
```

Append to `tests/db-init.test.js`:

```js
test('initDatabase creates grammar detail and example tables', () => {
  const db = new Database(':memory:');
  initDatabase(db);

  const detail = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'grammar_details'").get();
  const examples = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'grammar_examples'").get();

  expect(detail.name).toBe('grammar_details');
  expect(examples.name).toBe('grammar_examples');
});
```

- [ ] **Step 2: Run failing tests**

Run:

```bash
npm test -- --runInBand tests/grammar-example-queries.test.js tests/db-init.test.js
```

Expected: fail because `saveGrammarDetails`, `getGrammarDetails`, `replaceGrammarExamples`, and `getGrammarExamplesByItem` do not exist, and the new tables do not exist.

- [ ] **Step 3: Add grammar tables and triggers**

In `db/init.js`, add after `sentence_order_details`:

```js
    CREATE TABLE IF NOT EXISTS grammar_details (
      item_id     INTEGER PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
      title       TEXT    NOT NULL DEFAULT '',
      description TEXT    NOT NULL DEFAULT '',
      usage_notes TEXT,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS grammar_examples (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id       INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      example_type  TEXT    NOT NULL CHECK(example_type IN ('choice', 'completion', 'sentence_transform')),
      prompt_text   TEXT    NOT NULL,
      options_json  TEXT    NOT NULL DEFAULT '[]' CHECK(json_valid(options_json) AND json_type(options_json) = 'array'),
      answer_text   TEXT    NOT NULL,
      explanation   TEXT,
      sort_order    INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_grammar_examples_item_sort ON grammar_examples(item_id, sort_order, id);
```

Add triggers after sentence-order triggers:

```js
    CREATE TRIGGER IF NOT EXISTS trg_grammar_details_item_type_ins
    BEFORE INSERT ON grammar_details
    FOR EACH ROW
    WHEN (SELECT type FROM items WHERE id = NEW.item_id) IS NOT 'grammar'
    BEGIN
      SELECT RAISE(ABORT, 'grammar_details requires a grammar item');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_grammar_examples_item_type_ins
    BEFORE INSERT ON grammar_examples
    FOR EACH ROW
    WHEN (SELECT type FROM items WHERE id = NEW.item_id) IS NOT 'grammar'
    BEGIN
      SELECT RAISE(ABORT, 'grammar_examples requires a grammar item');
    END;
```

In the `trg_items_type_guard` trigger condition, include:

```sql
      EXISTS(SELECT 1 FROM grammar_details WHERE item_id = OLD.id) OR
      EXISTS(SELECT 1 FROM grammar_examples WHERE item_id = OLD.id) OR
```

- [ ] **Step 4: Add query helpers**

In `db/queries.js`, add near existing support helpers:

```js
function getGrammarDetails(db, itemId) {
  return db.prepare('SELECT * FROM grammar_details WHERE item_id = ?').get(itemId) || null;
}

function saveGrammarDetails(db, itemId, { title, description, usageNotes }) {
  db.prepare(
    `INSERT INTO grammar_details (item_id, title, description, usage_notes, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(item_id) DO UPDATE SET
       title = excluded.title,
       description = excluded.description,
       usage_notes = excluded.usage_notes,
       updated_at = datetime('now')`
  ).run(
    itemId,
    String(title || '').trim(),
    String(description || '').trim(),
    String(usageNotes || '').trim() || null,
  );
}

function normalizeGrammarExampleRow(row) {
  return {
    ...row,
    options: parseJsonOrDefault(row.options_json, []),
  };
}

function getGrammarExamplesByItem(db, itemId, options = {}) {
  const typeClause = options.exampleType ? 'AND example_type = ?' : '';
  const params = options.exampleType ? [itemId, options.exampleType] : [itemId];
  return db.prepare(
    `SELECT *
     FROM grammar_examples
     WHERE item_id = ?
       ${typeClause}
     ORDER BY sort_order, id`
  ).all(...params).map(normalizeGrammarExampleRow);
}

function replaceGrammarExamples(db, itemId, examples) {
  const rows = Array.isArray(examples) ? examples : [];
  const insert = db.prepare(
    `INSERT INTO grammar_examples (
       item_id, example_type, prompt_text, options_json, answer_text, explanation, sort_order
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM grammar_examples WHERE item_id = ?').run(itemId);
    rows.forEach((row, index) => {
      insert.run(
        itemId,
        row.exampleType,
        row.promptText,
        JSON.stringify(Array.isArray(row.options) ? row.options : []),
        row.answerText,
        row.explanation || null,
        index + 1,
      );
    });
  });
  tx();
}
```

Export the four new functions.

- [ ] **Step 5: Run tests and commit**

Run:

```bash
npm test -- --runInBand tests/grammar-example-queries.test.js tests/db-init.test.js
```

Expected: pass.

Commit:

```bash
git add db/init.js db/queries.js tests/grammar-example-queries.test.js tests/db-init.test.js
git commit -m "feat: add grammar example storage"
```

---

### Task 2: Admin Save Pipeline

**Files:**
- Modify: `services/admin-item-support.js`
- Modify: `routes/admin.js`
- Modify: `tests/single-point-admin-routes.test.js`

- [ ] **Step 1: Write failing admin route tests**

Append to `tests/single-point-admin-routes.test.js`:

```js
test('admin edit saves grammar details and examples', async () => {
  const app = buildApp();
  const { itemId } = seedItem(app.locals.db, 'grammar');

  const res = await requestApp(app, 'POST', `/admin/items/${itemId}/edit`, {
    type: 'grammar',
    english: 'Present continuous',
    chinese: '现在进行时',
    pos: '',
    example: '',
    'grammar_detail[title]': '现在进行时',
    'grammar_detail[description]': '表示正在发生的动作。',
    'grammar_detail[usage_notes]': '常与 look 和 now 连用。',
    'grammar_examples[0][example_type]': 'choice',
    'grammar_examples[0][prompt_text]': 'Look! The children ____ football.',
    'grammar_examples[0][options_text]': 'play\nplays\nare playing\nplayed',
    'grammar_examples[0][answer_text]': 'are playing',
    'grammar_examples[0][explanation]': 'Look 表示正在发生，所以用 are playing。',
    'grammar_examples[1][example_type]': 'sentence_transform',
    'grammar_examples[1][prompt_text]': 'She can speak French. 改为否定句',
    'grammar_examples[1][options_text]': '',
    'grammar_examples[1][answer_text]': 'She cannot speak French.',
    'grammar_examples[1][explanation]': '情态动词 can 的否定形式是 cannot。',
  });

  expect(res.statusCode).toBe(302);
  const detail = queries.getGrammarDetails(app.locals.db, itemId);
  const examples = queries.getGrammarExamplesByItem(app.locals.db, itemId);
  expect(detail.title).toBe('现在进行时');
  expect(examples).toHaveLength(2);
  expect(examples[0].options).toEqual(['play', 'plays', 'are playing', 'played']);
  expect(examples[1].example_type).toBe('sentence_transform');
});
```

- [ ] **Step 2: Run failing admin test**

Run:

```bash
npm test -- --runInBand tests/single-point-admin-routes.test.js
```

Expected: fail because grammar details and examples are not normalized or saved.

- [ ] **Step 3: Normalize grammar support in service**

In `services/admin-item-support.js`, add:

```js
const GRAMMAR_EXAMPLE_TYPES = new Set(['choice', 'completion', 'sentence_transform']);

function normalizeOptionsText(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map(option => option.trim())
    .filter(Boolean);
}

function normalizeGrammarDetails(raw) {
  return {
    title: String(raw?.title || '').trim(),
    description: String(raw?.description || '').trim(),
    usageNotes: String(raw?.usage_notes || '').trim(),
  };
}

function normalizeGrammarExampleRows(rawRows) {
  const rows = Array.isArray(rawRows) ? rawRows : rawRows ? Object.values(rawRows) : [];
  return rows.map(row => ({
    exampleType: String(row?.example_type || '').trim(),
    promptText: String(row?.prompt_text || '').trim(),
    options: normalizeOptionsText(row?.options_text),
    answerText: String(row?.answer_text || '').trim(),
    explanation: String(row?.explanation || '').trim(),
  })).filter(row => (
    GRAMMAR_EXAMPLE_TYPES.has(row.exampleType) &&
    row.promptText &&
    row.answerText &&
    (row.exampleType !== 'choice' || row.options.length >= 2)
  ));
}

function draftGrammarDetails(raw) {
  return {
    title: String(raw?.title || ''),
    description: String(raw?.description || ''),
    usage_notes: String(raw?.usage_notes || ''),
  };
}

function draftGrammarExamples(rawRows) {
  const rows = Array.isArray(rawRows) ? rawRows : rawRows ? Object.values(rawRows) : [];
  return rows.map(row => ({
    example_type: String(row?.example_type || ''),
    prompt_text: String(row?.prompt_text || ''),
    options_text: String(row?.options_text || ''),
    answer_text: String(row?.answer_text || ''),
    explanation: String(row?.explanation || ''),
  }));
}
```

Extend `getItemSupportViewData`:

```js
    grammarDetail: queries.getGrammarDetails(db, itemId),
    grammarExamples: queries.getGrammarExamplesByItem(db, itemId),
```

Extend `getDraftSupportViewData`:

```js
    grammarDetail: body.grammar_detail
      ? draftGrammarDetails(body.grammar_detail)
      : queries.getGrammarDetails(db, itemId),
    grammarExamples: body.grammar_examples
      ? draftGrammarExamples(body.grammar_examples)
      : queries.getGrammarExamplesByItem(db, itemId),
```

Extend `clearSupportData`:

```js
  db.prepare('DELETE FROM grammar_details WHERE item_id = ?').run(itemId);
  db.prepare('DELETE FROM grammar_examples WHERE item_id = ?').run(itemId);
```

Extend `saveSupportData`:

```js
  if (type === 'grammar') {
    if (body.grammar_detail) {
      queries.saveGrammarDetails(db, itemId, normalizeGrammarDetails(body.grammar_detail));
    }
    if (body.grammar_examples) {
      queries.replaceGrammarExamples(db, itemId, normalizeGrammarExampleRows(body.grammar_examples));
    }
    if (body.sentence_order) {
      saveSentenceOrderIfComplete(db, itemId, body.sentence_order);
    }
  }
```

- [ ] **Step 4: Save support data after item creation**

In `routes/admin.js`, after `queries.createItem(...)`, store the returned id and call `saveSupportData`:

```js
  const itemId = queries.createItem(db, {
    unitId: parseInt(req.params.id),
    type,
    english,
    chinese,
    pos,
    example: normalizeExampleText(type, example, examples),
  });
  saveSupportData(db, itemId, type, req.body);
```

- [ ] **Step 5: Run admin tests and commit**

Run:

```bash
npm test -- --runInBand tests/single-point-admin-routes.test.js
```

Expected: pass.

Commit:

```bash
git add services/admin-item-support.js routes/admin.js tests/single-point-admin-routes.test.js
git commit -m "feat: save grammar examples from admin"
```

---

### Task 3: Admin Grammar Editing UI

**Files:**
- Modify: `views/admin/item-edit.ejs`
- Modify: `tests/single-point-admin-routes.test.js`
- Modify: `tests/ui-text.test.js`

- [ ] **Step 1: Write failing template/route expectations**

Add assertions to the grammar edit route test in `tests/single-point-admin-routes.test.js`:

```js
test('grammar edit page renders grammar-specific fields', async () => {
  const app = buildApp();
  const { itemId } = seedItem(app.locals.db, 'grammar');

  queries.saveGrammarDetails(app.locals.db, itemId, {
    title: '现在进行时',
    description: '表示正在发生的动作。',
    usageNotes: '常与 now 连用。',
  });
  queries.replaceGrammarExamples(app.locals.db, itemId, [{
    exampleType: 'completion',
    promptText: 'He ____ (buy) a bike yesterday.',
    options: [],
    answerText: 'bought',
    explanation: 'yesterday 表示一般过去时。',
  }]);

  const res = await requestApp(app, 'GET', `/admin/items/${itemId}/edit`);

  expect(res.statusCode).toBe(200);
  expect(res.text).toContain('语法知识结构');
  expect(res.text).toContain('name="grammar_detail[title]"');
  expect(res.text).toContain('name="grammar_examples[0][example_type]"');
  expect(res.text).toContain('He ____ (buy) a bike yesterday.');
});
```

Add to `tests/ui-text.test.js` expected UI strings:

```js
'views/admin/item-edit.ejs': ['语法知识结构', '语法说明', '使用规则', '例题解析', '句型转换'],
```

- [ ] **Step 2: Run failing UI tests**

Run:

```bash
npm test -- --runInBand tests/single-point-admin-routes.test.js tests/ui-text.test.js
```

Expected: fail because the grammar-specific fields do not render.

- [ ] **Step 3: Render grammar detail and examples**

In `views/admin/item-edit.ejs`, replace the current primary grammar section with:

```ejs
  <% if (item.type === 'grammar') { %>
    <% const detail = grammarDetail || {}; %>
    <% const examples = (grammarExamples && grammarExamples.length ? grammarExamples : [{ example_type: 'choice', prompt_text: '', options: [], answer_text: '', explanation: '' }]); %>
    <section class="form-section">
      <h2>语法知识结构</h2>
      <div class="form-group">
        <label>语法标题</label>
        <input type="text" name="grammar_detail[title]" value="<%= detail.title || item.chinese || item.english || '' %>">
      </div>
      <div class="form-group">
        <label>语法说明</label>
        <textarea name="grammar_detail[description]" rows="4"><%= detail.description || item.chinese || '' %></textarea>
      </div>
      <div class="form-group">
        <label>使用规则</label>
        <textarea name="grammar_detail[usage_notes]" rows="3"><%= detail.usage_notes || '' %></textarea>
      </div>

      <h3>语法例题</h3>
      <% examples.forEach((grammarExample, index) => { %>
        <% const optionsText = grammarExample.options_text || (Array.isArray(grammarExample.options) ? grammarExample.options.join('\n') : ''); %>
        <div class="nested-card">
          <div class="form-group">
            <label>例题类型</label>
            <select name="grammar_examples[<%= index %>][example_type]">
              <option value="choice" <%= grammarExample.example_type === 'choice' ? 'selected' : '' %>>单项选择</option>
              <option value="completion" <%= grammarExample.example_type === 'completion' ? 'selected' : '' %>>完成句子</option>
              <option value="sentence_transform" <%= grammarExample.example_type === 'sentence_transform' ? 'selected' : '' %>>句型转换</option>
            </select>
          </div>
          <div class="form-group">
            <label>题干</label>
            <textarea name="grammar_examples[<%= index %>][prompt_text]" rows="3"><%= grammarExample.prompt_text || '' %></textarea>
          </div>
          <div class="form-group">
            <label>选项，每行一个，只有单项选择需要填写</label>
            <textarea name="grammar_examples[<%= index %>][options_text]" rows="4"><%= optionsText %></textarea>
          </div>
          <div class="form-group">
            <label>标准答案</label>
            <input type="text" name="grammar_examples[<%= index %>][answer_text]" value="<%= grammarExample.answer_text || '' %>">
          </div>
          <div class="form-group">
            <label>例题解析</label>
            <textarea name="grammar_examples[<%= index %>][explanation]" rows="3"><%= grammarExample.explanation || '' %></textarea>
          </div>
        </div>
      <% }) %>
    </section>
  <% } %>
```

Keep the sentence-ordering compatibility section below it, labeled:

```ejs
<h2>连词成句兼容设置</h2>
```

- [ ] **Step 4: Run UI tests and commit**

Run:

```bash
npm test -- --runInBand tests/single-point-admin-routes.test.js tests/ui-text.test.js
```

Expected: pass.

Commit:

```bash
git add views/admin/item-edit.ejs tests/single-point-admin-routes.test.js tests/ui-text.test.js
git commit -m "feat: render grammar example editor"
```

---

### Task 4: Grammar Question Types And Mapping

**Files:**
- Modify: `data/question-types.js`
- Modify: `engine/exercise-types.js`
- Modify: `engine/question-type-selection.js`
- Modify: `tests/question-type-status.test.js`
- Modify: `tests/question-type-generator.test.js`

- [ ] **Step 1: Write failing question type tests**

Add to `tests/question-type-status.test.js`:

```js
test('grammar example question types are available', () => {
  const grammarTypes = db.prepare(
    `SELECT code, implementation_status
     FROM question_types
     WHERE code IN ('grammar_choice', 'grammar_completion', 'grammar_sentence_transform')
     ORDER BY code`
  ).all();

  expect(grammarTypes).toEqual([
    { code: 'grammar_choice', implementation_status: 'available' },
    { code: 'grammar_completion', implementation_status: 'available' },
    { code: 'grammar_sentence_transform', implementation_status: 'available' },
  ]);
});
```

Add to `tests/question-type-generator.test.js`:

```js
test('maps grammar example question types to exercise types only when examples exist', () => {
  const { db, grammarId } = buildDb();
  queries.replaceGrammarExamples(db, grammarId, [{
    exampleType: 'completion',
    promptText: 'He ____ (buy) a bike yesterday.',
    options: [],
    answerText: 'bought',
    explanation: 'yesterday 表示一般过去时。',
  }]);

  const item = queries.getItemById(db, grammarId);
  const support = getSinglePointSupport(item, db);

  expect(mapQuestionTypeToExerciseType({ code: 'grammar_completion' }, item)).toBe('grammar_completion');
  expect(mapQuestionTypeToExerciseType({ code: 'grammar_choice' }, item)).toBe('grammar_choice');
  expect(isConfiguredTypeUsable({ code: 'grammar_completion' }, item, support)).toBe(true);
  expect(isConfiguredTypeUsable({ code: 'grammar_choice' }, item, support)).toBe(false);
});
```

If `isConfiguredTypeUsable` is not exported yet, the implementation step below exports it for testing.

- [ ] **Step 2: Run failing mapping tests**

Run:

```bash
npm test -- --runInBand tests/question-type-status.test.js tests/question-type-generator.test.js
```

Expected: fail because grammar completion does not exist and grammar types are still planned.

- [ ] **Step 3: Update question type definitions**

In `data/question-types.js`, change grammar definitions to:

```js
{ code: 'grammar_choice', category: 'grammar', name: '语法单项选择', description: '从语法例题库中抽取单项选择题。', supportedItemTypes: ['grammar'], implementationStatus: 'available', defaultWeight: 20, instructionText: '选择最符合语法规则的答案。', primaryActionText: '提交答案', hintText: '', displayOptions: { showExample: true } },
{ code: 'grammar_completion', category: 'grammar', name: '语法完成句子', description: '从语法例题库中抽取完成句子或填空题。', supportedItemTypes: ['grammar'], implementationStatus: 'available', defaultWeight: 20, instructionText: '根据语境写出正确答案。', primaryActionText: '提交答案', hintText: '', displayOptions: { showExample: true } },
{ code: 'grammar_sentence_transform', category: 'grammar', name: '语法句型转换', description: '从语法例题库中抽取句型转换题。', supportedItemTypes: ['grammar'], implementationStatus: 'available', defaultWeight: 10, instructionText: '按要求完成句型转换。', primaryActionText: '提交答案', hintText: '', displayOptions: { showExample: true } },
```

Keep `grammar_given_word_form` and `grammar_error_correction` as planned if they remain in the file.

- [ ] **Step 4: Add exercise types and mapping**

In `engine/exercise-types.js`, append:

```js
  'grammar_choice',
  'grammar_completion',
  'grammar_sentence_transform',
```

In `engine/question-type-selection.js`, add codes to `IMPLEMENTED_SINGLE_POINT_CODES`:

```js
  'grammar_choice',
  'grammar_completion',
  'grammar_sentence_transform',
```

In `mapQuestionTypeToExerciseType`:

```js
    case 'grammar_choice': return item.type === 'grammar' ? 'grammar_choice' : null;
    case 'grammar_completion': return item.type === 'grammar' ? 'grammar_completion' : null;
    case 'grammar_sentence_transform': return item.type === 'grammar' ? 'grammar_sentence_transform' : null;
```

In `getSinglePointSupport` add:

```js
    grammarExamples: item.type === 'grammar' ? queries.getGrammarExamplesByItem(db, item.id) : [],
```

Add helper:

```js
function getGrammarExampleTypeForQuestionCode(code) {
  if (code === 'grammar_choice') return 'choice';
  if (code === 'grammar_completion') return 'completion';
  if (code === 'grammar_sentence_transform') return 'sentence_transform';
  return null;
}
```

Extend `isConfiguredTypeUsable`:

```js
    case 'grammar_choice':
    case 'grammar_completion':
    case 'grammar_sentence_transform': {
      const exampleType = getGrammarExampleTypeForQuestionCode(questionType.code);
      return Array.isArray(support.grammarExamples) &&
        support.grammarExamples.some(example => example.example_type === exampleType);
    }
```

Export `isConfiguredTypeUsable` and `getGrammarExampleTypeForQuestionCode`.

- [ ] **Step 5: Run mapping tests and commit**

Run:

```bash
npm test -- --runInBand tests/question-type-status.test.js tests/question-type-generator.test.js
```

Expected: pass.

Commit:

```bash
git add data/question-types.js engine/exercise-types.js engine/question-type-selection.js tests/question-type-status.test.js tests/question-type-generator.test.js
git commit -m "feat: enable grammar example question types"
```

---

### Task 5: Grammar Exercise Generation And Scoring

**Files:**
- Modify: `engine/exercise-builders.js`
- Modify: `engine/generator.js`
- Create: `tests/grammar-example-generator.test.js`
- Modify: `tests/question-type-generator.test.js`

- [ ] **Step 1: Write failing generator tests**

Create `tests/grammar-example-generator.test.js`:

```js
const Database = require('better-sqlite3');
const { initDatabase } = require('../db/init');
const queries = require('../db/queries');
const generator = require('../engine/generator');

function setup() {
  const db = new Database(':memory:');
  initDatabase(db);
  const textbookId = queries.createTextbook(db, 'Book');
  const unitId = queries.createUnit(db, textbookId, 'Unit 1');
  const grammarId = queries.createItem(db, {
    unitId,
    type: 'grammar',
    english: 'Present continuous',
    chinese: '现在进行时',
  });
  return { db, grammarId };
}

describe('grammar example exercise generation', () => {
  test('builds grammar choice exercise from stored example', () => {
    const { db, grammarId } = setup();
    queries.replaceGrammarExamples(db, grammarId, [{
      exampleType: 'choice',
      promptText: 'Look! The children ____ football.',
      options: ['play', 'plays', 'are playing', 'played'],
      answerText: 'are playing',
      explanation: 'Look 表示正在发生。',
    }]);

    const item = queries.getItemById(db, grammarId);
    const exercise = generator.createExercise(item, 'grammar_choice', db, {}, null, { random: () => 0 });

    expect(exercise.exercise_type).toBe('grammar_choice');
    expect(exercise.question).toBe('Look! The children ____ football.');
    expect(exercise.options).toEqual(expect.arrayContaining(['play', 'plays', 'are playing', 'played']));
    expect(exercise.correct_answer).toBe('are playing');
    expect(exercise.explanation).toBe('Look 表示正在发生。');
  });

  test('builds grammar completion and scores answer case-insensitively', () => {
    const { db, grammarId } = setup();
    queries.replaceGrammarExamples(db, grammarId, [{
      exampleType: 'completion',
      promptText: 'He ____ (buy) a bike yesterday.',
      options: [],
      answerText: 'bought',
      explanation: 'yesterday 表示一般过去时。',
    }]);

    const item = queries.getItemById(db, grammarId);
    const exercise = generator.createExercise(item, 'grammar_completion', db, {}, null, { random: () => 0 });
    const result = generator.scoreAnswer(item, exercise.exercise_type, ' Bought ', exercise.correct_answer);

    expect(exercise.question).toBe('He ____ (buy) a bike yesterday.');
    expect(result.is_correct).toBe(true);
  });

  test('falls back to legacy sentence when no matching grammar example exists', () => {
    const { db, grammarId } = setup();
    const item = queries.getItemById(db, grammarId);

    const exercise = generator.createExercise(item, 'grammar_choice', db, {}, null, { random: () => 0 });

    expect(exercise.exercise_type).toBe('sentence');
    expect(exercise.correct_answer).toBe('Present continuous');
  });
});
```

- [ ] **Step 2: Run failing generator tests**

Run:

```bash
npm test -- --runInBand tests/grammar-example-generator.test.js
```

Expected: fail because new exercise builders are missing.

- [ ] **Step 3: Build grammar exercises**

In `engine/exercise-builders.js`, import:

```js
const { getGrammarExampleTypeForQuestionCode } = require('./question-type-selection');
```

Add helper:

```js
function pickGrammarExample(support, exerciseType, random = Math.random) {
  const exampleType = getGrammarExampleTypeForQuestionCode(exerciseType);
  const examples = (support.grammarExamples || []).filter(example => example.example_type === exampleType);
  if (examples.length === 0) return null;
  const index = Math.min(examples.length - 1, Math.floor(random() * examples.length));
  return examples[index];
}
```

Add cases in `createExercise`:

```js
    case 'grammar_choice': {
      const row = pickGrammarExample(singlePointSupport, exerciseType, options.random || Math.random);
      if (!row) return createExercise(item, 'sentence', db, {}, singlePointSupport, options);
      return {
        ...base,
        question: row.prompt_text,
        correct_answer: row.answer_text,
        options: shuffle(row.options || []),
        explanation: row.explanation || '',
      };
    }
    case 'grammar_completion':
    case 'grammar_sentence_transform': {
      const row = pickGrammarExample(singlePointSupport, exerciseType, options.random || Math.random);
      if (!row) return createExercise(item, 'sentence', db, {}, singlePointSupport, options);
      return {
        ...base,
        question: row.prompt_text,
        correct_answer: row.answer_text,
        explanation: row.explanation || '',
      };
    }
```

In `resolveAnswerMetadata`, no special code is needed because `createExercise` now returns `correct_answer` and `explanation` for grammar exercise types.

- [ ] **Step 4: Score grammar text answers**

In `engine/generator.js`, extend `scoreAnswer`:

```js
    case 'grammar_completion':
    case 'grammar_sentence_transform':
      isCorrect = normalizedUser.toLowerCase() === normalizedCorrect.toLowerCase();
      break;
    case 'grammar_choice':
      isCorrect = normalizedUser === normalizedCorrect;
      break;
```

Extend `getDefaultAnswerMetadata` for no-db fallback:

```js
    case 'grammar_choice':
    case 'grammar_completion':
    case 'grammar_sentence_transform':
      return {
        correct_answer: answer.correct_answer || item.chinese || item.english || '',
        explanation: answer.explanation || '',
      };
```

- [ ] **Step 5: Run generator tests and commit**

Run:

```bash
npm test -- --runInBand tests/grammar-example-generator.test.js tests/question-type-generator.test.js
```

Expected: pass.

Commit:

```bash
git add engine/exercise-builders.js engine/generator.js tests/grammar-example-generator.test.js tests/question-type-generator.test.js
git commit -m "feat: generate grammar exercises from examples"
```

---

### Task 6: Practice Rendering, Results, And Full Verification

**Files:**
- Modify: `views/practice/exercise.ejs`
- Modify: `views/practice/result.ejs`
- Modify: `tests/template-safety.test.js`
- Modify: `tests/practice-routes.test.js`
- Modify: `tests/ui-text.test.js`

- [ ] **Step 1: Write failing rendering tests**

Add to `tests/template-safety.test.js`:

```js
test('practice template renders grammar example exercise types', () => {
  const exercise = read('views/practice/exercise.ejs');

  expect(exercise).toContain("ex.exercise_type === 'grammar_choice'");
  expect(exercise).toContain("ex.exercise_type === 'grammar_completion'");
  expect(exercise).toContain("ex.exercise_type === 'grammar_sentence_transform'");
});
```

Add to `tests/ui-text.test.js` expected practice strings:

```js
'views/practice/exercise.ejs': ['语法单项选择', '语法完成句子', '语法句型转换'],
```

- [ ] **Step 2: Run failing rendering tests**

Run:

```bash
npm test -- --runInBand tests/template-safety.test.js tests/ui-text.test.js
```

Expected: fail because template labels do not include new exercise types.

- [ ] **Step 3: Render new grammar exercise labels and inputs**

In `views/practice/exercise.ejs`, extend the exercise label block:

```ejs
          <% } else if (ex.exercise_type === 'grammar_choice') { %>语法单项选择
          <% } else if (ex.exercise_type === 'grammar_completion') { %>语法完成句子
          <% } else if (ex.exercise_type === 'grammar_sentence_transform') { %>语法句型转换
```

Ensure the existing choice block handles `grammar_choice`:

```ejs
      <% if (ex.options && ex.options.length) { %>
```

Ensure the existing text input block handles `grammar_completion` and `grammar_sentence_transform` by leaving them in the default non-options path. The input must include:

```ejs
autocomplete="off" autocapitalize="off" spellcheck="false"
```

- [ ] **Step 4: Show grammar explanations on result page**

In `views/practice/result.ejs`, replace the phrase-only explanation condition with:

```ejs
      <% if (r.explanation) { %>
        <p class="explanation"><%= r.explanation %></p>
      <% } %>
```

- [ ] **Step 5: Add practice route integration test**

In `tests/practice-routes.test.js`, add a test that seeds a plan with one grammar item and one matching grammar example, enables `grammar_completion`, opens `/practice/start`, and expects the grammar prompt in the response.

Use this assertion:

```js
expect(res.text).toContain('He ____ (buy) a bike yesterday.');
expect(res.text).toContain('语法完成句子');
```

- [ ] **Step 6: Run focused and full tests**

Run:

```bash
npm test -- --runInBand tests/template-safety.test.js tests/ui-text.test.js tests/practice-routes.test.js
```

Expected: pass.

Run:

```bash
npm test -- --runInBand
```

Expected: all test suites pass.

- [ ] **Step 7: Commit and verify status**

Commit:

```bash
git add views/practice/exercise.ejs views/practice/result.ejs tests/template-safety.test.js tests/practice-routes.test.js tests/ui-text.test.js
git commit -m "feat: render grammar example exercises"
```

Check:

```bash
git status --short --branch
```

Expected: clean working tree on `phrase-multiple-examples`.

---

## Self-Review

Spec coverage:

- Grammar-specific storage is covered by Task 1.
- Grammar entry/edit UI is covered by Tasks 2 and 3.
- Grammar question type settings are covered by Task 4.
- Daily review generation from examples is covered by Task 5.
- Rendering and scoring are covered by Tasks 5 and 6.
- Compatibility with existing items and sentence ordering is covered by keeping existing tables and fallback behavior.

No task uses destructive migration. Word and phrase flows are not redesigned.
