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

  test('grammar example question type copy is readable Chinese', () => {
    const db = new Database(':memory:');
    initDatabase(db);

    const rows = db.prepare(
      `SELECT question_types.code,
              question_types.name,
              question_types.description,
              question_type_settings.instruction_text,
              question_type_settings.primary_action_text
       FROM question_types
       JOIN question_type_settings ON question_type_settings.question_type_code = question_types.code
       WHERE question_types.code IN ('grammar_choice', 'grammar_completion', 'grammar_sentence_transform')
       ORDER BY question_types.code`
    ).all();

    expect(rows).toEqual([
      {
        code: 'grammar_choice',
        name: '语法单项选择',
        description: '从选项中选择正确的语法答案。',
        instruction_text: '选择正确的语法答案。',
        primary_action_text: '提交答案',
      },
      {
        code: 'grammar_completion',
        name: '语法完成句子',
        description: '根据题干要求填写完整句子或缺失部分。',
        instruction_text: '根据要求完成句子。',
        primary_action_text: '提交答案',
      },
      {
        code: 'grammar_sentence_transform',
        name: '语法句型转换',
        description: '按要求改写句子，考查语法结构。',
        instruction_text: '按要求改写句子。',
        primary_action_text: '提交答案',
      },
    ]);
    expect(JSON.stringify(rows)).not.toContain('????');

    db.close();
  });

  test('initDatabase repairs corrupted grammar question type setting copy', () => {
    const db = new Database(':memory:');
    initDatabase(db);
    db.prepare(
      `UPDATE question_type_settings
       SET instruction_text = '?????????????',
           primary_action_text = '????'
       WHERE question_type_code = 'grammar_choice'`
    ).run();

    initDatabase(db);

    const row = db.prepare(
      `SELECT instruction_text, primary_action_text
       FROM question_type_settings
       WHERE question_type_code = 'grammar_choice'`
    ).get();
    expect(row).toEqual({
      instruction_text: '选择正确的语法答案。',
      primary_action_text: '提交答案',
    });

    db.close();
  });
});
