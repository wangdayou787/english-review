const Database = require('better-sqlite3');
const { initDatabase } = require('../db/init');
const queries = require('../db/queries');
const generator = require('../engine/generator');

function setup() {
  const db = new Database(':memory:');
  initDatabase(db);
  const textbookId = queries.createTextbook(db, 'Book');
  const unitId = queries.createUnit(db, textbookId, 'Unit 1');
  const grammarId = queries.createItem(db, {
    unitId,
    type: 'grammar',
    english: 'Present continuous',
    chinese: '现在进行时',
  });
  return { db, grammarId };
}

describe('grammar example exercise generation', () => {
  test('builds grammar choice exercise from stored example', () => {
    const { db, grammarId } = setup();
    queries.replaceGrammarExamples(db, grammarId, [{
      exampleType: 'choice',
      promptText: 'Look! The children ____ football.',
      options: ['play', 'plays', 'are playing', 'played'],
      answerText: 'are playing',
      explanation: 'Look 表示正在发生。',
    }]);

    const item = queries.getItemById(db, grammarId);
    const exercise = generator.createExercise(item, 'grammar_choice', db, {}, null, { random: () => 0 });

    expect(exercise.exercise_type).toBe('grammar_choice');
    expect(exercise.question).toBe('Look! The children ____ football.');
    expect(exercise.options).toEqual(expect.arrayContaining(['play', 'plays', 'are playing', 'played']));
    expect(exercise.correct_answer).toBe('are playing');
    expect(exercise.explanation).toBe('Look 表示正在发生。');
    db.close();
  });

  test('builds grammar completion and scores answer case-insensitively', () => {
    const { db, grammarId } = setup();
    queries.replaceGrammarExamples(db, grammarId, [{
      exampleType: 'completion',
      promptText: 'He ____ (buy) a bike yesterday.',
      options: [],
      answerText: 'bought',
      explanation: 'yesterday 表示一般过去时。',
    }]);

    const item = queries.getItemById(db, grammarId);
    const exercise = generator.createExercise(item, 'grammar_completion', db, {}, null, { random: () => 0 });
    const result = generator.scoreAnswer(item, exercise.exercise_type, ' Bought ', exercise.correct_answer);

    expect(exercise.question).toBe('He ____ (buy) a bike yesterday.');
    expect(result.is_correct).toBe(true);
    db.close();
  });

  test('can build a grammar exercise for the submitted example id', () => {
    const { db, grammarId } = setup();
    queries.replaceGrammarExamples(db, grammarId, [{
      exampleType: 'completion',
      promptText: 'He ____ (buy) a bike yesterday.',
      options: [],
      answerText: 'bought',
      explanation: 'past tense',
    }, {
      exampleType: 'completion',
      promptText: 'They ____ (play) football now.',
      options: [],
      answerText: 'are playing',
      explanation: 'present continuous',
    }]);
    const examples = queries.getGrammarExamplesByItem(db, grammarId, { exampleType: 'completion' });
    const item = queries.getItemById(db, grammarId);

    const exercise = generator.createExercise(item, 'grammar_completion', db, {}, null, {
      grammarExampleId: examples[1].id,
      random: () => 0,
    });

    expect(exercise.grammar_example_id).toBe(examples[1].id);
    expect(exercise.question).toBe('They ____ (play) football now.');
    expect(exercise.correct_answer).toBe('are playing');
    db.close();
  });

  test('falls back to legacy sentence when no matching grammar example exists', () => {
    const { db, grammarId } = setup();
    const item = queries.getItemById(db, grammarId);

    const exercise = generator.createExercise(item, 'grammar_choice', db, {}, null, { random: () => 0 });

    expect(exercise.exercise_type).toBe('sentence');
    expect(exercise.correct_answer).toBe('Present continuous');
    db.close();
  });
});
