# Middle School English Review MVP Design

## Status

Approved design for continuing the interrupted `english-review` project.

## Current Baseline

The project is an Express, EJS, and SQLite application for English review practice.
It already contains authentication, admin content management routes, practice generation, review records, check-ins, statistics, and Jest tests.

The interrupted state has several concrete problems:

- No project-level development documentation existed before this document.
- The project directory was not a Git repository.
- Visible Chinese text in routes, EJS templates, tests, and comments is corrupted.
- Several EJS templates contain broken labels, titles, and strings.
- The production and test SQLite databases currently contain only the default admin user, default review config, and default review cycles.
- `npm test` fails in PowerShell because `npm.ps1` is blocked by execution policy.
- `cmd /c npx jest --runInBand --verbose` is the reliable test command in the current environment.

## Product Direction

The MVP is a review tool for middle school students studying English basics.

The operating model is:

- Teachers or parents maintain review content.
- Students focus on daily review and practice.
- The interface language is Simplified Chinese.
- Learning content keeps English text plus Chinese meaning or explanation.

## MVP Scope

Student-facing MVP:

- View today's review progress.
- Start daily review.
- Complete generated exercises.
- View result feedback.
- View learning statistics.
- Mark known items as mastered.

Admin-facing MVP:

- Manage textbooks.
- Manage units.
- Manage words, phrases, and grammar items.
- Add items individually or by batch import.
- Configure daily review quotas.
- Configure enabled review cycles.

Out of scope for the first MVP:

- Class or group management.
- Cloud sync.
- AI-generated exercises.
- Online payment.
- Complex permissions beyond admin and student roles.
- Full mobile app packaging.

## Architecture

The project will keep the current lightweight architecture:

- Express handles HTTP routing and sessions.
- EJS renders server-side pages.
- SQLite stores users, content, review records, check-ins, mastery state, config, and review cycles.
- The existing scheduler and generator modules remain the core review engines.

No frontend build system will be introduced for the MVP. This keeps local testing simple and supports phone testing over the local network.

## Core User Flows

Admin content flow:

1. Admin logs in.
2. Admin creates a textbook.
3. Admin creates units under the textbook.
4. Admin adds words, phrases, and grammar items.
5. Admin adjusts daily quotas and review cycles if needed.

Student review flow:

1. Student logs in or registers.
2. Student sees today's progress, streak, score, and available review actions.
3. Student starts daily review or an active cycle review.
4. System generates exercises from eligible items.
5. Student submits answers.
6. System scores answers, writes review records, updates check-in progress, and shows result feedback.
7. Student can mark easy items as mastered.

## Review Logic

The MVP keeps the existing exercise types:

- English to Chinese multiple choice.
- Chinese to English typed answer.
- Listening recognition using browser speech synthesis.
- Sentence ordering for grammar practice.

Daily review should prioritize:

- New items.
- Items answered incorrectly.
- Items not reviewed recently.
- Items not marked as mastered.

Cycle reviews should continue using weekly, biweekly, and monthly rules.

## Visual Design Direction

The student interface should feel calm, readable, and suitable for repeated study sessions.

Design requirements:

- Use Simplified Chinese for interface text.
- Keep English learning content prominent and easy to scan.
- Use a low-saturation palette with light backgrounds and blue-green accents.
- Avoid harsh contrast, dense decoration, and noisy gradients.
- Use generous spacing for exercise options and inputs.
- Keep cards shallow and purposeful, with no nested card-heavy layout.
- Make pages responsive enough for phone testing.
- Keep typography readable for middle school students.

Admin pages should be more utilitarian:

- Clear form labels.
- Efficient tables.
- Obvious destructive action confirmations.
- Helpful validation and import feedback.

## Error Handling

The MVP should improve visible errors without overbuilding:

- Authentication errors should use clear Chinese messages.
- Admin validation errors should explain what needs fixing.
- Empty content states should tell the user what action is needed.
- Server rendering errors should not expose stack traces to users.

## Testing And Verification

The current reliable test command is:

```powershell
cmd /c npx jest --runInBand --verbose
```

The existing baseline result before implementation:

- Test suites: 3 passed.
- Tests: 29 passed.

Implementation should add or update tests around:

- Correct rendering of Chinese interface text.
- Exercise generation edge cases.
- Student practice submission flow.
- Admin content validation where practical.

Manual verification should include:

- Admin login with the default admin account.
- Creating textbook, unit, and sample items.
- Registering a student account.
- Running daily review.
- Submitting correct and incorrect answers.
- Checking result and statistics pages.
- Testing the interface from an Android phone on the local network.

## Implementation Priorities

1. Stabilize project hygiene: Git baseline, ignore rules, docs, and test command notes.
2. Repair visible Simplified Chinese text and broken EJS markup.
3. Improve student-facing page styling for long review sessions.
4. Improve admin form readability and content management feedback.
5. Add focused tests for repaired behavior.
6. Run automated tests and manual smoke checks.

## Open Assumptions

- The first MVP is for local or LAN testing, not public deployment.
- Default admin credentials are acceptable only for development and must be changed before real deployment.
- The existing SQLite schema is sufficient for the MVP.
- Sample learning content can be entered through the admin interface rather than seeded automatically in this phase.
