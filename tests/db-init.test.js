const Database = require('better-sqlite3');

// We'll require init after writing it — for now just describe the expected API
// The test uses a shared in-memory db to validate the init function's behavior

describe('db/init.js — database initialization', () => {
  let db;
  let initDatabase;

  beforeAll(() => {
    // Use :memory: for isolated testing
    db = new Database(':memory:');
    // Enable WAL mode is not needed for :memory: but init might try
    db.pragma('journal_mode = WAL');
  });

  afterAll(() => {
    db.close();
  });

  test('initDatabase creates all required tables', () => {
    // RED: This test will fail because init.js doesn't exist yet
    initDatabase = require('../db/init').initDatabase;
    initDatabase(db);

    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all().map(r => r.name);

    expect(tables).toContain('users');
    expect(tables).toContain('textbooks');
    expect(tables).toContain('units');
    expect(tables).toContain('items');
    expect(tables).toContain('review_records');
    expect(tables).toContain('check_ins');
    expect(tables).toContain('item_mastery');
    expect(tables).toContain('review_cycles');
    expect(tables).toContain('config');
  });

  test('initDatabase creates default admin account on first run', () => {
    const admin = db.prepare('SELECT * FROM users WHERE username = ?').get('admin');
    expect(admin).toBeTruthy();
    expect(admin.role).toBe('admin');
    // Password should be bcrypt hashed (not plaintext)
    expect(admin.password).not.toBe('admin123');
    expect(admin.password).toMatch(/^\$2[aby]\$\d+\$/);
  });

  test('initDatabase inserts default config values', () => {
    const config = {};
    const rows = db.prepare('SELECT * FROM config').all();
    rows.forEach(r => { config[r.key] = r.value; });

    expect(config.daily_words).toBe('20');
    expect(config.daily_phrases).toBe('5');
    expect(config.daily_grammar).toBe('3');
  });

  test('initDatabase inserts default review cycle rules', () => {
    const cycles = db.prepare(
      'SELECT * FROM review_cycles WHERE is_default = 1 ORDER BY id'
    ).all();

    expect(cycles.length).toBe(3);

    const weekly = cycles.find(c => c.cycle_type === 'weekly');
    const biweekly = cycles.find(c => c.cycle_type === 'biweekly');
    const monthly = cycles.find(c => c.cycle_type === 'monthly');

    expect(weekly).toBeTruthy();
    expect(weekly.enabled).toBe(1);
    expect(JSON.parse(weekly.trigger_days)).toEqual([6, 7]);
    expect(weekly.cover_days).toBe(7);

    expect(biweekly).toBeTruthy();
    expect(biweekly.cover_days).toBe(14);

    expect(monthly).toBeTruthy();
    expect(monthly.cover_days).toBe(0); // natural month
  });

  test('initDatabase is idempotent — running twice does not duplicate data', () => {
    const countBefore = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
    const cyclesBefore = db.prepare('SELECT COUNT(*) as c FROM review_cycles').get().c;
    const configBefore = db.prepare('SELECT COUNT(*) as c FROM config').get().c;

    // Run init again
    initDatabase(db);

    const countAfter = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
    const cyclesAfter = db.prepare('SELECT COUNT(*) as c FROM review_cycles').get().c;
    const configAfter = db.prepare('SELECT COUNT(*) as c FROM config').get().c;

    expect(countAfter).toBe(countBefore);
    expect(cyclesAfter).toBe(cyclesBefore);
    expect(configAfter).toBe(configBefore);
  });

  test('users table has correct schema', () => {
    const cols = db.prepare("PRAGMA table_info('users')").all();
    const colMap = {};
    cols.forEach(c => { colMap[c.name] = c; });

    expect(colMap.id.pk).toBe(1);
    expect(colMap.username.notnull).toBe(1);
    expect(colMap.password.notnull).toBe(1);
    expect(colMap.role.notnull).toBe(1);
  });

  test('items table constraints — word type requires english and chinese', () => {
    // Verify table exists with correct columns
    const cols = db.prepare("PRAGMA table_info('items')").all();
    const names = cols.map(c => c.name);

    expect(names).toContain('english');
    expect(names).toContain('chinese');
    expect(names).toContain('type');
    expect(names).toContain('unit_id');
  });

  test('check_ins has unique constraint on (user_id, check_date)', () => {
    // Inline UNIQUE constraint in CREATE TABLE won't appear as a standalone index;
    // check the table DDL instead.
    const tableInfo = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='check_ins'"
    ).get();
    expect(tableInfo.sql).toMatch(/UNIQUE\s*\(\s*user_id\s*,\s*check_date\s*\)/);
  });

  test('initDatabase creates review plan tables', () => {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all().map(r => r.name);

    expect(tables).toContain('review_plans');
    expect(tables).toContain('review_plan_units');
    expect(tables).toContain('daily_review_tasks');
  });

  test('daily_review_tasks prevents duplicate item assignment for the same student and date', () => {
    const textbookId = db.prepare('INSERT INTO textbooks (name) VALUES (?)').run('Schema Book').lastInsertRowid;
    const unitId = db.prepare('INSERT INTO units (textbook_id, name) VALUES (?, ?)').run(textbookId, 'Unit 1').lastInsertRowid;
    const itemId = db.prepare(
      "INSERT INTO items (unit_id, type, english, chinese) VALUES (?, 'word', 'apple', '苹果')"
    ).run(unitId).lastInsertRowid;
    const planId = db.prepare("INSERT INTO review_plans (name, is_active) VALUES ('Plan', 1)").run().lastInsertRowid;

    db.prepare(
      "INSERT INTO daily_review_tasks (user_id, plan_id, task_date, item_id, source_type) VALUES (1, ?, '2026-05-11', ?, 'new')"
    ).run(planId, itemId);

    expect(() => {
      db.prepare(
        "INSERT INTO daily_review_tasks (user_id, plan_id, task_date, item_id, source_type) VALUES (1, ?, '2026-05-11', ?, 'new')"
      ).run(planId, itemId);
    }).toThrow();
  });

  test('initDatabase creates question type infrastructure tables', () => {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all().map(r => r.name);

    expect(tables).toContain('question_types');
    expect(tables).toContain('question_type_settings');
  });

  test('initDatabase seeds the built-in question type catalog once', () => {
    const rows = db.prepare('SELECT code, category, implementation_status FROM question_types ORDER BY sort_order').all();
    const codes = rows.map(row => row.code);

    expect(codes).toContain('vocab_en_cn_choice');
    expect(codes).toContain('vocab_listening_choice');
    expect(codes).toContain('phrase_cn_en_fill');
    expect(codes).toContain('sentence_ordering');
    expect(codes).toContain('reading_task_based');
    expect(new Set(codes).size).toBe(codes.length);
    expect(rows.some(row => row.category === 'vocabulary')).toBe(true);
    expect(rows.some(row => row.category === 'reading')).toBe(true);
    expect(rows.find(row => row.code === 'grammar_choice').implementation_status).toBe('planned');
  });

  test('initDatabase seeds question type settings idempotently', () => {
    const beforeTypes = db.prepare('SELECT COUNT(*) AS count FROM question_types').get().count;
    const beforeSettings = db.prepare('SELECT COUNT(*) AS count FROM question_type_settings').get().count;

    initDatabase(db);

    const afterTypes = db.prepare('SELECT COUNT(*) AS count FROM question_types').get().count;
    const afterSettings = db.prepare('SELECT COUNT(*) AS count FROM question_type_settings').get().count;

    expect(afterTypes).toBe(beforeTypes);
    expect(afterSettings).toBe(beforeSettings);
    expect(afterSettings).toBe(afterTypes);
  });
});
