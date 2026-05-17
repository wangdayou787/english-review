# Remove Question Hint Text Design

## Goal

Remove the extra hint text shown at the bottom of each daily review question, and remove the `提示文案` configuration field from the question type settings page.

## Scope

This change covers:

- `views/practice/exercise.ejs`
- `views/admin/question-types.ejs`
- route/template tests that verify the hint text UI is gone

This change does not cover:

- deleting the `hint_text` database column
- deleting built-in question type hint seed data
- deleting item-level fields such as `first_letter_hint`
- deleting sentence-order detail hint storage from the item edit page

## Behavior

Daily review question cards should no longer render the bottom hint line driven by `ex.hint_text`.

The following should remain visible when applicable because they are part of the question content, not the removed bottom hint:

- 首字母提示
- 目标词形
- 用法说明
- 例句

The question type settings page should no longer show or submit a `hintText` input for each question type. Existing backend support for `hint_text` may remain in place so this is a low-risk UI removal instead of a database migration.

## Acceptance Criteria

- `/practice/start` output does not contain the `exercise-hint` block.
- `/admin/question-types` output does not contain `name="settings[...][hintText]"`.
- Saving question type settings still works for enabled state, weight, instruction text, button text, and display options.
- Existing tests pass.
