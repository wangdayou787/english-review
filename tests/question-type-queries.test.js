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
    }])).toThrow('题型比例必须是 0 到 100 的整数');

    expect(() => queries.updateQuestionTypeSettings(db, [{
      code: 'vocab_en_cn_choice',
      enabled: true,
      weight: '7abc',
      instructionText: '选择正确答案。',
      primaryActionText: '提交答案',
      hintText: '提示',
      displayOptions: {},
    }])).toThrow('题型比例必须是 0 到 100 的整数');
  });

  test('getQuestionTypeGroups tolerates malformed supported item type JSON', () => {
    db.prepare('UPDATE question_types SET supported_item_types = ? WHERE code = ?').run('{bad', 'vocab_en_cn_choice');

    expect(() => queries.getQuestionTypeGroups(db)).not.toThrow();

    const groups = queries.getQuestionTypeGroups(db);
    const vocabulary = groups.find(group => group.category === 'vocabulary');
    const row = vocabulary.types.find(type => type.code === 'vocab_en_cn_choice');
    expect(row.supported_item_types).toEqual([]);
  });

  test('saveWordQuestionDetails upserts structured word fields', () => {
    const textbookId = queries.createTextbook(db, 'Word Book');
    const unitId = queries.createUnit(db, textbookId, 'Unit 1');
    const itemId = queries.createItem(db, { unitId, type: 'word', english: 'study', chinese: '学习' });

    queries.saveWordQuestionDetails(db, itemId, {
      baseForm: 'study',
      firstLetterHint: 's',
      usageNote: '动词原形',
      inflections: { past_tense: 'studied', present_participle: 'studying' },
    });

    queries.saveWordQuestionDetails(db, itemId, {
      baseForm: 'study',
      firstLetterHint: 'st',
      usageNote: '更新后的说明',
      inflections: { past_tense: 'studied', present_participle: 'studying', third_person_singular: 'studies' },
    });

    const detail = queries.getWordQuestionDetails(db, itemId);
    expect(detail.base_form).toBe('study');
    expect(detail.first_letter_hint).toBe('st');
    expect(detail.usage_note).toBe('更新后的说明');
    expect(detail.inflections.past_tense).toBe('studied');
    expect(detail.inflections.third_person_singular).toBe('studies');
  });

  test('saveWordQuestionDetails normalizes blank inflection values to empty JSON', () => {
    const textbookId = queries.createTextbook(db, 'Word Book');
    const unitId = queries.createUnit(db, textbookId, 'Unit 2');
    const itemId = queries.createItem(db, { unitId, type: 'word', english: 'study', chinese: '学习' });

    queries.saveWordQuestionDetails(db, itemId, {
      baseForm: 'study',
      firstLetterHint: 's',
      usageNote: '',
      inflections: { past_tense: '', present_participle: '   ', plural: null },
    });

    const row = db.prepare('SELECT inflections_json FROM word_question_details WHERE item_id = ?').get(itemId);
    expect(row.inflections_json).toBe('{}');

    const detail = queries.getWordQuestionDetails(db, itemId);
    expect(detail.inflections).toEqual({});
  });

  test('savePhraseChoiceQuestion, updatePhraseChoiceQuestion, and deletePhraseChoiceQuestion manage explicit phrase questions', () => {
    const textbookId = queries.createTextbook(db, 'Phrase Book');
    const unitId = queries.createUnit(db, textbookId, 'Unit 1');
    const itemId = queries.createItem(db, { unitId, type: 'phrase', english: 'look after', chinese: '照顾' });

    const questionId = queries.savePhraseChoiceQuestion(db, {
      itemId,
      promptSentence: 'She often ___ her sister after school.',
      correctPhrase: 'looks after',
      distractorA: 'looks up',
      distractorB: 'looks for',
      distractorC: 'looks at',
      explanation: 'look after 表示照顾。',
    });

    let rows = queries.getPhraseChoiceQuestionsByItem(db, itemId);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(questionId);
    expect(rows[0].correct_phrase).toBe('looks after');

    queries.updatePhraseChoiceQuestion(db, questionId, {
      promptSentence: 'She always ___ her younger brother on weekends.',
      correctPhrase: 'looks after',
      distractorA: 'looks up',
      distractorB: 'looks over',
      distractorC: 'looks at',
      explanation: 'look after 表示照顾；look over 表示检查。',
    });

    rows = queries.getPhraseChoiceQuestionsByItem(db, itemId);
    expect(rows).toHaveLength(1);
    expect(rows[0].prompt_sentence).toBe('She always ___ her younger brother on weekends.');
    expect(rows[0].distractor_b).toBe('looks over');

    queries.deletePhraseChoiceQuestion(db, questionId);
    rows = queries.getPhraseChoiceQuestionsByItem(db, itemId);
    expect(rows).toHaveLength(0);
  });

  test('saveSentenceOrderDetails stores normalized tokens', () => {
    const textbookId = queries.createTextbook(db, 'Sentence Book');
    const unitId = queries.createUnit(db, textbookId, 'Unit 1');
    const itemId = queries.createItem(db, { unitId, type: 'grammar', english: 'She likes music', chinese: '她喜欢音乐' });

    queries.saveSentenceOrderDetails(db, itemId, {
      answerSentence: 'She likes music',
      tokens: ['She', 'likes', 'music'],
      hintText: '先找主语。',
    });

    queries.saveSentenceOrderDetails(db, itemId, {
      answerSentence: 'She likes pop music',
      tokens: ['She', 'likes', 'pop', 'music'],
      hintText: '先确定主语，再放动词。',
    });

    const detail = queries.getSentenceOrderDetails(db, itemId);
    expect(detail.answer_sentence).toBe('She likes pop music');
    expect(detail.tokens).toEqual(['She', 'likes', 'pop', 'music']);
    expect(detail.hint_text).toBe('先确定主语，再放动词。');
  });
});
