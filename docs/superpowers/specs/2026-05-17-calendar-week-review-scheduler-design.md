# Calendar Week Review Scheduler Design

## Goal

Fix daily review generation so the app follows the real calendar week and never shows `暂无复习内容` when an active review plan has eligible content. This aligns the tool with its purpose: helping students complete daily English foundational review.

## Problem

The current scheduler derives the review day from how many `daily_review_tasks` dates already exist for a student and plan. If a plan is activated on Sunday, the scheduler treats that Sunday as day 1 instead of a calendar weekend review day.

Weekend review also depends on previous task history. If the current plan has no Monday-Friday task rows yet, the weekend review pool is empty and `/practice/start` returns to the dashboard with `暂无复习内容`.

## Scope

This change covers:

- daily task scheduling in `engine/scheduler.js`
- the `/practice` and `/practice/start` flow where needed
- scheduler and route tests

This change does not cover:

- grammar question bank creation
- new grammar question generation or scoring
- question type settings UI changes
- complex spaced repetition beyond the rules below

## Calendar Rules

The scheduler should derive the day role from `taskDate`:

- Monday-Friday: weekday review
- Saturday-Sunday: weekend consolidation

The logic should not depend on how many previous task dates exist for the active plan.

## Weekday Rules

For Monday-Friday, each content type still respects its configured quota:

- words use `daily_words`
- phrases use `daily_phrases`
- grammar uses `daily_grammar`

The target mix is:

- about 70% review content
- about 30% new content

Review content is prioritized. If there is not enough distinct review content, the scheduler may repeat or cycle through existing review candidates to preserve the review portion instead of replacing the review portion with extra new content.

New content should remain close to the 30% target. It should not expand just because the review pool is small.

If there is no review pool at all, the scheduler can use new content so the student is not blocked on the first usable day.

## Weekend Rules

Saturday and Sunday are weekly consolidation days:

- Do not introduce extra new-content quota just to fill the task list.
- Prefer items that appeared in this calendar week's Monday-Friday daily tasks for the same student and plan.
- Respect the configured daily quotas per content type.
- Use `cycle_review` as the source type for weekend consolidation items.

If there are no Monday-Friday tasks for the current calendar week, the scheduler should fall back to the active review plan scope:

- Select eligible plan items by type up to the configured quotas.
- Mark them as `cycle_review`.
- Do not return an empty task set when the active plan has eligible items.

This fallback handles the real testing case where the teacher activates or reactivates a plan on Sunday and immediately previews student review.

## Repetition Policy

The `daily_review_tasks` table has a uniqueness rule for `(user_id, task_date, item_id)`, so the saved daily task list cannot contain the same item twice on the same date.

Therefore, "repeat" means:

- reuse eligible review items across different dates
- cycle through prior review candidates before allowing new content to exceed the 30% target
- if there are fewer distinct eligible items than the quota, return the available distinct items rather than inserting duplicates

## Dashboard Behavior

The review dashboard should not look empty when an active plan can generate tasks for today.

Recommended behavior:

- On `/practice`, if an active plan exists and today's saved tasks are empty, compute a preview task summary using the same scheduler selection rules without saving tasks.
- The dashboard can then show expected counts for `今日单词`, `今日短语`, `今日语法`, `新内容`, and `复习内容`.
- `/practice/start` remains responsible for saving the actual daily task rows.

If implementing a no-save preview creates too much complexity, it is acceptable for `/practice` to create today's tasks eagerly, as long as same-day reuse remains stable.

## Testing

Tests should verify:

- A Sunday task date uses weekend consolidation behavior even when the plan has no previous task dates.
- A Sunday task date with no Monday-Friday history falls back to active plan items instead of returning empty.
- Weekday generation keeps new content near the 30% target and does not use extra new items to replace a small review pool when review candidates exist.
- Repeated same-day calls still reuse saved tasks.
- Dashboard route no longer shows zero task counts when an active plan has eligible content and no saved tasks yet.
- Existing plan scope filtering and mastered-item exclusion continue to work.
