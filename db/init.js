const bcrypt = require('bcrypt');
const { QUESTION_TYPES, serializeDisplayOptions } = require('../data/question-types');
const { REVIEW_RECORD_EXERCISE_TYPES } = require('../engine/exercise-types');

function getReviewRecordExerciseTypeCheck() {
  return REVIEW_RECORD_EXERCISE_TYPES.map(type => `'${type}'`).join(', ');
}

function ensureReviewRecordExerciseTypes(db) {
  const row = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'review_records'"
  ).get();
  if (!row || !row.sql) return;

  const missingTypes = REVIEW_RECORD_EXERCISE_TYPES.filter(type => !row.sql.includes(`'${type}'`));
  if (missingTypes.length === 0) return;

  db.transaction(() => {
    db.exec(`
      CREATE TABLE review_records_new (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id       INTEGER NOT NULL REFERENCES users(id),
        item_id       INTEGER NOT NULL REFERENCES items(id),
        exercise_type TEXT    NOT NULL CHECK(exercise_type IN (${getReviewRecordExerciseTypeCheck()})),
        user_answer   TEXT    NOT NULL,
        is_correct    INTEGER NOT NULL CHECK(is_correct IN (0, 1)),
        created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO review_records_new (id, user_id, item_id, exercise_type, user_answer, is_correct, created_at)
      SELECT id, user_id, item_id, exercise_type, user_answer, is_correct, created_at
      FROM review_records;
      DROP TABLE review_records;
      ALTER TABLE review_records_new RENAME TO review_records;
      CREATE INDEX IF NOT EXISTS idx_review_user_item ON review_records(user_id, item_id);
      CREATE INDEX IF NOT EXISTS idx_review_user_time ON review_records(user_id, created_at);
    `);
  })();
}

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
      exercise_type TEXT    NOT NULL CHECK(exercise_type IN (${getReviewRecordExerciseTypeCheck()})),
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

    CREATE TABLE IF NOT EXISTS word_question_details (
      item_id            INTEGER PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
      base_form          TEXT,
      first_letter_hint  TEXT,
      usage_note         TEXT,
      inflections_json   TEXT    NOT NULL DEFAULT '{}' CHECK(json_valid(inflections_json) AND json_type(inflections_json) = 'object')
    );

    CREATE TABLE IF NOT EXISTS phrase_choice_questions (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id         INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      prompt_sentence TEXT    NOT NULL,
      correct_phrase  TEXT    NOT NULL,
      distractor_a    TEXT    NOT NULL,
      distractor_b    TEXT    NOT NULL,
      distractor_c    TEXT    NOT NULL,
      explanation     TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_phrase_choice_questions_item ON phrase_choice_questions(item_id, id);

    CREATE TABLE IF NOT EXISTS sentence_order_details (
      item_id          INTEGER PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
      answer_sentence  TEXT    NOT NULL,
      tokens_json      TEXT    NOT NULL DEFAULT '[]' CHECK(json_valid(tokens_json) AND json_type(tokens_json) = 'array'),
      hint_text        TEXT
    );

    CREATE TRIGGER IF NOT EXISTS trg_word_question_details_item_type_ins
    BEFORE INSERT ON word_question_details
    FOR EACH ROW
    WHEN (SELECT type FROM items WHERE id = NEW.item_id) IS NOT 'word'
    BEGIN
      SELECT RAISE(ABORT, 'word_question_details requires a word item');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_word_question_details_item_type_upd
    BEFORE UPDATE OF item_id ON word_question_details
    FOR EACH ROW
    WHEN (SELECT type FROM items WHERE id = NEW.item_id) IS NOT 'word'
    BEGIN
      SELECT RAISE(ABORT, 'word_question_details requires a word item');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_phrase_choice_questions_item_type_ins
    BEFORE INSERT ON phrase_choice_questions
    FOR EACH ROW
    WHEN (SELECT type FROM items WHERE id = NEW.item_id) IS NOT 'phrase'
    BEGIN
      SELECT RAISE(ABORT, 'phrase_choice_questions requires a phrase item');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_phrase_choice_questions_item_type_upd
    BEFORE UPDATE OF item_id ON phrase_choice_questions
    FOR EACH ROW
    WHEN (SELECT type FROM items WHERE id = NEW.item_id) IS NOT 'phrase'
    BEGIN
      SELECT RAISE(ABORT, 'phrase_choice_questions requires a phrase item');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_sentence_order_details_item_type_ins
    BEFORE INSERT ON sentence_order_details
    FOR EACH ROW
    WHEN (SELECT type FROM items WHERE id = NEW.item_id) IS NOT 'grammar'
    BEGIN
      SELECT RAISE(ABORT, 'sentence_order_details requires a grammar item');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_sentence_order_details_item_type_upd
    BEFORE UPDATE OF item_id ON sentence_order_details
    FOR EACH ROW
    WHEN (SELECT type FROM items WHERE id = NEW.item_id) IS NOT 'grammar'
    BEGIN
      SELECT RAISE(ABORT, 'sentence_order_details requires a grammar item');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_items_type_guard
    BEFORE UPDATE OF type ON items
    FOR EACH ROW
    WHEN NEW.type <> OLD.type AND (
      EXISTS(SELECT 1 FROM word_question_details WHERE item_id = OLD.id) OR
      EXISTS(SELECT 1 FROM phrase_choice_questions WHERE item_id = OLD.id) OR
      EXISTS(SELECT 1 FROM sentence_order_details WHERE item_id = OLD.id)
    )
    BEGIN
      SELECT RAISE(ABORT, 'items.type cannot change while support rows exist');
    END;

    CREATE TABLE IF NOT EXISTS config (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS question_types (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      code                  TEXT    NOT NULL UNIQUE,
      category              TEXT    NOT NULL CHECK(category IN ('vocabulary', 'phrase', 'grammar', 'sentence', 'cloze', 'reading')),
      name                  TEXT    NOT NULL,
      description           TEXT    NOT NULL DEFAULT '',
      supported_item_types  TEXT    NOT NULL,
      implementation_status TEXT    NOT NULL CHECK(implementation_status IN ('available', 'planned')),
      default_weight        INTEGER NOT NULL DEFAULT 10 CHECK(default_weight >= 0 AND default_weight <= 100),
      sort_order            INTEGER NOT NULL DEFAULT 0,
      created_at            TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at            TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_question_types_category_sort ON question_types(category, sort_order);

    CREATE TABLE IF NOT EXISTS question_type_settings (
      question_type_code  TEXT    PRIMARY KEY REFERENCES question_types(code) ON DELETE CASCADE,
      enabled             INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0, 1)),
      weight              INTEGER NOT NULL DEFAULT 10 CHECK(weight >= 0 AND weight <= 100),
      instruction_text    TEXT    NOT NULL DEFAULT '',
      primary_action_text TEXT    NOT NULL DEFAULT '',
      hint_text           TEXT    NOT NULL DEFAULT '',
      display_options     TEXT    NOT NULL DEFAULT '{}',
      updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // ── Insert default data (idempotent via INSERT OR IGNORE) ─────

  ensureReviewRecordExerciseTypes(db);

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

  const insertQuestionType = db.prepare(
    `INSERT INTO question_types (
       code, category, name, description, supported_item_types,
       implementation_status, default_weight, sort_order
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(code) DO UPDATE SET
       category = excluded.category,
       name = excluded.name,
       description = excluded.description,
       supported_item_types = excluded.supported_item_types,
       implementation_status = excluded.implementation_status,
       default_weight = excluded.default_weight,
       sort_order = excluded.sort_order,
       updated_at = datetime('now')`
  );

  const insertQuestionTypeSetting = db.prepare(
    `INSERT OR IGNORE INTO question_type_settings (
       question_type_code, enabled, weight, instruction_text,
       primary_action_text, hint_text, display_options
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  QUESTION_TYPES.forEach((type, index) => {
    insertQuestionType.run(
      type.code,
      type.category,
      type.name,
      type.description,
      JSON.stringify(type.supportedItemTypes),
      type.implementationStatus,
      type.defaultWeight,
      index + 1
    );

    insertQuestionTypeSetting.run(
      type.code,
      type.implementationStatus === 'available' ? 1 : 0,
      type.defaultWeight,
      type.instructionText,
      type.primaryActionText,
      type.hintText,
      serializeDisplayOptions(type.displayOptions)
    );
  });
}

module.exports = { initDatabase };
