const Database = require('better-sqlite3');
const { initDatabase } = require('../db/init');
const queries = require('../db/queries');
const scheduler = require('../engine/scheduler');

function seedWordSet(db, unitId, prefix, count) {
  const ids = [];
  for (let i = 1; i <= count; i++) {
    ids.push(queries.createItem(db, {
      unitId,
      type: 'word',
      english: `${prefix}-${i}`,
      chinese: `${prefix}中文${i}`,
    }));
  }
  return ids;
}

function setup() {
  const db = new Database(':memory:');
  initDatabase(db);
  const textbookId = queries.createTextbook(db, '七年级上册');
  const unit1Id = queries.createUnit(db, textbookId, 'Unit 1');
  const unit2Id = queries.createUnit(db, textbookId, 'Unit 2');
  const unit1Words = seedWordSet(db, unit1Id, 'unit1', 20);
  const unit2Words = seedWordSet(db, unit2Id, 'unit2', 5);
  const planId = queries.activateReviewPlan(db, { name: 'Unit 1', unitIds: [unit1Id] });
  db.prepare("INSERT INTO users (username, password, role) VALUES ('student', 'hash', 'user')").run();
  return { db, planId, unit1Words, unit2Words, userId: 2 };
}

describe('plan-aware daily scheduler', () => {
  test('monday with no review pool generates quota-limited new content from active plan scope', () => {
    const { db, planId, unit1Words, unit2Words, userId } = setup();

    const tasks = scheduler.getOrCreateDailyReviewTasks(db, userId, planId, '2026-05-11', {
      daily_words: 6,
      daily_phrases: 0,
      daily_grammar: 0,
    });

    expect(tasks.words).toHaveLength(6);
    expect(tasks.words.every(item => item.source_type === 'new')).toBe(true);
    expect(tasks.words.map(item => item.id).every(id => unit1Words.includes(id))).toBe(true);
    expect(tasks.words.map(item => item.id).some(id => unit2Words.includes(id))).toBe(false);
    db.close();
  });

  test('same-day calls reuse saved tasks', () => {
    const { db, planId, userId } = setup();

    const first = scheduler.getOrCreateDailyReviewTasks(db, userId, planId, '2026-05-11', {
      daily_words: 6,
      daily_phrases: 0,
      daily_grammar: 0,
    });
    const second = scheduler.getOrCreateDailyReviewTasks(db, userId, planId, '2026-05-11', {
      daily_words: 6,
      daily_phrases: 0,
      daily_grammar: 0,
    });

    expect(second.words.map(i => i.id)).toEqual(first.words.map(i => i.id));
    db.close();
  });

  test('same-day calls top up saved tasks when quota increases', () => {
    const { db, planId, userId } = setup();

    const first = scheduler.getOrCreateDailyReviewTasks(db, userId, planId, '2026-05-11', {
      daily_words: 6,
      daily_phrases: 0,
      daily_grammar: 0,
    });
    const second = scheduler.getOrCreateDailyReviewTasks(db, userId, planId, '2026-05-11', {
      daily_words: 10,
      daily_phrases: 0,
      daily_grammar: 0,
    });

    expect(first.words).toHaveLength(6);
    expect(second.words).toHaveLength(10);
    expect(first.words.map(item => item.id).every(id => second.words.map(item => item.id).includes(id))).toBe(true);
    db.close();
  });

  test('weekday uses one new word and five review words for quota six when review pool is large enough', () => {
    const { db, planId, userId } = setup();

    const day1 = scheduler.getOrCreateDailyReviewTasks(db, userId, planId, '2026-05-11', {
      daily_words: 6,
      daily_phrases: 0,
      daily_grammar: 0,
    });
    for (const item of day1.words) {
      queries.insertReviewRecord(db, {
        userId,
        itemId: item.id,
        exerciseType: 'en2cn',
        userAnswer: item.chinese,
        isCorrect: true,
      });
    }

    const day2 = scheduler.getOrCreateDailyReviewTasks(db, userId, planId, '2026-05-12', {
      daily_words: 6,
      daily_phrases: 0,
      daily_grammar: 0,
    });

    expect(day2.words.filter(item => item.source_type === 'new')).toHaveLength(1);
    expect(day2.words.filter(item => item.source_type === 'recent_review')).toHaveLength(5);
    db.close();
  });

  test('wrong items are prioritized as review tasks', () => {
    const { db, planId, userId } = setup();

    const day1 = scheduler.getOrCreateDailyReviewTasks(db, userId, planId, '2026-05-11', {
      daily_words: 6,
      daily_phrases: 0,
      daily_grammar: 0,
    });
    const wrongItem = day1.words[0];
    queries.insertReviewRecord(db, {
      userId,
      itemId: wrongItem.id,
      exerciseType: 'en2cn',
      userAnswer: 'wrong',
      isCorrect: false,
    });

    const day2 = scheduler.getOrCreateDailyReviewTasks(db, userId, planId, '2026-05-12', {
      daily_words: 6,
      daily_phrases: 0,
      daily_grammar: 0,
    });

    const selectedWrong = day2.words.find(item => item.id === wrongItem.id);
    expect(selectedWrong).toBeTruthy();
    expect(selectedWrong.source_type).toBe('wrong');
    db.close();
  });

  test('saturday introduces no new content after monday to friday tasks exist', () => {
    const { db, planId, userId } = setup();

    for (let day = 11; day <= 15; day++) {
      scheduler.getOrCreateDailyReviewTasks(db, userId, planId, `2026-05-${day}`, {
        daily_words: 6,
        daily_phrases: 0,
        daily_grammar: 0,
      });
    }

    const day6 = scheduler.getOrCreateDailyReviewTasks(db, userId, planId, '2026-05-16', {
      daily_words: 6,
      daily_phrases: 0,
      daily_grammar: 0,
    });

    expect(day6.words).toHaveLength(6);
    expect(day6.words.every(item => item.source_type === 'cycle_review')).toBe(true);
    db.close();
  });

  test('sunday consolidates items from the current calendar week', () => {
    const { db, planId, userId } = setup();

    for (let day = 11; day <= 15; day++) {
      scheduler.getOrCreateDailyReviewTasks(db, userId, planId, `2026-05-${day}`, {
        daily_words: 6,
        daily_phrases: 0,
        daily_grammar: 0,
      });
    }

    const sunday = scheduler.getOrCreateDailyReviewTasks(db, userId, planId, '2026-05-17', {
      daily_words: 6,
      daily_phrases: 0,
      daily_grammar: 0,
    });

    expect(sunday.words).toHaveLength(6);
    expect(sunday.words.every(item => item.source_type === 'cycle_review')).toBe(true);
    expect(new Set(sunday.words.map(item => item.task_date))).toEqual(new Set(['2026-05-17']));
    db.close();
  });

  test('sunday falls back to active plan items when current week has no task history', () => {
    const { db, planId, unit1Words, userId } = setup();

    const sunday = scheduler.getOrCreateDailyReviewTasks(db, userId, planId, '2026-05-17', {
      daily_words: 6,
      daily_phrases: 0,
      daily_grammar: 0,
    });

    expect(sunday.words).toHaveLength(6);
    expect(sunday.words.every(item => item.source_type === 'cycle_review')).toBe(true);
    expect(sunday.words.map(item => item.id).every(id => unit1Words.includes(id))).toBe(true);
    db.close();
  });

  test('sunday fallback fills quota from active plan even when wrong items exist', () => {
    const { db, planId, unit1Words, userId } = setup();
    queries.insertReviewRecord(db, {
      userId,
      itemId: unit1Words[0],
      exerciseType: 'en2cn',
      userAnswer: 'wrong',
      isCorrect: false,
    });

    const sunday = scheduler.getOrCreateDailyReviewTasks(db, userId, planId, '2026-05-17', {
      daily_words: 6,
      daily_phrases: 0,
      daily_grammar: 0,
    });

    expect(sunday.words).toHaveLength(6);
    expect(sunday.words.every(item => item.source_type === 'cycle_review')).toBe(true);
    expect(sunday.words.map(item => item.id)).toContain(unit1Words[0]);
    db.close();
  });

  test('weekday does not replace a small review pool with extra new content', () => {
    const { db, planId, userId } = setup();

    scheduler.getOrCreateDailyReviewTasks(db, userId, planId, '2026-05-13', {
      daily_words: 2,
      daily_phrases: 0,
      daily_grammar: 0,
    });

    const thursday = scheduler.getOrCreateDailyReviewTasks(db, userId, planId, '2026-05-14', {
      daily_words: 6,
      daily_phrases: 0,
      daily_grammar: 0,
    });

    expect(thursday.words.filter(item => item.source_type === 'new')).toHaveLength(1);
    expect(thursday.words.filter(item => item.source_type === 'recent_review')).toHaveLength(2);
    expect(thursday.words).toHaveLength(3);
    db.close();
  });

  test('mastered items are excluded from new daily tasks', () => {
    const { db, planId, unit1Words, userId } = setup();
    queries.setItemKnown(db, userId, unit1Words[0], true);

    const tasks = scheduler.getOrCreateDailyReviewTasks(db, userId, planId, '2026-05-11', {
      daily_words: 6,
      daily_phrases: 0,
      daily_grammar: 0,
    });

    expect(tasks.words.map(item => item.id)).not.toContain(unit1Words[0]);
    db.close();
  });
});
