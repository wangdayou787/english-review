# Translation Fill And Choice Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand practice generation so students can do both directions of translation choice, both directions of translation fill, and word-form fill with Chinese target labels.

**Architecture:** Keep the change inside the existing exercise generation pipeline. Add small helpers for translation-option generation and inflection labels in `engine/exercise-builders.js`, extend question-type mapping in `engine/question-type-selection.js`, seed one available translation-fill question type in `data/question-types.js`, and keep the EJS page generic so choice exercises use radio buttons and fill exercises use text inputs.

**Tech Stack:** Node.js, Express, EJS, SQLite via better-sqlite3, Jest.

---

## File Structure

- Modify `engine/exercise-builders.js`: add English-option choice generation, add `cn2en_choice`, add `en2cn_fill`, add Chinese inflection label mapping, and support deterministic random selection for tests.
- Modify `engine/question-type-selection.js`: allow `vocab_en_cn_choice` to map to either choice direction and add `translation_fill` mapping for words and phrases.
- Modify `engine/generator.js`: pass random options into exercise construction and score `en2cn_fill`.
- Modify `data/question-types.js`: add available `translation_fill` type for `word` and `phrase`.
- Modify `views/practice/exercise.ejs`: add display label for `cn2en_choice` and `en2cn_fill`; keep text input rendering for fill exercises.
- Modify `tests/engine.test.js`: add generation tests for new choice/fill variants.
- Modify `tests/single-point-score.test.js`: add scoring tests for `en2cn_fill`.
- Modify `tests/ui-text.test.js`: add visible text coverage for `互译填空` and `目标词形`.

## Implementation Notes

- Do not add a table or migration.
- Do not add fuzzy Chinese matching in this phase.
- Do not remove existing `cn2en`; it remains the fill form for Chinese prompt to English answer.
- Use existing question type settings weights. `translation_fill` gets its own row and can be enabled/weighted like other question types.
- Existing `phrase_cn_en_fill` can continue to map to `cn2en`; `translation_fill` is the cross-item-type general form.

---

### Task 1: Word-Form Label Mapping And Random Inflection Target

**Files:**
- Modify: `engine/question-type-selection.js`
- Modify: `engine/exercise-builders.js`
- Modify: `tests/engine.test.js`
- Modify: `tests/ui-text.test.js`

- [ ] **Step 1: Add failing tests for Chinese inflection labels and deterministic target selection**

Append these tests inside `describe('engine/generator.js', () => { ... })` in `tests/engine.test.js`:

```js
  test('form fill exposes Chinese target labels instead of internal inflection keys', () => {
    const smallDb = new Database(':memory:');
    initDatabase(smallDb);
    const textbookId = queries.createTextbook(smallDb, 'Forms Book');
    const unitId = queries.createUnit(smallDb, textbookId, 'Unit 1');
    const itemId = queries.createItem(smallDb, {
      unitId,
      type: 'word',
      english: 'study',
      chinese: '学习',
    });
    queries.saveWordQuestionDetails(smallDb, itemId, {
      baseForm: 'study',
      firstLetterHint: 's',
      usageNote: '',
      inflections: { plural: 'studies' },
    });

    const item = queries.getItemById(smallDb, itemId);
    const exercise = generator.createExercise(item, 'form_fill', smallDb);

    expect(exercise.prompt_label).toBe('复数');
    expect(exercise.correct_answer).toBe('studies');
    smallDb.close();
  });

  test('form fill can choose a later available inflection with deterministic random', () => {
    const smallDb = new Database(':memory:');
    initDatabase(smallDb);
    const textbookId = queries.createTextbook(smallDb, 'Random Forms Book');
    const unitId = queries.createUnit(smallDb, textbookId, 'Unit 1');
    const itemId = queries.createItem(smallDb, {
      unitId,
      type: 'word',
      english: 'study',
      chinese: '学习',
    });
    queries.saveWordQuestionDetails(smallDb, itemId, {
      baseForm: 'study',
      firstLetterHint: 's',
      usageNote: '',
      inflections: {
        plural: 'studies',
        past_tense: 'studied',
        past_participle: 'studied',
      },
    });

    const item = queries.getItemById(smallDb, itemId);
    const exercise = generator.createExercise(item, 'form_fill', smallDb, {}, null, { random: () => 0.5 });

    expect(exercise.prompt_label).toBe('过去式');
    expect(exercise.correct_answer).toBe('studied');
    smallDb.close();
  });
```

Update the `views/practice/exercise.ejs` entry in `tests/ui-text.test.js` to include `目标词形`.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
cmd /c npx jest tests/engine.test.js tests/ui-text.test.js --verbose --testPathIgnorePatterns=.worktrees --runInBand
```

Expected: FAIL because `prompt_label` is still `plural` or `past_tense`, and UI text coverage does not yet include the new text if the template has not been fixed.

- [ ] **Step 3: Add inflection metadata helpers**

In `engine/question-type-selection.js`, replace `getInflectionEntry` with metadata-aware helpers:

```js
const INFLECTION_LABELS = {
  plural: '复数',
  third_person_singular: '第三人称单数',
  past_tense: '过去式',
  past_participle: '过去分词',
  present_participle: '现在分词',
  comparative: '比较级',
  superlative: '最高级',
  adverb: '副词形式',
  adjective: '形容词形式',
  noun: '名词形式',
};

function getInflectionEntries(wordDetail) {
  if (!wordDetail || !wordDetail.inflections) return [];
  return Object.entries(wordDetail.inflections)
    .filter(([, value]) => typeof value === 'string' && value.trim())
    .map(([key, value]) => ({
      key,
      label: INFLECTION_LABELS[key] || key,
      value: value.trim(),
    }));
}

function getInflectionEntry(wordDetail, random = Math.random) {
  const entries = getInflectionEntries(wordDetail);
  if (entries.length === 0) return null;
  const index = Math.min(entries.length - 1, Math.floor(random() * entries.length));
  return entries[index];
}
```

Update `isConfiguredTypeUsable` so it still calls `getInflectionEntry(support.wordDetail)`.

Update `module.exports` to include:

```js
  INFLECTION_LABELS,
  getInflectionEntries,
```

- [ ] **Step 4: Use the label in form fill exercises**

In `engine/exercise-builders.js`, update the import:

```js
const { getInflectionEntry, getSinglePointSupport } = require('./question-type-selection');
```

Keep the import line but update `createExercise` signature:

```js
function createExercise(item, exerciseType, db, template = {}, support = null, options = {}) {
```

In the `form_fill` case, replace the tuple handling with:

```js
      const inflectionEntry = getInflectionEntry(wordDetail, options.random || Math.random);
      if (!inflectionEntry) return createExercise(item, 'cn2en', db, template, singlePointSupport, options);
      return {
        ...base,
        question: (wordDetail.base_form || item.english || '').trim(),
        correct_answer: inflectionEntry.value,
        prompt_label: inflectionEntry.label,
        prompt_key: inflectionEntry.key,
        usage_note: wordDetail.usage_note || '',
        example: item.example || '',
      };
```

Update fallback recursive calls in this file to pass `options` as the sixth argument.

- [ ] **Step 5: Pass deterministic random through generator**

In `engine/generator.js`, update the configured call:

```js
        return createExercise(item, exerciseType, db, {
          question_type_code: configuredType.code,
          instruction_text: configuredType.instruction_text,
          primary_action_text: configuredType.primary_action_text,
          hint_text: configuredType.hint_text,
          display_options: configuredType.display_options,
        }, support, options);
```

Update fallback generation:

```js
    return createExercise(item, pickFallbackExerciseType(item), db, {}, support, options);
```

- [ ] **Step 6: Ensure practice page has the desired visible copy**

In `views/practice/exercise.ejs`, ensure the form-fill line renders:

```ejs
        <p class="text-muted">目标词形：<%= ex.prompt_label %></p>
```

Do not render `prompt_key` on the page.

- [ ] **Step 7: Run tests and verify pass**

Run:

```bash
cmd /c npx jest tests/engine.test.js tests/ui-text.test.js --verbose --testPathIgnorePatterns=.worktrees --runInBand
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```bash
git add engine/question-type-selection.js engine/exercise-builders.js engine/generator.js views/practice/exercise.ejs tests/engine.test.js tests/ui-text.test.js
git commit -m "fix: show translated word form targets"
```

---

### Task 2: Translation Choice In Both Directions

**Files:**
- Modify: `engine/exercise-builders.js`
- Modify: `engine/question-type-selection.js`
- Modify: `engine/generator.js`
- Modify: `views/practice/exercise.ejs`
- Modify: `tests/engine.test.js`

- [ ] **Step 1: Add failing tests for Chinese-to-English choice**

Append these tests in `tests/engine.test.js` inside `describe('engine/generator.js', () => { ... })`:

```js
  test('cn2en choice exercises use English options and include the correct word', () => {
    const items = queries.getItemsByUnit(db, 1).filter(i => i.type === 'word').slice(0, 4);
    const item = items[0];

    const exercise = generator.createExercise(item, 'cn2en_choice', db);

    expect(exercise.exercise_type).toBe('cn2en_choice');
    expect(exercise.question).toBe(item.chinese);
    expect(exercise.correct_answer).toBe(item.english);
    expect(exercise.options).toContain(item.english);
    expect(exercise.options).not.toContain(item.chinese);
    expect(new Set(exercise.options).size).toBe(exercise.options.length);
  });

  test('translation choice question type can choose Chinese-to-English direction', () => {
    const item = queries.getItemsByUnit(db, 1).find(i => i.type === 'word');
    db.prepare('UPDATE question_type_settings SET enabled = 0').run();
    db.prepare(
      `INSERT INTO question_type_settings (question_type_code, enabled, weight, instruction_text, primary_action_text, hint_text, display_options)
       VALUES ('vocab_en_cn_choice', 1, 100, '选择正确答案。', '提交答案', '注意词义。', '{}')
       ON CONFLICT(question_type_code) DO UPDATE SET enabled = excluded.enabled, weight = excluded.weight`
    ).run();

    const exercise = generator.generateExercises([item], db, { random: () => 0.75 })[0];

    expect(exercise.exercise_type).toBe('cn2en_choice');
    expect(exercise.question).toBe(item.chinese);
    expect(exercise.correct_answer).toBe(item.english);
    expect(exercise.options).toContain(item.english);
  });
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
cmd /c npx jest tests/engine.test.js --verbose --testPathIgnorePatterns=.worktrees --runInBand
```

Expected: FAIL because `cn2en_choice` is not implemented and `vocab_en_cn_choice` only maps to `en2cn`.

- [ ] **Step 3: Add answer-field option builders**

In `engine/exercise-builders.js`, replace the current distractor/option helpers with field-aware versions:

```js
function getDistractors(item, db, answerField = 'chinese') {
  const seen = new Set([item[answerField]]);
  const distractors = [];

  function addRows(rows) {
    for (const row of rows) {
      const answer = row[answerField];
      if (!answer || seen.has(answer)) continue;
      seen.add(answer);
      distractors.push(row);
      if (distractors.length === 3) break;
    }
  }

  addRows(db.prepare(
    'SELECT * FROM items WHERE type = ? AND id != ? ORDER BY RANDOM()'
  ).all(item.type, item.id));

  if (distractors.length < 3) {
    addRows(db.prepare(
      'SELECT * FROM items WHERE type != ? AND id != ? ORDER BY RANDOM()'
    ).all(item.type, item.id));
  }

  return distractors;
}

function buildOptions(distractors, item, answerField = 'chinese') {
  const options = [...new Set([...distractors.map(d => d[answerField]), item[answerField]].filter(Boolean))];
  return shuffle(options);
}
```

Keep the existing `shuffle` helper.

- [ ] **Step 4: Implement `cn2en_choice` exercise**

In `createExercise`, add this case after `en2cn`:

```js
    case 'cn2en_choice':
      return {
        ...base,
        question: item.chinese,
        correct_answer: item.english,
        options: buildOptions(getDistractors(item, db, 'english'), item, 'english'),
      };
```

Ensure existing `en2cn` and `listening` call `buildOptions(..., 'chinese')` or rely on the default.

- [ ] **Step 5: Let `vocab_en_cn_choice` choose a direction**

In `engine/question-type-selection.js`, change `mapQuestionTypeToExerciseType` signature:

```js
function mapQuestionTypeToExerciseType(questionType, item, options = {}) {
```

Change the `vocab_en_cn_choice` case:

```js
    case 'vocab_en_cn_choice':
      if (item.type !== 'word' && item.type !== 'phrase') return null;
      return (options.random || Math.random)() < 0.5 ? 'en2cn' : 'cn2en_choice';
```

Update internal calls that only check compatibility to pass deterministic `random: () => 0` where needed:

```js
      .filter(code => mapQuestionTypeToExerciseType({ code }, item, { random: () => 0 }) !== null)
```

and:

```js
    .filter(type => mapQuestionTypeToExerciseType(type, item, { random: () => 0 }))
```

In `engine/generator.js`, update the configured mapping call:

```js
      const exerciseType = mapQuestionTypeToExerciseType(configuredType, item, options);
```

- [ ] **Step 6: Add UI label for choice direction**

In `views/practice/exercise.ejs`, add:

```ejs
          <% } else if (ex.exercise_type === 'cn2en_choice') { %>中文选英文
```

Place it near the existing `en2cn` and `cn2en` labels.

- [ ] **Step 7: Run tests and verify pass**

Run:

```bash
cmd /c npx jest tests/engine.test.js tests/ui-text.test.js --verbose --testPathIgnorePatterns=.worktrees --runInBand
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```bash
git add engine/exercise-builders.js engine/question-type-selection.js engine/generator.js views/practice/exercise.ejs tests/engine.test.js tests/ui-text.test.js
git commit -m "feat: add chinese to english choice exercises"
```

---

### Task 3: Translation Fill Question Type

**Files:**
- Modify: `data/question-types.js`
- Modify: `engine/exercise-builders.js`
- Modify: `engine/question-type-selection.js`
- Modify: `engine/generator.js`
- Modify: `views/practice/exercise.ejs`
- Modify: `tests/engine.test.js`
- Modify: `tests/single-point-score.test.js`
- Modify: `tests/db-init.test.js`
- Modify: `tests/ui-text.test.js`

- [ ] **Step 1: Add failing tests for translation fill generation and scoring**

Append these tests in `tests/engine.test.js` inside `describe('engine/generator.js', () => { ... })`:

```js
  test('english to chinese fill asks for direct Chinese translation', () => {
    const item = queries.getItemsByUnit(db, 1).find(i => i.type === 'word');

    const exercise = generator.createExercise(item, 'en2cn_fill', db);

    expect(exercise.exercise_type).toBe('en2cn_fill');
    expect(exercise.question).toBe(item.english);
    expect(exercise.correct_answer).toBe(item.chinese);
    expect(exercise.options).toBeUndefined();
  });

  test('translation fill question type supports phrase items', () => {
    const item = queries.getItemsByUnit(db, 1).find(i => i.type === 'phrase');
    db.prepare('UPDATE question_type_settings SET enabled = 0').run();
    db.prepare(
      `INSERT INTO question_type_settings (question_type_code, enabled, weight, instruction_text, primary_action_text, hint_text, display_options)
       VALUES ('translation_fill', 1, 100, '写出对应的翻译。', '提交答案', '注意拼写和中文释义。', '{}')
       ON CONFLICT(question_type_code) DO UPDATE SET enabled = excluded.enabled, weight = excluded.weight`
    ).run();

    const cnToEn = generator.generateExercises([item], db, { random: () => 0.25 })[0];
    const enToCn = generator.generateExercises([item], db, { random: () => 0.75 })[0];

    expect(cnToEn.exercise_type).toBe('cn2en');
    expect(cnToEn.question).toBe(item.chinese);
    expect(cnToEn.correct_answer).toBe(item.english);
    expect(enToCn.exercise_type).toBe('en2cn_fill');
    expect(enToCn.question).toBe(item.english);
    expect(enToCn.correct_answer).toBe(item.chinese);
  });
```

Append this test to `tests/single-point-score.test.js`:

```js
  test('english to chinese fill trims whitespace and compares Chinese meaning exactly', () => {
    const item = { id: 6, type: 'word', english: 'apple', chinese: '苹果' };
    const correct = generator.scoreAnswer(item, 'en2cn_fill', ' 苹果 ', '苹果');
    const wrong = generator.scoreAnswer(item, 'en2cn_fill', '苹果子', '苹果');

    expect(correct.is_correct).toBe(true);
    expect(wrong.is_correct).toBe(false);
  });
```

In `tests/db-init.test.js`, update the seeded question type assertion near the existing `vocab_en_cn_choice` expectations to include:

```js
    expect(codes).toContain('translation_fill');
```

In `tests/ui-text.test.js`, add `互译填空` to the `data/question-types.js` expected text list and add `英译中填空` to the `views/practice/exercise.ejs` expected text list.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
cmd /c npx jest tests/engine.test.js tests/single-point-score.test.js tests/db-init.test.js tests/ui-text.test.js --verbose --testPathIgnorePatterns=.worktrees --runInBand
```

Expected: FAIL because `translation_fill` and `en2cn_fill` are not implemented.

- [ ] **Step 3: Add question type seed**

In `data/question-types.js`, add this object after `vocab_en_cn_choice`:

```js
  { code: 'translation_fill', category: 'vocabulary', name: '互译填空', description: '给出英文或中文，直接填写对应翻译。', supportedItemTypes: ['word', 'phrase'], implementationStatus: 'available', defaultWeight: 20, instructionText: '写出对应的翻译。', primaryActionText: '提交答案', hintText: '注意拼写、大小写和中文释义。', displayOptions: { showPartOfSpeech: true, showChineseMeaning: true } },
```

- [ ] **Step 4: Map `translation_fill` to fill directions**

In `engine/question-type-selection.js`, update `mapQuestionTypeToExerciseType`:

```js
    case 'translation_fill':
      if (item.type !== 'word' && item.type !== 'phrase') return null;
      return (options.random || Math.random)() < 0.5 ? 'cn2en' : 'en2cn_fill';
```

Keep `phrase_cn_en_fill` mapping to `cn2en`.

- [ ] **Step 5: Implement `en2cn_fill` exercise**

In `engine/exercise-builders.js`, add this case after `cn2en`:

```js
    case 'en2cn_fill':
      return {
        ...base,
        question: item.english,
        correct_answer: item.chinese,
      };
```

- [ ] **Step 6: Score `en2cn_fill`**

In `engine/generator.js`, update `scoreAnswer`:

```js
    case 'en2cn_fill':
      isCorrect = normalizedUser === normalizedCorrect;
      break;
```

Update `getDefaultAnswerMetadata`:

```js
    case 'en2cn_fill':
      return { correct_answer: item.chinese || '', explanation: '' };
```

- [ ] **Step 7: Add UI label for fill direction**

In `views/practice/exercise.ejs`, add:

```ejs
          <% } else if (ex.exercise_type === 'en2cn_fill') { %>英译中填空
```

Place it near the existing `en2cn`, `cn2en`, and `cn2en_choice` labels.

- [ ] **Step 8: Run tests and verify pass**

Run:

```bash
cmd /c npx jest tests/engine.test.js tests/single-point-score.test.js tests/db-init.test.js tests/ui-text.test.js --verbose --testPathIgnorePatterns=.worktrees --runInBand
```

Expected: PASS.

- [ ] **Step 9: Commit**

Run:

```bash
git add data/question-types.js engine/exercise-builders.js engine/question-type-selection.js engine/generator.js views/practice/exercise.ejs tests/engine.test.js tests/single-point-score.test.js tests/db-init.test.js tests/ui-text.test.js
git commit -m "feat: add translation fill exercises"
```

---

### Task 4: Regression Verification

**Files:**
- No source edits expected.

- [ ] **Step 1: Run focused tests**

Run:

```bash
cmd /c npx jest tests/engine.test.js tests/single-point-score.test.js tests/db-init.test.js tests/ui-text.test.js --verbose --testPathIgnorePatterns=.worktrees --runInBand
```

Expected: PASS.

- [ ] **Step 2: Run full suite**

Run:

```bash
cmd /c npx jest --verbose --testPathIgnorePatterns=.worktrees --runInBand
```

Expected: PASS.

- [ ] **Step 3: Check status and diff**

Run:

```bash
git status --short --branch
git log --oneline -6
```

Expected:

- Working tree clean.
- Latest commits include:
  - `fix: show translated word form targets`
  - `feat: add chinese to english choice exercises`
  - `feat: add translation fill exercises`

## Final Review Checklist

- [ ] The practice page shows `目标词形：复数` or `目标词形：过去式`, not `plural` or `past_tense`.
- [ ] Translation choice can generate English-to-Chinese and Chinese-to-English directions.
- [ ] Translation fill can generate Chinese-to-English and English-to-Chinese directions.
- [ ] Translation fill works for both words and phrases.
- [ ] `en2cn_fill` trims whitespace and requires exact Chinese meaning.
- [ ] Existing phrase-specific `phrase_cn_en_fill` still works.
- [ ] Full Jest suite passes.
