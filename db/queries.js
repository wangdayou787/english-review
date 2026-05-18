/**
 * Database query helpers. Thin wrappers around SQLite queries.
 * All functions receive db as first argument (from app.locals.db).
 */
const { CATEGORY_LABELS, DEFAULT_DISPLAY_OPTIONS } = require('../data/question-types');

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
    const explicitType = parts[2];
    const isExplicitType = ['word', 'phrase', 'grammar'].includes(explicitType);
    const [english, chinese, type, pos, example] = isExplicitType
      ? parts
      : [parts[0], parts[2], 'word', parts[3], parts[4]];

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

function normalizeWrongItemType(type) {
  return ['word', 'phrase', 'grammar'].includes(type) ? type : null;
}

function normalizePositiveLimit(limit) {
  const parsed = Number(limit);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function getWrongItemsForUser(db, userId, options = {}) {
  const type = normalizeWrongItemType(options.type);
  const limit = normalizePositiveLimit(options.limit);
  const params = [userId, userId];
  const typeClause = type ? 'AND items.type = ?' : '';
  if (type) params.push(type);

  const limitClause = limit ? 'LIMIT ?' : '';
  if (limit) params.push(limit);

  return db.prepare(
    `WITH latest_records AS (
       SELECT review_records.*
       FROM review_records
       JOIN (
         SELECT item_id, MAX(id) AS latest_id
         FROM review_records
         WHERE user_id = ?
         GROUP BY item_id
       ) latest ON latest.latest_id = review_records.id
     ),
     wrong_counts AS (
       SELECT item_id, COUNT(*) AS wrong_count
       FROM review_records
       WHERE user_id = ? AND is_correct = 0
       GROUP BY item_id
     )
     SELECT
       items.id AS item_id,
       items.type,
       items.english,
       items.chinese,
       items.pos,
       items.example,
       wrong_counts.wrong_count,
       latest_records.created_at AS last_wrong_at,
       latest_records.user_answer AS last_user_answer,
       latest_records.exercise_type AS last_exercise_type
     FROM latest_records
     JOIN items ON items.id = latest_records.item_id
     JOIN wrong_counts ON wrong_counts.item_id = latest_records.item_id
     LEFT JOIN item_mastery
       ON item_mastery.user_id = latest_records.user_id
      AND item_mastery.item_id = latest_records.item_id
      AND item_mastery.known = 1
     WHERE latest_records.is_correct = 0
       AND item_mastery.item_id IS NULL
       ${typeClause}
     ORDER BY latest_records.created_at DESC, latest_records.id DESC
     ${limitClause}`
  ).all(...params);
}

function getWrongItemCountsForUser(db, userId) {
  const rows = db.prepare(
    `WITH latest_records AS (
       SELECT review_records.*
       FROM review_records
       JOIN (
         SELECT item_id, MAX(id) AS latest_id
         FROM review_records
         WHERE user_id = ?
         GROUP BY item_id
       ) latest ON latest.latest_id = review_records.id
     )
     SELECT items.type, COUNT(*) AS count
     FROM latest_records
     JOIN items ON items.id = latest_records.item_id
     LEFT JOIN item_mastery
       ON item_mastery.user_id = latest_records.user_id
      AND item_mastery.item_id = latest_records.item_id
      AND item_mastery.known = 1
     WHERE latest_records.is_correct = 0
       AND item_mastery.item_id IS NULL
     GROUP BY items.type`
  ).all(userId);

  const counts = { all: 0, word: 0, phrase: 0, grammar: 0 };
  for (const row of rows) {
    if (Object.prototype.hasOwnProperty.call(counts, row.type)) {
      counts[row.type] = row.count;
      counts.all += row.count;
    }
  }
  return counts;
}

// ═══════════════════════════════════════════════════════════════
// Review Plans
// ═══════════════════════════════════════════════════════════════

function getWrongItemDetailForUser(db, userId, itemId) {
  const parsedItemId = Number(itemId);
  if (!Number.isInteger(parsedItemId) || parsedItemId <= 0) return null;

  return db.prepare(
    `WITH latest_records AS (
       SELECT review_records.*
       FROM review_records
       JOIN (
         SELECT item_id, MAX(id) AS latest_id
         FROM review_records
         WHERE user_id = ? AND item_id = ?
         GROUP BY item_id
       ) latest ON latest.latest_id = review_records.id
     ),
     wrong_counts AS (
       SELECT item_id, COUNT(*) AS wrong_count
       FROM review_records
       WHERE user_id = ? AND item_id = ? AND is_correct = 0
       GROUP BY item_id
     )
     SELECT
       items.id AS item_id,
       items.id AS id,
       items.type,
       items.english,
       items.chinese,
       items.pos,
       items.example,
       wrong_counts.wrong_count,
       latest_records.created_at AS last_wrong_at,
       latest_records.user_answer AS last_user_answer,
       latest_records.exercise_type AS last_exercise_type
     FROM latest_records
     JOIN items ON items.id = latest_records.item_id
     JOIN wrong_counts ON wrong_counts.item_id = latest_records.item_id
     LEFT JOIN item_mastery
       ON item_mastery.user_id = latest_records.user_id
      AND item_mastery.item_id = latest_records.item_id
      AND item_mastery.known = 1
     WHERE latest_records.is_correct = 0
       AND item_mastery.item_id IS NULL`
  ).get(userId, parsedItemId, userId, parsedItemId) || null;
}

function getReviewHistoryForUserItem(db, userId, itemId, options = {}) {
  const parsedItemId = Number(itemId);
  if (!Number.isInteger(parsedItemId) || parsedItemId <= 0) return [];

  const limit = normalizePositiveLimit(options.limit) || 10;
  return db.prepare(
    `SELECT id, user_id, item_id, exercise_type, user_answer, is_correct, created_at
     FROM review_records
     WHERE user_id = ? AND item_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT ?`
  ).all(userId, parsedItemId, limit);
}

function getActiveReviewPlan(db) {
  const plan = db.prepare('SELECT * FROM review_plans WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get();
  if (!plan) return null;

  const units = db.prepare(
    `SELECT units.*, textbooks.name AS textbook_name
     FROM review_plan_units
     JOIN units ON units.id = review_plan_units.unit_id
     JOIN textbooks ON textbooks.id = units.textbook_id
     WHERE review_plan_units.plan_id = ?
     ORDER BY textbooks.sort_order, textbooks.id, units.sort_order, units.id`
  ).all(plan.id);

  return { ...plan, units };
}

function activateReviewPlan(db, { name, unitIds }) {
  const cleanUnitIds = [...new Set((unitIds || []).map(id => parseInt(id, 10)).filter(Number.isFinite))];
  if (cleanUnitIds.length === 0) {
    throw new Error('At least one unit is required');
  }

  const tx = db.transaction(() => {
    db.prepare("UPDATE review_plans SET is_active = 0, updated_at = datetime('now') WHERE is_active = 1").run();
    const result = db.prepare(
      'INSERT INTO review_plans (name, is_active) VALUES (?, 1)'
    ).run(name && name.trim() ? name.trim() : '复习计划');

    const insertUnit = db.prepare('INSERT INTO review_plan_units (plan_id, unit_id) VALUES (?, ?)');
    for (const unitId of cleanUnitIds) {
      insertUnit.run(result.lastInsertRowid, unitId);
    }

    return result.lastInsertRowid;
  });

  return tx();
}

function getItemsForPlan(db, planId) {
  return db.prepare(
    `SELECT items.*
     FROM review_plan_units
     JOIN items ON items.unit_id = review_plan_units.unit_id
     WHERE review_plan_units.plan_id = ?
     ORDER BY items.type, items.sort_order, items.id`
  ).all(planId);
}

function getPlanItemCounts(db, planId) {
  const rows = db.prepare(
    `SELECT items.type, COUNT(*) AS count
     FROM review_plan_units
     JOIN items ON items.unit_id = review_plan_units.unit_id
     WHERE review_plan_units.plan_id = ?
     GROUP BY items.type`
  ).all(planId);

  return rows.reduce((counts, row) => {
    counts[row.type] = row.count;
    return counts;
  }, { word: 0, phrase: 0, grammar: 0 });
}

function getDailyReviewTasks(db, userId, planId, taskDate) {
  return db.prepare(
    `SELECT items.*, daily_review_tasks.source_type, daily_review_tasks.task_date
     FROM daily_review_tasks
     JOIN items ON items.id = daily_review_tasks.item_id
     WHERE daily_review_tasks.user_id = ?
       AND daily_review_tasks.plan_id = ?
       AND daily_review_tasks.task_date = ?
     ORDER BY daily_review_tasks.id`
  ).all(userId, planId, taskDate);
}

function saveDailyReviewTasks(db, { userId, planId, taskDate, tasks }) {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO daily_review_tasks (user_id, plan_id, task_date, item_id, source_type)
     VALUES (?, ?, ?, ?, ?)`
  );

  const tx = db.transaction(() => {
    for (const task of tasks) {
      insert.run(userId, planId, taskDate, task.item_id, task.source_type);
    }
  });

  tx();
}

function getReviewTaskDates(db, userId, planId) {
  return db.prepare(
    `SELECT DISTINCT task_date
     FROM daily_review_tasks
     WHERE user_id = ? AND plan_id = ?
     ORDER BY task_date`
  ).all(userId, planId).map(row => row.task_date);
}

function getRecentReviewTaskItems(db, userId, planId, limitDays) {
  const dates = db.prepare(
    `SELECT DISTINCT task_date
     FROM daily_review_tasks
     WHERE user_id = ? AND plan_id = ?
     ORDER BY task_date DESC
     LIMIT ?`
  ).all(userId, planId, limitDays).map(row => row.task_date);

  if (dates.length === 0) return [];

  const placeholders = dates.map(() => '?').join(',');
  return db.prepare(
    `SELECT items.*, daily_review_tasks.source_type, daily_review_tasks.task_date
     FROM daily_review_tasks
     JOIN items ON items.id = daily_review_tasks.item_id
     WHERE daily_review_tasks.user_id = ?
       AND daily_review_tasks.plan_id = ?
       AND daily_review_tasks.task_date IN (${placeholders})
     ORDER BY daily_review_tasks.task_date DESC, daily_review_tasks.id`
  ).all(userId, planId, ...dates);
}

function getReviewTaskItemsBetweenDates(db, userId, planId, startDate, endDate) {
  return db.prepare(
    `SELECT items.*, daily_review_tasks.source_type, daily_review_tasks.task_date
     FROM daily_review_tasks
     JOIN items ON items.id = daily_review_tasks.item_id
     WHERE daily_review_tasks.user_id = ?
       AND daily_review_tasks.plan_id = ?
       AND daily_review_tasks.task_date BETWEEN ? AND ?
     ORDER BY daily_review_tasks.task_date, daily_review_tasks.id`
  ).all(userId, planId, startDate, endDate);
}

// ═══════════════════════════════════════════════════════════════
// Question Types
// ═══════════════════════════════════════════════════════════════

function parseJsonOrDefault(value, fallback) {
  try {
    return JSON.parse(value || JSON.stringify(fallback));
  } catch (err) {
    return fallback;
  }
}

function getWordQuestionDetails(db, itemId) {
  const row = db.prepare('SELECT * FROM word_question_details WHERE item_id = ?').get(itemId);
  if (!row) return null;
  return {
    ...row,
    inflections: parseJsonOrDefault(row.inflections_json, {}),
  };
}

function saveWordQuestionDetails(db, itemId, { baseForm, firstLetterHint, usageNote, inflections }) {
  const normalizedInflections = Object.fromEntries(
    Object.entries(inflections || {}).filter(([, value]) => {
      if (value === null || value === undefined) return false;
      if (typeof value === 'string') return value.trim() !== '';
      return true;
    })
  );

  db.prepare(
    `INSERT INTO word_question_details (item_id, base_form, first_letter_hint, usage_note, inflections_json)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(item_id) DO UPDATE SET
       base_form = excluded.base_form,
       first_letter_hint = excluded.first_letter_hint,
       usage_note = excluded.usage_note,
       inflections_json = excluded.inflections_json`
  ).run(
    itemId,
    baseForm || null,
    firstLetterHint || null,
    usageNote || null,
    JSON.stringify(Object.keys(normalizedInflections).length ? normalizedInflections : {}),
  );
}

function getPhraseChoiceQuestionsByItem(db, itemId) {
  return db.prepare(
    'SELECT * FROM phrase_choice_questions WHERE item_id = ? ORDER BY id'
  ).all(itemId);
}

function savePhraseChoiceQuestion(db, { itemId, promptSentence, correctPhrase, distractorA, distractorB, distractorC, explanation }) {
  const result = db.prepare(
    `INSERT INTO phrase_choice_questions (
       item_id, prompt_sentence, correct_phrase, distractor_a, distractor_b, distractor_c, explanation
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    itemId,
    promptSentence,
    correctPhrase,
    distractorA,
    distractorB,
    distractorC,
    explanation || null,
  );
  return result.lastInsertRowid;
}

function updatePhraseChoiceQuestion(db, id, { promptSentence, correctPhrase, distractorA, distractorB, distractorC, explanation }) {
  db.prepare(
    `UPDATE phrase_choice_questions
     SET prompt_sentence = ?,
         correct_phrase = ?,
         distractor_a = ?,
         distractor_b = ?,
         distractor_c = ?,
         explanation = ?
     WHERE id = ?`
  ).run(
    promptSentence,
    correctPhrase,
    distractorA,
    distractorB,
    distractorC,
    explanation || null,
    id,
  );
}

function deletePhraseChoiceQuestion(db, id) {
  db.prepare('DELETE FROM phrase_choice_questions WHERE id = ?').run(id);
}

function getSentenceOrderDetails(db, itemId) {
  const row = db.prepare('SELECT * FROM sentence_order_details WHERE item_id = ?').get(itemId);
  if (!row) return null;
  return {
    ...row,
    tokens: parseJsonOrDefault(row.tokens_json, []),
  };
}

function saveSentenceOrderDetails(db, itemId, { answerSentence, tokens, hintText }) {
  db.prepare(
    `INSERT INTO sentence_order_details (item_id, answer_sentence, tokens_json, hint_text)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(item_id) DO UPDATE SET
       answer_sentence = excluded.answer_sentence,
       tokens_json = excluded.tokens_json,
       hint_text = excluded.hint_text`
  ).run(
    itemId,
    answerSentence,
    JSON.stringify(Array.isArray(tokens) ? tokens : []),
    hintText || null,
  );
}

function safeParseDisplayOptions(value) {
  try {
    return { ...DEFAULT_DISPLAY_OPTIONS, ...JSON.parse(value || '{}') };
  } catch (err) {
    return { ...DEFAULT_DISPLAY_OPTIONS };
  }
}

function normalizeQuestionTypeRow(row) {
  const supportedItemTypes = parseJsonOrDefault(row.supported_item_types, []);
  return {
    ...row,
    enabled: row.enabled === 1,
    supported_item_types: Array.isArray(supportedItemTypes) ? supportedItemTypes : [],
    display_options: safeParseDisplayOptions(row.display_options),
  };
}

function getQuestionTypeRows(db) {
  return db.prepare(
    `SELECT question_types.*,
            COALESCE(question_type_settings.enabled, CASE WHEN question_types.implementation_status = 'available' THEN 1 ELSE 0 END) AS enabled,
            COALESCE(question_type_settings.weight, question_types.default_weight) AS weight,
            COALESCE(question_type_settings.instruction_text, '') AS instruction_text,
            COALESCE(question_type_settings.primary_action_text, '') AS primary_action_text,
            COALESCE(question_type_settings.hint_text, '') AS hint_text,
            COALESCE(question_type_settings.display_options, '{}') AS display_options
     FROM question_types
     LEFT JOIN question_type_settings ON question_type_settings.question_type_code = question_types.code
     ORDER BY question_types.sort_order, question_types.id`
  ).all().map(normalizeQuestionTypeRow);
}

function getQuestionTypeGroups(db) {
  const groups = Object.entries(CATEGORY_LABELS).map(([category, label]) => ({ category, label, types: [] }));
  const byCategory = new Map(groups.map(group => [group.category, group]));

  for (const row of getQuestionTypeRows(db)) {
    const group = byCategory.get(row.category);
    if (group) group.types.push(row);
  }

  return groups;
}

function validateQuestionTypeWeight(weight) {
  const raw = typeof weight === 'number' ? weight : String(weight).trim();
  const parsed = typeof raw === 'number'
    ? raw
    : (/^[+-]?\d+$/.test(raw) ? Number(raw) : Number.NaN);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
    throw new Error('题型比例必须是 0 到 100 的整数');
  }
  return parsed;
}

function updateQuestionTypeSettings(db, settings) {
  const existingCodes = new Set(db.prepare('SELECT code FROM question_types').all().map(row => row.code));
  const update = db.prepare(
    `INSERT INTO question_type_settings (question_type_code, enabled, weight, instruction_text, primary_action_text, hint_text, display_options, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(question_type_code) DO UPDATE SET
       enabled = excluded.enabled,
       weight = excluded.weight,
       instruction_text = excluded.instruction_text,
       primary_action_text = excluded.primary_action_text,
       hint_text = excluded.hint_text,
       display_options = excluded.display_options,
       updated_at = datetime('now')`
  );
  const tx = db.transaction(() => {
    for (const setting of settings) {
      if (!existingCodes.has(setting.code)) continue;
      update.run(
        setting.code,
        setting.enabled ? 1 : 0,
        validateQuestionTypeWeight(setting.weight),
        String(setting.instructionText || ''),
        String(setting.primaryActionText || ''),
        String(setting.hintText || ''),
        JSON.stringify({ ...DEFAULT_DISPLAY_OPTIONS, ...(setting.displayOptions || {}) })
      );
    }
  });
  tx();
}

function getAvailableQuestionTypesForItemType(db, itemType) {
  return getQuestionTypeRows(db).filter(row => (
    row.implementation_status === 'available' &&
    row.enabled &&
    row.weight > 0 &&
    row.supported_item_types.includes(itemType)
  ));
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
  getWrongItemsForUser,
  getWrongItemCountsForUser,
  getWrongItemDetailForUser,
  getReviewHistoryForUserItem,
  getActiveReviewPlan,
  activateReviewPlan,
  getItemsForPlan,
  getPlanItemCounts,
  getDailyReviewTasks,
  saveDailyReviewTasks,
  getReviewTaskDates,
  getRecentReviewTaskItems,
  getReviewTaskItemsBetweenDates,
  getWordQuestionDetails,
  saveWordQuestionDetails,
  getPhraseChoiceQuestionsByItem,
  savePhraseChoiceQuestion,
  updatePhraseChoiceQuestion,
  deletePhraseChoiceQuestion,
  getSentenceOrderDetails,
  saveSentenceOrderDetails,
  getQuestionTypeGroups,
  updateQuestionTypeSettings,
  getAvailableQuestionTypesForItemType,
};
