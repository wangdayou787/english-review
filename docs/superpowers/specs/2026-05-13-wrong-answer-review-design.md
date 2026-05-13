# Wrong Answer Review Design

Date: 2026-05-13

## Purpose

This design defines the next focused sub-project for the English review tool: a wrong-answer notebook and wrong-answer专项复习 loop for students.

The goal is a practical MVP. Students should be able to see their current wrong items, filter them by item type, and start a focused review session. When a student answers an item correctly later, it should leave the current wrong-answer set automatically.

## Confirmed Decisions

- Use the existing Express, EJS, SQLite, and Jest structure.
- Keep `review_records` as the source of truth for answer history.
- Do not add a separate `wrong_items` lifecycle table in this phase.
- Current wrong items are computed dynamically from answer history.
- The feature is student-facing. Admin textbook and question-type flows are unchanged.
- All visible UI text remains Simplified Chinese.

## Scope

This sub-project includes:

- Query helpers for current wrong items.
- A student wrong-answer notebook page.
- Filtering by `all`, `word`, `phrase`, and `grammar`.
- A wrong-answer专项复习 entry point.
- Reuse of existing exercise generation, scoring, and review-record writing.
- Tests for query behavior, route behavior, and key UI text.

This sub-project does not include:

- Manual ignore, restore, or archive workflows.
- A separate wrong-answer state table.
- Exporting wrong answers.
- Teacher dashboards.
- Wrong-answer trend charts.
- Passage-level wrong-answer grouping.

## Wrong Item Definition

For one student and one item:

- Find the latest `review_records` row for that `user_id` and `item_id`.
- If the latest row has `is_correct = 0`, the item is currently wrong.
- If the latest row has `is_correct = 1`, the item is no longer currently wrong.

This means a wrong item is resolved by a later correct answer. No additional state update is needed.

Items marked as mastered in `item_mastery` should be excluded from the wrong-answer notebook. If a student has explicitly marked an item as mastered, it should not be pushed back through wrong-answer专项复习 in this phase.

Deleted items should not appear because all notebook queries join through the live `items` table.

## Data Model

No new table is required.

The feature reads:

- `review_records`
- `items`
- `item_mastery`

Recommended derived fields for notebook rows:

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

`wrong_count` is the total number of wrong records for that user and item, not only consecutive wrong attempts.

`last_wrong_at`, `last_user_answer`, and `last_exercise_type` come from the latest wrong record for that item.

## Query Helpers

Add focused helpers in `db/queries.js`.

### `getWrongItemsForUser(db, userId, options)`

Inputs:

- `userId`
- optional `type`
- optional `limit`

Behavior:

- Return live items whose latest review record for this user is wrong.
- Exclude mastered items.
- If `type` is `word`, `phrase`, or `grammar`, return only that item type.
- Sort newest wrong item first using the latest review record time.
- Include wrong metadata fields listed above.

### `getWrongItemCountsForUser(db, userId)`

Behavior:

- Return current wrong counts by type and total:
  - `all`
  - `word`
  - `phrase`
  - `grammar`
- Counts use the same current-wrong definition and mastery exclusion as the list helper.

The helper names should stay narrow. They should not try to become a generic analytics layer.

## Student Experience

### Navigation

For normal student users, add a `错题本` navigation link.

The student dashboard should also show a compact wrong-answer entry point:

- current wrong total
- action to open the wrong-answer notebook
- action to start wrong-answer专项复习 when at least one current wrong item exists

### Wrong-Answer Notebook Page

Route:

- `GET /wrong-items`

Query:

- `?type=word`
- `?type=phrase`
- `?type=grammar`
- no query or `?type=all` means all current wrong items

Page content:

- title: `错题本`
- filter controls for all, word, phrase, grammar
- current wrong count
- wrong item list
- each row shows:
  - item type label
  - English or Chinese item title
  - Chinese or English secondary text when available
  - wrong count
  - latest wrong answer
  - latest wrong time
- primary action: `开始错题专项复习`

Empty state:

- If no current wrong items exist for the selected filter, show a concise empty state.
- If all filters are empty, tell the student there are no current wrong answers.

### Wrong-Answer Practice

Route:

- `GET /practice/wrong`

Query:

- optional `type`

Behavior:

- Load current wrong items for the student with the same filter.
- Limit the first MVP session to a small fixed batch, recommended 20 items.
- Generate exercises with existing `generator.generateExercises(items, db)`.
- Render the existing `views/practice/exercise.ejs` template.
- Use title `错题专项复习`.
- Submit through the existing `/practice/submit` route.

Resolution behavior:

- If the student answers a wrong item correctly, `/practice/submit` writes a correct `review_records` row.
- The next wrong-answer notebook query no longer returns that item.
- If the student answers incorrectly again, it remains in the notebook with a higher `wrong_count`.

## Integration With Existing Review Flow

Existing daily review generation already prioritizes wrong items. This feature should not replace that behavior.

The wrong-answer notebook gives students direct control when they want to review only current wrong items. Daily review can continue to mix new content, recent review, cycle review, and wrong content.

The existing result page can remain shared. It already displays correct answers for wrong attempts and offers the mastered action.

## Error Handling

- Invalid `type` filters should be treated as `all`.
- If the student has no wrong items for `/practice/wrong`, redirect to `/wrong-items` or render the dashboard-style empty state without crashing.
- Missing items are naturally excluded by joining through `items`.
- If no active review plan exists, wrong-answer notebook still works because it is based on answer history, not the active plan.

## Testing Strategy

Query tests should verify:

- an item appears when the latest review record is wrong
- an item disappears after a later correct answer
- wrong counts include all wrong attempts for the item
- type filtering returns only the requested type
- mastered items are excluded

Route tests should verify:

- authenticated students can open `/wrong-items`
- the page shows wrong items and counts
- `type` filter changes the visible item set
- `/practice/wrong` renders exercises from current wrong items
- no wrong items produces a safe empty state or redirect

UI text tests should verify key visible copy:

- `错题本`
- `错题专项复习`
- `开始错题专项复习`
- `暂无错题`

Regression tests should verify:

- regular `/practice/start` still works
- `/practice/submit` still records answers
- existing stats page still opens
- existing question-type generation still works

## Migration Strategy

No database migration is needed because this design uses existing tables.

Implementation should only add query helpers, routes, views, navigation links, and tests.

## Future Work After This Sub-Project

Likely follow-up sub-projects:

1. Wrong-answer details with per-question explanation history.
2. Manual ignore, restore, and archive actions.
3. Wrong-answer export for offline printing.
4. Trend charts for weekly wrong-answer changes.
5. Higher-granularity grouping by question type code instead of only item type.

## Open Risks

- Dynamic current-wrong computation may become slower if `review_records` grows large. Indexes already exist on `(user_id, item_id)` and `(user_id, created_at)`, which should be enough for the MVP.
- The latest-answer definition is simple and predictable, but it does not distinguish between answering the same item correctly in a different exercise type. This is acceptable for this phase because current mastery is tracked at item level across the app.
- The current result page does not send students directly back to the wrong-answer notebook. That can be added later if the first MVP feels awkward in manual testing.
