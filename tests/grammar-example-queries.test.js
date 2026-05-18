const Database = require('better-sqlite3');
const { initDatabase } = require('../db/init');
const queries = require('../db/queries');

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
  const wordId = queries.createItem(db, {
    unitId,
    type: 'word',
    english: 'study',
    chinese: '学习',
  });
  return { db, grammarId, wordId };
}

describe('grammar example queries', () => {
  test('saves and loads grammar details', () => {
    const { db, grammarId } = setup();

    queries.saveGrammarDetails(db, grammarId, {
      title: '现在进行时',
      description: '表示正在发生的动作。',
      usageNotes: '常与 now 和 look 搭配。',
    });

    expect(queries.getGrammarDetails(db, grammarId)).toMatchObject({
      item_id: grammarId,
      title: '现在进行时',
      description: '表示正在发生的动作。',
      usage_notes: '常与 now 和 look 搭配。',
    });
    db.close();
  });

  test('replaces grammar examples in sort order', () => {
    const { db, grammarId } = setup();

    queries.replaceGrammarExamples(db, grammarId, [
      {
        exampleType: 'choice',
        promptText: 'Look! The children ____ football.',
        options: ['play', 'plays', 'are playing', 'played'],
        answerText: 'are playing',
        explanation: 'Look 表示正在发生，用现在进行时。',
      },
      {
        exampleType: 'completion',
        promptText: 'He ____ (buy) a bike yesterday.',
        options: [],
        answerText: 'bought',
        explanation: 'yesterday 表示一般过去时。',
      },
    ]);

    const examples = queries.getGrammarExamplesByItem(db, grammarId);
    expect(examples).toHaveLength(2);
    expect(examples[0]).toMatchObject({
      item_id: grammarId,
      example_type: 'choice',
      prompt_text: 'Look! The children ____ football.',
      answer_text: 'are playing',
      explanation: 'Look 表示正在发生，用现在进行时。',
      sort_order: 1,
    });
    expect(examples[0].options).toEqual(['play', 'plays', 'are playing', 'played']);
    expect(examples[1].example_type).toBe('completion');
    db.close();
  });

  test('rejects grammar support rows for non-grammar items', () => {
    const { db, wordId } = setup();

    expect(() => {
      queries.saveGrammarDetails(db, wordId, {
        title: 'Invalid',
        description: 'Invalid',
        usageNotes: '',
      });
    }).toThrow('grammar_details requires a grammar item');
    db.close();
  });
});
