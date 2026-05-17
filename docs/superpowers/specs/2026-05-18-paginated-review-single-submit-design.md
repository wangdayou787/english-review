# Paginated Review Single Submit Design

## Goal

Fix daily review pagination so students complete all pages of today's review before submitting answers once.

## Problem

`/practice/start` currently paginates exercises at 20 questions per page. Each page renders a separate form. If a student answers page 1, clicks `下一页`, then submits on page 2, only page 2 answers are posted to `/practice/submit`. Page 1 answers are lost because they were never submitted or carried forward.

## Scope

This change covers:

- `views/practice/exercise.ejs`
- route/template tests for pagination controls
- client-side temporary answer storage for paginated practice

This change does not cover:

- changing scoring logic in `engine/generator.js`
- changing daily task generation
- changing the result page
- server-side draft persistence

## Behavior

When a practice set has multiple pages:

- pages before the last page must not show `提交答案`
- pages before the last page show `下一页`
- middle and final pages may show `上一页`
- only the last page shows `提交答案`
- moving between pages saves the current page's answers in browser `sessionStorage`
- returning to a previous page restores the saved answers
- submitting from the last page posts answers from all pages to `/practice/submit`

When a practice set has only one page:

- the page keeps the normal `提交答案` behavior
- no cross-page answer merge is needed

## Storage Key

Use a session storage key scoped to the practice type and date/page set so separate practice contexts do not overwrite each other.

The key can be passed from the route as `answerStorageKey`.

For daily review, use a stable key like:

```text
practice-answers:daily:<YYYY-MM-DD>
```

For cycle review, include the cycle type:

```text
practice-answers:cycle:<cycleType>:<YYYY-MM-DD>
```

## Client-Side Data Shape

Store answers by item id:

```json
{
  "34": { "item_id": "34", "exercise_type": "cn2en", "answer": "get" },
  "35": { "item_id": "35", "exercise_type": "en2cn_fill", "answer": "她自己" }
}
```

Before final submit:

1. save the current page's answers
2. append hidden `answers[index][item_id]`, `answers[index][exercise_type]`, and `answers[index][answer]` inputs for all stored answers
3. remove or disable the current page's original answer inputs so duplicate names are not submitted
4. allow the form to submit normally
5. clear storage after the browser starts the final submit

## Sentence Ordering

Sentence ordering answers are already stored in hidden inputs. The save/restore logic should read and restore those hidden values like other input types. Restoring the visual selected chips is not required for this change; it is acceptable for the hidden answer value to be restored for final submission.

## Acceptance Criteria

- On page 1 of a multi-page daily review, there is no `提交答案` button.
- On page 1 of a multi-page daily review, `下一页` saves current answers before navigation.
- On the final page, `提交答案` submits answers from all pages.
- Single-page practice still shows `提交答案`.
- Existing scoring and result rendering continue to pass tests.
