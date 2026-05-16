const ExcelJS = require('exceljs');
const Database = require('better-sqlite3');
const { initDatabase } = require('../db/init');
const queries = require('../db/queries');
const {
  WORD_IMPORT_HEADERS,
  buildWordImportTemplateWorkbook,
  importWordRows,
  parseWordImportWorkbook,
} = require('../services/word-excel-import');

async function workbookBuffer(rows) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Words');
  worksheet.addRows(rows);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function setupDb() {
  const db = new Database(':memory:');
  initDatabase(db);
  const textbookId = queries.createTextbook(db, 'Excel Book');
  const unitId = queries.createUnit(db, textbookId, 'Unit 1');
  return { db, unitId };
}

describe('word excel import service', () => {
  test('parses valid workbook rows by fixed Chinese headers', async () => {
    const buffer = await workbookBuffer([
      WORD_IMPORT_HEADERS,
      ['study', '学习', 'v.', 'I study English.', 'study', 's', '动词原形', '', 'studies', 'studied', 'studied', 'studying', '', '', '', '', ''],
    ]);

    const result = await parseWordImportWorkbook(buffer);

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

  test('fails when required headers are missing', async () => {
    const buffer = await workbookBuffer([
      ['英文', '词性'],
      ['study', 'v.'],
    ]);

    await expect(parseWordImportWorkbook(buffer)).rejects.toThrow('缺少必需列：中文');
  });

  test('fails when the English required header is missing', async () => {
    const buffer = await workbookBuffer([
      ['中文', '词性'],
      ['学习', 'v.'],
    ]);

    await expect(parseWordImportWorkbook(buffer)).rejects.toThrow('缺少必需列：英文');
  });

  test('reports unknown headers while parsing known columns', async () => {
    const buffer = await workbookBuffer([
      ['英文', '中文', '备注'],
      ['apple', '苹果', 'ignore me'],
    ]);

    const result = await parseWordImportWorkbook(buffer);

    expect(result.rows[0].english).toBe('apple');
    expect(result.rows[0].chinese).toBe('苹果');
    expect(result.unknownHeaders).toEqual(['备注']);
  });

  test('skips empty workbook rows', async () => {
    const buffer = await workbookBuffer([
      WORD_IMPORT_HEADERS,
      ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['apple', '苹果', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ]);

    const result = await parseWordImportWorkbook(buffer);

    expect(result.rows).toEqual([expect.objectContaining({
      rowNumber: 3,
      english: 'apple',
      chinese: '苹果',
    })]);
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

  test('builds a template workbook with the standard headers', async () => {
    const buffer = await buildWordImportTemplateWorkbook();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const worksheet = workbook.worksheets[0];
    const rows = [worksheet.getRow(1).values.slice(1)];

    expect(rows[0]).toEqual(WORD_IMPORT_HEADERS);
  });
});
