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
        instructionText: 'Pick the right answer.',
        primaryActionText: 'Submit',
        hintText: 'Pay attention to meaning.',
        displayOptions: {},
      },
      {
        code: 'vocab_listening_choice',
        enabled: true,
        weight: 100,
        instructionText: 'Listen and choose the meaning.',
        primaryActionText: 'Play audio',
        hintText: 'You can replay it.',
        displayOptions: {},
      },
    ]);

    const item = queries.getItemById(db, wordId);
    const exercise = generator.generateExercises([item], db, { random: () => 0 })[0];

    expect(exercise.question_type_code).toBe('vocab_listening_choice');
    expect(exercise.exercise_type).toBe('listening');
    expect(exercise.instruction_text).toBe('Listen and choose the meaning.');
    expect(exercise.primary_action_text).toBe('Play audio');
    expect(exercise.hint_text).toBe('You can replay it.');
    db.close();
  });

  test('planned question types are not generated even when enabled', () => {
    const { db, grammarId } = buildDb();
    queries.updateQuestionTypeSettings(db, [
      {
        code: 'grammar_choice',
        enabled: true,
        weight: 100,
        instructionText: 'Choose the grammar answer.',
        primaryActionText: 'Submit',
        hintText: 'Watch the grammar point.',
        displayOptions: {},
      },
      {
        code: 'sentence_ordering',
        enabled: true,
        weight: 100,
        instructionText: 'Arrange the sentence.',
        primaryActionText: 'Submit',
        hintText: 'Use all words.',
        displayOptions: {},
      },
    ]);

    const item = queries.getItemById(db, grammarId);
    const exercise = generator.generateExercises([item], db, { random: () => 0 })[0];

    expect(exercise.question_type_code).not.toBe('grammar_choice');
    expect(exercise.question_type_code).toBeUndefined();
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
        instructionText: 'Write the phrase.',
        primaryActionText: 'Submit',
        hintText: 'Watch the preposition.',
        displayOptions: {},
      },
      {
        code: 'vocab_listening_choice',
        enabled: false,
        weight: 20,
        instructionText: 'Listen.',
        primaryActionText: 'Play audio',
        hintText: 'Hint',
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
        instructionText: 'Pick the right answer.',
        primaryActionText: 'Submit',
        hintText: 'Mind the meaning.',
        displayOptions: {},
      },
      {
        code: 'vocab_listening_choice',
        enabled: true,
        weight: 90,
        instructionText: 'Listen.',
        primaryActionText: 'Play audio',
        hintText: 'Listen carefully.',
        displayOptions: {},
      },
      {
        code: 'translation_fill',
        enabled: false,
        weight: 0,
        instructionText: '',
        primaryActionText: '',
        hintText: '',
        displayOptions: {},
      },
    ]);

    const item = queries.getItemById(db, wordId);
    const exercise = generator.generateExercises([item], db, { random: () => 0.95 })[0];

    expect(exercise.question_type_code).toBe('vocab_listening_choice');
    db.close();
  });

  test('generates vocab_spelling_fill when word question details exist', () => {
    const { db, wordId } = buildDb();
    queries.saveWordQuestionDetails(db, wordId, {
      baseForm: 'apple',
      firstLetterHint: 'a',
      usageNote: 'noun',
      inflections: {},
    });
    queries.updateQuestionTypeSettings(db, [
      {
        code: 'vocab_spelling_fill',
        enabled: true,
        weight: 100,
        instructionText: 'Spell the word.',
        primaryActionText: 'Submit',
        hintText: 'Starts with a.',
        displayOptions: {},
      },
      {
        code: 'vocab_en_cn_choice',
        enabled: false,
        weight: 0,
        instructionText: '',
        primaryActionText: '',
        hintText: '',
        displayOptions: {},
      },
      {
        code: 'vocab_listening_choice',
        enabled: false,
        weight: 0,
        instructionText: '',
        primaryActionText: '',
        hintText: '',
        displayOptions: {},
      },
    ]);

    const item = queries.getItemById(db, wordId);
    const exercise = generator.generateExercises([item], db, { random: () => 0 })[0];

    expect(exercise.question_type_code).toBe('vocab_spelling_fill');
    expect(exercise.exercise_type).toBe('spelling_fill');
    expect(exercise.question).toBe(item.chinese);
    expect(exercise.correct_answer).toBe('apple');
    expect(exercise.first_letter_hint).toBe('a');
    db.close();
  });

  test('generates vocab_form_transform when a target inflection exists', () => {
    const { db, wordId } = buildDb();
    queries.saveWordQuestionDetails(db, wordId, {
      baseForm: 'study',
      firstLetterHint: 's',
      usageNote: 'verb',
      inflections: { past_tense: 'studied' },
    });
    db.prepare('UPDATE items SET english = ?, chinese = ? WHERE id = ?').run('study', '学习', wordId);
    queries.updateQuestionTypeSettings(db, [
      {
        code: 'vocab_form_transform',
        enabled: true,
        weight: 100,
        instructionText: 'Use the right form.',
        primaryActionText: 'Submit',
        hintText: 'Past tense.',
        displayOptions: {},
      },
      {
        code: 'vocab_en_cn_choice',
        enabled: false,
        weight: 0,
        instructionText: '',
        primaryActionText: '',
        hintText: '',
        displayOptions: {},
      },
      {
        code: 'vocab_spelling_fill',
        enabled: false,
        weight: 0,
        instructionText: '',
        primaryActionText: '',
        hintText: '',
        displayOptions: {},
      },
      {
        code: 'vocab_listening_choice',
        enabled: false,
        weight: 0,
        instructionText: '',
        primaryActionText: '',
        hintText: '',
        displayOptions: {},
      },
    ]);

    const item = queries.getItemById(db, wordId);
    const exercise = generator.generateExercises([item], db, { random: () => 0 })[0];

    expect(exercise.question_type_code).toBe('vocab_form_transform');
    expect(exercise.exercise_type).toBe('form_fill');
    expect(exercise.question).toBe('study');
    expect(exercise.correct_answer).toBe('studied');
    expect(exercise.prompt_label).toBe('过去式');
    db.close();
  });

  test('generates phrase_choice only when explicit authored rows exist', () => {
    const { db, phraseId } = buildDb();
    queries.updateQuestionTypeSettings(db, [
      {
        code: 'phrase_choice',
        enabled: true,
        weight: 100,
        instructionText: 'Choose the phrase.',
        primaryActionText: 'Submit',
        hintText: 'Match the usage.',
        displayOptions: {},
      },
      {
        code: 'phrase_cn_en_fill',
        enabled: false,
        weight: 0,
        instructionText: '',
        primaryActionText: '',
        hintText: '',
        displayOptions: {},
      },
      {
        code: 'vocab_listening_choice',
        enabled: false,
        weight: 0,
        instructionText: '',
        primaryActionText: '',
        hintText: '',
        displayOptions: {},
      },
    ]);

    let item = queries.getItemById(db, phraseId);
    let exercise = generator.generateExercises([item], db, { random: () => 0 })[0];
    expect(exercise.question_type_code).not.toBe('phrase_choice');

    queries.savePhraseChoiceQuestion(db, {
      itemId: phraseId,
      promptSentence: 'She often ___ her sister after school.',
      correctPhrase: 'looks after',
      distractorA: 'looks up',
      distractorB: 'looks for',
      distractorC: 'looks at',
      explanation: 'fixed phrase',
    });

    item = queries.getItemById(db, phraseId);
    exercise = generator.generateExercises([item], db, { random: () => 0 })[0];

    expect(exercise.question_type_code).toBe('phrase_choice');
    expect(exercise.exercise_type).toBe('phrase_choice');
    expect(exercise.question).toBe('She often ___ her sister after school.');
    expect(exercise.correct_answer).toBe('looks after');
    expect(exercise.options).toHaveLength(4);
    expect(exercise.options).toEqual(expect.arrayContaining([
      'looks after',
      'looks up',
      'looks for',
      'looks at',
    ]));
    db.close();
  });

  test('generates enhanced sentence ordering only when sentence order details exist', () => {
    const { db, grammarId } = buildDb();
    queries.updateQuestionTypeSettings(db, [
      {
        code: 'sentence_ordering',
        enabled: true,
        weight: 100,
        instructionText: 'Build the sentence.',
        primaryActionText: 'Submit',
        hintText: 'Use all tokens.',
        displayOptions: {},
      },
    ]);

    let item = queries.getItemById(db, grammarId);
    let exercise = generator.generateExercises([item], db, { random: () => 0 })[0];
    expect(exercise.exercise_type).toBe('sentence');

    queries.saveSentenceOrderDetails(db, grammarId, {
      answerSentence: 'She likes music',
      tokens: ['She', 'likes', 'music'],
      hintText: 'Start with the subject.',
    });

    item = queries.getItemById(db, grammarId);
    exercise = generator.generateExercises([item], db, { random: () => 0 })[0];

    expect(exercise.question_type_code).toBe('sentence_ordering');
    expect(exercise.exercise_type).toBe('sentence_plus');
    expect(exercise.correct_answer).toBe('She likes music');
    expect(exercise.words).toEqual(expect.arrayContaining(['She', 'likes', 'music']));
    expect(exercise.words).toHaveLength(3);
    db.close();
  });

  test('enhanced sentence ordering does not present tokens in the correct order', () => {
    const { db, grammarId } = buildDb();
    queries.saveSentenceOrderDetails(db, grammarId, {
      answerSentence: 'You should study harder before the examination',
      tokens: ['You', 'should', 'study harder', 'before the examination'],
      hintText: '',
    });

    const item = queries.getItemById(db, grammarId);
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const exercise = generator.createExercise(item, 'sentence_plus', db);
    randomSpy.mockRestore();

    expect(exercise.correct_answer).toBe('You should study harder before the examination');
    expect(exercise.words).toEqual(expect.arrayContaining([
      'You',
      'should',
      'study harder',
      'before the examination',
    ]));
    expect(exercise.words).not.toEqual([
      'You',
      'should',
      'study harder',
      'before the examination',
    ]);
    db.close();
  });

  test('falls back when enhanced sentence ordering has tokens but no answer sentence', () => {
    const { db, grammarId } = buildDb();
    queries.updateQuestionTypeSettings(db, [
      {
        code: 'sentence_ordering',
        enabled: true,
        weight: 100,
        instructionText: 'Build the sentence.',
        primaryActionText: 'Submit',
        hintText: 'Use all tokens.',
        displayOptions: {},
      },
    ]);
    queries.saveSentenceOrderDetails(db, grammarId, {
      answerSentence: '',
      tokens: ['She', 'likes', 'music'],
      hintText: 'Start with the subject.',
    });

    const item = queries.getItemById(db, grammarId);
    const exercise = generator.generateExercises([item], db, { random: () => 0 })[0];

    expect(exercise.question_type_code).toBeUndefined();
    expect(exercise.exercise_type).toBe('sentence');
    expect(exercise.correct_answer).toBe('She likes music');
    db.close();
  });
});
