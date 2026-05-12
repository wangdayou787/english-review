const Database = require('better-sqlite3');
const { initDatabase } = require('../db/init');
const queries = require('../db/queries');
const generator = require('../engine/generator');

function buildDb() {
  const db = new Database(':memory:');
  initDatabase(db);
  const textbookId = queries.createTextbook(db, 'Test Book');
  const unitId = queries.createUnit(db, textbookId, 'Unit 1');
  const wordId = queries.createItem(db, { unitId, type: 'word', english: 'apple', chinese: '苹果', pos: 'n.' });
  queries.createItem(db, { unitId, type: 'word', english: 'book', chinese: '书' });
  queries.createItem(db, { unitId, type: 'word', english: 'cat', chinese: '猫' });
  queries.createItem(db, { unitId, type: 'word', english: 'dog', chinese: '狗' });
  const phraseId = queries.createItem(db, { unitId, type: 'phrase', english: 'look after', chinese: '照顾' });
  const grammarId = queries.createItem(db, { unitId, type: 'grammar', english: 'She likes music', chinese: '她喜欢音乐' });
  return { db, wordId, phraseId, grammarId };
}

describe('configured question type generation', () => {
  test('uses enabled available question type settings for word exercises', () => {
    const { db, wordId } = buildDb();
    queries.updateQuestionTypeSettings(db, [
      {
        code: 'vocab_en_cn_choice',
        enabled: false,
        weight: 30,
        instructionText: '选择正确答案。',
        primaryActionText: '提交答案',
        hintText: '注意词义和语境。',
        displayOptions: {},
      },
      {
        code: 'vocab_listening_choice',
        enabled: true,
        weight: 100,
        instructionText: '听发音，选择正确释义。',
        primaryActionText: '播放发音',
        hintText: '可以重复播放后再选择。',
        displayOptions: {},
      },
    ]);

    const item = queries.getItemById(db, wordId);
    const exercise = generator.generateExercises([item], db, { random: () => 0 })[0];

    expect(exercise.question_type_code).toBe('vocab_listening_choice');
    expect(exercise.exercise_type).toBe('listening');
    expect(exercise.instruction_text).toBe('听发音，选择正确释义。');
    expect(exercise.primary_action_text).toBe('播放发音');
    expect(exercise.hint_text).toBe('可以重复播放后再选择。');
    db.close();
  });

  test('planned question types are not generated even when enabled', () => {
    const { db, grammarId } = buildDb();
    queries.updateQuestionTypeSettings(db, [
      {
        code: 'grammar_choice',
        enabled: true,
        weight: 100,
        instructionText: '选择语法答案。',
        primaryActionText: '提交答案',
        hintText: '注意语法点。',
        displayOptions: {},
      },
    ]);

    const item = queries.getItemById(db, grammarId);
    const exercise = generator.generateExercises([item], db, { random: () => 0 })[0];

    expect(exercise.question_type_code).not.toBe('grammar_choice');
    expect(exercise.question_type_code).toBe('sentence_ordering');
    expect(exercise.exercise_type).toBe('sentence');
    db.close();
  });

  test('falls back to existing behavior when all compatible types are disabled', () => {
    const { db, phraseId } = buildDb();
    queries.updateQuestionTypeSettings(db, [
      {
        code: 'phrase_cn_en_fill',
        enabled: false,
        weight: 30,
        instructionText: '写出对应英文短语。',
        primaryActionText: '提交答案',
        hintText: '注意介词。',
        displayOptions: {},
      },
      {
        code: 'vocab_listening_choice',
        enabled: false,
        weight: 20,
        instructionText: '听发音。',
        primaryActionText: '播放发音',
        hintText: '提示',
        displayOptions: {},
      },
    ]);

    const item = queries.getItemById(db, phraseId);
    const exercise = generator.generateExercises([item], db, { random: () => 0 })[0];

    expect(exercise.item_id).toBe(phraseId);
    expect(['en2cn', 'cn2en', 'listening']).toContain(exercise.exercise_type);
    db.close();
  });

  test('weighted selection can choose later configured types deterministically', () => {
    const { db, wordId } = buildDb();
    queries.updateQuestionTypeSettings(db, [
      {
        code: 'vocab_en_cn_choice',
        enabled: true,
        weight: 10,
        instructionText: '选择正确答案。',
        primaryActionText: '提交答案',
        hintText: '注意词义。',
        displayOptions: {},
      },
      {
        code: 'vocab_listening_choice',
        enabled: true,
        weight: 90,
        instructionText: '听发音。',
        primaryActionText: '播放发音',
        hintText: '认真听。',
        displayOptions: {},
      },
    ]);

    const item = queries.getItemById(db, wordId);
    const exercise = generator.generateExercises([item], db, { random: () => 0.95 })[0];

    expect(exercise.question_type_code).toBe('vocab_listening_choice');
    db.close();
  });
});
