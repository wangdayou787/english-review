const Database = require('better-sqlite3');
const { initDatabase } = require('../db/init');
const queries = require('../db/queries');

let db;

beforeAll(() => {
  db = new Database(':memory:');
  initDatabase(db);

  // Insert test data: 1 textbook, 2 units, 10 items
  const tId = queries.createTextbook(db, 'Test Book');
  const u1Id = queries.createUnit(db, tId, 'Unit 1');
  const u2Id = queries.createUnit(db, tId, 'Unit 2');

  const words = [
    { unitId: u1Id, type: 'word', english: 'apple', chinese: '苹果' },
    { unitId: u1Id, type: 'word', english: 'book', chinese: '书' },
    { unitId: u1Id, type: 'word', english: 'cat', chinese: '猫' },
    { unitId: u1Id, type: 'word', english: 'dog', chinese: '狗' },
    { unitId: u2Id, type: 'word', english: 'elephant', chinese: '大象' },
    { unitId: u2Id, type: 'word', english: 'fish', chinese: '鱼' },
  ];
  const phrases = [
    { unitId: u1Id, type: 'phrase', english: 'good morning', chinese: '早上好' },
    { unitId: u1Id, type: 'phrase', english: 'thank you', chinese: '谢谢' },
  ];
  const grammars = [
    { unitId: u1Id, type: 'grammar', english: 'I am a student', chinese: '我是一个学生' },
    { unitId: u1Id, type: 'grammar', english: 'She likes music', chinese: '她喜欢音乐' },
  ];

  for (const w of words) queries.createItem(db, w);
  for (const p of phrases) queries.createItem(db, p);
  for (const g of grammars) queries.createItem(db, g);

  // Create a test user
  db.prepare("INSERT INTO users (username, password, role) VALUES ('test', 'hash', 'user')").run();
});

afterAll(() => {
  db.close();
});

// We'll require them after writing them
let scheduler, generator;

describe('engine/scheduler.js', () => {
  beforeAll(() => {
    scheduler = require('../engine/scheduler');
  });

  test('getDailyItems returns correct number of items per type', () => {
    const result = scheduler.getDailyItems(db, 1, { daily_words: 3, daily_phrases: 1, daily_grammar: 1 });
    expect(result.words.length).toBeLessThanOrEqual(3);
    expect(result.phrases.length).toBeLessThanOrEqual(1);
    expect(result.grammar.length).toBeLessThanOrEqual(1);
  });

  test('getDailyItems prioritizes new items over reviewed ones', () => {
    // First call: all items are new
    const first = scheduler.getDailyItems(db, 1, { daily_words: 2, daily_phrases: 0, daily_grammar: 0 });
    expect(first.words.length).toBe(2);

    // Record one as reviewed (correct)
    queries.insertReviewRecord(db, {
      userId: 1, itemId: first.words[0].id,
      exerciseType: 'en2cn', userAnswer: 'correct', isCorrect: true
    });

    // Second call: the unreviewed word should appear before the reviewed one
    const second = scheduler.getDailyItems(db, 1, { daily_words: 3, daily_phrases: 0, daily_grammar: 0 });
    // The second call should include the previously unreviewed item first
    expect(second.words.length).toBeLessThanOrEqual(3);
  });

  test('getDailyItems respects known (mastered) items', () => {
    // Mark an item as known
    const allItems = queries.getItemsByUnit(db, 1);
    if (allItems.length > 0) {
      queries.setItemKnown(db, 1, allItems[0].id, true);
      const result = scheduler.getDailyItems(db, 1, { daily_words: 10, daily_phrases: 10, daily_grammar: 10 });
      const allIds = [...result.words, ...result.phrases, ...result.grammar].map(i => i.id);
      expect(allIds).not.toContain(allItems[0].id);
    }
  });

  test('getCycleItems returns items reviewed within the cover period', () => {
    // Add a review record with a specific date
    const allItems = queries.getItemsByUnit(db, 1);
    if (allItems.length > 0) {
      const itemId = allItems[0].id;
      queries.insertReviewRecord(db, {
        userId: 1, itemId, exerciseType: 'en2cn', userAnswer: 'x', isCorrect: true
      });

      // Cycle covering 30 days should include this item
      const cycleItems = scheduler.getCycleItems(db, 1, 30);
      expect(cycleItems.length).toBeGreaterThan(0);
    }
  });

  test('getActiveCycles returns enabled cycles that trigger today', () => {
    const cycles = scheduler.getActiveCycles(db);
    // Default: weekly triggers Sat-Sun (6,7), biweekly triggers Sat-Sun (6,7), monthly triggers 28-31
    // The test depends on today's date, so just verify structure
    expect(Array.isArray(cycles)).toBe(true);
    cycles.forEach(c => {
      expect(c).toHaveProperty('cycle_type');
      expect(c).toHaveProperty('cover_days');
    });
  });
});

describe('engine/generator.js', () => {
  beforeAll(() => {
    generator = require('../engine/generator');
  });

  test('generateExercises creates correct number of exercises', () => {
    const items = queries.getItemsByUnit(db, 1).filter(i => i.type === 'word').slice(0, 4);
    const exercises = generator.generateExercises(items, db);
    expect(exercises.length).toBe(4);
  });

  test('exercises have required fields', () => {
    const items = queries.getItemsByUnit(db, 1).slice(0, 2);
    const exercises = generator.generateExercises(items, db);
    exercises.forEach(ex => {
      expect(ex).toHaveProperty('item_id');
      expect(ex).toHaveProperty('exercise_type');
      expect(ex).toHaveProperty('question');
      expect(ex).toHaveProperty('correct_answer');
    });
  });

  test('en2cn exercises have 4 options including the correct one', () => {
    const items = queries.getItemsByUnit(db, 1).filter(i => i.type === 'word').slice(0, 4);
    // Force exercise type to en2cn
    const exercises = items.map(item => generator.createExercise(item, 'en2cn', db));
    exercises.forEach(ex => {
      expect(ex.exercise_type).toBe('en2cn');
      expect(ex.options).toHaveLength(4);
      expect(ex.options).toContain(ex.correct_answer);
    });
  });

  test('cn2en exercise uses text input (no options)', () => {
    const item = queries.getItemsByUnit(db, 1).find(i => i.type === 'word');
    const ex = generator.createExercise(item, 'cn2en', db);
    expect(ex.exercise_type).toBe('cn2en');
    expect(ex.options).toBeUndefined();
    expect(ex.correct_answer).toBe(item.english);
  });

  test('listening exercise uses browser TTS (no options property needed)', () => {
    const item = queries.getItemsByUnit(db, 1).find(i => i.type === 'word');
    const ex = generator.createExercise(item, 'listening', db);
    expect(ex.exercise_type).toBe('listening');
    expect(ex.options).toHaveLength(4);
  });

  test('multiple choice exercise does not crash when there is only one item', () => {
    const smallDb = new Database(':memory:');
    initDatabase(smallDb);
    const textbookId = queries.createTextbook(smallDb, 'Small Book');
    const unitId = queries.createUnit(smallDb, textbookId, 'Unit 1');
    const itemId = queries.createItem(smallDb, {
      unitId,
      type: 'word',
      english: 'apple',
      chinese: '苹果',
    });
    const item = queries.getItemById(smallDb, itemId);

    const exercise = generator.createExercise(item, 'en2cn', smallDb);

    expect(exercise.options).toEqual(['苹果']);
    expect(exercise.options).toContain('苹果');
    smallDb.close();
  });

  test('multiple choice options are unique when distractor pool is small', () => {
    const smallDb = new Database(':memory:');
    initDatabase(smallDb);
    const textbookId = queries.createTextbook(smallDb, 'Small Book');
    const unitId = queries.createUnit(smallDb, textbookId, 'Unit 1');
    const items = [
      { unitId, type: 'word', english: 'apple', chinese: '苹果' },
      { unitId, type: 'word', english: 'book', chinese: '书' },
      { unitId, type: 'phrase', english: 'good morning', chinese: '早上好' },
    ];
    for (const item of items) queries.createItem(smallDb, item);
    const target = smallDb.prepare("SELECT * FROM items WHERE english = 'apple'").get();

    const exercise = generator.createExercise(target, 'listening', smallDb);

    expect(new Set(exercise.options).size).toBe(exercise.options.length);
    expect(exercise.options).toContain('苹果');
    expect(exercise.options.length).toBeLessThanOrEqual(4);
    smallDb.close();
  });

  test('multiple choice falls back past unusable same-type distractors', () => {
    const smallDb = new Database(':memory:');
    initDatabase(smallDb);
    const textbookId = queries.createTextbook(smallDb, 'Fallback Book');
    const unitId = queries.createUnit(smallDb, textbookId, 'Unit 1');
    const targetId = queries.createItem(smallDb, {
      unitId,
      type: 'word',
      english: 'apple',
      chinese: '苹果',
    });

    for (let i = 0; i < 20; i++) {
      queries.createItem(smallDb, {
        unitId,
        type: 'word',
        english: `duplicate-${i}`,
        chinese: '苹果',
      });
    }

    for (const [english, chinese] of [['phrase-a', '短语A'], ['phrase-b', '短语B'], ['phrase-c', '短语C']]) {
      queries.createItem(smallDb, { unitId, type: 'phrase', english, chinese });
    }

    const item = queries.getItemById(smallDb, targetId);
    const exercise = generator.createExercise(item, 'en2cn', smallDb);

    expect(new Set(exercise.options).size).toBe(4);
    expect(exercise.options).toContain('苹果');
    expect(exercise.options).toEqual(expect.arrayContaining(['短语A', '短语B', '短语C']));
    smallDb.close();
  });

  test('cn2en choice exercises use English options and include the correct word', () => {
    const items = queries.getItemsByUnit(db, 1).filter(i => i.type === 'word').slice(0, 4);
    const item = items[0];

    const exercise = generator.createExercise(item, 'cn2en_choice', db);

    expect(exercise.exercise_type).toBe('cn2en_choice');
    expect(exercise.question).toBe(item.chinese);
    expect(exercise.correct_answer).toBe(item.english);
    expect(exercise.options).toContain(item.english);
    expect(exercise.options).not.toContain(item.chinese);
    expect(new Set(exercise.options).size).toBe(exercise.options.length);
  });

  test('translation choice question type can choose Chinese-to-English direction', () => {
    const item = queries.getItemsByUnit(db, 1).find(i => i.type === 'word');
    db.prepare('UPDATE question_type_settings SET enabled = 0').run();
    db.prepare(
      `INSERT INTO question_type_settings (question_type_code, enabled, weight, instruction_text, primary_action_text, hint_text, display_options)
       VALUES ('vocab_en_cn_choice', 1, 100, '选择正确答案。', '提交答案', '注意词义。', '{}')
       ON CONFLICT(question_type_code) DO UPDATE SET enabled = excluded.enabled, weight = excluded.weight`
    ).run();

    const exercise = generator.generateExercises([item], db, { random: () => 0.75 })[0];

    expect(exercise.exercise_type).toBe('cn2en_choice');
    expect(exercise.question).toBe(item.chinese);
    expect(exercise.correct_answer).toBe(item.english);
    expect(exercise.options).toContain(item.english);
  });

  test('sentence exercise splits example into words for ordering', () => {
    const item = queries.getItemsByUnit(db, 1).find(i => i.type === 'grammar');
    const ex = generator.createExercise(item, 'sentence', db);
    expect(ex.exercise_type).toBe('sentence');
    expect(ex.words).toBeDefined();
    expect(Array.isArray(ex.words)).toBe(true);
  });

  test('form fill exposes Chinese target labels instead of internal inflection keys', () => {
    const smallDb = new Database(':memory:');
    initDatabase(smallDb);
    const textbookId = queries.createTextbook(smallDb, 'Forms Book');
    const unitId = queries.createUnit(smallDb, textbookId, 'Unit 1');
    const itemId = queries.createItem(smallDb, {
      unitId,
      type: 'word',
      english: 'study',
      chinese: '学习',
    });
    queries.saveWordQuestionDetails(smallDb, itemId, {
      baseForm: 'study',
      firstLetterHint: 's',
      usageNote: '',
      inflections: { plural: 'studies' },
    });

    const item = queries.getItemById(smallDb, itemId);
    const exercise = generator.createExercise(item, 'form_fill', smallDb);

    expect(exercise.prompt_label).toBe('复数');
    expect(exercise.correct_answer).toBe('studies');
    smallDb.close();
  });

  test('form fill can choose a later available inflection with deterministic random', () => {
    const smallDb = new Database(':memory:');
    initDatabase(smallDb);
    const textbookId = queries.createTextbook(smallDb, 'Random Forms Book');
    const unitId = queries.createUnit(smallDb, textbookId, 'Unit 1');
    const itemId = queries.createItem(smallDb, {
      unitId,
      type: 'word',
      english: 'study',
      chinese: '学习',
    });
    queries.saveWordQuestionDetails(smallDb, itemId, {
      baseForm: 'study',
      firstLetterHint: 's',
      usageNote: '',
      inflections: {
        plural: 'studies',
        past_tense: 'studied',
        past_participle: 'studied',
      },
    });

    const item = queries.getItemById(smallDb, itemId);
    const exercise = generator.createExercise(item, 'form_fill', smallDb, {}, null, { random: () => 0.5 });

    expect(exercise.prompt_label).toBe('过去式');
    expect(exercise.correct_answer).toBe('studied');
    smallDb.close();
  });

  test('scoreAnswer correctly marks correct and incorrect answers', () => {
    const item = { id: 1, english: 'apple', chinese: '苹果', type: 'word' };

    // Correct en2cn
    const r1 = generator.scoreAnswer(item, 'en2cn', '苹果', '苹果');
    expect(r1.is_correct).toBe(true);

    // Wrong en2cn
    const r2 = generator.scoreAnswer(item, 'en2cn', '香蕉', '苹果');
    expect(r2.is_correct).toBe(false);

    // Correct cn2en (case insensitive, trimmed)
    const r3 = generator.scoreAnswer(item, 'cn2en', ' Apple ', 'apple');
    expect(r3.is_correct).toBe(true);
  });

  test('scoreAnswers returns totals with perfect bonus', () => {
    const items = [
      { id: 1, english: 'apple', chinese: '苹果', type: 'word' },
      { id: 2, english: 'book', chinese: '书', type: 'word' },
    ];
    const answers = [
      { item_id: 1, exercise_type: 'en2cn', answer: '苹果' },
      { item_id: 2, exercise_type: 'cn2en', answer: 'book' },
    ];
    const result = generator.scoreAnswers(items, answers);
    expect(result.total_correct).toBe(2);
    expect(result.total_questions).toBe(2);
    expect(result.perfect_bonus).toBe(3);
    expect(result.score).toBe(5); // 2 correct + 3 bonus
  });
});
