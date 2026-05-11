const bcrypt = require('bcrypt');

/**
 * Initialize the database: create tables and insert default data.
 * Idempotent — safe to call multiple times.
 * @param {import('better-sqlite3').Database} db
 */
function initDatabase(db) {
  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');

  // ── Create tables ──────────────────────────────────────────────

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      username   TEXT    NOT NULL UNIQUE,
      password   TEXT    NOT NULL,
      role       TEXT    NOT NULL CHECK(role IN ('admin', 'user')),
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS textbooks (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS units (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      textbook_id INTEGER NOT NULL REFERENCES textbooks(id) ON DELETE CASCADE,
      name        TEXT    NOT NULL,
      sort_order  INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_units_textbook ON units(textbook_id, sort_order);

    CREATE TABLE IF NOT EXISTS items (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      unit_id    INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
      type       TEXT    NOT NULL CHECK(type IN ('word', 'phrase', 'grammar')),
      english    TEXT,
      chinese    TEXT,
      pos        TEXT,
      example    TEXT,
      audio_path TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_items_unit ON items(unit_id, sort_order);

    CREATE TABLE IF NOT EXISTS review_records (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       INTEGER NOT NULL REFERENCES users(id),
      item_id       INTEGER NOT NULL REFERENCES items(id),
      exercise_type TEXT    NOT NULL CHECK(exercise_type IN ('en2cn', 'cn2en', 'listening', 'sentence')),
      user_answer   TEXT    NOT NULL,
      is_correct    INTEGER NOT NULL CHECK(is_correct IN (0, 1)),
      created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_review_user_item ON review_records(user_id, item_id);
    CREATE INDEX IF NOT EXISTS idx_review_user_time ON review_records(user_id, created_at);

    CREATE TABLE IF NOT EXISTS check_ins (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       INTEGER NOT NULL REFERENCES users(id),
      check_date    TEXT    NOT NULL,
      words_done    INTEGER NOT NULL DEFAULT 0,
      phrases_done  INTEGER NOT NULL DEFAULT 0,
      grammar_done  INTEGER NOT NULL DEFAULT 0,
      is_complete   INTEGER NOT NULL DEFAULT 0 CHECK(is_complete IN (0, 1)),
      UNIQUE(user_id, check_date)
    );

    CREATE TABLE IF NOT EXISTS item_mastery (
      user_id INTEGER NOT NULL REFERENCES users(id),
      item_id INTEGER NOT NULL REFERENCES items(id),
      known   INTEGER NOT NULL DEFAULT 0 CHECK(known IN (0, 1)),
      PRIMARY KEY (user_id, item_id)
    );

    CREATE TABLE IF NOT EXISTS review_cycles (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      cycle_type   TEXT    NOT NULL CHECK(cycle_type IN ('weekly', 'biweekly', 'monthly')),
      trigger_days TEXT    NOT NULL,
      cover_days   INTEGER NOT NULL,
      is_default   INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN (0, 1)),
      enabled      INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1))
    );

    CREATE TABLE IF NOT EXISTS review_plans (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL,
      is_active  INTEGER NOT NULL DEFAULT 0 CHECK(is_active IN (0, 1)),
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_review_plans_one_active
      ON review_plans(is_active)
      WHERE is_active = 1;

    CREATE TABLE IF NOT EXISTS review_plan_units (
      plan_id INTEGER NOT NULL REFERENCES review_plans(id) ON DELETE CASCADE,
      unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
      PRIMARY KEY (plan_id, unit_id)
    );
    CREATE INDEX IF NOT EXISTS idx_review_plan_units_unit ON review_plan_units(unit_id);

    CREATE TABLE IF NOT EXISTS daily_review_tasks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id),
      plan_id     INTEGER NOT NULL REFERENCES review_plans(id),
      task_date   TEXT    NOT NULL,
      item_id     INTEGER NOT NULL REFERENCES items(id),
      source_type TEXT    NOT NULL CHECK(source_type IN ('new', 'recent_review', 'cycle_review', 'wrong')),
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, task_date, item_id)
    );
    CREATE INDEX IF NOT EXISTS idx_daily_tasks_user_plan_date
      ON daily_review_tasks(user_id, plan_id, task_date);
    CREATE INDEX IF NOT EXISTS idx_daily_tasks_plan_item
      ON daily_review_tasks(plan_id, item_id);

    CREATE TABLE IF NOT EXISTS config (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // ── Insert default data (idempotent via INSERT OR IGNORE) ─────

  // Default admin account (password: admin123)
  const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (!adminExists) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run('admin', hash, 'admin');
  }

  // Default config values
  const defaults = [
    ['daily_words', '20'],
    ['daily_phrases', '5'],
    ['daily_grammar', '3'],
  ];
  const insertConfig = db.prepare('INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)');
  for (const [key, value] of defaults) {
    insertConfig.run(key, value);
  }

  // Default review cycle rules
  const cycleCount = db.prepare('SELECT COUNT(*) as c FROM review_cycles WHERE is_default = 1').get().c;
  if (cycleCount === 0) {
    const insertCycle = db.prepare(
      'INSERT INTO review_cycles (cycle_type, trigger_days, cover_days, is_default, enabled) VALUES (?, ?, ?, 1, 1)'
    );
    insertCycle.run('weekly', '[6,7]', 7);
    insertCycle.run('biweekly', '[6,7]', 14);
    insertCycle.run('monthly', '[28,29,30,31]', 0);
  }
}

module.exports = { initDatabase };
