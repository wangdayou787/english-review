# Grammar Title Reuse Design

## Goal

When adding grammar examples, the same grammar title should represent the same grammar knowledge point. If an admin enters a grammar title that already exists, the add form should reuse the existing grammar description and usage notes so the admin can add more examples without retyping the shared grammar structure.

## Current Problem

The add-item page can create a new grammar item with grammar details and examples. However, it treats each submission as a new item. If the admin wants to add several examples for the same grammar point, they must repeatedly enter the same grammar description and usage notes. This risks duplicate grammar points with inconsistent descriptions.

## Behavior

On the add-item page:

- The grammar title input is the identity field for grammar knowledge reuse.
- When the entered title matches an existing grammar title in the same unit, the page fills:
  - Grammar description.
  - Usage notes.
- The admin can still edit those filled values before submitting.

On submit:

- If no matching grammar title exists in the current unit, create a new grammar item and save its details and examples.
- If a matching grammar title exists in the current unit, reuse that existing grammar item.
- Save any submitted description or usage notes back to that existing grammar item.
- Append submitted examples to the existing grammar item instead of replacing existing examples.

Matching is case-sensitive for Chinese and English text but ignores surrounding whitespace.

## Data Flow

1. `GET /admin/units/:id/items` loads grammar title reuse data for that unit.
2. The view embeds a compact JSON list of existing grammar details:
   - item id
   - title
   - description
   - usage notes
3. Browser script watches the grammar title input.
4. When the title matches an existing row, the description and usage notes fields are filled.
5. `POST /admin/units/:id/items` checks for an existing grammar item by title before creating a new item.
6. Existing examples remain intact; new examples are appended.

## Scope

This change only applies to adding grammar items from the unit item page. Editing an existing grammar item keeps the current behavior.

Word and phrase add flows are unchanged.

## Testing

Add tests for:

- Unit item page embeds existing grammar title reuse data.
- Entering an existing grammar title can be matched by the page script.
- Posting a grammar item with an existing title reuses the existing item.
- Reused grammar item updates details and appends examples.
- Posting a new grammar title still creates a new grammar item.

## Acceptance Criteria

- Admins do not need to retype description and usage notes for an existing grammar title.
- Submitting a repeated grammar title does not create duplicate grammar items in the same unit.
- New examples are appended to the existing grammar point.
- Full test suite passes.
