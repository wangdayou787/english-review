# Daily Review Print Design

## Goal

Add a print option to the daily review page so teachers can print all of the current day's review questions.

## User Need

On `/practice/start`, the visible exercise page is paginated for on-screen answering. The user needs a print action in the upper-right area of the daily review page that can print the full set of today's review questions, not only the currently visible page.

## Scope

This change covers:

- a print entry point from the daily review exercise page
- a dedicated print view for today's daily review
- print-specific CSS
- route and template tests

This change does not cover:

- printing answers or answer keys
- changing review task generation
- changing exercise scoring or submission
- printing wrong-answer专项复习 or cycle review pages

## Behavior

### Daily Review Page

The daily review exercise page should show a print control near the page title area, visually aligned to the upper-right of the content header.

The control should be labeled `打印`.

Clicking it should open a dedicated daily review print page:

```text
/practice/print
```

Opening in the same tab is acceptable. The print view itself should provide a print button that calls `window.print()`.

### Print View

The print view should:

- load today's active-plan daily review tasks for the signed-in user
- use the same generated exercise content as `/practice/start`
- include all of today's questions in one print document
- allow the browser to naturally paginate the printed paper output
- show the title `今日复习`
- show the total question count
- not include answer submission controls

If today's daily review tasks do not exist yet, the print route should call the existing scheduler to create or reuse them. This keeps `/practice/print` consistent with `/practice/start`.

### Pagination Meaning

The print view should not use the on-screen exercise pagination limit of 20 questions per page. It should render all questions for the day in the document. Browser/paper pagination is allowed and expected during printing.

### Print Styling

When printing:

- hide the global navigation/header
- hide print action buttons
- hide submit buttons and answer form actions
- keep question cards, question numbers, question type labels, prompts, options, and answer blanks visible
- keep enough spacing for handwritten answers in fill-in questions
- avoid splitting a question card across pages where practical using print CSS

## Architecture

Use the existing `routes/practice.js` daily review flow and `engine/generator.generateExercises`.

Add a new route:

```js
GET /practice/print
```

The route should:

1. require authentication through the existing router middleware
2. load config and active review plan
3. redirect to `/practice` if there is no active plan
4. call `scheduler.getOrCreateDailyReviewTasks(db, userId, activePlan.id, today, config)`
5. flatten all returned tasks
6. render all generated exercises in a print-focused template

Create a new template:

```text
views/practice/print.ejs
```

The template can reuse the same exercise display structure as `views/practice/exercise.ejs`, but without answer submission and pagination controls.

Add print CSS to `public/review.css` or `public/style.css`, following the existing project style. Prefer `public/review.css` if exercise-specific styles already live there.

## Testing

Add route tests that verify:

- `/practice/start` includes a print link for daily review pages
- `/practice/print` creates or reuses today's daily tasks and renders all of them
- `/practice/print` is not limited to 20 questions when more than 20 tasks exist
- `/practice/print` does not render the submit answer button

Add template safety tests if needed to ensure:

- the print template contains `window.print()`
- print-only classes or `@media print` rules are present

## Acceptance Criteria

- From `/practice/start`, the user can see and click `打印`.
- The print view contains every current-day daily review question.
- A 26-question day renders 26 questions in the print view.
- Browser printing can naturally span multiple paper pages.
- The normal answer submission flow remains unchanged.
