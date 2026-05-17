# Question Type Collapsible Sections Design

## Goal

Improve the admin question type settings page so supported question types and future question types are easier to scan and manage, while preventing browser answer history from leaking hints in student fill-in exercises.

## Scope

This change covers two areas:

- Admin question type settings page at `/admin/question-types`.
- Student practice answer text inputs rendered by `views/practice/exercise.ejs`.

It does not add new question type generation logic, new database fields, or editing support for planned question types.

## Admin Page Design

The page will be organized into two top-level areas:

1. `可用于练习`
   - Placed first.
   - Visually emphasized because these are the active question types that can enter student practice.
   - Contains every question type whose implementation status is `available`.
   - No longer uses the previous category-first layout as the main page structure.

2. `后续支持`
   - Placed below `可用于练习`.
   - Contains every question type whose implementation status is not `available`.
   - Shows only the type name and a brief description or to-do note.
   - Does not render setting inputs and does not submit planned type configuration.

Both areas use the same interaction model: every question type appears as a collapsed summary row first.

For `可用于练习`, opening a type shows the existing editable settings:

- enable checkbox
- weight
- instruction text
- primary action text
- hint text
- display option checkboxes

For `后续支持`, opening a type only shows the short description or pending work note. Deeper configuration is intentionally omitted for now.

## Data Flow

The route can continue to load the same question type group data from the query layer. The rendering layer should split the loaded types into:

- available types
- planned types

Only available types receive indexed `settings[...]` form fields. Planned types remain visible but read-only.

This keeps the existing persistence behavior intact: `POST /admin/question-types` updates only submitted settings.

## Practice Input Design

All text answer inputs in student practice should disable browser answer history and similar automatic suggestions:

- `autocomplete="off"`
- `autocapitalize="off"`
- `spellcheck="false"`

This applies to fill-in answer inputs rendered when an exercise has no radio options and is not a sentence-order hidden input.

## Testing

Focused tests should verify:

- `/admin/question-types` renders `可用于练习` before `后续支持`.
- Available question types still render editable `settings[...]` fields.
- Planned question types are listed but do not render editable `settings[...]` fields.
- Practice text answer inputs include `autocomplete="off"`.

Existing route and UI text tests should continue to pass.
