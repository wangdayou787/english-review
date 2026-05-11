# Review Plan Design

Date: 2026-05-11

## Purpose

The project needs a real review-content workflow, not only textbook management. Admin users should configure the active review range, and students should receive stable daily review tasks based on that range, their own progress, and the configured daily workload.

This design keeps the app as a desktop web application. It does not introduce Android or iOS behavior.

## Confirmed Decisions

- Admin and student responsibilities are separated.
- Admin users manage textbooks, units, knowledge items, settings, and the active review plan.
- Students see and complete today's review tasks.
- The active review range is configured globally by admin users.
- Each student's progress, generated tasks, answers, wrong items, and mastery state remain independent.
- Daily workload is the hard limit. A selected unit is a review pool, not a requirement to finish all unit content on the first day.
- Listening remains listen-and-choose. The app will not implement dictation input for listening exercises in this phase.
- MVP supports one active review plan at a time.
- The implementation should use the existing Express, EJS, SQLite, and Jest structure.

## Navigation And Roles

Admin navigation should be split into clear areas:

- Textbook Management: textbooks, units, words, phrases, and grammar points.
- Review Plan: active review scope and plan activation.
- System Settings: daily quotas and review-cycle parameters.

The Review Plan page should let an admin:

- View the current active plan.
- Select one or more units from existing textbooks.
- See item counts inside the selected scope:
  - words
  - phrases
  - grammar points
- See the current daily quotas.
- Activate the selected review scope as the current plan.

Student navigation should keep the review experience focused:

- The student review dashboard shows today's review summary.
- Starting review uses the active review plan rather than the whole item database.
- If no plan is active, the student sees a clear empty-state message.

## Data Model

The feature should add three groups of data while preserving existing tables and records.

### review_plans

Stores review plans created by admin users.

Recommended fields:

- `id`
- `name`
- `is_active`
- `created_at`
- `updated_at`

MVP behavior:

- Only one plan may be active at a time.
- Activating a plan deactivates any previous active plan.
- Implementation may enforce this with application logic and, if practical in SQLite, a partial unique index for active plans.

### review_plan_units

Stores the units included in a review plan.

Recommended fields:

- `plan_id`
- `unit_id`

Recommended constraints:

- `plan_id` references `review_plans(id)`.
- `unit_id` references `units(id)`.
- `(plan_id, unit_id)` is unique.

### daily_review_tasks

Stores the generated daily tasks for each student.

Recommended fields:

- `id`
- `user_id`
- `plan_id`
- `task_date`
- `item_id`
- `source_type`
- `created_at`

Allowed `source_type` values:

- `new`: newly introduced content
- `recent_review`: content selected from recent review history
- `cycle_review`: content selected for day 6 or day 7 consolidation
- `wrong`: content selected because of recent wrong answers

Recommended constraints:

- `user_id` references `users(id)`.
- `plan_id` references `review_plans(id)`.
- `item_id` references `items(id)`.
- `(user_id, task_date, item_id)` is unique.

This table makes today's tasks stable. A student who refreshes the page or re-enters the page on the same date should see the same task set.

## Scheduling Rules

The scheduler must only select items from the active review plan's unit scope.

Daily quotas remain configured in system settings:

- `daily_words`
- `daily_phrases`
- `daily_grammar`

The selected unit or units form the review pool. They do not override the daily quotas.

### Review Day Calculation

For a student and the active plan, the review day number is based on distinct previous `daily_review_tasks.task_date` values for that student and plan:

- No previous task date means day 1.
- One previous task date means day 2.
- Continue until day 7.
- After day 7, the next generated task starts a new 7-day cycle and uses the same rhythm again.

This keeps the schedule tied to actual generated review days, not calendar weekdays.

### 30/70 Rounding

For each item type on days 2-5:

- `new_target = max(1, floor(quota * 0.3))` when quota is greater than 0.
- `review_target = quota - new_target`.
- If the quota is 1, the scheduler may choose either one new item or one review item based on availability and priority, with wrong review items preferred.

Fallback rules may fill unused slots from the other bucket, so the final count should still try to reach the configured quota.

### Day 1

If the student has no recent task history for the active plan:

- Fill each item type up to its quota.
- Use new items.
- Do not require all selected-unit content to be reviewed on day 1.

### Days 2-5

For each item type:

- Target 30 percent new content.
- Target 70 percent review content.
- Wrong items are prioritized inside the review portion.
- If there is not enough review content, use new content to fill the remaining quota.
- If there is not enough new content, use review content or wrong content to fill the remaining quota.
- Items marked as mastered are excluded from normal daily tasks.

Recommended review priority:

1. Items answered incorrectly in the previous day.
2. Previous-day items that are not mastered.
3. Earlier recent items that need rotation.
4. New items as fallback.

### Days 6 And 7

Days 6 and 7 are consolidation days:

- Do not introduce new content.
- Select from items that appeared in the previous 5 days.
- Still respect daily quotas.
- Prioritize items with more wrong answers, more recent wrong answers, fewer review attempts, and earlier appearance in the week.

This creates the intended rhythm: small daily intake, heavy reinforcement, and weekly consolidation.

## Exercise Types

The review plan feature should reuse the current exercise generation path and bind it to saved daily tasks.

Supported MVP exercise forms:

- English to Chinese.
- Chinese to English.
- Listening choice.
- Grammar sentence or ordering practice.

Listening choice is explicitly not dictation. The page plays English audio or browser speech output, and the student chooses the matching answer from options.

## User Experience

The interface should remain a desktop web app for middle-school English review.

Admin Review Plan page:

- Keep the layout calm and readable.
- Use clear sections for active plan, unit selection, content counts, and activation.
- Avoid a marketing-style landing page.
- Do not overload the page with class management or assignment features in this phase.

Student Review page:

- Show today's task counts by type.
- Show new-content and review-content counts.
- Show the active review range, such as a textbook and unit name.
- Provide a direct "Start Today's Review" action.
- Reuse the same generated task set during the same day.
- Show a helpful empty state when no active plan exists.

The visual direction should be suitable for repeated study: clean, low-fatigue, structured, and readable.

## Error Handling

- If no active review plan exists, the student dashboard should not attempt to generate tasks.
- If the active plan has no units, the student dashboard should show a plan-configuration message.
- If the selected unit scope has fewer items than the quotas, the scheduler should return the available items without failing.
- If today's task already exists, the app should reuse it instead of generating duplicates.
- Admin activation should validate that at least one unit is selected.

## Testing Strategy

Database initialization tests should verify:

- `review_plans` exists.
- `review_plan_units` exists.
- `daily_review_tasks` exists.
- Daily task uniqueness prevents duplicate item assignment for the same user and date.

Scheduler tests should verify:

- Day 1 generates quota-limited new content.
- Days 2-5 use the 30 percent new and 70 percent review target.
- Missing review content is replaced by new content.
- Missing new content is replaced by review or wrong content.
- Days 6 and 7 do not introduce new content.
- Selection is limited to active-plan units.
- Mastered items are excluded from normal daily tasks.

Route tests should verify:

- Admin users can open the Review Plan page.
- Admin users can activate a plan with selected units.
- Non-admin users cannot access admin plan routes.
- Students see an empty state when no active plan exists.
- A student's first visit for the day generates tasks.
- A repeated visit on the same day reuses saved tasks.

UI text tests should verify key visible text:

- Review Plan
- Today's Review
- New Content
- Review Content
- Start Today's Review

## Migration Strategy

The current project initializes SQLite schema in `db/init.js` with idempotent `CREATE TABLE IF NOT EXISTS` statements. This feature should follow that existing pattern.

Implementation should:

- Add the new tables in `db/init.js`.
- Preserve all existing tables and data.
- Avoid requiring manual database reset.
- Avoid deleting or renaming existing columns.

## Out Of Scope For This Phase

- Multiple simultaneous active plans.
- Class, group, or assignment management.
- Teacher dashboards for each student's detailed completion report.
- Android or iOS app behavior.
- Dictation-style listening input.
- Complex spaced-repetition algorithms beyond the confirmed 30/70 and day 6/7 rhythm.

## Implementation Notes

The implementation should be planned after this design is accepted. The likely work areas are:

- `db/init.js`
- `db/queries.js`
- `engine/scheduler.js`
- `routes/admin.js`
- `routes/practice.js`
- `views/layout.ejs`
- `views/admin/review-plan.ejs`
- `views/practice/dashboard.ejs`
- related Jest tests

The previous phrase multiple-examples work is separate and should not be reverted.
