# Question Type Collapsible Sections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework `/admin/question-types` into two collapsible sections for available and planned question types, and prevent browser answer history in practice fill-in inputs.

**Architecture:** Keep the existing question type query and save behavior. Split loaded type groups into `availableTypes` and `plannedTypes` in the admin route, render only available types as editable settings, and render planned types as read-only collapsed summaries. Add answer-input browser-history controls in the existing practice exercise template.

**Tech Stack:** Node.js, Express, EJS, Jest, better-sqlite3.

---

### Task 1: Add Failing Coverage For The New Rendering Contract

**Files:**
- Modify: `tests/question-type-routes.test.js`
- Modify: `tests/template-safety.test.js`

- [ ] **Step 1: Add route assertions for the two admin regions**

Add this test in `tests/question-type-routes.test.js` inside `describe('admin question type settings routes', ...)`:

```js
  test('question type settings separates available and planned types', async () => {
    const app = buildApp({ id: 1, username: 'admin', role: 'admin' });
    const res = await requestApp(app, 'GET', '/admin/question-types');

    expect(res.statusCode).toBe(200);
    expect(res.text.indexOf('可用于练习')).toBeGreaterThan(-1);
    expect(res.text.indexOf('后续支持')).toBeGreaterThan(res.text.indexOf('可用于练习'));
    expect(res.text).toContain('value="vocab_en_cn_choice"');
    expect(res.text).not.toContain('value="vocab_word_bank_fill"');
    expect(res.text).toContain('选词填空');
    expect(res.text).toContain('从词库中选择合适单词填入句子。');

    app.cleanup();
  });
```

- [ ] **Step 2: Add template safety coverage for answer input autocomplete**

Add this test in `tests/template-safety.test.js`:

```js
  test('practice text answer inputs disable browser answer history', () => {
    const exercise = read('views/practice/exercise.ejs');

    expect(exercise).toContain('autocomplete="off"');
    expect(exercise).toContain('autocapitalize="off"');
    expect(exercise).toContain('spellcheck="false"');
  });
```

- [ ] **Step 3: Run the focused tests to verify they fail**

Run:

```bash
npx jest tests/question-type-routes.test.js tests/template-safety.test.js --runInBand
```

Expected: the new admin rendering test fails because planned types are still rendered as editable settings, and the template safety test fails because `autocomplete="off"` is not yet present.

### Task 2: Split Question Type View Data And Render Collapsible Sections

**Files:**
- Modify: `routes/admin.js`
- Modify: `views/admin/question-types.ejs`
- Optional Modify: `public/style.css`

- [ ] **Step 1: Add a view-data helper in `routes/admin.js`**

Add this helper near `normalizeQuestionTypeSettings`:

```js
function getQuestionTypeSettingsViewData(db, { error = null, success = null } = {}) {
  const groups = queries.getQuestionTypeGroups(db);
  const availableTypes = [];
  const plannedTypes = [];

  groups.forEach(group => {
    group.types.forEach(type => {
      const viewType = {
        ...type,
        category_label: group.label,
      };
      if (type.implementation_status === 'available') {
        availableTypes.push(viewType);
      } else {
        plannedTypes.push(viewType);
      }
    });
  });

  return { availableTypes, plannedTypes, error, success };
}
```

- [ ] **Step 2: Use the helper in GET and POST error rendering**

Replace the current GET route body with:

```js
router.get('/admin/question-types', (req, res) => {
  renderWithLayout(
    res,
    'admin/question-types',
    getQuestionTypeSettingsViewData(req.app.locals.db),
    '题型设置'
  );
});
```

Replace the POST catch rendering data with:

```js
    renderWithLayout(
      res,
      'admin/question-types',
      getQuestionTypeSettingsViewData(db, { error: err.message }),
      '题型设置'
    );
```

- [ ] **Step 3: Replace `views/admin/question-types.ejs` with the two-section collapsible layout**

Use this structure, preserving the existing settings field names for available types:

```ejs
<h1>题型设置</h1>

<% if (typeof error !== 'undefined' && error) { %>
  <div class="alert alert-error"><%= error %></div>
<% } %>
<% if (typeof success !== 'undefined' && success) { %>
  <div class="alert alert-success"><%= success %></div>
<% } %>

<section class="panel mb-2">
  <h2 class="mb-1">题型生成规则</h2>
  <p class="text-muted">只有“可用于练习”并已启用的题型会进入学生练习；“后续支持”的题型只展示规划方向，当前不会生成到学生端。</p>
</section>

<form method="POST" action="/admin/question-types" class="question-type-settings">
  <section class="panel question-type-region question-type-region-primary mb-2">
    <div class="question-type-region-header">
      <div>
        <h2>可用于练习</h2>
        <p class="text-muted">当前已经支持生成和判分的题型。</p>
      </div>
      <span class="status-pill status-available"><%= availableTypes.length %> 个题型</span>
    </div>

    <% if (availableTypes.length === 0) { %>
      <p class="text-muted">暂无可用于练习的题型</p>
    <% } %>

    <div class="question-type-list">
      <% availableTypes.forEach((type, index) => { %>
        <details class="question-type-card question-type-details">
          <summary class="question-type-summary">
            <span>
              <strong><%= type.name %></strong>
              <small><%= type.category_label %> · <%= type.description %></small>
            </span>
            <span class="status-pill status-available">可用于练习</span>
          </summary>

          <div class="question-type-detail-body">
            <input type="hidden" name="settings[<%= index %>][code]" value="<%= type.code %>">

            <label class="check-row">
              <input type="checkbox" name="settings[<%= index %>][enabled]" <%= type.enabled ? 'checked' : '' %>>
              <span>启用此题型</span>
            </label>

            <div class="form-group">
              <label>比例权重</label>
              <input type="number" min="0" max="100" name="settings[<%= index %>][weight]" value="<%= type.weight %>">
            </div>

            <div class="form-group">
              <label>题目说明文案</label>
              <input type="text" name="settings[<%= index %>][instructionText]" value="<%= type.instruction_text %>">
            </div>

            <div class="form-group">
              <label>按钮文案</label>
              <input type="text" name="settings[<%= index %>][primaryActionText]" value="<%= type.primary_action_text %>">
            </div>

            <div class="form-group">
              <label>提示文案</label>
              <input type="text" name="settings[<%= index %>][hintText]" value="<%= type.hint_text %>">
            </div>

            <div class="display-option-grid">
              <label class="check-row">
                <input type="checkbox" name="settings[<%= index %>][showExample]" <%= type.display_options.showExample ? 'checked' : '' %>>
                <span>显示例句</span>
              </label>
              <label class="check-row">
                <input type="checkbox" name="settings[<%= index %>][showPartOfSpeech]" <%= type.display_options.showPartOfSpeech ? 'checked' : '' %>>
                <span>显示词性</span>
              </label>
              <label class="check-row">
                <input type="checkbox" name="settings[<%= index %>][showChineseMeaning]" <%= type.display_options.showChineseMeaning ? 'checked' : '' %>>
                <span>显示中文释义</span>
              </label>
              <label class="check-row">
                <input type="checkbox" name="settings[<%= index %>][showFirstLetterHint]" <%= type.display_options.showFirstLetterHint ? 'checked' : '' %>>
                <span>显示首字母提示</span>
              </label>
            </div>
          </div>
        </details>
      <% }) %>
    </div>
  </section>

  <button type="submit" class="btn btn-primary">保存题型设置</button>
</form>

<section class="panel question-type-region mb-2">
  <div class="question-type-region-header">
    <div>
      <h2>后续支持</h2>
      <p class="text-muted">后续规划题型，目前只展示名称和待做事项。</p>
    </div>
    <span class="status-pill status-planned"><%= plannedTypes.length %> 个题型</span>
  </div>

  <% if (plannedTypes.length === 0) { %>
    <p class="text-muted">暂无后续支持题型</p>
  <% } %>

  <div class="question-type-list">
    <% plannedTypes.forEach(type => { %>
      <details class="question-type-card question-type-details">
        <summary class="question-type-summary">
          <span>
            <strong><%= type.name %></strong>
            <small><%= type.category_label %> · <%= type.description %></small>
          </span>
          <span class="status-pill status-planned">后续支持</span>
        </summary>
        <div class="question-type-detail-body">
          <p class="text-muted mb-0"><%= type.description %></p>
        </div>
      </details>
    <% }) %>
  </div>
</section>
```

- [ ] **Step 4: Add small CSS only if the existing cards do not align after rendering**

If needed, append to `public/style.css`:

```css
.question-type-region-primary {
  border-color: #9cc7a8;
  box-shadow: 0 1px 0 rgba(37, 99, 66, 0.08);
}

.question-type-region-header,
.question-type-summary {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.question-type-summary {
  cursor: pointer;
  list-style: none;
}

.question-type-summary::-webkit-details-marker {
  display: none;
}

.question-type-summary small {
  display: block;
  margin-top: 0.25rem;
  color: #667085;
}

.question-type-detail-body {
  margin-top: 1rem;
}
```

- [ ] **Step 5: Run focused route tests**

Run:

```bash
npx jest tests/question-type-routes.test.js --runInBand
```

Expected: all tests in `question-type-routes.test.js` pass.

### Task 3: Disable Fill-In Input History And Verify The Whole Change

**Files:**
- Modify: `views/practice/exercise.ejs`
- Modify: `tests/ui-text.test.js` only if text assertions need updates after the template rewrite

- [ ] **Step 1: Update the text answer input**

Replace the plain text answer input in `views/practice/exercise.ejs`:

```ejs
<input type="text" class="answer-input" name="answers[<%= idx %>][answer]" placeholder="输入你的答案" required>
```

with:

```ejs
<input
  type="text"
  class="answer-input"
  name="answers[<%= idx %>][answer]"
  placeholder="输入你的答案"
  autocomplete="off"
  autocapitalize="off"
  spellcheck="false"
  required
>
```

- [ ] **Step 2: Run focused template and UI tests**

Run:

```bash
npx jest tests/template-safety.test.js tests/ui-text.test.js --runInBand
```

Expected: both test suites pass.

- [ ] **Step 3: Run the full Jest suite**

Run:

```bash
npx jest --runInBand
```

Expected: all test suites pass.

- [ ] **Step 4: Commit the implementation**

Run:

```bash
git add routes/admin.js views/admin/question-types.ejs views/practice/exercise.ejs public/style.css tests/question-type-routes.test.js tests/template-safety.test.js tests/ui-text.test.js
git commit -m "feat: collapse question type settings sections"
```

Expected: one implementation commit after the design and plan commits.

- [ ] **Step 5: Push the branch**

Run:

```bash
git push origin phrase-multiple-examples
```

Expected: the existing PR updates with the new commits.

## Self-Review

- Spec coverage: the plan covers the two admin regions, collapsible per-type display, planned type read-only behavior, and practice input autocomplete prevention.
- Placeholder scan: no deferred implementation placeholders remain.
- Type consistency: `availableTypes`, `plannedTypes`, and existing `settings[...]` fields are used consistently across route, template, and tests.
