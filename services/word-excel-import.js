const ExcelJS = require('exceljs');
const queries = require('../db/queries');

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
  if (value && typeof value === 'object') {
    if (Array.isArray(value.richText)) {
      return value.richText.map(part => part.text ?? '').join('').trim();
    }
    if (value.text) return String(value.text).trim();
    if (value.result !== undefined) return cleanCell(value.result);
    if (value instanceof Date) return value.toISOString().trim();
  }
  return String(value ?? '').trim();
}

async function readWorkbookRows(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error('Excel 文件中没有可导入的数据');
  }

  const columnCount = worksheet.columnCount;
  const rows = [];
  for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber++) {
    const worksheetRow = worksheet.getRow(rowNumber);
    const row = [];
    for (let columnNumber = 1; columnNumber <= columnCount; columnNumber++) {
      row.push(worksheetRow.getCell(columnNumber).value ?? '');
    }
    rows.push(row);
  }

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

async function parseWordImportWorkbook(buffer) {
  const workbookRows = await readWorkbookRows(buffer);
  const headerIndex = buildHeaderIndex(workbookRows[0]);
  requireHeaders(headerIndex);

  const knownHeaders = new Set(WORD_IMPORT_HEADERS);
  const unknownHeaders = [...headerIndex.keys()].filter(header => !knownHeaders.has(header));
  const rows = [];

  for (let i = 1; i < workbookRows.length; i++) {
    const row = workbookRows[i];
    if (isEmptyDataRow(row)) continue;

    const inflections = {};
    for (const [header, key] of Object.entries(INFLECTION_HEADER_MAP)) {
      const value = getCell(row, headerIndex, header);
      if (value) inflections[key] = value;
    }

    rows.push({
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

  return { rows, unknownHeaders };
}

async function buildWordImportTemplateWorkbook() {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Words');
  worksheet.addRows([
    WORD_IMPORT_HEADERS,
    ['study', '学习', 'v.', 'I study English every day.', 'study', 's', '动词原形', '', 'studies', 'studied', 'studied', 'studying', '', '', '', '', ''],
  ]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
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
      const message = validateImportRow(row);
      if (message) {
        result.failedRows.push({ rowNumber: row.rowNumber, message });
        continue;
      }

      const itemId = queries.createItem(db, {
        unitId,
        type: 'word',
        english: row.english,
        chinese: row.chinese,
        pos: row.pos,
        example: row.example,
      });
      queries.saveWordQuestionDetails(db, itemId, {
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
