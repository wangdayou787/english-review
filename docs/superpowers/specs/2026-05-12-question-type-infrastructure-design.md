# Question Type Infrastructure Design

Date: 2026-05-12

## Purpose

The project is moving from an MVP review workflow to a fuller middle-school English review system. The long-term goal includes six major question families: vocabulary, fixed phrases, grammar, sentence patterns, cloze, and reading comprehension.

This design covers the first sub-project only: question type infrastructure. It creates the stable catalog, admin configuration, and generator integration needed before implementing all individual question forms.

The app remains a desktop web application based on Express, EJS, SQLite, and Jest. SQLite remains the durable data store. Browser LocalStorage is reserved for lightweight client state in later experience work.

## Confirmed Decisions

- Continue using the current Express/EJS/SQLite architecture.
- Keep all current MVP review functionality working.
- Treat the complete six-family question system as a 2.0 goal, split across multiple sub-projects.
- This sub-project builds the question type foundation only.
- Admin users configure question type availability, weight, and display templates.
- Students do not choose question types in this phase.
- Only implemented and enabled question types may be generated for student practice.
- Planned question types may appear in admin configuration but must not appear in student exercises until their data model and scoring are implemented.
- All visible app text remains Simplified Chinese in this phase.

## Scope

This sub-project includes:

- A system question type catalog covering all six requested families.
- Admin configuration for each question type:
  - enabled state
  - generation weight
  - instruction text
  - primary button or action text
  - hint text
  - display options such as example, part of speech, Chinese meaning, and first-letter hint
- Mapping between question types and supported content types.
- Generator integration so current available question types are selected through configuration.
- Clear admin distinction between currently available types and planned future types.
- Fallback behavior so student practice still works when configuration is missing or invalid.
- Tests for schema, seed data, settings, route access, generator behavior, and UI text.

This sub-project does not include:

- Full implementation of cloze, reading comprehension, or task-based reading pages.
- Full implementation of every single-point question form, such as spelling fill-in, word transformation, phrase matching, sentence transformation, and error correction.
- Wrong-answer book upgrades.
- Learning data center charts.
- Custom question bank import.
- Fast recitation or category review as standalone student modes.

## Question Type Catalog

The system catalog should contain these six groups.

### Vocabulary

- `vocab_en_cn_choice`: 中英互译单选
- `vocab_spelling_fill`: 单词拼写填空
- `vocab_form_transform`: 词形变换填空
- `vocab_word_bank_fill`: 选词填空
- `vocab_synonym_antonym_choice`: 近义词 / 反义词辨析选择题
- `vocab_listening_choice`: 听音选择

### Phrases

- `phrase_cn_en_fill`: 短语汉译英填空
- `phrase_choice`: 短语单选辨析
- `phrase_matching`: 短语匹配题

### Grammar

- `grammar_choice`: 语法单项选择
- `grammar_given_word_form`: 用所给词适当形式填空
- `grammar_error_correction`: 单句改错
- `grammar_sentence_transform`: 句型转换

### Sentence Patterns

- `sentence_ordering`: 连词成句
- `situational_dialogue_choice`: 情景交际单选
- `dialogue_completion`: 补全对话

### Cloze

- `cloze_choice`: 标准短文完形
- `cloze_word_bank`: 短文选词完形

### Reading

- `reading_true_false`: 判断正误阅读
- `reading_choice`: 阅读理解选择题
- `reading_task_based`: 任务型阅读

## Implementation Status

Each catalog entry must have an implementation status:

- `available`: may be used in student practice when enabled.
- `planned`: visible and configurable in admin, but not generated for students.

Initial available types should map only to behavior the current code can support safely:

- `vocab_en_cn_choice` maps to current English-to-Chinese and Chinese-to-English behavior where applicable.
- `vocab_listening_choice` maps to current listen-and-choose behavior for words and phrases.
- `phrase_cn_en_fill` maps to current Chinese-to-English phrase input behavior.
- `sentence_ordering` maps to current sentence ordering behavior.

`grammar_choice` and other richer grammar forms should start as `planned` until their content model, options, and scoring rules are implemented explicitly.

If there is doubt that a type can be rendered and scored correctly with current data, it should start as `planned`.

## Data Model

### `question_types`

Stores the system catalog. Recommended fields:

- `id`
- `code` unique text identifier
- `category` text, such as `vocabulary`, `phrase`, `grammar`, `sentence`, `cloze`, `reading`
- `name` Simplified Chinese display name
- `description` short Simplified Chinese explanation
- `supported_item_types` JSON text, such as `["word"]`, `["phrase"]`, `["grammar"]`, or `["passage"]`
- `implementation_status` text checked to `available` or `planned`
- `default_weight` integer
- `sort_order` integer
- `created_at`
- `updated_at`

The table is seeded idempotently by `db/init.js`. Re-running database initialization must not create duplicate rows.

### `question_type_settings`

Stores admin configuration separately from the catalog so catalog upgrades do not overwrite admin settings. Recommended fields:

- `question_type_code` primary key referencing `question_types(code)`
- `enabled` integer boolean
- `weight` integer
- `instruction_text` text
- `primary_action_text` text
- `hint_text` text
- `display_options` JSON text
- `updated_at`

Settings are created on demand from catalog defaults or seeded for all catalog entries during initialization.

## Admin Experience

Add an admin page, likely `/admin/question-types`, and link it from the admin navigation as `题型设置`.

The page should:

- Group question types by the six categories.
- Show name, description, status, supported content type, enabled state, and weight.
- Allow editing enabled state, weight, instruction text, action text, hint text, and display options.
- Clearly mark `available` as `可用于练习`.
- Clearly mark `planned` as `后续支持`.
- Allow saving all visible settings in one form or category-level forms.
- Keep the layout calm and readable for repeated admin use.

Validation rules:

- Weight must be an integer from 0 to 100.
- Planned question types may be saved but should never be generated for student practice.
- If invalid JSON-like display options are accepted through checkboxes instead of raw text, route handlers should serialize them to JSON internally.

## Student Practice Generation

The generator should no longer pick only from hard-coded exercise types. It should first load available question type settings.

Generation rules:

1. For an item, find question types that are:
   - `available`
   - enabled
   - compatible with the item type
   - supported by the current generator mapping
2. Select among compatible types by weight.
3. Map the selected question type to the current internal exercise representation.
4. Apply display template fields to the exercise object so EJS can render instructions and hints.
5. If no compatible configured type exists, use the existing hard-coded fallback for that item.

The configured weights apply within the same knowledge content type. They do not change the daily quotas or review plan selection.

Already generated daily tasks remain stable because tasks are item-based. Exercise presentation may use the latest configuration when the student starts or restarts the practice page.

## Compatibility

- Do not delete, rename, or repurpose existing tables or columns.
- Existing routes should keep working.
- Existing tests should keep passing.
- Existing `en2cn`, `cn2en`, `listening`, and `sentence` internal exercise behavior may remain as compatibility mappings.
- The current listen-and-choose behavior must be represented by `vocab_listening_choice` so it can be configured instead of remaining invisible hard-coded behavior.
- Planned question types should not create broken student pages.
- If configuration data is missing, corrupted, or fully disabled for an item type, the app must fall back to current generator behavior.

## Error Handling

- Invalid admin weight values should render the settings page with a clear error message.
- Missing settings rows should be repaired by reading catalog defaults.
- Unknown question type codes posted from the admin form should be ignored or rejected without changing valid settings.
- The student practice route should never fail only because question type settings are incomplete.

## Testing Strategy

Database tests should verify:

- `question_types` exists.
- `question_type_settings` exists.
- All six categories are seeded.
- Seed initialization is idempotent.
- Built-in question type codes are unique.

Query tests should verify:

- Question types can be read grouped by category.
- Settings can be saved and re-read.
- Available enabled types can be filtered by item type.
- Planned types are excluded from generation queries.

Generator tests should verify:

- Enabled available types are used.
- Disabled types are skipped.
- Weight zero prevents normal selection.
- Planned types are never generated.
- Fallback behavior works when all compatible settings are disabled or missing.

Route tests should verify:

- Admin users can open the question type settings page.
- Non-admin users cannot open the page.
- Admin users can save settings.
- Invalid weights show a validation error.

UI text tests should verify visible Simplified Chinese labels:

- 题型设置
- 可用于练习
- 后续支持
- 单词词汇类
- 短语固定搭配类
- 语法专项类
- 句子句型类
- 完形填空类
- 阅读理解类

## Future Sub-Projects

After this infrastructure lands, the remaining 2.0 question work should be split into separate specs and plans:

1. Single knowledge-point question implementation for vocabulary, phrases, grammar, and sentence patterns.
2. Passage question implementation for cloze and reading comprehension.
3. Wrong-answer book and special review integration across all question types.
4. Learning data center and review analytics.

## Open Risks

- Some current item records do not contain enough structured data for advanced question types. Those types must stay planned until their content model is designed.
- Weight-based selection can be tested deterministically only if the generator exposes a predictable selection helper or accepts a random function in tests.
- The admin page may grow large because the catalog has many types. Grouping by category is required for readability.



