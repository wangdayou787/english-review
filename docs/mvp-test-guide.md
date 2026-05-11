# MVP Test Guide

## Automated Tests

Run tests from `C:\Users\dayou\english-review`:

```powershell
cmd /c npx jest --runInBand --verbose
```

Expected result: all test suites pass.

## Start The App

```powershell
cmd /c npm start
```

Open:

```text
http://localhost:3000
```

## Default Admin

- Username: `admin`
- Password: `admin123`

Change this before any real deployment.

## Admin Smoke Test

1. Log in as admin.
2. Create a textbook such as `七年级上册`.
3. Create a unit such as `Unit 1`.
4. Add at least four word items with English and Chinese values.
5. Add one phrase item.
6. Add one grammar item with an English sentence.
7. Confirm the items appear in the unit list.

## Student Smoke Test

1. Register a student account.
2. Open the review home page.
3. Start today's review.
4. Answer at least one question correctly and one question incorrectly.
5. Submit answers.
6. Confirm the result page shows score, correct answer feedback, and the mastered action.
7. Open learning statistics and confirm the score and accuracy are visible.

## Desktop Browser Test

1. Start the app on the development computer:

```powershell
cmd /c npm start
```

2. Open a desktop browser on the same computer:

```text
http://localhost:3000
```

3. Test admin login, content entry, student registration, review, answer submission, result feedback, and statistics.

If the page cannot open, confirm the app is listening on port `3000` and no other process is using that port.
