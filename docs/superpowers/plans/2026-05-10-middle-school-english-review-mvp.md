# Middle School English Review MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize the interrupted middle-school English review MVP, repair Chinese UI text and broken templates, improve the student review experience, and add focused regression tests.

**Architecture:** Keep the current Express, EJS, and SQLite application. Repair the existing server-rendered routes and templates first, then improve CSS and exercise engine edge cases without introducing a frontend build step.

**Tech Stack:** Node.js, Express 5, EJS, better-sqlite3, express-session, bcrypt, Jest, plain CSS.

---

## File Structure

- `.gitignore`: already excludes dependencies, SQLite runtime files, logs, and local environment files.
- `server.js`: Express app bootstrap, session setup, route registration, and server export for tests.
- `middleware/auth.js`: route guards for authenticated users and admins.
- `routes/auth.js`: login, registration, logout, and root redirect behavior.
- `routes/admin.js`: textbook, unit, item, batch import, and review-cycle management.
- `routes/practice.js`: student dashboard, exercise generation, answer submission, and mastery marking.
- `routes/stats.js`: student statistics page.
- `db/init.js`: database schema and default data.
- `db/queries.js`: database access helpers used by routes and engines.
- `engine/generator.js`: exercise creation and scoring.
- `engine/scheduler.js`: daily and cycle review item selection.
- `views/**/*.ejs`: server-rendered HTML for auth, admin, student practice, results, and stats pages.
- `public/style.css`: shared visual system for student and admin pages.
- `tests/*.test.js`: current tests for DB init, engine logic, and server behavior.
- `docs/superpowers/specs/2026-05-10-middle-school-english-review-mvp-design.md`: approved design spec.
- `docs/superpowers/plans/2026-05-10-middle-school-english-review-mvp.md`: this implementation plan.

## Verification Commands

Use this command for automated tests in the current Windows environment:

```powershell
cmd /c npx jest --runInBand --verbose
```

Use this command to run the app locally:

```powershell
cmd /c npm start
```

---

### Task 1: Add UI Text Regression Tests

**Files:**
- Create: `tests/ui-text.test.js`
- Modify: none

- [ ] **Step 1: Write the failing text-integrity test**

Create `tests/ui-text.test.js` with this exact content:

```js
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');

const filesWithUserFacingText = [
  'middleware/auth.js',
  'routes/auth.js',
  'routes/admin.js',
  'routes/practice.js',
  'routes/stats.js',
  'views/layout.ejs',
  'views/login.ejs',
  'views/register.ejs',
  'views/stats.ejs',
  'views/admin/textbooks.ejs',
  'views/admin/units.ejs',
  'views/admin/items.ejs',
  'views/admin/item-edit.ejs',
  'views/admin/settings.ejs',
  'views/practice/dashboard.ejs',
  'views/practice/exercise.ejs',
  'views/practice/result.ejs',
];

const corruptedFragments = [
  '鈹',
  '鑻',
  '澶',
  '璇',
  '绠',
  '鐧',
  '娉',
  '瀛',
  '鎴',
  '锛?',
  '馃',
  '鉁',
  '鉂',
  '�',
];

const expectedText = {
  'views/layout.ejs': ['英语复习工具', '管理后台', '开始复习', '学习统计', '退出'],
  'views/login.ejs': ['登录', '用户名', '密码', '还没有账号？', '立即注册'],
  'views/register.ejs': ['注册', '用户名', '密码', '已有账号？', '立即登录'],
  'views/practice/dashboard.ejs': ['复习主页', '今日进度', '开始今日复习', '周期复习提醒'],
  'views/practice/exercise.ejs': ['提交答案', '播放发音', '输入你的答案'],
  'views/practice/result.ejs': ['练习结果', '获得积分', '正确率', '已掌握'],
  'views/stats.ejs': ['学习统计', '总积分', '连续打卡', '总正确率'],
  'views/admin/textbooks.ejs': ['课本管理', '添加课本', '系统设置'],
  'views/admin/units.ejs': ['返回课本列表', '添加单元'],
  'views/admin/items.ejs': ['添加条目', '批量导入', '英文', '中文释义'],
  'views/admin/item-edit.ejs': ['编辑条目', '保存', '取消'],
  'views/admin/settings.ejs': ['系统设置', '每日复习配额', '复习周期规则'],
};

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

describe('Simplified Chinese UI text', () => {
  test.each(filesWithUserFacingText)('%s does not contain mojibake fragments', (relativePath) => {
    const content = read(relativePath);
    for (const fragment of corruptedFragments) {
      expect(content).not.toContain(fragment);
    }
  });

  test.each(Object.entries(expectedText))('%s contains expected user-facing copy', (relativePath, strings) => {
    const content = read(relativePath);
    for (const text of strings) {
      expect(content).toContain(text);
    }
  });
});
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```powershell
cmd /c npx jest tests/ui-text.test.js --runInBand --verbose
```

Expected: FAIL. The failure should mention corrupted fragments such as `鑻` or missing expected text such as `英语复习工具`.

- [ ] **Step 3: Commit the failing test**

Run:

```powershell
git add tests/ui-text.test.js
git commit -m "test: add ui text integrity coverage"
```

Expected: commit succeeds with only the new test file.

---

### Task 2: Repair Simplified Chinese Route Copy

**Files:**
- Modify: `middleware/auth.js`
- Modify: `routes/auth.js`
- Modify: `routes/admin.js`
- Modify: `routes/practice.js`
- Modify: `routes/stats.js`
- Test: `tests/ui-text.test.js`
- Test: `tests/server.test.js`

- [ ] **Step 1: Update route and middleware text**

Replace corrupted user-facing strings with Simplified Chinese. Preserve route behavior and helper function names.

Use these exact route copy values:

```js
// middleware/auth.js
'需要管理员权限'

// routes/auth.js
'登录'
'注册'
'用户名和密码不能为空'
'用户名或密码错误'
'用户名必须为 2-20 位字母、数字或下划线'
'密码长度必须为 6-50 个字符'
'用户名已存在'

// routes/admin.js
'课本管理'
'课本名称不能为空'
'单元名称不能为空'
'英文和中文释义不能为空'
`成功导入 ${result.count} 条；${result.errors.length} 条失败：${result.errors.join('；')}`
`成功导入 ${result.count} 条`
'编辑条目'
'系统设置'

// routes/practice.js
'复习主页'
'周复习'
'双周复习'
'月复习'
'今日复习'
'暂无复习内容'
'练习结果'

// routes/stats.js
'学习统计'
```

Also replace corrupted section comments with plain ASCII comments:

```js
// Textbooks
// Units
// Items
// Settings
// Dashboard
// Start exercise
// Submit answers
// Mark item as known
```

- [ ] **Step 2: Update server test expectations for repaired text**

In `tests/server.test.js`, replace these expectations:

```js
expect(res.body).toContain('鐧诲綍');
expect(res.body).toContain('娉ㄥ唽');
```

with:

```js
expect(res.body).toContain('登录');
expect(res.body).toContain('注册');
```

Also replace the suite name string:

```js
describe('server.js - HTTP server', () => {
```

- [ ] **Step 3: Run targeted tests**

Run:

```powershell
cmd /c npx jest tests/ui-text.test.js tests/server.test.js --runInBand --verbose
```

Expected: route-copy related failures should be reduced. Template-copy failures may remain until Task 3.

- [ ] **Step 4: Commit route copy repair**

Run:

```powershell
git add middleware/auth.js routes/auth.js routes/admin.js routes/practice.js routes/stats.js tests/server.test.js
git commit -m "fix: repair route chinese copy"
```

Expected: commit succeeds.

---

### Task 3: Repair EJS Templates And Markup

**Files:**
- Modify: `views/layout.ejs`
- Modify: `views/login.ejs`
- Modify: `views/register.ejs`
- Modify: `views/stats.ejs`
- Modify: `views/admin/textbooks.ejs`
- Modify: `views/admin/units.ejs`
- Modify: `views/admin/items.ejs`
- Modify: `views/admin/item-edit.ejs`
- Modify: `views/admin/settings.ejs`
- Modify: `views/practice/dashboard.ejs`
- Modify: `views/practice/exercise.ejs`
- Modify: `views/practice/result.ejs`
- Test: `tests/ui-text.test.js`
- Test: `tests/server.test.js`

- [ ] **Step 1: Replace the layout with valid Simplified Chinese HTML**

Use this structure in `views/layout.ejs`:

```ejs
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><%= typeof title !== 'undefined' ? title : '英语复习工具' %></title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <nav class="app-nav">
    <div class="nav-brand">
      <a href="/">英语复习工具</a>
    </div>
    <div class="nav-links">
      <% if (user) { %>
        <% if (user.role === 'admin') { %>
          <a href="/admin">管理后台</a>
        <% } else { %>
          <a href="/practice">开始复习</a>
          <a href="/stats">学习统计</a>
        <% } %>
        <span class="nav-user"><%= user.username %></span>
        <a href="/logout">退出</a>
      <% } %>
    </div>
  </nav>
  <main class="page-shell">
    <%- body %>
  </main>
</body>
</html>
```

- [ ] **Step 2: Repair auth templates**

`views/login.ejs` must contain labels `用户名` and `密码`, the heading `登录`, submit button `登录`, and footer `还没有账号？立即注册`.

`views/register.ejs` must contain heading `注册`, username label `用户名（2-20 位字符，字母/数字/下划线）`, password label `密码（6-50 位字符）`, submit button `注册`, and footer `已有账号？立即登录`.

Keep existing form actions:

```ejs
<form method="POST" action="/login">
<form method="POST" action="/register">
```

- [ ] **Step 3: Repair admin templates**

Use these exact visible labels and headings:

```text
课本管理
输入课本名称（如：人教版七年级上册）
添加课本
暂无课本，请创建第一个课本
删除课本将同时删除其下所有单元和条目，确定继续？
系统设置
返回课本列表
添加单元
输入单元名称（如：Unit 1 Hello）
暂无单元，请添加
添加条目
类型
单词
短语
语法
英文
中文释义
词性（可选）
例句（可选）
批量导入
每行一条，格式：英文 | 中文 | 类型 | 词性（可选） | 例句（可选）
编辑
删除
编辑条目
保存
取消
每日复习配额
每日单词数
每日短语数
每日语法数
复习周期规则
添加自定义周期规则
```

Preserve all existing form action URLs and EJS variables.

- [ ] **Step 4: Repair student templates**

Use these exact visible labels and headings:

```text
复习主页
暂无复习内容，请联系管理员添加单词、短语和语法条目。
连续打卡天数
累计积分
今日进度
单词
短语
语法
开始今日复习
周期复习提醒
开始复习
查看学习统计
共
题
第
页
英译中
中译英
听音辨义
连词成句
播放发音
输入你的答案
提交答案
练习结果
获得积分
正确率
全部正确！额外获得
你的答案
正确答案
已掌握
再来一组
返回主页
学习统计
总积分
连续打卡
总正确率
已掌握条目
暂无已掌握条目
返回复习主页
```

Preserve the existing `speak(text)` and `selectWord(el, idx)` JavaScript functions, but remove inline emoji text from labels so the UI remains calm and readable.

- [ ] **Step 5: Run template tests**

Run:

```powershell
cmd /c npx jest tests/ui-text.test.js tests/server.test.js --runInBand --verbose
```

Expected: PASS for both test files.

- [ ] **Step 6: Commit repaired templates**

Run:

```powershell
git add views tests/ui-text.test.js tests/server.test.js
git commit -m "fix: repair ejs chinese templates"
```

Expected: commit succeeds.

---

### Task 4: Improve Student-Friendly Visual Design

**Files:**
- Modify: `public/style.css`
- Modify: `views/practice/dashboard.ejs`
- Modify: `views/practice/exercise.ejs`
- Modify: `views/practice/result.ejs`
- Modify: `views/stats.ejs`
- Modify: `views/admin/*.ejs` only if class names are needed for shared styles
- Test: `tests/ui-text.test.js`

- [ ] **Step 1: Add focused CSS structure**

Replace the current one-note CSS with a low-fatigue design system using these selectors:

```css
:root {
  --bg: #f6f8fb;
  --surface: #ffffff;
  --surface-soft: #eef6f3;
  --text: #25313d;
  --muted: #6b7785;
  --border: #d9e2ec;
  --primary: #2f7dbd;
  --primary-dark: #25669b;
  --success: #2d8a65;
  --danger: #c84c45;
  --warning-bg: #fff6db;
  --radius: 8px;
  --shadow: 0 2px 10px rgba(32, 45, 58, 0.07);
}
```

The stylesheet must include these class groups:

```css
.app-nav
.page-shell
.page-header
.panel
.metric-grid
.metric-card
.progress-list
.progress-row
.primary-action
.exercise-card
.exercise-meta
.choice-option
.answer-input
.word-chip
.sentence-result
.result-card
.result-card.correct
.result-card.wrong
.table-wrap
@media (max-width: 720px)
```

Rules to preserve:

- Cards use `border-radius: 8px` or less.
- Body background is light and neutral.
- Buttons have clear hover states.
- Text does not use viewport-scaled font sizes.
- Mobile layout stacks metric cards and form rows.

- [ ] **Step 2: Remove major inline style blocks from student templates**

In the student templates, replace inline layout styles with the CSS classes from Step 1.

Examples:

```ejs
<div class="metric-grid">
  <section class="metric-card">
    <strong><%= consecutive %></strong>
    <span>连续打卡天数</span>
  </section>
</div>
```

```ejs
<article class="exercise-card">
  <div class="exercise-meta">
    <strong>第 <%= idx + 1 %> 题</strong>
    <span><%= ex.exercise_type === 'en2cn' ? '英译中' : ex.exercise_type === 'cn2en' ? '中译英' : ex.exercise_type === 'listening' ? '听音辨义' : '连词成句' %></span>
  </div>
</article>
```

```ejs
<label class="choice-option">
  <input type="radio" name="answers[<%= idx %>][answer]" value="<%= opt %>" required>
  <span><%= String.fromCharCode(65 + oi) %>. <%= opt %></span>
</label>
```

- [ ] **Step 3: Run UI text tests and full test suite**

Run:

```powershell
cmd /c npx jest --runInBand --verbose
```

Expected: PASS for all test suites.

- [ ] **Step 4: Commit visual design update**

Run:

```powershell
git add public/style.css views/practice views/stats.ejs views/admin
git commit -m "style: improve review ui readability"
```

Expected: commit succeeds.

---

### Task 5: Fix Exercise Generator Distractor Edge Cases

**Files:**
- Modify: `engine/generator.js`
- Modify: `tests/engine.test.js`

- [ ] **Step 1: Add failing tests for small item pools**

Append these tests inside `describe('engine/generator.js', () => { ... })` in `tests/engine.test.js`:

```js
test('multiple choice exercise does not crash when there is only one item', () => {
  const smallDb = new Database(':memory:');
  initDatabase(smallDb);
  const textbookId = queries.createTextbook(smallDb, 'Small Book');
  const unitId = queries.createUnit(smallDb, textbookId, 'Unit 1');
  const itemId = queries.createItem(smallDb, {
    unitId,
    type: 'word',
    english: 'apple',
    chinese: '苹果',
  });
  const item = queries.getItemById(smallDb, itemId);

  const exercise = generator.createExercise(item, 'en2cn', smallDb);

  expect(exercise.options).toEqual(['苹果']);
  expect(exercise.options).toContain('苹果');
  smallDb.close();
});

test('multiple choice options are unique when distractor pool is small', () => {
  const smallDb = new Database(':memory:');
  initDatabase(smallDb);
  const textbookId = queries.createTextbook(smallDb, 'Small Book');
  const unitId = queries.createUnit(smallDb, textbookId, 'Unit 1');
  const items = [
    { unitId, type: 'word', english: 'apple', chinese: '苹果' },
    { unitId, type: 'word', english: 'book', chinese: '书' },
    { unitId, type: 'phrase', english: 'good morning', chinese: '早上好' },
  ];
  for (const item of items) queries.createItem(smallDb, item);
  const target = smallDb.prepare("SELECT * FROM items WHERE english = 'apple'").get();

  const exercise = generator.createExercise(target, 'listening', smallDb);

  expect(new Set(exercise.options).size).toBe(exercise.options.length);
  expect(exercise.options).toContain('苹果');
  expect(exercise.options.length).toBeLessThanOrEqual(4);
  smallDb.close();
});
```

- [ ] **Step 2: Run the new engine tests and verify they fail**

Run:

```powershell
cmd /c npx jest tests/engine.test.js --runInBand --verbose
```

Expected: FAIL before implementation because the current distractor query has fixed placeholders and can crash or duplicate options for small pools.

- [ ] **Step 3: Replace distractor selection with a safe implementation**

In `engine/generator.js`, replace `getDistractors(item, db)` with:

```js
function getDistractors(item, db) {
  const rows = db.prepare(
    `SELECT * FROM items
     WHERE id != ?
     ORDER BY
       CASE WHEN type = ? THEN 0 ELSE 1 END,
       RANDOM()
     LIMIT 12`
  ).all(item.id, item.type);

  const seen = new Set([item.chinese]);
  const distractors = [];
  for (const row of rows) {
    if (!row.chinese || seen.has(row.chinese)) continue;
    seen.add(row.chinese);
    distractors.push(row);
    if (distractors.length === 3) break;
  }
  return distractors;
}
```

This keeps same-type distractors preferred, avoids dynamic SQL placeholder mistakes, and prevents duplicate Chinese choices.

- [ ] **Step 4: Make option generation unique**

In `createExercise`, replace:

```js
options: shuffle([...distractors.map(d => d.chinese), item.chinese]),
```

with:

```js
options: shuffle([...new Set([...distractors.map(d => d.chinese), item.chinese].filter(Boolean))]),
```

Apply this replacement for both `en2cn` and `listening` branches.

- [ ] **Step 5: Run engine and full tests**

Run:

```powershell
cmd /c npx jest tests/engine.test.js --runInBand --verbose
cmd /c npx jest --runInBand --verbose
```

Expected: PASS for engine tests and full test suite.

- [ ] **Step 6: Commit generator fix**

Run:

```powershell
git add engine/generator.js tests/engine.test.js
git commit -m "fix: handle small distractor pools"
```

Expected: commit succeeds.

---

### Task 6: Add MVP Operation Notes

**Files:**
- Create: `docs/mvp-test-guide.md`
- Modify: `README.md` if it exists; otherwise do not create a README in this task

- [ ] **Step 1: Write the manual verification guide**

Create `docs/mvp-test-guide.md` with this exact structure:

```md
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

## Android Phone LAN Test

1. Keep the computer and Android phone on the same Wi-Fi network.
2. Find the computer IPv4 address with:

```powershell
ipconfig
```

3. Start the app with:

```powershell
cmd /c npm start
```

4. On the phone browser, open:

```text
http://<computer-ip>:3000
```

5. Test login, review, answer submission, result feedback, and statistics.

If the phone cannot connect, check Windows firewall and confirm the app is listening on port `3000`.
```

- [ ] **Step 2: Run tests after docs-only change**

Run:

```powershell
cmd /c npx jest --runInBand --verbose
```

Expected: PASS.

- [ ] **Step 3: Commit operation notes**

Run:

```powershell
git add docs/mvp-test-guide.md
git commit -m "docs: add mvp test guide"
```

Expected: commit succeeds.

---

### Task 7: Final Verification Checkpoint

**Files:**
- Modify: none unless verification exposes a failure

- [ ] **Step 1: Check Git status**

Run:

```powershell
git status --short
```

Expected: no output.

- [ ] **Step 2: Run full automated test suite**

Run:

```powershell
cmd /c npx jest --runInBand --verbose
```

Expected:

```text
Test Suites: 4 passed, 4 total
```

The exact test count may be higher than the current 29 tests because this plan adds UI text and generator edge-case coverage.

- [ ] **Step 3: Run a local server smoke check**

Run:

```powershell
cmd /c npm start
```

Expected console output:

```text
English Review Tool running at http://localhost:3000
```

Open `http://localhost:3000/login` in a browser, confirm the login page displays readable Simplified Chinese, then stop the server with `Ctrl+C`.

- [ ] **Step 4: Commit any verification-only documentation updates**

If no files changed, skip this step. If `docs/mvp-test-guide.md` needed an update from the smoke check, run:

```powershell
git add docs/mvp-test-guide.md
git commit -m "docs: clarify mvp verification"
```

Expected: commit succeeds only if documentation changed.

---

## Self-Review Notes

- Spec coverage: the plan covers Git/doc hygiene, Chinese text repair, EJS repair, student-friendly visual design, generator edge cases, test coverage, and manual Android verification notes.
- Scope control: the plan does not add class management, cloud sync, AI generation, payment, public deployment, or mobile packaging.
- Test strategy: Tasks use failing tests before repairs for UI text and generator edge cases, then run targeted and full suites.
- Execution style: tasks are small enough for checkpointed execution and frequent commits.
