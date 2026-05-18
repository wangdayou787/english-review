# Grammar Example Question Bank Design

## Goal

Adjust grammar knowledge so it is no longer forced into the same structure as words and phrases. Words and phrases keep the current fields and behavior. Grammar becomes a grammar point with a clear explanation plus multiple example questions. Daily grammar review questions are generated directly from those examples.

## Current Problem

The current `items` table stores words, phrases, and grammar with the same generic fields. Grammar can only use fields such as English, Chinese, part of speech, example sentence, and the existing sentence-ordering enhancement. This works for vocabulary, but it does not express a grammar point well.

Grammar knowledge needs:

- A grammar title or name.
- A clear grammar description.
- Multiple example questions.
- A detailed explanation for each example question.
- Question generation based on those example questions.

## Scope

This change covers:

- Grammar data structure.
- Grammar entry and edit UI in textbook management.
- Grammar question type settings.
- Grammar exercise generation in today's review.
- Compatibility with existing grammar and sentence-ordering data.

This change does not redesign word or phrase storage. Word and phrase question types remain as they are.

## Data Model

Keep `items.type = 'grammar'` as the top-level grammar knowledge record. Add grammar-specific tables.

### `grammar_details`

One row per grammar item.

Fields:

- `item_id`: references `items.id`, primary key.
- `title`: grammar point title.
- `description`: clear explanation of the grammar point.
- `usage_notes`: optional notes, rules, or common mistakes.
- `created_at`
- `updated_at`

### `grammar_examples`

Multiple rows per grammar item.

Fields:

- `id`: primary key.
- `item_id`: references `items.id`.
- `example_type`: one of `choice`, `completion`, `sentence_transform`.
- `prompt_text`: question stem shown to the student.
- `options_json`: JSON array for choice questions. Empty or null for non-choice questions.
- `answer_text`: standard answer.
- `explanation`: detailed explanation of how this example applies the grammar point.
- `sort_order`: display and selection order.
- `created_at`
- `updated_at`

The example types map to:

- `choice`: single-choice grammar question.
- `completion`: fill-in or sentence-completion grammar question.
- `sentence_transform`: sentence transformation question.

## Textbook Management UI

For word and phrase items, keep the current entry form.

For grammar items, show a grammar-specific form:

- Grammar title.
- Grammar description.
- Usage notes.
- Example question list.

Each example question row includes:

- Example type.
- Prompt text.
- Options field, visible for single-choice examples.
- Standard answer.
- Detailed explanation.

Admins can add, edit, delete, and reorder examples for a grammar point. A grammar point can be saved without examples, but it cannot generate grammar review questions until at least one valid example is present.

## Question Type Settings

In the grammar tab, available grammar question types become:

- Grammar single-choice.
- Grammar completion.
- Grammar sentence transformation.

These map directly to `grammar_examples.example_type`.

The existing sentence-ordering grammar behavior is kept for backward compatibility, but it is no longer the primary grammar question model. It should be treated as legacy or future-support content unless explicitly kept enabled in existing data.

## Daily Review Generation

The scheduler still selects grammar items by the configured grammar quota.

When generating a grammar exercise:

1. Load the selected grammar item.
2. Load its `grammar_examples`.
3. Filter examples by enabled grammar question types.
4. Select one valid example for the exercise.
5. Render the exercise based on the example type.

Rendering rules:

- `choice`: show prompt and options as a single-choice question.
- `completion`: show prompt and a text input.
- `sentence_transform`: show prompt and a text input.

Scoring rules:

- Choice questions compare the selected answer with `answer_text`.
- Fill-in and transformation questions compare normalized text with `answer_text`.
- The result page can show the example explanation as feedback.

If a grammar item has no examples that match enabled grammar question types, the generator skips that item and uses the next available grammar item. If there are valid grammar examples but not enough unique examples to fill the quota, the generator may repeat valid examples to avoid blank review content. If there are no valid grammar examples at all, the generated grammar count can be lower than the configured quota. This is preferable to generating incorrect questions.

## Compatibility

Existing grammar rows in `items` remain valid. Existing sentence-ordering details remain in the database and are not deleted.

For existing grammar items without `grammar_details`, the edit page can initialize the grammar title from the existing item fields. Admins can then fill the new grammar description and examples.

No existing word or phrase behavior changes.

## Testing

Add focused tests for:

- Creating and updating grammar details.
- Creating, updating, deleting, and ordering grammar examples.
- Rendering grammar admin forms.
- Mapping grammar question type settings to example types.
- Generating choice, completion, and sentence transformation exercises from grammar examples.
- Skipping grammar items without matching examples.
- Preserving existing word and phrase question generation.

## Acceptance Criteria

- Grammar entry no longer uses the vocabulary-style structure as its primary form.
- A grammar point can contain a description and multiple example questions.
- Each grammar example has a type, prompt, answer, and explanation.
- Grammar question types in settings are separated from word and phrase question types.
- Today's review generates grammar questions directly from stored grammar examples.
- Existing word, phrase, and legacy grammar data are not broken.
