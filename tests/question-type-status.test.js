const Database = require('better-sqlite3');
const { initDatabase } = require('../db/init');

describe('question type implementation status', () => {
  test('first-batch generated question types are marked available in the catalog', () => {
    const db = new Database(':memory:');
    initDatabase(db);

    const rows = db.prepare(
      `SELECT code, implementation_status
       FROM question_types
       WHERE code IN ('vocab_spelling_fill', 'vocab_form_transform', 'phrase_choice')`
    ).all();

    expect(Object.fromEntries(rows.map(row => [row.code, row.implementation_status]))).toEqual({
      vocab_spelling_fill: 'available',
      vocab_form_transform: 'available',
      phrase_choice: 'available',
    });

    db.close();
  });

  test('grammar example question types are available', () => {
    const db = new Database(':memory:');
    initDatabase(db);

    const rows = db.prepare(
      `SELECT code, implementation_status
       FROM question_types
       WHERE code IN ('grammar_choice', 'grammar_completion', 'grammar_sentence_transform')
       ORDER BY code`
    ).all();

    expect(rows).toEqual([
      { code: 'grammar_choice', implementation_status: 'available' },
      { code: 'grammar_completion', implementation_status: 'available' },
      { code: 'grammar_sentence_transform', implementation_status: 'available' },
    ]);

    db.close();
  });
});
