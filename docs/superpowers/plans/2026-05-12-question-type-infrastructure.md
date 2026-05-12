# Question Type Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the configurable question type catalog, admin settings, and generator integration for the next phase of the middle-school English review tool.

**Architecture:** Keep the current Express/EJS/SQLite structure. Add a focused catalog module, add SQLite catalog/settings tables, add query helpers, then route exercise generation through enabled available question types with safe fallback to current behavior.

**Tech Stack:** Node.js CommonJS, Express 5, EJS, better-sqlite3, Jest, existing CSS in `public/style.css` and `public/review.css`.

---

## File Structure

- Create `data/question-types.js`: built-in question type catalog, category labels, display option defaults, and JSON helper.
- Modify `db/init.js`: create and seed `question_types` and `question_type_settings` without touching existing tables.
- Modify `db/queries.js`: grouped admin settings, setting updates, available generation settings by item type.
- Modify `engine/generator.js`: weighted configured selection and mapping to current internal exercise types.
- Modify `routes/admin.js`: `GET /admin/question-types` and `POST /admin/question-types`.
- Create `views/admin/question-types.ejs`: grouped admin settings form.
- Modify `views/layout.ejs`: admin nav link `题型设置`.
- Modify `views/practice/exercise.ejs`: render optional instruction and hint text.
- Modify `public/review.css`: settings cards and exercise hint styles.
- Tests: update `tests/db-init.test.js`, create `tests/question-type-queries.test.js`, create `tests/question-type-generator.test.js`, create `tests/question-type-routes.test.js`, update `tests/ui-text.test.js`.

---

### Task 1: Built-In Catalog And Database Schema

**Files:**
- Create: `data/question-types.js`
- Modify: `db/init.js`
- Test: `tests/db-init.test.js`

- [ ] **Step 1: Write failing schema and seed tests**

Append these tests inside the existing `describe('db/init.js — database initialization', () => { ... })` block in `tests/db-init.test.js`.

```js
  test('initDatabase creates question type infrastructure tables', () => {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all().map(r => r.name);

    expect(tables).toContain('question_types');
    expect(tables).toContain('question_type_settings');
  });

  test('initDatabase seeds the built-in question type catalog once', () => {
    const rows = db.prepare('SELECT code, category, implementation_status FROM question_types ORDER BY sort_order').all();
    const codes = rows.map(row => row.code);

    expect(codes).toContain('vocab_en_cn_choice');
    expect(codes).toContain('vocab_listening_choice');
    expect(codes).toContain('phrase_cn_en_fill');
    expect(codes).toContain('sentence_ordering');
    expect(codes).toContain('reading_task_based');
    expect(new Set(codes).size).toBe(codes.length);
    expect(rows.some(row => row.category === 'vocabulary')).toBe(true);
    expect(rows.some(row => row.category === 'reading')).toBe(true);
    expect(rows.find(row => row.code === 'grammar_choice').implementation_status).toBe('planned');
  });

  test('initDatabase seeds question type settings idempotently', () => {
    const beforeTypes = db.prepare('SELECT COUNT(*) AS count FROM question_types').get().count;
    const beforeSettings = db.prepare('SELECT COUNT(*) AS count FROM question_type_settings').get().count;

    initDatabase(db);

    const afterTypes = db.prepare('SELECT COUNT(*) AS count FROM question_types').get().count;
    const afterSettings = db.prepare('SELECT COUNT(*) AS count FROM question_type_settings').get().count;

    expect(afterTypes).toBe(beforeTypes);
    expect(afterSettings).toBe(beforeSettings);
    expect(afterSettings).toBe(afterTypes);
  });
```

- [ ] **Step 2: Run the failing schema tests**

Run:

```bash
cmd /c npx jest tests\db-init.test.js --runInBand --verbose
```

Expected: FAIL because `question_types` and `question_type_settings` do not exist.

- [ ] **Step 3: Create `data/question-types.js`**

Create the file with these exports and include every code listed in `docs/superpowers/specs/2026-05-12-question-type-infrastructure-design.md` under `QUESTION_TYPES`.

```js
const CATEGORY_LABELS = {
  vocabulary: '单词词汇类',
  phrase: '短语固定搭配类',
  grammar: '语法专项类',
  sentence: '句子句型类',
  cloze: '完形填空类',
  reading: '阅读理解类',
};

const DEFAULT_DISPLAY_OPTIONS = {
  showExample: false,
  showPartOfSpeech: false,
  showChineseMeaning: false,
  showFirstLetterHint: false,
};

const QUESTION_TYPES = [
  { code: 'vocab_en_cn_choice', category: 'vocabulary', name: '中英互译单选', description: '给中文选英文，或给英文选中文释义。', supportedItemTypes: ['word'], implementationStatus: 'available', defaultWeight: 30, instructionText: '选择正确答案。', primaryActionText: '提交答案', hintText: '注意词义和语境。', displayOptions: { showPartOfSpeech: true } },
  { code: 'vocab_spelling_fill', category: 'vocabulary', name: '单词拼写填空', description: '给出中文和首字母，填写完整单词。', supportedItemTypes: ['word'], implementationStatus: 'planned', defaultWeight: 10, instructionText: '根据提示拼写完整单词。', primaryActionText: '提交答案', hintText: '先回忆发音，再检查拼写。', displayOptions: { showPartOfSpeech: true, showChineseMeaning: true, showFirstLetterHint: true } },
  { code: 'vocab_form_transform', category: 'vocabulary', name: '词形变换填空', description: '考查名词、动词、形容词和副词等常见变形。', supportedItemTypes: ['word'], implementationStatus: 'planned', defaultWeight: 10, instructionText: '写出所给词的正确形式。', primaryActionText: '提交答案', hintText: '注意时态、词性和比较等级。', displayOptions: { showPartOfSpeech: true, showChineseMeaning: true, showExample: true } },
  { code: 'vocab_word_bank_fill', category: 'vocabulary', name: '选词填空', description: '从词库中选择合适单词填入句子。', supportedItemTypes: ['word'], implementationStatus: 'planned', defaultWeight: 10, instructionText: '从词库中选择合适的词。', primaryActionText: '提交答案', hintText: '先判断句子需要的词性。', displayOptions: { showExample: true } },
  { code: 'vocab_synonym_antonym_choice', category: 'vocabulary', name: '近义词 / 反义词辨析选择题', description: '辨析常见易混词、近义词和反义词。', supportedItemTypes: ['word'], implementationStatus: 'planned', defaultWeight: 10, instructionText: '选择最符合题意的词。', primaryActionText: '提交答案', hintText: '注意词义差别和固定搭配。', displayOptions: { showPartOfSpeech: true, showExample: true } },
  { code: 'vocab_listening_choice', category: 'vocabulary', name: '听音选择', description: '听英文发音，选择对应中文释义。', supportedItemTypes: ['word', 'phrase'], implementationStatus: 'available', defaultWeight: 20, instructionText: '听发音，选择正确释义。', primaryActionText: '播放发音', hintText: '可以重复播放后再选择。', displayOptions: {} },
  { code: 'phrase_cn_en_fill', category: 'phrase', name: '短语汉译英填空', description: '给中文短语，默写英文固定搭配。', supportedItemTypes: ['phrase'], implementationStatus: 'available', defaultWeight: 30, instructionText: '写出对应英文短语。', primaryActionText: '提交答案', hintText: '注意介词和冠词。', displayOptions: { showChineseMeaning: true, showExample: true } },
  { code: 'phrase_choice', category: 'phrase', name: '短语单选辨析', description: '从相近短语中选择正确搭配。', supportedItemTypes: ['phrase'], implementationStatus: 'planned', defaultWeight: 10, instructionText: '选择正确短语。', primaryActionText: '提交答案', hintText: '注意动词和介词搭配。', displayOptions: { showExample: true } },
  { code: 'phrase_matching', category: 'phrase', name: '短语匹配题', description: '匹配中文短语和英文短语。', supportedItemTypes: ['phrase'], implementationStatus: 'planned', defaultWeight: 10, instructionText: '匹配意思相同的短语。', primaryActionText: '提交答案', hintText: '先匹配最熟悉的短语。', displayOptions: { showChineseMeaning: true } },
  { code: 'grammar_choice', category: 'grammar', name: '语法单项选择', description: '每题考查一个语法点。', supportedItemTypes: ['grammar'], implementationStatus: 'planned', defaultWeight: 20, instructionText: '选择最符合语法规则的答案。', primaryActionText: '提交答案', hintText: '先判断本题考查的语法点。', displayOptions: { showExample: true } },
  { code: 'grammar_given_word_form', category: 'grammar', name: '用所给词适当形式填空', description: '根据句子语境填写所给词的正确形式。', supportedItemTypes: ['grammar'], implementationStatus: 'planned', defaultWeight: 20, instructionText: '写出括号内词的正确形式。', primaryActionText: '提交答案', hintText: '注意时态、语态和词性。', displayOptions: { showExample: true } },
  { code: 'grammar_error_correction', category: 'grammar', name: '单句改错', description: '选择错误部分并写出改正内容。', supportedItemTypes: ['grammar'], implementationStatus: 'planned', defaultWeight: 10, instructionText: '找出错误并改正。', primaryActionText: '提交答案', hintText: '从时态、主谓一致和固定搭配检查。', displayOptions: { showExample: true } },
  { code: 'grammar_sentence_transform', category: 'grammar', name: '句型转换', description: '完成同义句、否定句、疑问句等转换。', supportedItemTypes: ['grammar'], implementationStatus: 'planned', defaultWeight: 10, instructionText: '按要求完成句型转换。', primaryActionText: '提交答案', hintText: '注意助动词和句子结构。', displayOptions: { showExample: true } },
  { code: 'sentence_ordering', category: 'sentence', name: '连词成句', description: '把打乱的词语排列成完整句子。', supportedItemTypes: ['grammar'], implementationStatus: 'available', defaultWeight: 20, instructionText: '点击词块组成完整句子。', primaryActionText: '提交答案', hintText: '先找主语和谓语。', displayOptions: { showChineseMeaning: true } },
  { code: 'situational_dialogue_choice', category: 'sentence', name: '情景交际单选', description: '根据对话上下文选择合适答句。', supportedItemTypes: ['grammar'], implementationStatus: 'planned', defaultWeight: 10, instructionText: '选择最合适的答句。', primaryActionText: '提交答案', hintText: '注意上下文语气。', displayOptions: { showExample: true } },
  { code: 'dialogue_completion', category: 'sentence', name: '补全对话', description: '从备选句子中补全对话。', supportedItemTypes: ['passage'], implementationStatus: 'planned', defaultWeight: 10, instructionText: '选择合适句子补全对话。', primaryActionText: '提交答案', hintText: '先判断空格前后的问答关系。', displayOptions: {} },
  { code: 'cloze_choice', category: 'cloze', name: '标准短文完形', description: '短文每空四选一。', supportedItemTypes: ['passage'], implementationStatus: 'planned', defaultWeight: 10, instructionText: '阅读短文，选择每空正确答案。', primaryActionText: '提交答案', hintText: '先通读全文，再逐空判断。', displayOptions: {} },
  { code: 'cloze_word_bank', category: 'cloze', name: '短文选词完形', description: '从词库中选择合适词语完成短文。', supportedItemTypes: ['passage'], implementationStatus: 'planned', defaultWeight: 10, instructionText: '从词库中选择合适词语。', primaryActionText: '提交答案', hintText: '注意上下文和词形变化。', displayOptions: {} },
  { code: 'reading_true_false', category: 'reading', name: '判断正误阅读', description: '阅读短文后判断句子正误。', supportedItemTypes: ['passage'], implementationStatus: 'planned', defaultWeight: 10, instructionText: '根据短文判断正误。', primaryActionText: '提交答案', hintText: '回到原文定位关键信息。', displayOptions: {} },
  { code: 'reading_choice', category: 'reading', name: '阅读理解选择题', description: '阅读短文后回答细节、推理和主旨题。', supportedItemTypes: ['passage'], implementationStatus: 'planned', defaultWeight: 10, instructionText: '阅读短文并选择正确答案。', primaryActionText: '提交答案', hintText: '先看题干，再回原文定位。', displayOptions: {} },
  { code: 'reading_task_based', category: 'reading', name: '任务型阅读', description: '完成表格、简答或信息填空。', supportedItemTypes: ['passage'], implementationStatus: 'planned', defaultWeight: 10, instructionText: '根据短文完成任务。', primaryActionText: '提交答案', hintText: '答案通常来自原文信息。', displayOptions: {} },
];

function serializeDisplayOptions(options) {
  return JSON.stringify({ ...DEFAULT_DISPLAY_OPTIONS, ...(options || {}) });
}

module.exports = { CATEGORY_LABELS, DEFAULT_DISPLAY_OPTIONS, QUESTION_TYPES, serializeDisplayOptions };
```

- [ ] **Step 4: Add schema and seeding in `db/init.js`**

Add this import at the top.

```js
const { QUESTION_TYPES, serializeDisplayOptions } = require('../data/question-types');
```

Inside the `db.exec` schema block, add `question_types` and `question_type_settings` with these columns: `code`, `category`, `name`, `description`, `supported_item_types`, `implementation_status`, `default_weight`, `sort_order`, and settings fields `question_type_code`, `enabled`, `weight`, `instruction_text`, `primary_action_text`, `hint_text`, `display_options`.

After review cycle seeding, add an idempotent seed loop using `INSERT ... ON CONFLICT(code) DO UPDATE` for `question_types` and `INSERT OR IGNORE` for `question_type_settings`. Store `supportedItemTypes` and `displayOptions` as JSON strings.

- [ ] **Step 5: Verify and commit**

Run:

```bash
cmd /c npx jest tests\db-init.test.js --runInBand --verbose
```

Expected: PASS.

Commit:

```bash
git add data/question-types.js db/init.js tests/db-init.test.js
git commit -m "feat: seed question type catalog"
```

---

### Task 2: Query Helpers For Admin Settings And Generation

**Files:**
- Modify: `db/queries.js`
- Create: `tests/question-type-queries.test.js`

- [ ] **Step 1: Write failing query tests**

Create `tests/question-type-queries.test.js`.

```js
const Database = require('better-sqlite3');
const { initDatabase } = require('../db/init');
const queries = require('../db/queries');

let db;

beforeEach(() => {
  db = new Database(':memory:');
  initDatabase(db);
});

afterEach(() => db.close());

describe('question type query helpers', () => {
  test('getQuestionTypeGroups returns catalog rows grouped by category label', () => {
    const groups = queries.getQuestionTypeGroups(db);
    expect(groups.map(group => group.label)).toEqual([
      '单词词汇类', '短语固定搭配类', '语法专项类', '句子句型类', '完形填空类', '阅读理解类',
    ]);
    const vocabulary = groups.find(group => group.category === 'vocabulary');
    expect(vocabulary.types.map(type => type.code)).toContain('vocab_en_cn_choice');
    expect(vocabulary.types[0]).toHaveProperty('enabled');
    expect(vocabulary.types[0]).toHaveProperty('display_options');
  });

  test('updateQuestionTypeSettings persists enabled state, weight, copy, and display options', () => {
    queries.updateQuestionTypeSettings(db, [{
      code: 'vocab_en_cn_choice', enabled: false, weight: 7,
      instructionText: '选择最准确的释义。', primaryActionText: '提交本题', hintText: '先排除明显错误项。',
      displayOptions: { showExample: true, showPartOfSpeech: true, showChineseMeaning: false, showFirstLetterHint: false },
    }]);
    const row = db.prepare('SELECT * FROM question_type_settings WHERE question_type_code = ?').get('vocab_en_cn_choice');
    expect(row.enabled).toBe(0);
    expect(row.weight).toBe(7);
    expect(row.instruction_text).toBe('选择最准确的释义。');
    expect(row.primary_action_text).toBe('提交本题');
    expect(row.hint_text).toBe('先排除明显错误项。');
    expect(JSON.parse(row.display_options).showExample).toBe(true);
  });

  test('getAvailableQuestionTypesForItemType excludes planned and disabled types', () => {
    queries.updateQuestionTypeSettings(db, [{
      code: 'vocab_en_cn_choice', enabled: false, weight: 30,
      instructionText: '选择正确答案。', primaryActionText: '提交答案', hintText: '注意词义和语境。', displayOptions: {},
    }]);
    const wordTypes = queries.getAvailableQuestionTypesForItemType(db, 'word');
    const grammarTypes = queries.getAvailableQuestionTypesForItemType(db, 'grammar');
    expect(wordTypes.map(type => type.code)).not.toContain('vocab_en_cn_choice');
    expect(wordTypes.map(type => type.code)).toContain('vocab_listening_choice');
    expect(grammarTypes.map(type => type.code)).not.toContain('grammar_choice');
  });

  test('updateQuestionTypeSettings rejects invalid weights', () => {
    expect(() => queries.updateQuestionTypeSettings(db, [{
      code: 'vocab_en_cn_choice', enabled: true, weight: 101,
      instructionText: '选择正确答案。', primaryActionText: '提交答案', hintText: '提示', displayOptions: {},
    }])).toThrow('题型比例必须是 0 到 100 的整数');
  });
});
```

- [ ] **Step 2: Run failing query tests**

Run:

```bash
cmd /c npx jest tests\question-type-queries.test.js --runInBand --verbose
```

Expected: FAIL with `queries.getQuestionTypeGroups is not a function`.

- [ ] **Step 3: Add query helpers in `db/queries.js`**

Add this import at the top.

```js
const { CATEGORY_LABELS, DEFAULT_DISPLAY_OPTIONS } = require('../data/question-types');
```

Add these functions before `module.exports`.

```js
function safeParseDisplayOptions(value) {
  try { return { ...DEFAULT_DISPLAY_OPTIONS, ...JSON.parse(value || '{}') }; }
  catch (err) { return { ...DEFAULT_DISPLAY_OPTIONS }; }
}

function normalizeQuestionTypeRow(row) {
  return {
    ...row,
    enabled: row.enabled === 1,
    supported_item_types: JSON.parse(row.supported_item_types || '[]'),
    display_options: safeParseDisplayOptions(row.display_options),
  };
}

function getQuestionTypeRows(db) {
  return db.prepare(
    `SELECT question_types.*,
            COALESCE(question_type_settings.enabled, CASE WHEN question_types.implementation_status = 'available' THEN 1 ELSE 0 END) AS enabled,
            COALESCE(question_type_settings.weight, question_types.default_weight) AS weight,
            COALESCE(question_type_settings.instruction_text, '') AS instruction_text,
            COALESCE(question_type_settings.primary_action_text, '') AS primary_action_text,
            COALESCE(question_type_settings.hint_text, '') AS hint_text,
            COALESCE(question_type_settings.display_options, '{}') AS display_options
     FROM question_types
     LEFT JOIN question_type_settings ON question_type_settings.question_type_code = question_types.code
     ORDER BY question_types.sort_order, question_types.id`
  ).all().map(normalizeQuestionTypeRow);
}

function getQuestionTypeGroups(db) {
  const groups = Object.entries(CATEGORY_LABELS).map(([category, label]) => ({ category, label, types: [] }));
  const byCategory = new Map(groups.map(group => [group.category, group]));
  for (const row of getQuestionTypeRows(db)) {
    const group = byCategory.get(row.category);
    if (group) group.types.push(row);
  }
  return groups;
}

function validateQuestionTypeWeight(weight) {
  const parsed = Number.parseInt(weight, 10);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
    throw new Error('题型比例必须是 0 到 100 的整数');
  }
  return parsed;
}

function updateQuestionTypeSettings(db, settings) {
  const existingCodes = new Set(db.prepare('SELECT code FROM question_types').all().map(row => row.code));
  const update = db.prepare(
    `INSERT INTO question_type_settings (question_type_code, enabled, weight, instruction_text, primary_action_text, hint_text, display_options, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(question_type_code) DO UPDATE SET
       enabled = excluded.enabled,
       weight = excluded.weight,
       instruction_text = excluded.instruction_text,
       primary_action_text = excluded.primary_action_text,
       hint_text = excluded.hint_text,
       display_options = excluded.display_options,
       updated_at = datetime('now')`
  );
  const tx = db.transaction(() => {
    for (const setting of settings) {
      if (!existingCodes.has(setting.code)) continue;
      update.run(
        setting.code,
        setting.enabled ? 1 : 0,
        validateQuestionTypeWeight(setting.weight),
        String(setting.instructionText || ''),
        String(setting.primaryActionText || ''),
        String(setting.hintText || ''),
        JSON.stringify({ ...DEFAULT_DISPLAY_OPTIONS, ...(setting.displayOptions || {}) })
      );
    }
  });
  tx();
}

function getAvailableQuestionTypesForItemType(db, itemType) {
  return getQuestionTypeRows(db).filter(row => (
    row.implementation_status === 'available' && row.enabled && row.weight > 0 && row.supported_item_types.includes(itemType)
  ));
}
```

Export `getQuestionTypeGroups`, `updateQuestionTypeSettings`, and `getAvailableQuestionTypesForItemType`.

- [ ] **Step 4: Verify and commit**

Run:

```bash
cmd /c npx jest tests\question-type-queries.test.js tests\review-plan-queries.test.js --runInBand --verbose
```

Expected: PASS.

Commit:

```bash
git add db/queries.js tests/question-type-queries.test.js
git commit -m "feat: add question type query helpers"
```

---

### Task 3: Generator Integration With Weighted Configured Types

**Files:**
- Modify: `engine/generator.js`
- Modify: `views/practice/exercise.ejs`
- Modify: `public/review.css`
- Create: `tests/question-type-generator.test.js`

- [ ] **Step 1: Write failing generator tests**

Create `tests/question-type-generator.test.js` with tests that assert: enabled `vocab_listening_choice` generates `listening`, planned `grammar_choice` is excluded, disabled phrase types fall back, and deterministic weighted selection can choose `vocab_listening_choice` when `random: () => 0.95`.

Use this core assertion structure in the first test.

```js
const exercise = generator.generateExercises([item], db, { random: () => 0 })[0];
expect(exercise.question_type_code).toBe('vocab_listening_choice');
expect(exercise.exercise_type).toBe('listening');
expect(exercise.instruction_text).toBe('听发音，选择正确释义。');
expect(exercise.primary_action_text).toBe('播放发音');
expect(exercise.hint_text).toBe('可以重复播放后再选择。');
```

- [ ] **Step 2: Run failing generator tests**

Run:

```bash
cmd /c npx jest tests\question-type-generator.test.js --runInBand --verbose
```

Expected: FAIL because the generator has no configured question type support.

- [ ] **Step 3: Modify `engine/generator.js`**

Add configured mapping and selection functions.

```js
function pickFallbackExerciseType(item) {
  const types = getExerciseTypesForItem(item);
  return types[Math.floor(Math.random() * types.length)];
}

function mapQuestionTypeToExerciseType(questionType, item) {
  switch (questionType.code) {
    case 'vocab_en_cn_choice': return item.type === 'word' ? 'en2cn' : null;
    case 'vocab_listening_choice': return item.type === 'word' || item.type === 'phrase' ? 'listening' : null;
    case 'phrase_cn_en_fill': return item.type === 'phrase' ? 'cn2en' : null;
    case 'sentence_ordering': return item.type === 'grammar' ? 'sentence' : null;
    default: return null;
  }
}

function pickWeightedQuestionType(questionTypes, random = Math.random) {
  const weighted = questionTypes.filter(type => Number(type.weight) > 0);
  const total = weighted.reduce((sum, type) => sum + Number(type.weight), 0);
  if (total <= 0) return null;
  let target = random() * total;
  for (const type of weighted) {
    target -= Number(type.weight);
    if (target < 0) return type;
  }
  return weighted[weighted.length - 1] || null;
}

function pickConfiguredQuestionType(item, db, options = {}) {
  if (!db || typeof db.prepare !== 'function') return null;
  const queries = require('../db/queries');
  const candidates = queries.getAvailableQuestionTypesForItemType(db, item.type)
    .filter(type => mapQuestionTypeToExerciseType(type, item));
  return pickWeightedQuestionType(candidates, options.random || Math.random);
}
```

Change `createExercise(item, exerciseType, db)` to accept `template = {}` and add these fields to `base`: `question_type_code`, `instruction_text`, `primary_action_text`, `hint_text`, `display_options`.

Replace `generateExercises`.

```js
function generateExercises(items, db, options = {}) {
  return items.map(item => {
    const configuredType = pickConfiguredQuestionType(item, db, options);
    if (configuredType) {
      const exerciseType = mapQuestionTypeToExerciseType(configuredType, item);
      if (exerciseType) {
        return createExercise(item, exerciseType, db, {
          question_type_code: configuredType.code,
          instruction_text: configuredType.instruction_text,
          primary_action_text: configuredType.primary_action_text,
          hint_text: configuredType.hint_text,
          display_options: configuredType.display_options,
        });
      }
    }
    return createExercise(item, pickFallbackExerciseType(item), db);
  });
}
```

Export `pickWeightedQuestionType` along with existing exports.

- [ ] **Step 4: Render configured copy**

In `views/practice/exercise.ejs`, render `ex.instruction_text` before the question and `ex.hint_text` after the answer controls. Use `ex.primary_action_text || '播放发音'` for the listening button.

Add CSS to `public/review.css`.

```css
.exercise-instruction,
.exercise-hint {
  margin-bottom: 0.75rem;
  color: var(--muted);
  font-size: 0.9rem;
}

.exercise-hint {
  margin-top: 0.75rem;
  padding: 0.6rem 0.75rem;
  border-left: 3px solid #a8c7fa;
  background: #f8fbff;
}
```

- [ ] **Step 5: Verify and commit**

Run:

```bash
cmd /c npx jest tests\question-type-generator.test.js tests\engine.test.js --runInBand --verbose
```

Expected: PASS.

Commit:

```bash
git add engine/generator.js views/practice/exercise.ejs public/review.css tests/question-type-generator.test.js
git commit -m "feat: generate exercises from question type settings"
```

---

### Task 4: Admin Question Type Settings Routes And Page

**Files:**
- Modify: `routes/admin.js`
- Modify: `views/layout.ejs`
- Create: `views/admin/question-types.ejs`
- Modify: `public/review.css`
- Create: `tests/question-type-routes.test.js`

- [ ] **Step 1: Write failing route tests**

Create `tests/question-type-routes.test.js`. Copy the `buildApp` and `requestApp` helper pattern from `tests/review-plan-routes.test.js`, then add these route assertions.

```js
test('admin can open question type settings page', async () => {
  const app = buildApp({ id: 1, username: 'admin', role: 'admin' });
  const res = await requestApp(app, 'GET', '/admin/question-types');
  expect(res.statusCode).toBe(200);
  expect(res.text).toContain('题型设置');
  expect(res.text).toContain('单词词汇类');
  expect(res.text).toContain('可用于练习');
  expect(res.text).toContain('后续支持');
  app.cleanup();
});

test('non-admin cannot open question type settings page', async () => {
  const app = buildApp({ id: 2, username: 'student', role: 'user' });
  const res = await requestApp(app, 'GET', '/admin/question-types');
  expect(res.statusCode).toBe(403);
  app.cleanup();
});

test('admin can save question type settings', async () => {
  const app = buildApp({ id: 1, username: 'admin', role: 'admin' });
  const res = await requestApp(app, 'POST', '/admin/question-types', {
    'settings[0][code]': 'vocab_en_cn_choice',
    'settings[0][enabled]': 'on',
    'settings[0][weight]': '17',
    'settings[0][instructionText]': '选择最准确的答案。',
    'settings[0][primaryActionText]': '提交本题',
    'settings[0][hintText]': '认真比较选项。',
    'settings[0][showExample]': 'on',
    'settings[0][showPartOfSpeech]': 'on',
  });
  const saved = app.locals.db.prepare('SELECT * FROM question_type_settings WHERE question_type_code = ?').get('vocab_en_cn_choice');
  expect(res.statusCode).toBe(302);
  expect(res.headers.location).toBe('/admin/question-types');
  expect(saved.weight).toBe(17);
  expect(saved.instruction_text).toBe('选择最准确的答案。');
  expect(JSON.parse(saved.display_options).showExample).toBe(true);
  app.cleanup();
});

test('invalid weight renders validation error', async () => {
  const app = buildApp({ id: 1, username: 'admin', role: 'admin' });
  const res = await requestApp(app, 'POST', '/admin/question-types', {
    'settings[0][code]': 'vocab_en_cn_choice',
    'settings[0][enabled]': 'on',
    'settings[0][weight]': '101',
    'settings[0][instructionText]': '选择正确答案。',
    'settings[0][primaryActionText]': '提交答案',
    'settings[0][hintText]': '提示',
  });
  expect(res.statusCode).toBe(200);
  expect(res.text).toContain('题型比例必须是 0 到 100 的整数');
  app.cleanup();
});
```

- [ ] **Step 2: Run failing route tests**

Run:

```bash
cmd /c npx jest tests\question-type-routes.test.js --runInBand --verbose
```

Expected: FAIL with route/page missing.

- [ ] **Step 3: Add admin routes in `routes/admin.js`**

Add this GET route and helper near the existing review-plan route.

```js
router.get('/admin/question-types', (req, res) => {
  const groups = queries.getQuestionTypeGroups(req.app.locals.db);
  renderWithLayout(res, 'admin/question-types', { groups, error: null, success: null }, '题型设置');
});

function normalizeQuestionTypeSettings(rawSettings) {
  const settingsArray = Array.isArray(rawSettings) ? rawSettings : rawSettings ? Object.values(rawSettings) : [];
  return settingsArray.map(setting => ({
    code: setting.code,
    enabled: setting.enabled === 'on' || setting.enabled === '1' || setting.enabled === true,
    weight: setting.weight,
    instructionText: setting.instructionText,
    primaryActionText: setting.primaryActionText,
    hintText: setting.hintText,
    displayOptions: {
      showExample: setting.showExample === 'on',
      showPartOfSpeech: setting.showPartOfSpeech === 'on',
      showChineseMeaning: setting.showChineseMeaning === 'on',
      showFirstLetterHint: setting.showFirstLetterHint === 'on',
    },
  }));
}
```

Add this POST route.

```js
router.post('/admin/question-types', (req, res) => {
  const db = req.app.locals.db;
  try {
    queries.updateQuestionTypeSettings(db, normalizeQuestionTypeSettings(req.body.settings));
    res.redirect('/admin/question-types');
  } catch (err) {
    renderWithLayout(res, 'admin/question-types', {
      groups: queries.getQuestionTypeGroups(db),
      error: err.message,
      success: null,
    }, '题型设置');
  }
});
```

- [ ] **Step 4: Create `views/admin/question-types.ejs`**

Create a grouped form with `groups.forEach(group => { ... })`, one card per type, and these exact controls per card:

```ejs
<input type="hidden" name="settings[<%= index %>][code]" value="<%= type.code %>">
<input type="checkbox" name="settings[<%= index %>][enabled]" <%= type.enabled ? 'checked' : '' %>>
<input type="number" min="0" max="100" name="settings[<%= index %>][weight]" value="<%= type.weight %>">
<input type="text" name="settings[<%= index %>][instructionText]" value="<%= type.instruction_text %>">
<input type="text" name="settings[<%= index %>][primaryActionText]" value="<%= type.primary_action_text %>">
<input type="text" name="settings[<%= index %>][hintText]" value="<%= type.hint_text %>">
<input type="checkbox" name="settings[<%= index %>][showExample]" <%= type.display_options.showExample ? 'checked' : '' %>>
<input type="checkbox" name="settings[<%= index %>][showPartOfSpeech]" <%= type.display_options.showPartOfSpeech ? 'checked' : '' %>>
<input type="checkbox" name="settings[<%= index %>][showChineseMeaning]" <%= type.display_options.showChineseMeaning ? 'checked' : '' %>>
<input type="checkbox" name="settings[<%= index %>][showFirstLetterHint]" <%= type.display_options.showFirstLetterHint ? 'checked' : '' %>>
```

The page must include the visible text `题型设置`, `题型生成规则`, `可用于练习`, `后续支持`, and `保存题型设置`.

- [ ] **Step 5: Add nav and styling**

Add this link to the admin nav in `views/layout.ejs` after `复习计划`.

```ejs
<a href="/admin/question-types">题型设置</a>
```

Add these CSS classes to `public/review.css`.

```css
.question-type-settings { display: grid; gap: 1rem; }
.question-type-list { display: grid; gap: 1rem; }
.question-type-card { border: 1px solid var(--border); border-radius: var(--radius); padding: 1rem; background: var(--surface); }
.question-type-card-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
.status-pill { display: inline-flex; align-items: center; min-height: 1.75rem; padding: 0.2rem 0.6rem; border-radius: 999px; font-size: 0.8rem; font-weight: 600; white-space: nowrap; }
.status-available { color: #137333; background: #e6f4ea; }
.status-planned { color: #5f6368; background: #f1f3f4; }
.display-option-grid { display: grid; gap: 0.25rem 1rem; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); }
```

- [ ] **Step 6: Verify and commit**

Run:

```bash
cmd /c npx jest tests\question-type-routes.test.js --runInBand --verbose
```

Expected: PASS.

Commit:

```bash
git add routes/admin.js views/layout.ejs views/admin/question-types.ejs public/review.css tests/question-type-routes.test.js
git commit -m "feat: add admin question type settings"
```

---

### Task 5: UI Text Coverage And Full Regression

**Files:**
- Modify: `tests/ui-text.test.js`

- [ ] **Step 1: Add UI text coverage**

Add `views/admin/question-types.ejs` to `filesWithUserFacingText`.

```js
'views/admin/question-types.ejs',
```

Add this expected text entry.

```js
'views/admin/question-types.ejs': ['题型设置', '题型生成规则', '可用于练习', '后续支持', '保存题型设置', '单词词汇类', '短语固定搭配类', '语法专项类', '句子句型类', '完形填空类', '阅读理解类'],
```

Update the `views/layout.ejs` entry to include `题型设置`.

```js
'views/layout.ejs': ['英语复习工具', '课本管理', '复习计划', '题型设置', '学生端预览', '系统设置', '开始复习', '学习统计', '退出'],
```

- [ ] **Step 2: Run UI text and full tests**

Run:

```bash
cmd /c npx jest tests\ui-text.test.js --runInBand --verbose
cmd /c npx jest --runInBand --verbose
```

Expected: PASS. If Jest discovers duplicate suites under `.worktrees`, every discovered suite must still pass.

- [ ] **Step 3: Commit UI coverage**

Commit:

```bash
git add tests/ui-text.test.js
git commit -m "test: cover question type settings text"
```

---

### Task 6: Manual Verification Notes And Final Review

**Files:**
- Modify: `docs/mvp-test-guide.md` when it already has a suitable admin verification section.
- Create: `docs/question-type-settings-test-guide.md` when `docs/mvp-test-guide.md` has no suitable section.

- [ ] **Step 1: Add manual verification instructions**

Use this exact content for the new section or new file.

```md
# Question Type Settings Verification

## Preconditions

- Start the app with `cmd /c npm start`.
- Open `http://localhost:3000`.
- Log in as admin with `admin` / `admin123`.

## Admin Checks

1. Open `题型设置` from the admin navigation.
2. Confirm the six groups are visible: 单词词汇类、短语固定搭配类、语法专项类、句子句型类、完形填空类、阅读理解类。
3. Confirm available types show `可用于练习` and planned types show `后续支持`.
4. Change `听音选择` weight to `100` and keep it enabled.
5. Save the page and confirm the value remains after reload.
6. Enter invalid weight `101`; confirm the page shows `题型比例必须是 0 到 100 的整数`.

## Student Checks

1. Make sure a review plan is active and contains word items.
2. Open `学生端预览`, then start today's review.
3. Confirm word exercises can use the configured type.
4. Confirm planned types such as 阅读理解 do not appear in student practice.
5. Submit answers and confirm the result page still works.

## Regression Checks

- Existing textbook management still works.
- Existing review plan activation still works.
- Existing daily review task generation still works.
- Existing stats page still opens.
```

- [ ] **Step 2: Run final verification**

Run focused suites:

```bash
cmd /c npx jest tests\db-init.test.js tests\question-type-queries.test.js tests\question-type-generator.test.js tests\question-type-routes.test.js tests\ui-text.test.js --runInBand --verbose
```

Expected: PASS.

Run full suite:

```bash
cmd /c npx jest --runInBand --verbose
```

Expected: PASS.

- [ ] **Step 3: Commit docs**

Commit the changed verification guide path.

```bash
git add docs/mvp-test-guide.md docs/question-type-settings-test-guide.md
git commit -m "docs: add question type settings verification"
```

If one of those paths does not exist, run `git add` only for the path that was created or modified, then commit with the same message.

- [ ] **Step 4: Final implementation status**

Run:

```bash
git status --short --branch
git log --oneline -6
```

Expected: only pre-existing unrelated untracked paths such as `.claude/` or `docs/new_vison_guide.md` may remain. The new implementation files should be committed.

---

## Plan Self-Review

- Spec coverage: Task 1 covers catalog/schema/seed. Task 2 covers admin and generation queries. Task 3 covers configured generation, planned exclusion, weights, fallback, and exercise template fields. Task 4 covers admin routes/page/navigation. Task 5 covers UI text. Task 6 covers manual verification and full regression.
- Placeholder scan: the plan gives concrete file paths, test code, implementation snippets, commands, and expected outcomes.
- Type consistency: the plan consistently uses `question_types`, `question_type_settings`, `question_type_code`, `implementation_status`, `display_options`, `vocab_listening_choice`, `getQuestionTypeGroups`, `updateQuestionTypeSettings`, and `getAvailableQuestionTypesForItemType`.
