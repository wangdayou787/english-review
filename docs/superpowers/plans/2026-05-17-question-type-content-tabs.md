# Question Type Content Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework `/admin/question-types` so teachers configure question types inside `单词`, `词组`, and `语法` tabs, while hiding non-core future types from this page.

**Architecture:** Keep the existing `question_types` and `question_type_settings` tables. Split route view data into content tabs based on `supported_item_types`, render canonical editable forms only once per question type to avoid duplicate `settings[...]` submissions, and render mirrored cards in other tabs as display-only controls linked to the canonical input by JavaScript. The change is limited to the admin question type settings page and its tests.

**Tech Stack:** Node.js, Express, EJS, Jest, better-sqlite3, vanilla browser JavaScript.

---

### Task 1: Add Failing Coverage For Content Tabs And Hidden Non-Core Types

**Files:**
- Modify: `tests/question-type-routes.test.js`
- Modify: `tests/template-safety.test.js`

- [ ] **Step 1: Add route coverage for content tabs**

Add this test inside `describe('admin question type settings routes', ...)` in `tests/question-type-routes.test.js`:

```js
  test('question type settings groups core types by review content tabs', async () => {
    const app = buildApp({ id: 1, username: 'admin', role: 'admin' });
    const res = await requestApp(app, 'GET', '/admin/question-types');

    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('data-question-type-tab="word"');
    expect(res.text).toContain('data-question-type-tab="phrase"');
    expect(res.text).toContain('data-question-type-tab="grammar"');
    expect(res.text).toContain('单词');
    expect(res.text).toContain('词组');
    expect(res.text).toContain('语法');
    expect(res.text).toContain('data-question-type-panel="word"');
    expect(res.text).toContain('data-question-type-panel="phrase"');
    expect(res.text).toContain('data-question-type-panel="grammar"');
    expect(res.text).toContain('data-content-type="word"');
    expect(res.text).toContain('data-content-type="phrase"');
    expect(res.text).toContain('data-content-type="grammar"');

    app.cleanup();
  });
```

- [ ] **Step 2: Add route coverage for hiding non-core future types**

Add this test in the same describe block:

```js
  test('question type settings hides cloze reading and passage-only future types', async () => {
    const app = buildApp({ id: 1, username: 'admin', role: 'admin' });
    const res = await requestApp(app, 'GET', '/admin/question-types');

    expect(res.statusCode).toBe(200);
    expect(res.text).not.toContain('标准短文完形');
    expect(res.text).not.toContain('短文选词完形');
    expect(res.text).not.toContain('判断正误阅读');
    expect(res.text).not.toContain('阅读理解选择题');
    expect(res.text).not.toContain('任务型阅读');
    expect(res.text).not.toContain('补全对话');

    app.cleanup();
  });
```

- [ ] **Step 3: Add route coverage to prevent duplicate submitted settings**

Add this test in the same describe block:

```js
  test('question type settings submits each available question type only once', async () => {
    const app = buildApp({ id: 1, username: 'admin', role: 'admin' });
    const res = await requestApp(app, 'GET', '/admin/question-types');

    expect(res.statusCode).toBe(200);
    const codeInputs = [...res.text.matchAll(/name="settings\[\d+\]\[code\]" value="([^"]+)"/g)]
      .map(match => match[1]);
    const uniqueCodes = new Set(codeInputs);

    expect(codeInputs).toHaveLength(uniqueCodes.size);
    expect(codeInputs).toContain('vocab_en_cn_choice');
    expect(codeInputs).toContain('translation_fill');
    expect(codeInputs).toContain('vocab_listening_choice');
    expect(codeInputs.filter(code => code === 'translation_fill')).toHaveLength(1);
    expect(codeInputs.filter(code => code === 'vocab_listening_choice')).toHaveLength(1);

    app.cleanup();
  });
```

- [ ] **Step 4: Add template safety coverage for tab and mirror behavior**

Add this test in `tests/template-safety.test.js`:

```js
  test('question type settings tabs synchronize mirrored controls without duplicate forms', () => {
    const questionTypes = read('views/admin/question-types.ejs');

    expect(questionTypes).toContain('data-question-type-tab');
    expect(questionTypes).toContain('data-question-type-panel');
    expect(questionTypes).toContain('data-canonical-code');
    expect(questionTypes).toContain('data-mirror-enabled');
    expect(questionTypes).toContain('syncMirroredCards');
    expect(questionTypes).toContain("addEventListener('click'");
    expect(questionTypes).not.toContain('onclick=');
  });
```

- [ ] **Step 5: Run the focused tests and verify failure**

Run:

```bash
npx jest tests/question-type-routes.test.js tests/template-safety.test.js --runInBand
```

Expected: the new tests fail because the page has no content tabs, does not hide all non-core future types by tab, and has no mirror synchronization script.

### Task 2: Build Content Tab View Data In The Admin Route

**Files:**
- Modify: `routes/admin.js`
- Test: `tests/question-type-routes.test.js`

- [ ] **Step 1: Add tab metadata constants near the question type helper**

Add this above `getQuestionTypeSettingsViewData` in `routes/admin.js`:

```js
const QUESTION_TYPE_CONTENT_TABS = [
  { key: 'word', label: '单词' },
  { key: 'phrase', label: '词组' },
  { key: 'grammar', label: '语法' },
];
```

- [ ] **Step 2: Replace `getQuestionTypeSettingsViewData` with tab-based data**

Replace the current helper with:

```js
function getSupportedItemTypes(type) {
  return Array.isArray(type.supported_item_types) ? type.supported_item_types : [];
}

function getQuestionTypeSettingsViewData(db, { error = null, success = null } = {}) {
  const groups = queries.getQuestionTypeGroups(db);
  const allTypes = groups.flatMap(group => group.types.map(type => ({
    ...type,
    category_label: group.label,
  })));
  const coreTypes = allTypes.filter(type =>
    getSupportedItemTypes(type).some(itemType => ['word', 'phrase', 'grammar'].includes(itemType))
  );
  const canonicalAvailableTypes = [];
  const seenAvailableCodes = new Set();

  coreTypes.forEach(type => {
    if (type.implementation_status !== 'available') return;
    if (seenAvailableCodes.has(type.code)) return;
    seenAvailableCodes.add(type.code);
    canonicalAvailableTypes.push(type);
  });

  const contentTabs = QUESTION_TYPE_CONTENT_TABS.map(tab => ({
    ...tab,
    availableTypes: coreTypes.filter(type =>
      type.implementation_status === 'available' && getSupportedItemTypes(type).includes(tab.key)
    ),
    plannedTypes: coreTypes.filter(type =>
      type.implementation_status !== 'available' && getSupportedItemTypes(type).includes(tab.key)
    ),
  }));

  return { contentTabs, canonicalAvailableTypes, error, success };
}
```

- [ ] **Step 3: Run the route tests and verify expected partial failure**

Run:

```bash
npx jest tests/question-type-routes.test.js --runInBand
```

Expected: rendering may fail until the EJS template is updated to use `contentTabs` and `canonicalAvailableTypes`.

### Task 3: Render Tabs, Canonical Editable Cards, And Read-Only Mirrors

**Files:**
- Modify: `views/admin/question-types.ejs`
- Modify: `public/review.css`
- Test: `tests/question-type-routes.test.js`
- Test: `tests/template-safety.test.js`
- Test: `tests/ui-text.test.js`

- [ ] **Step 1: Replace the settings form body with tab navigation and panels**

Replace the single available/planned rendering in `views/admin/question-types.ejs` with this structure:

```ejs
<form method="POST" action="/admin/question-types" class="question-type-settings">
  <% const canonicalCodes = canonicalAvailableTypes.map(type => type.code); %>
  <div class="question-type-tabs" role="tablist" aria-label="题型内容分类">
    <% contentTabs.forEach((tab, tabIndex) => { %>
      <button
        type="button"
        class="question-type-tab <%= tabIndex === 0 ? 'active' : '' %>"
        role="tab"
        aria-selected="<%= tabIndex === 0 ? 'true' : 'false' %>"
        data-question-type-tab="<%= tab.key %>"
      ><%= tab.label %></button>
    <% }) %>
  </div>

  <% contentTabs.forEach((tab, tabIndex) => { %>
    <section
      class="question-type-tab-panel <%= tabIndex === 0 ? 'active' : '' %>"
      data-question-type-panel="<%= tab.key %>"
      data-content-type="<%= tab.key %>"
    >
      <section class="panel question-type-region question-type-region-primary mb-2">
        <div class="question-type-region-header">
          <div>
            <h2><%= tab.label %> · 可用于练习</h2>
            <p class="text-muted">当前已经支持生成和判分的<%= tab.label %>题型。</p>
          </div>
          <span
            class="status-pill status-available"
            data-available-count
            data-content-type="<%= tab.key %>"
            data-total-count="<%= tab.availableTypes.length %>"
          ></span>
        </div>

        <% if (tab.availableTypes.length === 0) { %>
          <p class="text-muted">暂无可用于练习的<%= tab.label %>题型</p>
        <% } %>

        <div class="question-type-list">
          <% tab.availableTypes.forEach(type => { %>
            <% const canonicalIndex = canonicalCodes.indexOf(type.code); %>
            <% const isCanonical = canonicalIndex >= 0 && canonicalAvailableTypes[canonicalIndex].code === type.code; %>
            <details
              class="question-type-card question-type-details <%= type.enabled ? 'question-type-selected' : '' %>"
              data-question-type-card="<%= tab.key %>-<%= type.code %>"
              data-question-type-code="<%= type.code %>"
            >
              <summary class="question-type-summary">
                <span>
                  <strong><%= type.name %></strong>
                  <small><%= type.category_label %> · <%= type.description %></small>
                </span>
                <span class="status-pill status-available">可用于练习</span>
              </summary>

              <div class="question-type-detail-body">
                <% if (isCanonical) { %>
                  <input type="hidden" name="settings[<%= canonicalIndex %>][code]" value="<%= type.code %>">
                  <label class="check-row">
                    <input
                      type="checkbox"
                      name="settings[<%= canonicalIndex %>][enabled]"
                      data-question-type-enabled
                      data-canonical-code="<%= type.code %>"
                      <%= type.enabled ? 'checked' : '' %>
                    >
                    <span>选用此题型</span>
                  </label>
                  <div class="form-group">
                    <label>比例权重</label>
                    <input type="number" min="0" max="100" name="settings[<%= canonicalIndex %>][weight]" value="<%= type.weight %>">
                  </div>
                  <div class="form-group">
                    <label>题目说明文案</label>
                    <input type="text" name="settings[<%= canonicalIndex %>][instructionText]" value="<%= type.instruction_text %>">
                  </div>
                  <div class="form-group">
                    <label>按钮文案</label>
                    <input type="text" name="settings[<%= canonicalIndex %>][primaryActionText]" value="<%= type.primary_action_text %>">
                  </div>
                  <div class="form-group">
                    <label>提示文案</label>
                    <input type="text" name="settings[<%= canonicalIndex %>][hintText]" value="<%= type.hint_text %>">
                  </div>
                  <div class="display-option-grid">
                    <label class="check-row">
                      <input type="checkbox" name="settings[<%= canonicalIndex %>][showExample]" <%= type.display_options.showExample ? 'checked' : '' %>>
                      <span>显示例句</span>
                    </label>
                    <label class="check-row">
                      <input type="checkbox" name="settings[<%= canonicalIndex %>][showPartOfSpeech]" <%= type.display_options.showPartOfSpeech ? 'checked' : '' %>>
                      <span>显示词性</span>
                    </label>
                    <label class="check-row">
                      <input type="checkbox" name="settings[<%= canonicalIndex %>][showChineseMeaning]" <%= type.display_options.showChineseMeaning ? 'checked' : '' %>>
                      <span>显示中文释义</span>
                    </label>
                    <label class="check-row">
                      <input type="checkbox" name="settings[<%= canonicalIndex %>][showFirstLetterHint]" <%= type.display_options.showFirstLetterHint ? 'checked' : '' %>>
                      <span>显示首字母提示</span>
                    </label>
                  </div>
                <% } else { %>
                  <label class="check-row">
                    <input
                      type="checkbox"
                      data-mirror-enabled
                      data-canonical-code="<%= type.code %>"
                      <%= type.enabled ? 'checked' : '' %>
                    >
                    <span>选用此题型</span>
                  </label>
                  <p class="text-muted mb-0">此题型设置与其他内容分类共用，保存时只提交一份配置。</p>
                <% } %>
              </div>
            </details>
          <% }) %>
        </div>
      </section>

      <section class="panel question-type-region mb-2">
        <div class="question-type-region-header">
          <div>
            <h2><%= tab.label %> · 后续支持</h2>
            <p class="text-muted">后续规划题型，目前只展示名称和待做事项。</p>
          </div>
          <span class="status-pill status-planned"><%= tab.plannedTypes.length %> 个题型</span>
        </div>

        <% if (tab.plannedTypes.length === 0) { %>
          <p class="text-muted">暂无后续支持题型</p>
        <% } %>

        <div class="question-type-list">
          <% tab.plannedTypes.forEach(type => { %>
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
    </section>
  <% }) %>

  <button type="submit" class="btn btn-primary">保存题型设置</button>
</form>
```

- [ ] **Step 2: Replace the existing question type script**

Replace the script at the bottom of `views/admin/question-types.ejs` with:

```ejs
<script>
const questionTypeTabs = document.querySelectorAll('[data-question-type-tab]');
const questionTypePanels = document.querySelectorAll('[data-question-type-panel]');
const canonicalInputs = document.querySelectorAll('[data-question-type-enabled]');
const mirrorInputs = document.querySelectorAll('[data-mirror-enabled]');
const countPills = document.querySelectorAll('[data-available-count]');

function setActiveQuestionTypeTab(tabKey) {
  questionTypeTabs.forEach(tab => {
    const active = tab.dataset.questionTypeTab === tabKey;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  questionTypePanels.forEach(panel => {
    panel.classList.toggle('active', panel.dataset.questionTypePanel === tabKey);
  });
}

function isTypeEnabled(code) {
  const input = document.querySelector(`[data-question-type-enabled][data-canonical-code="${code}"]`);
  return input ? input.checked : false;
}

function syncMirroredCards() {
  document.querySelectorAll('[data-question-type-code]').forEach(card => {
    card.classList.toggle('question-type-selected', isTypeEnabled(card.dataset.questionTypeCode));
  });
  mirrorInputs.forEach(input => {
    input.checked = isTypeEnabled(input.dataset.canonicalCode);
  });
}

function updateAvailableTypeCounts() {
  countPills.forEach(pill => {
    const panel = pill.closest('[data-question-type-panel]');
    const cards = panel ? panel.querySelectorAll('[data-question-type-code]') : [];
    const selected = Array.from(cards).filter(card => isTypeEnabled(card.dataset.questionTypeCode)).length;
    const total = Number(pill.dataset.totalCount || cards.length);
    pill.textContent = selected > 0
      ? `${total} 个题型，选用 ${selected} 个`
      : `${total} 个题型`;
  });
}

function updateQuestionTypeSelection() {
  syncMirroredCards();
  updateAvailableTypeCounts();
}

questionTypeTabs.forEach(tab => {
  tab.addEventListener('click', () => setActiveQuestionTypeTab(tab.dataset.questionTypeTab));
});
canonicalInputs.forEach(input => {
  input.addEventListener('change', updateQuestionTypeSelection);
});
mirrorInputs.forEach(input => {
  input.addEventListener('change', () => {
    const canonical = document.querySelector(`[data-question-type-enabled][data-canonical-code="${input.dataset.canonicalCode}"]`);
    if (canonical) {
      canonical.checked = input.checked;
      updateQuestionTypeSelection();
    }
  });
});
updateQuestionTypeSelection();
</script>
```

- [ ] **Step 3: Add tab CSS to `public/review.css`**

Add:

```css
.question-type-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.question-type-tab {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text);
  cursor: pointer;
  font: inherit;
  font-weight: 600;
  min-height: 2.35rem;
  padding: 0.45rem 1rem;
}

.question-type-tab.active {
  background: #e8f0fe;
  border-color: var(--primary);
  color: var(--primary);
}

.question-type-tab-panel {
  display: none;
}

.question-type-tab-panel.active {
  display: block;
}
```

- [ ] **Step 4: Update UI text expectations if needed**

If `tests/ui-text.test.js` expects the old single-region text and fails, add `单词`, `词组`, and `语法` to the expected strings for `views/admin/question-types.ejs`.

- [ ] **Step 5: Run focused tests**

Run:

```bash
npx jest tests/question-type-routes.test.js tests/template-safety.test.js tests/ui-text.test.js --runInBand
```

Expected: all focused tests pass.

### Task 4: Verify Save Behavior And Commit

**Files:**
- Modify: `routes/admin.js`
- Modify: `views/admin/question-types.ejs`
- Modify: `public/review.css`
- Modify: `tests/question-type-routes.test.js`
- Modify: `tests/template-safety.test.js`
- Optional Modify: `tests/ui-text.test.js`

- [ ] **Step 1: Run full test suite**

Run:

```bash
npx jest --runInBand
```

Expected: all suites pass.

- [ ] **Step 2: Review diff**

Run:

```bash
git diff --stat
git diff -- routes/admin.js views/admin/question-types.ejs public/review.css tests/question-type-routes.test.js tests/template-safety.test.js tests/ui-text.test.js
```

Expected: changes are limited to question type tab rendering, styles, and tests.

- [ ] **Step 3: Commit implementation**

Run:

```bash
git add routes/admin.js views/admin/question-types.ejs public/review.css tests/question-type-routes.test.js tests/template-safety.test.js tests/ui-text.test.js
git commit -m "feat: group question types by review content"
```

Expected: one implementation commit.

- [ ] **Step 4: Push current branch**

Run:

```bash
git push origin phrase-multiple-examples
```

Expected: existing PR updates with the new commit.

## Self-Review

- Spec coverage: tasks cover three tabs, default word tab, tab-specific available and planned sections, hidden non-core future types, no duplicate submitted settings, and unchanged save behavior.
- Placeholder scan: no deferred implementation placeholders remain.
- Type consistency: route returns `contentTabs` and `canonicalAvailableTypes`; template and tests use the same names.
