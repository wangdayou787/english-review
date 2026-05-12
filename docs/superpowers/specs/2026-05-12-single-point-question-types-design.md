# Single Point Question Types Design

Date: 2026-05-12

## Purpose

This design defines the second 2.0 sub-project for the desktop web English review tool: implementing the first batch of single-point question types on top of the existing question type infrastructure.

The scope is intentionally narrow. It adds four practical question types that fit the current knowledge-item model and keeps SQLite as the runtime source of truth.

## Confirmed Decisions

- The app remains a desktop web application based on Express, EJS, SQLite, and Jest.
- SQLite remains the formal runtime storage.
- Excel may be added later only as a batch import source, not as the system of record.
- This sub-project covers only four question types:
  - 单词拼写填空
  - 词形变换填空
  - 短语单选辨析
  - 连词成句增强版
- `items` remains the main knowledge-point table.
- New question-type-specific data should live in dedicated supporting tables instead of being forced into the `items` table.
- Short phrase choice questions use explicit authored question records, not automatically generated distractors.
- Enhanced sentence ordering uses one standard answer only.
- All visible UI text remains Simplified Chinese.

## Scope

This sub-project includes:

- Schema additions for question-type-specific supporting data.
- Admin editing support for the four question types.
- Exercise generation support that uses the existing `question_types` configuration and only generates these types when their required data is complete.
- Scoring support for the four question types.
- Route, generator, schema, and regression tests.

This sub-project does not include:

- Cloze, reading, or task-based reading question pages.
- Wrong-answer system upgrades.
- Excel import.
- Multiple accepted answers.
- Automatic distractor generation for phrase distinction questions.
- Generic question-editor infrastructure.

## Question Types In Scope

### 1. 单词拼写填空

Student sees:

- Chinese meaning
- optional first-letter hint
- answer input

Answer source:

- `items.english` or `word_question_details.base_form`

### 2. 词形变换填空

Student sees:

- prompt based on the target inflection
- optional usage note or example
- answer input

Answer source:

- one selected field from `word_question_details.inflections_json`

### 3. 短语单选辨析

Student sees:

- authored prompt sentence
- four phrase options
- one correct answer

Answer source:

- one row in `phrase_choice_questions`

### 4. 连词成句增强版

Student sees:

- shuffled tokens
- optional hint text
- one final reconstructed sentence

Answer source:

- `sentence_order_details.answer_sentence`
- token display from `sentence_order_details.tokens_json`

## Data Model

### `word_question_details`

Purpose:
Supports spelling and inflection questions for `word` items.

Fields:

- `item_id` primary key referencing `items(id)` on delete cascade
- `base_form` text
- `first_letter_hint` text
- `usage_note` text
- `inflections_json` text not null default `'{}'`

`inflections_json` may contain:

- `plural`
- `third_person_singular`
- `past_tense`
- `past_participle`
- `present_participle`
- `comparative`
- `superlative`
- `adverb`
- `adjective`
- `noun`

Rules:

- one `word_question_details` row per word item
- if a needed inflection field is missing, the matching inflection question type must not be generated

### `phrase_choice_questions`

Purpose:
Stores authored phrase distinction questions.

Fields:

- `id` primary key
- `item_id` referencing `items(id)` on delete cascade
- `prompt_sentence` text not null
- `correct_phrase` text not null
- `distractor_a` text not null
- `distractor_b` text not null
- `distractor_c` text not null
- `explanation` text

Rules:

- one phrase item may have multiple distinction questions
- generator must only use explicit rows from this table
- generator must not fabricate phrase distinction questions from plain phrase items

### `sentence_order_details`

Purpose:
Stores stable data for enhanced sentence ordering.

Fields:

- `item_id` primary key referencing `items(id)` on delete cascade
- `answer_sentence` text not null
- `tokens_json` text not null default `'[]'`
- `hint_text` text

Rules:

- one sentence-order detail row per supporting item
- current implementation uses one standard answer only
- initial token generation may split on spaces, but stored `tokens_json` is the source used for rendering

## Admin Experience

The current admin content workflow should be extended rather than replaced.

### Word Item Editing

For `word` items, add a `题型扩展信息` section with:

- `base_form`
- `first_letter_hint`
- `usage_note`
- common inflection fields

None of these fields are globally required. Missing values only block the related question type.

### Phrase Item Editing

For `phrase` items, add a `辨析题` management section.

Admin actions:

- create distinction question
- edit distinction question
- delete distinction question

Each distinction question contains:

- prompt sentence
- correct phrase
- three distractors
- explanation

### Grammar Or Sentence Item Editing

For supported sentence-order items, add fields for:

- standard answer sentence
- token list
- hint text

When the admin leaves token data blank, the app may derive a default token list from the standard answer at save time.

## Student Practice Generation

Generation still begins with the `question_types` catalog and settings.

Rules:

1. A configured question type must be enabled and available.
2. The item must have the required supporting data.
3. If the supporting data is missing or incomplete, the generator falls back to an already supported exercise type.
4. Generator behavior must never produce empty or broken exercises.

Per type:

- `vocab_spelling_fill` requires a word item and at least one valid answer source.
- `vocab_form_transform` requires a word item and a non-empty matching inflection field.
- `phrase_choice` requires at least one explicit `phrase_choice_questions` row for the item.
- `sentence_ordering` enhanced mode requires `sentence_order_details`.

## Scoring Rules

### 单词拼写填空

- compare trimmed strings
- case-insensitive
- one accepted answer only

### 词形变换填空

- compare trimmed strings
- case-insensitive
- one accepted answer only from the targeted inflection field

### 短语单选辨析

- compare submitted option to `correct_phrase`
- result page should show `explanation`

### 连词成句增强版

- compare the final student sentence to `answer_sentence`
- exact sentence match after trimming
- no multiple accepted answers in this phase

## Error Handling And Fallbacks

- Missing `word_question_details` row: spelling and inflection question types must not generate.
- Missing inflection key: inflection question type must not generate.
- Missing phrase distinction rows: `phrase_choice` must not generate.
- Missing sentence order detail: enhanced sentence ordering must not generate.
- In all missing-data cases, fall back to currently supported question types instead of failing the page.

## Testing Strategy

Database tests should verify:

- `word_question_details` exists
- `phrase_choice_questions` exists
- `sentence_order_details` exists
- cascade behavior and uniqueness rules are correct

Query tests should verify:

- word detail save/load
- phrase distinction question save/load/delete
- sentence order detail save/load

Generator tests should verify:

- complete word detail can generate spelling or inflection questions
- missing detail falls back safely
- phrase distinction only uses explicit rows
- enhanced sentence ordering only uses stored detail rows

Route tests should verify:

- admin can save word extension fields
- admin can save phrase distinction questions
- admin can save sentence order detail
- non-admin cannot access these controls

Scoring tests should verify:

- spelling is case-insensitive and trim-safe
- inflection answers compare against the selected field
- phrase distinction matches the correct option only
- sentence ordering matches the stored standard answer only

Regression tests should verify:

- question type settings page still works
- existing daily review flow still works
- result page still works
- stats page still opens

## Future Work After This Sub-Project

The next likely sub-projects remain:

1. Additional single-point grammar and sentence question types beyond this first batch.
2. Passage-based question types such as cloze and reading.
3. Wrong-answer system integration across all question types.
4. Excel import templates that write into SQLite-backed content tables.

## Open Risks

- Existing `items` content may not yet contain enough high-quality structured detail for inflection questions.
- Phrase distinction content quality depends entirely on manual authoring.
- Token splitting for sentence ordering may need a more guided UI if admin-entered sentences are inconsistent.
