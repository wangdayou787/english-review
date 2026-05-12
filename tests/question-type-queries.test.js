const Database = require('better-sqlite3');
const { initDatabase } = require('../db/init');
const queries = require('../db/queries');

let db;

beforeEach(() => {
  db = new Database(':memory:');
  initDatabase(db);
});

afterEach(() => db.close());

describe('question type query helpers', () => {
  test('getQuestionTypeGroups returns catalog rows grouped by category label', () => {
    const groups = queries.getQuestionTypeGroups(db);
    expect(groups.map(group => group.label)).toEqual([
      '单词词汇类', '短语固定搭配类', '语法专项类', '句子句型类', '完形填空类', '阅读理解类',
    ]);
    const vocabulary = groups.find(group => group.category === 'vocabulary');
    expect(vocabulary.types.map(type => type.code)).toContain('vocab_en_cn_choice');
    expect(vocabulary.types[0]).toHaveProperty('enabled');
    expect(vocabulary.types[0]).toHaveProperty('display_options');
  });

  test('updateQuestionTypeSettings persists enabled state, weight, copy, and display options', () => {
    queries.updateQuestionTypeSettings(db, [{
      code: 'vocab_en_cn_choice',
      enabled: false,
      weight: 7,
      instructionText: '选择最准确的释义。',
      primaryActionText: '提交本题',
      hintText: '先排除明显错误项。',
      displayOptions: { showExample: true, showPartOfSpeech: true, showChineseMeaning: false, showFirstLetterHint: false },
    }]);
    const row = db.prepare('SELECT * FROM question_type_settings WHERE question_type_code = ?').get('vocab_en_cn_choice');
    expect(row.enabled).toBe(0);
    expect(row.weight).toBe(7);
    expect(row.instruction_text).toBe('选择最准确的释义。');
    expect(row.primary_action_text).toBe('提交本题');
    expect(row.hint_text).toBe('先排除明显错误项。');
    expect(JSON.parse(row.display_options).showExample).toBe(true);
  });

  test('getAvailableQuestionTypesForItemType excludes planned and disabled types', () => {
    queries.updateQuestionTypeSettings(db, [{
      code: 'vocab_en_cn_choice',
      enabled: false,
      weight: 30,
      instructionText: '选择正确答案。',
      primaryActionText: '提交答案',
      hintText: '注意词义和语境。',
      displayOptions: {},
    }]);
    const wordTypes = queries.getAvailableQuestionTypesForItemType(db, 'word');
    const grammarTypes = queries.getAvailableQuestionTypesForItemType(db, 'grammar');
    expect(wordTypes.map(type => type.code)).not.toContain('vocab_en_cn_choice');
    expect(wordTypes.map(type => type.code)).toContain('vocab_listening_choice');
    expect(grammarTypes.map(type => type.code)).not.toContain('grammar_choice');
  });

  test('updateQuestionTypeSettings rejects invalid weights', () => {
    expect(() => queries.updateQuestionTypeSettings(db, [{
      code: 'vocab_en_cn_choice',
      enabled: true,
      weight: 101,
      instructionText: '选择正确答案。',
      primaryActionText: '提交答案',
      hintText: '提示',
      displayOptions: {},
    }])).toThrow('题型比例必须是 0 到 100 的整数');
  });

  test('updateQuestionTypeSettings rejects malformed weights', () => {
    expect(() => queries.updateQuestionTypeSettings(db, [{
      code: 'vocab_en_cn_choice',
      enabled: true,
      weight: '7.5',
      instructionText: '选择正确答案。',
      primaryActionText: '提交答案',
      hintText: '提示',
      displayOptions: {},
    }])).toThrow();

    expect(() => queries.updateQuestionTypeSettings(db, [{
      code: 'vocab_en_cn_choice',
      enabled: true,
      weight: '7abc',
      instructionText: '选择正确答案。',
      primaryActionText: '提交答案',
      hintText: '提示',
      displayOptions: {},
    }])).toThrow();
  });

  test('getQuestionTypeGroups tolerates malformed supported item type JSON', () => {
    db.prepare('UPDATE question_types SET supported_item_types = ? WHERE code = ?').run('not json', 'vocab_en_cn_choice');

    expect(() => queries.getQuestionTypeGroups(db)).not.toThrow();

    const groups = queries.getQuestionTypeGroups(db);
    const vocabulary = groups.find(group => group.category === 'vocabulary');
    const row = vocabulary.types.find(type => type.code === 'vocab_en_cn_choice');
    expect(row.supported_item_types).toEqual([]);
  });
});
