const express = require('express');
const router = express.Router();
const queries = require('../db/queries');
const { requireAuth } = require('../middleware/auth');

function renderWithLayout(res, view, data, title) {
  res.render(view, data, (err, body) => {
    if (err) return res.status(500).send('Render error');
    res.render('layout', { title, body });
  });
}

router.use(requireAuth);

router.get('/stats', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.user.id;

  const totalScore = queries.getTotalScore(db, userId);
  const consecutive = queries.getConsecutiveDays(db, userId);
  const accuracy = queries.getAccuracy(db, userId);

  // Calendar for current and previous month
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
  const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;

  const currentCheckIns = queries.getCheckInsForMonth(db, userId, currentYear, currentMonth);
  const prevCheckIns = queries.getCheckInsForMonth(db, userId, prevYear, prevMonth);

  const knownItems = db.prepare(
    `SELECT i.*, m.known FROM item_mastery m
     JOIN items i ON i.id = m.item_id
     WHERE m.user_id = ? AND m.known = 1`
  ).all(userId);

  renderWithLayout(res, 'stats', {
    totalScore,
    consecutive,
    accuracy,
    currentMonth: { year: currentYear, month: currentMonth, checkIns: currentCheckIns },
    prevMonth: { year: prevYear, month: prevMonth, checkIns: prevCheckIns },
    knownItems,
  }, '学习统计');
});

module.exports = router;
