const express = require('express');
const router = express.Router();
const queries = require('../db/queries');
const scheduler = require('../engine/scheduler');
const generator = require('../engine/generator');
const { requireAuth } = require('../middleware/auth');

function renderWithLayout(res, view, data, title) {
  res.render(view, data, (err, body) => {
    if (err) return res.status(500).send('Render error');
    res.render('layout', { title, body });
  });
}

router.use(requireAuth);

// ── Dashboard ────────────────────────────────────────────────────
router.get('/practice', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.user.id;
  const config = queries.getConfig(db);
  const today = new Date().toISOString().slice(0, 10);
  const checkIn = queries.getCheckIn(db, userId, today) || { words_done: 0, phrases_done: 0, grammar_done: 0 };
  const consecutive = queries.getConsecutiveDays(db, userId);
  const totalScore = queries.getTotalScore(db, userId);
  const activeCycles = scheduler.getActiveCycles(db);

  const hasItems = db.prepare('SELECT COUNT(*) as c FROM items').get().c > 0;

  renderWithLayout(res, 'practice/dashboard', {
    config,
    checkIn,
    consecutive,
    totalScore,
    activeCycles,
    hasItems,
  }, '复习主页');
});

// ── Start exercise (daily or cycle) ──────────────────────────────
router.get('/practice/start', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.user.id;
  const config = queries.getConfig(db);
  const cycleType = req.query.cycle;

  let items;
  let title;

  if (cycleType) {
    // Cycle review
    const cycles = queries.getEnabledReviewCycles(db);
    const cycle = cycles.find(c => c.cycle_type === cycleType);
    if (!cycle) return res.redirect('/practice');

    const coverDays = cycle.cover_days === 0
      ? new Date().getDate() // month-to-date
      : cycle.cover_days;

    items = scheduler.getCycleItems(db, userId, coverDays);
    title = `${cycleType === 'weekly' ? '周' : cycleType === 'biweekly' ? '双周' : '月'}复习`;
  } else {
    // Daily review
    const result = scheduler.getDailyItems(db, userId, config);
    items = [...result.words, ...result.phrases, ...result.grammar];
    title = '今日复习';
  }

  if (items.length === 0) {
    return renderWithLayout(res, 'practice/dashboard', {
      config,
      checkIn: queries.getCheckIn(db, userId, new Date().toISOString().slice(0, 10)) || {},
      consecutive: queries.getConsecutiveDays(db, userId),
      totalScore: queries.getTotalScore(db, userId),
      activeCycles: scheduler.getActiveCycles(db),
      hasItems: true,
      error: '暂无复习内容',
    }, '复习主页');
  }

  // Paginate for cycle review
  const page = parseInt(req.query.page) || 1;
  const perPage = 20;
  const totalPages = Math.ceil(items.length / perPage);
  const pageItems = items.slice((page - 1) * perPage, page * perPage);

  const exercises = generator.generateExercises(pageItems, db);

  renderWithLayout(res, 'practice/exercise', {
    exercises,
    title,
    cycleType,
    page,
    totalPages,
    totalItems: items.length,
  }, title);
});

// ── Submit answers ───────────────────────────────────────────────
router.post('/practice/submit', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.user.id;

  // Parse answers from urlencoded form (answers[0][item_id], answers[0][answer], etc.)
  const rawAnswers = req.body.answers;
  let answers = [];
  
  if (Array.isArray(rawAnswers)) {
    answers = rawAnswers.map(a => ({
      item_id: parseInt(a.item_id),
      exercise_type: a.exercise_type,
      answer: a.answer || '',
    }));
  } else if (rawAnswers) {
    // Single answer case
    answers = [{
      item_id: parseInt(rawAnswers.item_id),
      exercise_type: rawAnswers.exercise_type,
      answer: rawAnswers.answer || '',
    }];
  }

  // Get items for scoring
  const itemIds = answers.map(a => a.item_id);
  const placeholders = itemIds.map(() => '?').join(',');
  const items = placeholders.length > 0
    ? db.prepare(`SELECT * FROM items WHERE id IN (${placeholders})`).all(...itemIds)
    : [];

  const result = generator.scoreAnswers(items, answers);

  // Write review records
  const insertRecord = db.prepare(
    `INSERT INTO review_records (user_id, item_id, exercise_type, user_answer, is_correct, created_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`
  );
  for (const r of result.results) {
    insertRecord.run(userId, r.item_id, answers.find(a => a.item_id === r.item_id)?.exercise_type || 'en2cn', r.user_answer, r.is_correct ? 1 : 0);
  }

  // Update check-in counts
  const today = new Date().toISOString().slice(0, 10);
  const config = queries.getConfig(db);
  const wordCount = answers.filter(a => {
    const item = items.find(i => i.id === a.item_id);
    return item && item.type === 'word';
  }).length;
  const phraseCount = answers.filter(a => {
    const item = items.find(i => i.id === a.item_id);
    return item && item.type === 'phrase';
  }).length;
  const grammarCount = answers.filter(a => {
    const item = items.find(i => i.id === a.item_id);
    return item && item.type === 'grammar';
  }).length;

  queries.upsertCheckIn(db, userId, today, { words: wordCount, phrases: phraseCount, grammar: grammarCount });

  // Check if daily goal met
  const checkIn = queries.getCheckIn(db, userId, today);
  if (checkIn && checkIn.words_done >= parseInt(config.daily_words) &&
      checkIn.phrases_done >= parseInt(config.daily_phrases) &&
      checkIn.grammar_done >= parseInt(config.daily_grammar)) {
    queries.setCheckInComplete(db, userId, today);
  }

  renderWithLayout(res, 'practice/result', {
    results: result.results,
    score: result.score,
    totalCorrect: result.total_correct,
    totalQuestions: result.total_questions,
    perfectBonus: result.perfect_bonus,
    items,
  }, '练习结果');
});

// ── Mark item as known ───────────────────────────────────────────
router.post('/practice/item/:id/known', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.user.id;
  queries.setItemKnown(db, userId, req.params.id, true);
  res.redirect(req.get('Referrer') || '/practice');
});

module.exports = router;
