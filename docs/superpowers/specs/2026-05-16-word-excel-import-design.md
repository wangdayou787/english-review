# Word Excel Import Design

Date: 2026-05-16

## Purpose

This design defines a focused MVP 2.0 admin feature: importing word knowledge points from a fixed-header Excel file.

The goal is to let an admin prepare word data in a spreadsheet and import all fields needed by the current word practice system in one operation. This avoids manually creating each word and then opening the edit page to fill word-specific question details.

## Confirmed Scope

This sub-project includes:

- A standard Excel template for word imports.
- Uploading a `.xlsx` file from a unit's admin item page.
- Parsing rows by fixed Chinese column headers.
- Creating `items` rows with `type = 'word'`.
- Creating matching `word_question_details` rows.
- Row-level validation and import result feedback.
- Tests for parsing, route behavior, and key UI text.

This sub-project does not include:

- Phrase Excel import.
- Grammar Excel import.
- Reading, cloze, or passage import.
- Updating existing words in place.
- Duplicate resolution workflows.
- A visual spreadsheet editor inside the app.
- Using Excel as the system of record after import.

## Excel Template

The first row is the header row. The importer recognizes these exact column titles:

```text
英文
中文
词性
例句
原形
首字母提示
用法说明
复数
第三人称单数
过去式
过去分词
现在分词
比较级
最高级
副词形式
形容词形式
名词形式
```

Required columns:

- `英文`
- `中文`

Recommended columns:

- `词性`
- `例句`
- `原形`
- `首字母提示`
- `用法说明`

Optional inflection columns:

- `复数`
- `第三人称单数`
- `过去式`
- `过去分词`
- `现在分词`
- `比较级`
- `最高级`
- `副词形式`
- `形容词形式`
- `名词形式`

Unknown columns should be ignored, but the import result should report that unknown headers were skipped.

## Data Mapping

Each valid row creates one `items` record:

- `unit_id`: current unit
- `type`: `word`
- `english`: `英文`
- `chinese`: `中文`
- `pos`: `词性`
- `example`: `例句`

Each valid row also creates one `word_question_details` record:

- `base_form`: `原形`
- `first_letter_hint`: `首字母提示`
- `usage_note`: `用法说明`
- `inflections_json.plural`: `复数`
- `inflections_json.third_person_singular`: `第三人称单数`
- `inflections_json.past_tense`: `过去式`
- `inflections_json.past_participle`: `过去分词`
- `inflections_json.present_participle`: `现在分词`
- `inflections_json.comparative`: `比较级`
- `inflections_json.superlative`: `最高级`
- `inflections_json.adverb`: `副词形式`
- `inflections_json.adjective`: `形容词形式`
- `inflections_json.noun`: `名词形式`

Blank optional values should be normalized the same way the edit form currently normalizes them. Blank inflection values should not be stored in `inflections_json`.

## Admin Flow

On the unit item page, near the current text batch import area, add a new section:

- `单词 Excel 导入`
- file input accepting `.xlsx`
- submit button `导入单词 Excel`
- optional link `下载单词导入模板`

The upload route should be:

```text
POST /admin/units/:id/word-import
```

The template download route should be:

```text
GET /admin/units/:id/word-import-template
```

After import, redirect or render the unit item page with a success/error summary:

```text
成功导入 35 条，失败 2 条。
第 8 行：英文不能为空。
第 19 行：中文不能为空。
忽略未知列：备注。
```

## Validation

File validation:

- Missing file: show `请选择要导入的 Excel 文件`
- Unsupported extension: show `仅支持 .xlsx 文件`
- Empty workbook or missing first sheet: show `Excel 文件中没有可导入的数据`

Header validation:

- Missing `英文`: fail the whole import with `缺少必需列：英文`
- Missing `中文`: fail the whole import with `缺少必需列：中文`

Row validation:

- Empty row: skip without counting as failure.
- Missing `英文`: count row as failed.
- Missing `中文`: count row as failed.
- Valid row: insert item and word details.

Duplicate handling for this phase:

- Do not check duplicates across the unit.
- If the spreadsheet contains duplicate words, import both rows.
- A later phase can add duplicate preview and merge behavior.

## Implementation Notes

Use a dedicated parsing service so route code stays small:

```text
services/word-excel-import.js
```

The service should expose pure functions where practical:

- `parseWordImportWorkbook(buffer)`
- `buildWordImportTemplateWorkbook()`
- `importWordRows(db, unitId, rows)`

The route can use `multer` or another minimal upload middleware. If adding a dependency, keep it limited to upload parsing. Excel parsing should use a stable Node library such as `xlsx`.

Import should run in a SQLite transaction. If a row fails validation before insertion, skip that row and continue. If database insertion fails unexpectedly, fail the import cleanly and show an error message.

## Testing

Add tests for:

- Parsing a valid workbook into normalized word rows.
- Rejecting a workbook missing required headers.
- Ignoring unknown columns while reporting them.
- Importing valid rows into `items` and `word_question_details`.
- Skipping invalid rows and reporting row-specific errors.
- Admin can upload a valid `.xlsx` file and see success feedback.
- Admin can download the template.
- Non-admin users cannot access upload or template routes.
- UI text coverage for `单词 Excel 导入`, `导入单词 Excel`, and `下载单词导入模板`.

## Acceptance Criteria

- Admin can import a fixed-header `.xlsx` file for one unit.
- Imported words are immediately visible in that unit's item list.
- Imported word details power existing spelling-fill and form-fill question types.
- Invalid rows do not block valid rows.
- Missing required headers fail clearly.
- Existing text batch import remains unchanged.
- Full Jest suite passes.
