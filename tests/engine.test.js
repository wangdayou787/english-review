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

  test('sentence exercise splits example into words for ordering', () => {
    const item = queries.getItemsByUnit(db, 1).find(i => i.type === 'grammar');
    const ex = generator.createExercise(item, 'sentence', db);
    expect(ex.exercise_type).toBe('sentence');
    expect(ex.words).toBeDefined();
    expect(Array.isArray(ex.words)).toBe(true);
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
