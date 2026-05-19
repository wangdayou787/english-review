# Grammar Title Reuse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reuse existing grammar knowledge details when adding examples under the same grammar title.

**Architecture:** Add query helpers to find grammar details by unit/title and append examples. The admin add route reuses matching grammar items instead of creating duplicates, and the add form embeds existing grammar details for client-side autofill.

**Tech Stack:** Node.js, Express, EJS, better-sqlite3, Jest.

---

### Task 1: Query Helpers

**Files:**
- Modify: `db/queries.js`
- Modify: `tests/grammar-example-queries.test.js`

- [ ] Write failing tests for `getGrammarDetailsForUnit` and `getGrammarItemByTitleInUnit`.
- [ ] Run `npm test -- --runInBand tests/grammar-example-queries.test.js` and verify failure.
- [ ] Implement helpers in `db/queries.js`.
- [ ] Export the helpers.
- [ ] Run the same test and commit.

### Task 2: Admin Add Route Reuse

**Files:**
- Modify: `services/admin-item-support.js`
- Modify: `routes/admin.js`
- Modify: `tests/single-point-admin-routes.test.js`

- [ ] Write a failing route test: posting grammar with an existing title reuses one item, updates details, and appends a new example.
- [ ] Run `npm test -- --runInBand tests/single-point-admin-routes.test.js` and verify failure.
- [ ] Add an append helper for grammar examples.
- [ ] Update `POST /admin/units/:id/items` to reuse an existing grammar item when title matches in the same unit.
- [ ] Run the route test and commit.

### Task 3: Add Form Autofill

**Files:**
- Modify: `views/admin/items.ejs`
- Modify: `routes/admin.js`
- Modify: `tests/single-point-admin-routes.test.js`
- Modify: `tests/template-safety.test.js`

- [ ] Write failing tests that the unit item page embeds existing grammar title reuse data and contains autofill script markers.
- [ ] Run focused tests and verify failure.
- [ ] Pass grammar title reuse data from `renderUnitItems`.
- [ ] Embed JSON in `views/admin/items.ejs`.
- [ ] Add script that fills description and usage notes when title matches.
- [ ] Run focused tests and commit.

### Task 4: Verification

**Files:**
- No additional files expected.

- [ ] Run `npm test -- --runInBand`.
- [ ] Confirm all tests pass.
- [ ] Push `master` to GitHub.
