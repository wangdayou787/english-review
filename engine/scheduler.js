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

function groupTasksByType(tasks) {
  return {
    words: tasks.filter(item => item.type === 'word'),
    phrases: tasks.filter(item => item.type === 'phrase'),
    grammar: tasks.filter(item => item.type === 'grammar'),
  };
}

function parseTaskDate(taskDate) {
  return new Date(`${taskDate}T00:00:00`);
}

function formatTaskDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDayRole(taskDate) {
  const day = parseTaskDate(taskDate).getDay();
  return day === 0 || day === 6 ? 'weekend' : 'weekday';
}

function getCalendarWeekdayRange(taskDate) {
  const date = parseTaskDate(taskDate);
  const day = date.getDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(date);
  monday.setDate(date.getDate() - daysSinceMonday);
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  return {
    startDate: formatTaskDate(monday),
    endDate: formatTaskDate(friday),
  };
}

function splitQuota(quota) {
  const parsed = parseInt(quota, 10) || 0;
  if (parsed <= 0) return { newTarget: 0, reviewTarget: 0 };
  if (parsed === 1) return { newTarget: 1, reviewTarget: 0 };
  const newTarget = Math.max(1, Math.floor(parsed * 0.3));
  return { newTarget, reviewTarget: parsed - newTarget };
}

function uniqueById(items) {
  const seen = new Set();
  return items.filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function getWrongItemIds(db, userId, itemIds) {
  const records = queries.getReviewRecordsForUser(db, userId, itemIds);
  const latest = new Map();
  for (const record of records) {
    if (!latest.has(record.item_id) || record.created_at > latest.get(record.item_id).created_at) {
      latest.set(record.item_id, record);
    }
  }
  return new Set(
    [...latest.values()]
      .filter(record => record.is_correct === 0)
      .map(record => record.item_id)
  );
}

function selectPlanItemsForType({ candidates, reviewPoolItems, wrongIds, knownIds, quota, dayRole }) {
  const available = candidates.filter(item => !knownIds.has(item.id));
  if (quota <= 0 || available.length === 0) return [];

  const availableIds = new Set(available.map(item => item.id));
  const reviewPoolIds = new Set(reviewPoolItems.map(item => item.id));
  const newItems = available.filter(item => !reviewPoolIds.has(item.id));
  const wrongItems = available.filter(item => wrongIds.has(item.id));
  const reviewItems = uniqueById([
    ...wrongItems,
    ...reviewPoolItems.filter(item => item.type === available[0].type && availableIds.has(item.id)),
  ]);

  if (dayRole === 'weekend') {
    const weekendPool = reviewItems.length > 0 ? reviewItems : available;
    return weekendPool.slice(0, quota).map(item => ({ ...item, source_type: 'cycle_review' }));
  }

  if (reviewItems.length === 0) {
    return newItems.slice(0, quota).map(item => ({ ...item, source_type: 'new' }));
  }

  const { newTarget, reviewTarget } = splitQuota(quota);
  const selectedReview = reviewItems.slice(0, reviewTarget).map(item => ({
    ...item,
    source_type: wrongIds.has(item.id) ? 'wrong' : 'recent_review',
  }));
  const selectedIds = new Set(selectedReview.map(item => item.id));
  const selectedNew = newItems
    .filter(item => !selectedIds.has(item.id))
    .slice(0, newTarget)
    .map(item => ({ ...item, source_type: 'new' }));

  return [...selectedNew, ...selectedReview].slice(0, quota);
}

function getOrCreateDailyReviewTasks(db, userId, planId, taskDate, quotas) {
  const existing = queries.getDailyReviewTasks(db, userId, planId, taskDate);
  if (existing.length > 0) {
    return groupTasksByType(existing);
  }

  const dayRole = getDayRole(taskDate);
  const weekdayRange = getCalendarWeekdayRange(taskDate);
  const planItems = queries.getItemsForPlan(db, planId);
  const knownIds = new Set(queries.getKnownItemIds(db, userId));
  const reviewPoolItems = dayRole === 'weekend'
    ? queries.getReviewTaskItemsBetweenDates(db, userId, planId, weekdayRange.startDate, weekdayRange.endDate)
    : queries.getRecentReviewTaskItems(db, userId, planId, 1);
  const wrongIds = getWrongItemIds(db, userId, planItems.map(item => item.id));

  const byType = {
    words: planItems.filter(item => item.type === 'word'),
    phrases: planItems.filter(item => item.type === 'phrase'),
    grammar: planItems.filter(item => item.type === 'grammar'),
  };

  const selected = {
    words: selectPlanItemsForType({
      candidates: byType.words,
      reviewPoolItems,
      wrongIds,
      knownIds,
      quota: parseInt(quotas.daily_words, 10) || 0,
      dayRole,
    }),
    phrases: selectPlanItemsForType({
      candidates: byType.phrases,
      reviewPoolItems,
      wrongIds,
      knownIds,
      quota: parseInt(quotas.daily_phrases, 10) || 0,
      dayRole,
    }),
    grammar: selectPlanItemsForType({
      candidates: byType.grammar,
      reviewPoolItems,
      wrongIds,
      knownIds,
      quota: parseInt(quotas.daily_grammar, 10) || 0,
      dayRole,
    }),
  };

  const flatTasks = [...selected.words, ...selected.phrases, ...selected.grammar].map(item => ({
    item_id: item.id,
    source_type: item.source_type,
  }));

  queries.saveDailyReviewTasks(db, { userId, planId, taskDate, tasks: flatTasks });
  return groupTasksByType(queries.getDailyReviewTasks(db, userId, planId, taskDate));
}

module.exports = { getDailyItems, getCycleItems, getActiveCycles, getOrCreateDailyReviewTasks };
