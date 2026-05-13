# Wrong Answer Detail Design

Date: 2026-05-13

## Purpose

This design defines the next focused sub-project after the wrong-answer notebook MVP: a student-facing wrong-answer detail page.

The page should help a student understand one current wrong item before starting focused practice. It should show what the item is, how the student last answered it incorrectly, what the current correct answer is, and a short recent answer history.

## Confirmed Decisions

- Use the existing Express, EJS, SQLite, and Jest structure.
- Keep `review_records` as the source of truth for answer history.
- Do not add a database migration or a historical question snapshot table in this phase.
- Reuse the current wrong-item definition from the wrong-answer notebook.
- Recompute the correct answer from current item and support data.
- Keep all visible UI text in Simplified Chinese.
- Do not add manual archive, restore, delete, export, or trend analytics in this phase.

## Scope

This sub-project includes:

- A route for opening the detail page for one current wrong item.
- A query helper for loading one current wrong item for one user.
- A query helper for loading recent review history for that user and item.
- A student-facing EJS detail view.
- A detail link from the existing wrong-answer notebook list.
- Route, query, and UI text tests.

This sub-project does not include:

- Manual removal from the wrong-answer notebook.
- Restoring resolved wrong items.
- Exporting wrong items.
- Teacher or admin views.
- Charts or trend analysis.
- Persisted historical correct-answer snapshots.
- Editing item content from the detail page.

## Wrong Item Eligibility

The detail page should only be available for an item that is currently wrong for the current student.

The definition matches the existing notebook behavior:

- For one `user_id` and `item_id`, find the latest `review_records` row.
- If the latest row has `is_correct = 0`, the item is currently wrong.
- If the latest row has `is_correct = 1`, the item is resolved and should not be shown as a wrong-item detail.
- Items marked as mastered in `item_mastery` are excluded.
- Deleted or missing items are excluded because queries join through the live `items` table.

This keeps the detail page consistent with the notebook and focused wrong-answer practice entry points.

## Route

Add:

```text
GET /wrong-items/:itemId
```

Behavior:

- Require the existing authenticated student session.
- Parse `itemId` as an integer.
- Load the item through a user-scoped current-wrong-item helper.
- If the item is not currently wrong for this user, render a not-found response or redirect back to `/wrong-items`.
- Render the detail page when the item is eligible.

The implementation should prefer a user-scoped lookup over loading an item globally and checking ownership later. The route must not expose another user's answer history.

## Data Flow

The detail route needs three pieces of data:

1. Current wrong-item summary.
2. Current correct-answer metadata.
3. Recent review history for this user and item.

### Current wrong-item summary

Add a helper such as:

```js
getWrongItemDetailForUser(db, userId, itemId)
```

It should return the same kind of derived fields used by the notebook list, plus any item fields needed by the detail view:

- `item_id`
- `type`
- `english`
- `chinese`
- `pos`
- `example`
- `wrong_count`
- `last_wrong_at`
- `last_user_answer`
- `last_exercise_type`

The helper should return `null` when the item is missing, mastered, not current wrong, or not associated with this user's current wrong set.

### Correct-answer metadata

Use existing generator support instead of duplicating answer logic:

- Resolve metadata using the item's `last_exercise_type`.
- Reuse `resolveAnswerMetadata` through an appropriate local helper or export.
- Include at least `correct_answer` and `explanation` when available.

The page should clearly treat this as the current answer derived from current item data.

Important limitation: `review_records` currently stores `exercise_type`, `user_answer`, correctness, and timestamp. It does not store the generated question payload, support-row id, historical correct answer, or historical explanation. Therefore the page cannot guarantee an exact historical reconstruction of the question shown during the wrong attempt. For this phase, current metadata is acceptable.

### Recent review history

Add a helper such as:

```js
getReviewHistoryForUserItem(db, userId, itemId, options = {})
```

Recommended fields:

- `id`
- `exercise_type`
- `user_answer`
- `is_correct`
- `created_at`

Default limit: 10 recent rows, newest first.

This helper must be scoped by `user_id` and `item_id`.

## View

Create a view such as:

```text
views/wrong-item-detail.ejs
```

The page should show:

- Back link to the wrong-answer notebook.
- Item type label.
- English and Chinese content.
- Optional part of speech and example when present.
- Wrong count.
- Last wrong time.
- Last wrong answer.
- Last exercise type.
- Current correct answer.
- Explanation, only when available.
- Recent answer history.
- Link to start wrong-answer focused practice.

The existing notebook list should add a stable detail link for every row:

```text
/wrong-items/:itemId
```

The detail page should stay quiet and functional. It is a study utility page, not a marketing or dashboard page.

## Empty And Error States

- If the wrong item cannot be found for this user, the app should not leak whether the item exists globally.
- Preferred behavior: redirect to `/wrong-items` with the existing notebook empty/list state handling.
- If current metadata cannot be resolved, the page should still render the wrong-item summary and history, with the correct-answer section omitted or shown as unavailable.
- A missing explanation is normal and should not be treated as an error.

## Testing

Add or update focused tests for:

- Query helper returns a detail row for a current wrong item.
- Query helper returns `null` after the item is later answered correctly.
- Query helper excludes another user's wrong item.
- Review history helper returns only the current user's records for the item.
- `GET /wrong-items/:itemId` renders the detail page for a current wrong item.
- The detail page shows last wrong answer, current correct answer, and recent history.
- The wrong-answer notebook list links to the detail route.
- Resolved or inaccessible item detail requests do not expose content.
- UI text test includes the new detail view and key Chinese labels.

## Acceptance Criteria

- A student can open a detail page from the wrong-answer notebook.
- The page explains the current wrong item without changing data.
- Resolved wrong items stop being accessible through the wrong-item detail route.
- Existing wrong-answer notebook and focused practice behavior remains unchanged.
- The full Jest suite passes with the existing `.worktrees` ignore pattern.
