const Database = require('better-sqlite3');
const { initDatabase } = require('../db/init');

describe('review record schema migration', () => {
  test('initDatabase allows single-point exercise types in review_records', () => {
    const db = new Database(':memory:');
    initDatabase(db);

    const userId = db.prepare(
      "INSERT INTO users (username, password, role) VALUES ('student-review', 'hash', 'user')"
    ).run().lastInsertRowid;
    const textbookId = db.prepare("INSERT INTO textbooks (name) VALUES ('Schema Book')").run().lastInsertRowid;
    const unitId = db.prepare("INSERT INTO units (textbook_id, name) VALUES (?, 'Unit 1')").run(textbookId).lastInsertRowid;
    const itemId = db.prepare(
      "INSERT INTO items (unit_id, type, english, chinese) VALUES (?, 'phrase', 'look after', '照顾')"
    ).run(unitId).lastInsertRowid;

    expect(() => {
      db.prepare(
        "INSERT INTO review_records (user_id, item_id, exercise_type, user_answer, is_correct) VALUES (?, ?, 'phrase_choice', 'looks after', 1)"
      ).run(userId, itemId);
    }).not.toThrow();

    db.close();
  });

  test('initDatabase migrates legacy review_records constraint to include new exercise types', () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        role TEXT NOT NULL
      );
      CREATE TABLE textbooks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL
      );
      CREATE TABLE units (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        textbook_id INTEGER NOT NULL REFERENCES textbooks(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        english TEXT,
        chinese TEXT,
        pos TEXT,
        example TEXT,
        audio_path TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE review_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        item_id INTEGER NOT NULL REFERENCES items(id),
        exercise_type TEXT NOT NULL CHECK(exercise_type IN ('en2cn', 'cn2en', 'listening', 'sentence')),
        user_answer TEXT NOT NULL,
        is_correct INTEGER NOT NULL CHECK(is_correct IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_review_user_item ON review_records(user_id, item_id);
      CREATE INDEX idx_review_user_time ON review_records(user_id, created_at);
    `);

    initDatabase(db);

    const userId = db.prepare(
      "INSERT INTO users (username, password, role) VALUES ('student-migrate', 'hash', 'user')"
    ).run().lastInsertRowid;
    const textbookId = db.prepare("INSERT INTO textbooks (name) VALUES ('Legacy Book')").run().lastInsertRowid;
    const unitId = db.prepare("INSERT INTO units (textbook_id, name) VALUES (?, 'Unit 1')").run(textbookId).lastInsertRowid;
    const itemId = db.prepare(
      "INSERT INTO items (unit_id, type, english, chinese) VALUES (?, 'phrase', 'look after', '照顾')"
    ).run(unitId).lastInsertRowid;

    expect(() => {
      db.prepare(
        "INSERT INTO review_records (user_id, item_id, exercise_type, user_answer, is_correct) VALUES (?, ?, 'phrase_choice', 'looks after', 1)"
      ).run(userId, itemId);
    }).not.toThrow();

    db.close();
  });

  test('initDatabase preserves legacy review_records rows across migration reruns', () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        role TEXT NOT NULL
      );
      CREATE TABLE textbooks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL
      );
      CREATE TABLE units (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        textbook_id INTEGER NOT NULL REFERENCES textbooks(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        english TEXT,
        chinese TEXT,
        pos TEXT,
        example TEXT,
        audio_path TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE review_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        item_id INTEGER NOT NULL REFERENCES items(id),
        exercise_type TEXT NOT NULL CHECK(exercise_type IN ('en2cn', 'cn2en', 'listening', 'sentence')),
        user_answer TEXT NOT NULL,
        is_correct INTEGER NOT NULL CHECK(is_correct IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_review_user_item ON review_records(user_id, item_id);
      CREATE INDEX idx_review_user_time ON review_records(user_id, created_at);
    `);

    const userId = db.prepare(
      "INSERT INTO users (username, password, role) VALUES ('student-legacy', 'hash', 'user')"
    ).run().lastInsertRowid;
    const textbookId = db.prepare("INSERT INTO textbooks (name) VALUES ('Legacy Rows Book')").run().lastInsertRowid;
    const unitId = db.prepare("INSERT INTO units (textbook_id, name) VALUES (?, 'Unit 1')").run(textbookId).lastInsertRowid;
    const itemId = db.prepare(
      "INSERT INTO items (unit_id, type, english, chinese) VALUES (?, 'word', 'study', '学习')"
    ).run(unitId).lastInsertRowid;

    db.prepare(
      "INSERT INTO review_records (user_id, item_id, exercise_type, user_answer, is_correct) VALUES (?, ?, 'en2cn', '学习', 1)"
    ).run(userId, itemId);

    initDatabase(db);
    initDatabase(db);

    const rows = db.prepare(
      'SELECT exercise_type, user_answer, is_correct FROM review_records WHERE user_id = ? AND item_id = ?'
    ).all(userId, itemId);

    expect(rows).toEqual([{
      exercise_type: 'en2cn',
      user_answer: '学习',
      is_correct: 1,
    }]);

    db.close();
  });
});
