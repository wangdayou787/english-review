const queries = require('../db/queries');

/**
 * Select items for daily review based on priority.
 * Priority: new > wrong > stale (>7d) > normal rotation
 */
function getDailyItems(db, userId, quotas) {
  const knownIds = queries.getKnownItemIds(db, userId);

  const allWords = queries.getAllItemsByType(db, 'word').filter(i => !knownIds.includes(i.id));
  const allPhrases = queries.getAllItemsByType(db, 'phrase').filter(i => !knownIds.includes(i.id));
  const allGrammars = queries.getAllItemsByType(db, 'grammar').filter(i => !knownIds.includes(i.id));

  function selectType(items, count) {
    if (items.length === 0 || count <= 0) return [];

    // Get review records for these items
    const itemIds = items.map(i => i.id);
    const records = queries.getReviewRecordsForUser(db, userId, itemIds);
    const reviewedIds = new Set(records.map(r => r.item_id));

    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;

    // Build a map: itemId → { lastCorrect, lastWrong, lastReview }
    const itemStats = {};
    for (const r of records) {
      if (!itemStats[r.item_id]) {
        itemStats[r.item_id] = { lastCorrect: null, lastWrong: null, lastReview: r.created_at };
      }
      if (r.is_correct && (!itemStats[r.item_id].lastCorrect || r.created_at > itemStats[r.item_id].lastCorrect)) {
        itemStats[r.item_id].lastCorrect = r.created_at;
      }
      if (!r.is_correct && (!itemStats[r.item_id].lastWrong || r.created_at > itemStats[r.item_id].lastWrong)) {
        itemStats[r.item_id].lastWrong = r.created_at;
      }
    }

    // Priority buckets
    const newItems = items.filter(i => !reviewedIds.has(i.id));
    const wrongItems = items.filter(i => {
      const s = itemStats[i.id];
      return s && s.lastWrong && (!s.lastCorrect || s.lastWrong > s.lastCorrect);
    });
    const staleItems = items.filter(i => {
      const s = itemStats[i.id];
      return s && new Date(s.lastReview).getTime() < now - sevenDays && !wrongItems.includes(i);
    });
    const normalItems = items.filter(i => {
      return reviewedIds.has(i.id) && !wrongItems.includes(i) && !staleItems.includes(i);
    });

    // Sort normal items by most recent review (oldest first)
    normalItems.sort((a, b) => {
      const sa = itemStats[a.id];
      const sb = itemStats[b.id];
      if (!sa || !sb) return 0;
      return new Date(sa.lastReview) - new Date(sb.lastReview);
    });

    // Concatenate priority buckets and take `count`
    const selected = [...newItems, ...wrongItems, ...staleItems, ...normalItems].slice(0, count);
    return selected;
  }

  return {
    words: selectType(allWords, parseInt(quotas.daily_words) || 20),
    phrases: selectType(allPhrases, parseInt(quotas.daily_phrases) || 5),
    grammar: selectType(allGrammars, parseInt(quotas.daily_grammar) || 3),
  };
}

/**
 * Get all items that the user has reviewed within the past `coverDays` days.
 */
function getCycleItems(db, userId, coverDays) {
  const since = new Date();
  since.setDate(since.getDate() - coverDays);
  const sinceStr = since.toISOString().slice(0, 10);

  const rows = db.prepare(
    `SELECT DISTINCT item_id FROM review_records
     WHERE user_id = ? AND created_at >= ?`
  ).all(userId, sinceStr + 'T00:00:00');

  if (rows.length === 0) return [];

  const itemIds = rows.map(r => r.item_id);
  const placeholders = itemIds.map(() => '?').join(',');
  return db.prepare(
    `SELECT * FROM items WHERE id IN (${placeholders})`
  ).all(...itemIds);
}

/**
 * Get enabled review cycles that should trigger today.
 */
function getActiveCycles(db) {
  const cycles = queries.getEnabledReviewCycles(db);
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const dayOfMonth = today.getDate();
  const weekOfYear = Math.ceil(
    (today - new Date(today.getFullYear(), 0, 1)) / (7 * 24 * 60 * 60 * 1000)
  );

  return cycles.filter(c => {
    const triggerDays = JSON.parse(c.trigger_days);

    if (c.cycle_type === 'weekly') {
      return triggerDays.includes(dayOfWeek);
    }
    if (c.cycle_type === 'biweekly') {
      // Trigger only on even weeks
      if (weekOfYear % 2 !== 0) return false;
      return triggerDays.includes(dayOfWeek);
    }
    if (c.cycle_type === 'monthly') {
      return triggerDays.includes(dayOfMonth);
    }
    return false;
  });
}

module.exports = { getDailyItems, getCycleItems, getActiveCycles };
