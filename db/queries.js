/**
 * Database query helpers. Thin wrappers around SQLite queries.
 * All functions receive db as first argument (from app.locals.db).
 */

// ═══════════════════════════════════════════════════════════════
// Textbooks
// ═══════════════════════════════════════════════════════════════

function getTextbooks(db) {
  return db.prepare('SELECT * FROM textbooks ORDER BY sort_order, id').all();
}

function createTextbook(db, name) {
  const result = db.prepare('INSERT INTO textbooks (name) VALUES (?)').run(name);
  return result.lastInsertRowid;
}

function deleteTextbook(db, id) {
  // CASCADE deletes units and items via FK
  db.prepare('DELETE FROM textbooks WHERE id = ?').run(id);
}

// ═══════════════════════════════════════════════════════════════
// Units
// ═══════════════════════════════════════════════════════════════

function getUnitsByTextbook(db, textbookId) {
  return db.prepare(
    'SELECT * FROM units WHERE textbook_id = ? ORDER BY sort_order, id'
  ).all(textbookId);
}

function getUnitById(db, id) {
  return db.prepare('SELECT * FROM units WHERE id = ?').get(id);
}

function createUnit(db, textbookId, name) {
  const result = db.prepare(
    'INSERT INTO units (textbook_id, name) VALUES (?, ?)'
  ).run(textbookId, name);
  return result.lastInsertRowid;
}

function deleteUnit(db, id) {
  db.prepare('DELETE FROM units WHERE id = ?').run(id);
}

// ═══════════════════════════════════════════════════════════════
// Items
// ═══════════════════════════════════════════════════════════════

function getItemsByUnit(db, unitId) {
  return db.prepare(
    'SELECT * FROM items WHERE unit_id = ? ORDER BY sort_order, id'
  ).all(unitId);
}

function getItemById(db, id) {
  return db.prepare('SELECT * FROM items WHERE id = ?').get(id);
}

function createItem(db, { unitId, type, english, chinese, pos, example }) {
  const result = db.prepare(
    `INSERT INTO items (unit_id, type, english, chinese, pos, example)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(unitId, type, english || null, chinese || null, pos || null, example || null);
  return result.lastInsertRowid;
}

function updateItem(db, id, { type, english, chinese, pos, example }) {
  db.prepare(
    `UPDATE items SET type=?, english=?, chinese=?, pos=?, example=? WHERE id=?`
  ).run(type, english || null, chinese || null, pos || null, example || null, id);
}

function deleteItem(db, id) {
  db.prepare('DELETE FROM items WHERE id = ?').run(id);
}

function batchCreateItems(db, unitId, rows) {
  const insert = db.prepare(
    `INSERT INTO items (unit_id, type, english, chinese, pos, example)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  let count = 0;
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const parts = row.split('|').map(s => s.trim());
    const [english, chinese, type, pos, example] = parts;

    if (!type || !['word', 'phrase', 'grammar'].includes(type)) {
      errors.push(`第 ${i + 1} 行：类型无效 (${type})`);
      continue;
    }
    if ((type === 'word' || type === 'phrase') && (!english || !chinese)) {
      errors.push(`第 ${i + 1} 行：${type} 类型需要英文和中文`);
      continue;
    }
    if (type === 'grammar' && !english && !chinese) {
      errors.push(`第 ${i + 1} 行：grammar 类型至少需要英文或中文`);
      continue;
    }

    insert.run(unitId, type, english || null, chinese || null, pos || null, example || null);
    count++;
  }

  return { count, errors };
}

// ═══════════════════════════════════════════════════════════════
// Config
// ═══════════════════════════════════════════════════════════════

function getConfig(db) {
  const rows = db.prepare('SELECT * FROM config').all();
  const config = {};
  rows.forEach(r => { config[r.key] = r.value; });
  return config;
}

function setConfig(db, key, value) {
  db.prepare(
    'INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, String(value));
}

// ═══════════════════════════════════════════════════════════════
// Review Cycles
// ═══════════════════════════════════════════════════════════════

function getReviewCycles(db) {
  return db.prepare('SELECT * FROM review_cycles ORDER BY id').all();
}

function getEnabledReviewCycles(db) {
  return db.prepare('SELECT * FROM review_cycles WHERE enabled = 1 ORDER BY id').all();
}

function createReviewCycle(db, { cycle_type, trigger_days, cover_days }) {
  db.prepare(
    'INSERT INTO review_cycles (cycle_type, trigger_days, cover_days, is_default, enabled) VALUES (?, ?, ?, 0, 1)'
  ).run(cycle_type, trigger_days, cover_days);
}

function toggleReviewCycle(db, id) {
  const cycle = db.prepare('SELECT * FROM review_cycles WHERE id = ?').get(id);
  if (!cycle || cycle.is_default) return;
  db.prepare('UPDATE review_cycles SET enabled = ? WHERE id = ?').run(cycle.enabled ? 0 : 1, id);
}

function deleteReviewCycle(db, id) {
  const cycle = db.prepare('SELECT * FROM review_cycles WHERE id = ?').get(id);
  if (!cycle || cycle.is_default) return;
  db.prepare('DELETE FROM review_cycles WHERE id = ?').run(id);
}

// ═══════════════════════════════════════════════════════════════
// Users
// ═══════════════════════════════════════════════════════════════

function getUserById(db, id) {
  return db.prepare('SELECT id, username, role, created_at FROM users WHERE id = ?').get(id);
}

// ═══════════════════════════════════════════════════════════════
// Review / Stats (for engine and practice)
// ═══════════════════════════════════════════════════════════════

function getReviewRecordsForUser(db, userId, itemIds) {
  if (!itemIds || itemIds.length === 0) return [];
  const placeholders = itemIds.map(() => '?').join(',');
  return db.prepare(
    `SELECT * FROM review_records WHERE user_id = ? AND item_id IN (${placeholders}) ORDER BY created_at DESC`
  ).all(userId, ...itemIds);
}

function insertReviewRecord(db, { userId, itemId, exerciseType, userAnswer, isCorrect }) {
  db.prepare(
    `INSERT INTO review_records (user_id, item_id, exercise_type, user_answer, is_correct)
     VALUES (?, ?, ?, ?, ?)`
  ).run(userId, itemId, exerciseType, userAnswer, isCorrect ? 1 : 0);
}

function upsertCheckIn(db, userId, date, { words, phrases, grammar }) {
  db.prepare(
    `INSERT INTO check_ins (user_id, check_date, words_done, phrases_done, grammar_done, is_complete)
     VALUES (?, ?, ?, ?, ?, 0)
     ON CONFLICT(user_id, check_date) DO UPDATE SET
       words_done = words_done + excluded.words_done,
       phrases_done = phrases_done + excluded.phrases_done,
       grammar_done = grammar_done + excluded.grammar_done`
  ).run(userId, date, words, phrases, grammar);
}

function setCheckInComplete(db, userId, date) {
  db.prepare(
    `UPDATE check_ins SET is_complete = 1 WHERE user_id = ? AND check_date = ?`
  ).run(userId, date);
}

function getCheckIn(db, userId, date) {
  return db.prepare(
    'SELECT * FROM check_ins WHERE user_id = ? AND check_date = ?'
  ).get(userId, date);
}

function getConsecutiveDays(db, userId) {
  const rows = db.prepare(
    `SELECT check_date, is_complete FROM check_ins
     WHERE user_id = ? ORDER BY check_date DESC LIMIT 100`
  ).all(userId);

  let count = 0;
  const today = new Date().toISOString().slice(0, 10);

  for (let i = 0; i < rows.length; i++) {
    const expected = new Date();
    expected.setDate(expected.getDate() - i);
    const expectedStr = expected.toISOString().slice(0, 10);

    if (rows[i].check_date === expectedStr && rows[i].is_complete) {
      count++;
    } else if (i === 0 && rows[i].check_date !== today) {
      // Today not yet completed — check if yesterday was
      break; // allow today to be incomplete
    } else {
      break;
    }
  }

  // Count from today backwards
  let consecutive = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const ds = d.toISOString().slice(0, 10);
    const row = rows.find(r => r.check_date === ds);
    if (row && row.is_complete) {
      consecutive++;
    } else {
      // If today is not yet checked, consider it the start
      if (i === 0 && (!row || !row.is_complete)) {
        continue;
      }
      break;
    }
  }

  return consecutive;
}

function getTotalScore(db, userId) {
  const correct = db.prepare(
    'SELECT COUNT(*) as c FROM review_records WHERE user_id = ? AND is_correct = 1'
  ).get(userId).c;
  return correct;
}

function getAccuracy(db, userId) {
  const total = db.prepare(
    'SELECT COUNT(*) as c FROM review_records WHERE user_id = ?'
  ).get(userId).c;
  if (total === 0) return 0;
  const correct = db.prepare(
    'SELECT COUNT(*) as c FROM review_records WHERE user_id = ? AND is_correct = 1'
  ).get(userId).c;
  return Math.round((correct / total) * 1000) / 10;
}

function getCheckInsForMonth(db, userId, year, month) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = `${year}-${String(month).padStart(2, '0')}-31`;
  return db.prepare(
    `SELECT check_date, is_complete FROM check_ins
     WHERE user_id = ? AND check_date >= ? AND check_date <= ? ORDER BY check_date`
  ).all(userId, start, end);
}

function setItemKnown(db, userId, itemId, known) {
  db.prepare(
    `INSERT INTO item_mastery (user_id, item_id, known) VALUES (?, ?, ?)
     ON CONFLICT(user_id, item_id) DO UPDATE SET known = excluded.known`
  ).run(userId, itemId, known ? 1 : 0);
}

function getKnownItemIds(db, userId) {
  return db.prepare(
    'SELECT item_id FROM item_mastery WHERE user_id = ? AND known = 1'
  ).all(userId).map(r => r.item_id);
}

function getAllItemsByType(db, type) {
  return db.prepare('SELECT * FROM items WHERE type = ? ORDER BY id').all(type);
}

module.exports = {
  getTextbooks,
  createTextbook,
  deleteTextbook,
  getUnitsByTextbook,
  getUnitById,
  createUnit,
  deleteUnit,
  getItemsByUnit,
  getItemById,
  createItem,
  updateItem,
  deleteItem,
  batchCreateItems,
  getConfig,
  setConfig,
  getReviewCycles,
  getEnabledReviewCycles,
  createReviewCycle,
  toggleReviewCycle,
  deleteReviewCycle,
  getUserById,
  getReviewRecordsForUser,
  insertReviewRecord,
  upsertCheckIn,
  setCheckInComplete,
  getCheckIn,
  getConsecutiveDays,
  getTotalScore,
  getAccuracy,
  getCheckInsForMonth,
  setItemKnown,
  getKnownItemIds,
  getAllItemsByType,
};
