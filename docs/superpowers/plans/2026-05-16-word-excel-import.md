# Word Excel Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add admin upload support for fixed-header `.xlsx` word imports that create both base word items and word-specific question details.

**Architecture:** Keep Excel parsing and import rules in a dedicated service, then call that service from small admin routes. Use `xlsx` for workbook parsing/template generation and `multer` memory storage for upload handling; persist rows through existing `queries.createItem` and `queries.saveWordQuestionDetails` so the imported data immediately powers existing word question types.

**Tech Stack:** Node.js, Express, EJS, SQLite via better-sqlite3, `xlsx`, `multer`, Jest.

---

## File Structure

- Modify `package.json` and `package-lock.json`: add runtime dependencies `xlsx` and `multer`.
- Create `services/word-excel-import.js`: parse workbook buffers, build template buffers, validate/import rows.
- Create `tests/word-excel-import.test.js`: unit tests for parser, template, validation, and DB import behavior.
- Modify `routes/admin.js`: add upload middleware, template route, upload route, and shared rendering for the unit item page.
- Modify `views/admin/items.ejs`: add the `单词 Excel 导入` form and template download link near existing text batch import.
- Modify `tests/single-point-admin-routes.test.js`: add multipart upload and template download route tests.
- Modify `tests/ui-text.test.js`: include new visible labels for the import UI.

## Implementation Notes

- Do not replace the existing text batch import.
- Do not add a new table.
- Do not implement phrase or grammar Excel import in this phase.
- Unknown Excel columns are ignored but reported in the result.
- Missing required headers fail the whole parse before DB writes.
- Invalid rows are skipped and reported; valid rows still import.
- Duplicate words are allowed in this phase.
- Use memory upload only; do not write uploaded `.xlsx` files to disk.

---

### Task 1: Add Excel Import Dependencies

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install dependencies**

Run:

```bash
cmd /c npm install xlsx multer
```

Expected: `package.json` gains `xlsx` and `multer`; `package-lock.json` updates.

- [ ] **Step 2: Verify dependencies resolve**

Run:

```bash
node -e "require('xlsx'); require('multer'); console.log('excel deps ok')"
```

Expected:

```text
excel deps ok
```

- [ ] **Step 3: Commit dependency update**

Run:

```bash
git add package.json package-lock.json
git commit -m "chore: add excel import dependencies"
```

---

### Task 2: Word Excel Import Service

**Files:**
- Create: `services/word-excel-import.js`
- Create: `tests/word-excel-import.test.js`

- [ ] **Step 1: Write failing service tests**

Create `tests/word-excel-import.test.js`:

```js
const XLSX = require('xlsx');
const Database = require('better-sqlite3');
const { initDatabase } = require('../db/init');
const queries = require('../db/queries');
const {
  WORD_IMPORT_HEADERS,
  buildWordImportTemplateWorkbook,
  importWordRows,
  parseWordImportWorkbook,
} = require('../services/word-excel-import');

function workbookBuffer(rows) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Words');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

function setupDb() {
  const db = new Database(':memory:');
  initDatabase(db);
  const textbookId = queries.createTextbook(db, 'Excel Book');
  const unitId = queries.createUnit(db, textbookId, 'Unit 1');
  return { db, unitId };
}

describe('word excel import service', () => {
  test('parses valid workbook rows by fixed Chinese headers', () => {
    const buffer = workbookBuffer([
      WORD_IMPORT_HEADERS,
      ['study', '学习', 'v.', 'I study English.', 'study', 's', '动词原形', '', 'studies', 'studied', 'studied', 'studying', '', '', '', '', ''],
    ]);

    const result = parseWordImportWorkbook(buffer);

    expect(result.rows).toEqual([{
      rowNumber: 2,
      english: 'study',
      chinese: '学习',
      pos: 'v.',
      example: 'I study English.',
      baseForm: 'study',
      firstLetterHint: 's',
      usageNote: '动词原形',
      inflections: {
        third_person_singular: 'studies',
        past_tense: 'studied',
        past_participle: 'studied',
        present_participle: 'studying',
      },
    }]);
    expect(result.unknownHeaders).toEqual([]);
  });

  test('fails when required headers are missing', () => {
    const buffer = workbookBuffer([
      ['英文', '词性'],
      ['study', 'v.'],
    ]);

    expect(() => parseWordImportWorkbook(buffer)).toThrow('缺少必需列：中文');
  });

  test('reports unknown headers while parsing known columns', () => {
    const buffer = workbookBuffer([
      ['英文', '中文', '备注'],
      ['apple', '苹果', 'ignore me'],
    ]);

    const result = parseWordImportWorkbook(buffer);

    expect(result.rows[0].english).toBe('apple');
    expect(result.rows[0].chinese).toBe('苹果');
    expect(result.unknownHeaders).toEqual(['备注']);
  });

  test('imports valid rows and skips invalid rows with row errors', () => {
    const { db, unitId } = setupDb();
    const rows = [
      {
        rowNumber: 2,
        english: 'study',
        chinese: '学习',
        pos: 'v.',
        example: 'I study English.',
        baseForm: 'study',
        firstLetterHint: 's',
        usageNote: '动词原形',
        inflections: { past_tense: 'studied', present_participle: 'studying' },
      },
      {
        rowNumber: 3,
        english: '',
        chinese: '苹果',
        pos: '',
        example: '',
        baseForm: '',
        firstLetterHint: '',
        usageNote: '',
        inflections: {},
      },
    ];

    const result = importWordRows(db, unitId, rows);
    const items = queries.getItemsByUnit(db, unitId);
    const detail = queries.getWordQuestionDetails(db, items[0].id);

    expect(result.importedCount).toBe(1);
    expect(result.failedRows).toEqual([{ rowNumber: 3, message: '英文不能为空' }]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      type: 'word',
      english: 'study',
      chinese: '学习',
      pos: 'v.',
      example: 'I study English.',
    });
    expect(detail.base_form).toBe('study');
    expect(detail.first_letter_hint).toBe('s');
    expect(detail.usage_note).toBe('动词原形');
    expect(detail.inflections.past_tense).toBe('studied');
    expect(detail.inflections.present_participle).toBe('studying');
    db.close();
  });

  test('builds a template workbook with the standard headers', () => {
    const buffer = buildWordImportTemplateWorkbook();
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });

    expect(rows[0]).toEqual(WORD_IMPORT_HEADERS);
  });
});
```

- [ ] **Step 2: Run service tests and verify failure**

Run:

```bash
cmd /c npx jest tests/word-excel-import.test.js --verbose --runInBand
```

Expected: FAIL because `services/word-excel-import.js` does not exist.

- [ ] **Step 3: Implement the import service**

Create `services/word-excel-import.js`:

```js
const XLSX = require('xlsx');

const WORD_IMPORT_HEADERS = [
  '英文',
  '中文',
  '词性',
  '例句',
  '原形',
  '首字母提示',
  '用法说明',
  '复数',
  '第三人称单数',
  '过去式',
  '过去分词',
  '现在分词',
  '比较级',
  '最高级',
  '副词形式',
  '形容词形式',
  '名词形式',
];

const REQUIRED_HEADERS = ['英文', '中文'];

const INFLECTION_HEADER_MAP = {
  复数: 'plural',
  第三人称单数: 'third_person_singular',
  过去式: 'past_tense',
  过去分词: 'past_participle',
  现在分词: 'present_participle',
  比较级: 'comparative',
  最高级: 'superlative',
  副词形式: 'adverb',
  形容词形式: 'adjective',
  名词形式: 'noun',
};

function cleanCell(value) {
  return String(value ?? '').trim();
}

function readWorkbookRows(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('Excel 文件中没有可导入的数据');
  }

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], {
    header: 1,
    defval: '',
    blankrows: false,
  });
  if (rows.length === 0) {
    throw new Error('Excel 文件中没有可导入的数据');
  }
  return rows;
}

function buildHeaderIndex(headerRow) {
  const index = new Map();
  headerRow.forEach((header, position) => {
    const normalized = cleanCell(header);
    if (normalized && !index.has(normalized)) {
      index.set(normalized, position);
    }
  });
  return index;
}

function requireHeaders(headerIndex) {
  for (const header of REQUIRED_HEADERS) {
    if (!headerIndex.has(header)) {
      throw new Error(`缺少必需列：${header}`);
    }
  }
}

function getCell(row, headerIndex, header) {
  if (!headerIndex.has(header)) return '';
  return cleanCell(row[headerIndex.get(header)]);
}

function isEmptyDataRow(row) {
  return row.every(value => cleanCell(value) === '');
}

function parseWordImportWorkbook(buffer) {
  const rows = readWorkbookRows(buffer);
  const headerIndex = buildHeaderIndex(rows[0]);
  requireHeaders(headerIndex);

  const knownHeaders = new Set(WORD_IMPORT_HEADERS);
  const unknownHeaders = [...headerIndex.keys()].filter(header => !knownHeaders.has(header));
  const parsedRows = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (isEmptyDataRow(row)) continue;

    const inflections = {};
    for (const [header, key] of Object.entries(INFLECTION_HEADER_MAP)) {
      const value = getCell(row, headerIndex, header);
      if (value) inflections[key] = value;
    }

    parsedRows.push({
      rowNumber: i + 1,
      english: getCell(row, headerIndex, '英文'),
      chinese: getCell(row, headerIndex, '中文'),
      pos: getCell(row, headerIndex, '词性'),
      example: getCell(row, headerIndex, '例句'),
      baseForm: getCell(row, headerIndex, '原形'),
      firstLetterHint: getCell(row, headerIndex, '首字母提示'),
      usageNote: getCell(row, headerIndex, '用法说明'),
      inflections,
    });
  }

  return { rows: parsedRows, unknownHeaders };
}

function buildWordImportTemplateWorkbook() {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    WORD_IMPORT_HEADERS,
    ['study', '学习', 'v.', 'I study English every day.', 'study', 's', '动词原形', '', 'studies', 'studied', 'studied', 'studying', '', '', '', '', ''],
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Words');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

function validateImportRow(row) {
  if (!row.english) return '英文不能为空';
  if (!row.chinese) return '中文不能为空';
  return null;
}

function importWordRows(db, unitId, rows) {
  const result = { importedCount: 0, failedRows: [] };
  const tx = db.transaction(() => {
    for (const row of rows) {
      const error = validateImportRow(row);
      if (error) {
        result.failedRows.push({ rowNumber: row.rowNumber, message: error });
        continue;
      }

      const itemId = require('../db/queries').createItem(db, {
        unitId,
        type: 'word',
        english: row.english,
        chinese: row.chinese,
        pos: row.pos,
        example: row.example,
      });
      require('../db/queries').saveWordQuestionDetails(db, itemId, {
        baseForm: row.baseForm,
        firstLetterHint: row.firstLetterHint,
        usageNote: row.usageNote,
        inflections: row.inflections,
      });
      result.importedCount++;
    }
  });
  tx();
  return result;
}

module.exports = {
  WORD_IMPORT_HEADERS,
  buildWordImportTemplateWorkbook,
  importWordRows,
  parseWordImportWorkbook,
};
```

- [ ] **Step 4: Run service tests and verify pass**

Run:

```bash
cmd /c npx jest tests/word-excel-import.test.js --verbose --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit service**

Run:

```bash
git add services/word-excel-import.js tests/word-excel-import.test.js
git commit -m "feat: add word excel import service"
```

---

### Task 3: Admin Routes For Template And Upload

**Files:**
- Modify: `routes/admin.js`
- Modify: `tests/single-point-admin-routes.test.js`

- [ ] **Step 1: Add failing route tests**

Append helpers and tests to `tests/single-point-admin-routes.test.js`. Add this helper near `requestApp`:

```js
function requestMultipart(app, method, urlPath, { fieldName, filename, contentType, buffer }) {
  return new Promise((resolve, reject) => {
    const boundary = '----codexwordexceltest';
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\n`),
      Buffer.from(`Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n`),
      Buffer.from(`Content-Type: ${contentType}\r\n\r\n`),
      buffer,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const server = app.listen(0, () => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: server.address().port,
        method,
        path: urlPath,
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
        },
      }, (res) => {
        let text = '';
        res.on('data', chunk => { text += chunk; });
        res.on('end', () => {
          server.close(() => resolve({ statusCode: res.statusCode, headers: res.headers, text }));
        });
      });

      req.on('error', err => server.close(() => reject(err)));
      req.write(body);
      req.end();
    });
  });
}
```

Add these imports:

```js
const XLSX = require('xlsx');
const { WORD_IMPORT_HEADERS } = require('../services/word-excel-import');
```

Add this helper:

```js
function wordWorkbookBuffer(rows) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Words');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}
```

Append tests:

```js
  test('admin can download the word excel import template', async () => {
    const app = buildApp({ id: 1, username: 'admin', role: 'admin' });
    const { unitId } = seedItem(app.locals.db, 'word');

    const res = await requestApp(app, 'GET', `/admin/units/${unitId}/word-import-template`);

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toContain('word-import-template.xlsx');
    expect(res.headers['content-type']).toContain('spreadsheet');
    app.cleanup();
  });

  test('admin can upload a word excel file and import word details', async () => {
    const app = buildApp({ id: 1, username: 'admin', role: 'admin' });
    const { unitId } = seedItem(app.locals.db, 'word');
    const buffer = wordWorkbookBuffer([
      WORD_IMPORT_HEADERS,
      ['study', '学习', 'v.', 'I study English.', 'study', 's', '动词原形', '', 'studies', 'studied', 'studied', 'studying', '', '', '', '', ''],
    ]);

    const res = await requestMultipart(app, 'POST', `/admin/units/${unitId}/word-import`, {
      fieldName: 'word_excel',
      filename: 'words.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer,
    });
    const items = queries.getItemsByUnit(app.locals.db, unitId);
    const imported = items.find(item => item.english === 'study');
    const detail = queries.getWordQuestionDetails(app.locals.db, imported.id);

    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('成功导入 1 条');
    expect(imported).toMatchObject({ type: 'word', chinese: '学习', pos: 'v.' });
    expect(detail.base_form).toBe('study');
    expect(detail.inflections.past_tense).toBe('studied');
    app.cleanup();
  });

  test('word excel upload reports missing file', async () => {
    const app = buildApp({ id: 1, username: 'admin', role: 'admin' });
    const { unitId } = seedItem(app.locals.db, 'word');

    const res = await requestMultipart(app, 'POST', `/admin/units/${unitId}/word-import`, {
      fieldName: 'word_excel',
      filename: '',
      contentType: 'application/octet-stream',
      buffer: Buffer.alloc(0),
    });

    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('请选择要导入的 Excel 文件');
    app.cleanup();
  });
```

- [ ] **Step 2: Run route tests and verify failure**

Run:

```bash
cmd /c npx jest tests/single-point-admin-routes.test.js --verbose --runInBand
```

Expected: FAIL because the template and upload routes do not exist.

- [ ] **Step 3: Implement routes**

In `routes/admin.js`, add imports:

```js
const multer = require('multer');
const {
  buildWordImportTemplateWorkbook,
  importWordRows,
  parseWordImportWorkbook,
} = require('../services/word-excel-import');
```

Add upload middleware near the top:

```js
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});
```

Add a shared renderer after `renderWithLayout`:

```js
function renderUnitItems(res, db, unit, { error = null, success = null } = {}) {
  const textbook = db.prepare('SELECT * FROM textbooks WHERE id = ?').get(unit.textbook_id);
  const items = queries.getItemsByUnit(db, unit.id);
  renderWithLayout(res, 'admin/items', { textbook, unit, items, error, success }, unit.name);
}
```

Add these routes before `router.get('/admin/items/:id/edit', ...)`:

```js
router.get('/admin/units/:id/word-import-template', (req, res) => {
  const db = req.app.locals.db;
  const unit = queries.getUnitById(db, req.params.id);
  if (!unit) return res.redirect('/admin/textbooks');

  const buffer = buildWordImportTemplateWorkbook();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="word-import-template.xlsx"');
  res.send(buffer);
});

router.post('/admin/units/:id/word-import', upload.single('word_excel'), (req, res) => {
  const db = req.app.locals.db;
  const unit = queries.getUnitById(db, req.params.id);
  if (!unit) return res.redirect('/admin/textbooks');

  if (!req.file || req.file.size === 0) {
    return renderUnitItems(res, db, unit, { error: '请选择要导入的 Excel 文件' });
  }
  if (!req.file.originalname.toLowerCase().endsWith('.xlsx')) {
    return renderUnitItems(res, db, unit, { error: '仅支持 .xlsx 文件' });
  }

  try {
    const parsed = parseWordImportWorkbook(req.file.buffer);
    const result = importWordRows(db, unit.id, parsed.rows);
    const parts = [`成功导入 ${result.importedCount} 条`];
    if (result.failedRows.length > 0) {
      parts.push(`失败 ${result.failedRows.length} 条：${result.failedRows.map(row => `第 ${row.rowNumber} 行：${row.message}`).join('；')}`);
    }
    if (parsed.unknownHeaders.length > 0) {
      parts.push(`忽略未知列：${parsed.unknownHeaders.join('、')}`);
    }
    return renderUnitItems(res, db, unit, { success: parts.join('，') });
  } catch (err) {
    return renderUnitItems(res, db, unit, { error: err.message });
  }
});
```

- [ ] **Step 4: Run route tests and verify pass**

Run:

```bash
cmd /c npx jest tests/single-point-admin-routes.test.js --verbose --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit routes**

Run:

```bash
git add routes/admin.js tests/single-point-admin-routes.test.js
git commit -m "feat: add word excel admin routes"
```

---

### Task 4: Admin UI Entry Point And UI Text Coverage

**Files:**
- Modify: `views/admin/items.ejs`
- Modify: `tests/ui-text.test.js`
- Modify: `tests/single-point-admin-routes.test.js`

- [ ] **Step 1: Add failing UI assertions**

In `tests/single-point-admin-routes.test.js`, add a test that opens the unit item page:

```js
  test('admin item page exposes word excel import controls', async () => {
    const app = buildApp({ id: 1, username: 'admin', role: 'admin' });
    const { unitId } = seedItem(app.locals.db, 'word');

    const res = await requestApp(app, 'GET', `/admin/units/${unitId}/items`);

    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('单词 Excel 导入');
    expect(res.text).toContain('导入单词 Excel');
    expect(res.text).toContain('下载单词导入模板');
    expect(res.text).toContain(`action="/admin/units/${unitId}/word-import"`);
    expect(res.text).toContain(`href="/admin/units/${unitId}/word-import-template"`);
    app.cleanup();
  });
```

In `tests/ui-text.test.js`, update the `views/admin/items.ejs` expected text entry to include:

```js
'单词 Excel 导入', '导入单词 Excel', '下载单词导入模板'
```

- [ ] **Step 2: Run UI-related tests and verify failure**

Run:

```bash
cmd /c npx jest tests/single-point-admin-routes.test.js tests/ui-text.test.js --verbose --runInBand
```

Expected: FAIL because the page does not yet render the Excel import controls.

- [ ] **Step 3: Add the UI controls**

In `views/admin/items.ejs`, add this section after the existing text batch import `</details>` block:

```ejs
<details class="mb-2" style="background:#fff;padding:1rem;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
  <summary style="cursor:pointer;font-weight:bold;">单词 Excel 导入</summary>
  <p class="text-muted mt-1">请使用固定列标题的 .xlsx 文件导入单词及其题型扩展信息。</p>
  <p class="mt-1">
    <a href="/admin/units/<%= unit.id %>/word-import-template" class="btn">下载单词导入模板</a>
  </p>
  <form method="POST" action="/admin/units/<%= unit.id %>/word-import" enctype="multipart/form-data" style="margin-top:0.5rem;">
    <div class="form-group">
      <label for="word-excel">选择 .xlsx 文件</label>
      <input type="file" id="word-excel" name="word_excel" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required>
    </div>
    <button type="submit" class="btn btn-primary">导入单词 Excel</button>
  </form>
</details>
```

- [ ] **Step 4: Run UI-related tests and verify pass**

Run:

```bash
cmd /c npx jest tests/single-point-admin-routes.test.js tests/ui-text.test.js --verbose --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit UI**

Run:

```bash
git add views/admin/items.ejs tests/ui-text.test.js tests/single-point-admin-routes.test.js
git commit -m "feat: expose word excel import controls"
```

---

### Task 5: Verification And Regression

**Files:**
- No new source files unless tests expose a real bug.

- [ ] **Step 1: Run focused tests**

Run:

```bash
cmd /c npx jest tests/word-excel-import.test.js tests/single-point-admin-routes.test.js tests/ui-text.test.js --verbose --runInBand
```

Expected: PASS.

- [ ] **Step 2: Run full suite**

Run:

```bash
cmd /c npx jest --verbose --testPathIgnorePatterns=.worktrees --runInBand
```

Expected: PASS.

- [ ] **Step 3: Manually inspect final git diff**

Run:

```bash
git diff --stat HEAD~4..HEAD
git status --short --branch
```

Expected:

- Feature commits only.
- No unstaged changes except pre-existing untracked `.claude/` and `docs/new_vison_guide.md`.

---

## Final Review Checklist

- [ ] `.xlsx` template download works for an existing unit.
- [ ] `.xlsx` upload creates `items` and `word_question_details`.
- [ ] Blank optional inflection values are omitted from `inflections_json`.
- [ ] Missing required headers fail clearly.
- [ ] Invalid rows are skipped while valid rows import.
- [ ] Existing text batch import remains unchanged.
- [ ] Non-admin access still uses existing admin route protection.
- [ ] Full Jest suite passes.
