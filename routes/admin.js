const express = require('express');
const router = express.Router();
const queries = require('../db/queries');
const { requireAdmin } = require('../middleware/auth');
const { normalizeExampleText } = require('../lib/item-examples');
const WORD_INFLECTION_FIELDS = [
  'plural',
  'third_person_singular',
  'past_tense',
  'past_participle',
  'present_participle',
  'comparative',
  'superlative',
  'adverb',
  'adjective',
  'noun',
];

// Reuse renderWithLayout helper
function renderWithLayout(res, view, data, title) {
  res.render(view, data, (err, body) => {
    if (err) return res.status(500).send('Render error');
    res.render('layout', { title, body });
  });
}

router.use(requireAdmin);

// ── Textbooks ────────────────────────────────────────────────────
router.get('/admin', (req, res) => res.redirect('/admin/textbooks'));

// ── Review Plan ──────────────────────────────────────────────────
router.get('/admin/review-plan', (req, res) => {
  const db = req.app.locals.db;
  const textbooks = queries.getTextbooks(db).map(textbook => ({
    ...textbook,
    units: queries.getUnitsByTextbook(db, textbook.id),
  }));
  const activePlan = queries.getActiveReviewPlan(db);
  const config = queries.getConfig(db);
  const counts = activePlan ? queries.getPlanItemCounts(db, activePlan.id) : { word: 0, phrase: 0, grammar: 0 };

  renderWithLayout(res, 'admin/review-plan', {
    textbooks,
    activePlan,
    config,
    counts,
    error: null,
    success: null,
  }, '复习计划');
});

router.post('/admin/review-plan', (req, res) => {
  const db = req.app.locals.db;
  const rawUnitIds = req.body.unit_ids;
  const unitIds = Array.isArray(rawUnitIds) ? rawUnitIds : rawUnitIds ? [rawUnitIds] : [];

  if (unitIds.length === 0) {
    const textbooks = queries.getTextbooks(db).map(textbook => ({
      ...textbook,
      units: queries.getUnitsByTextbook(db, textbook.id),
    }));
    const activePlan = queries.getActiveReviewPlan(db);
    const config = queries.getConfig(db);
    const counts = activePlan ? queries.getPlanItemCounts(db, activePlan.id) : { word: 0, phrase: 0, grammar: 0 };

    return renderWithLayout(res, 'admin/review-plan', {
      textbooks,
      activePlan,
      config,
      counts,
      error: '请至少选择一个单元',
      success: null,
    }, '复习计划');
  }

  queries.activateReviewPlan(db, {
    name: req.body.name || '复习计划',
    unitIds,
  });
  res.redirect('/admin/review-plan');
});

// ── Question Types ────────────────────────────────────────────────
router.get('/admin/question-types', (req, res) => {
  const groups = queries.getQuestionTypeGroups(req.app.locals.db);
  renderWithLayout(res, 'admin/question-types', { groups, error: null, success: null }, '题型设置');
});

function normalizeQuestionTypeSettings(rawSettings) {
  const settingsArray = Array.isArray(rawSettings) ? rawSettings : rawSettings ? Object.values(rawSettings) : [];
  return settingsArray.map(setting => ({
    code: setting.code,
    enabled: setting.enabled === 'on' || setting.enabled === '1' || setting.enabled === true,
    weight: setting.weight,
    instructionText: setting.instructionText,
    primaryActionText: setting.primaryActionText,
    hintText: setting.hintText,
    displayOptions: {
      showExample: setting.showExample === 'on',
      showPartOfSpeech: setting.showPartOfSpeech === 'on',
      showChineseMeaning: setting.showChineseMeaning === 'on',
      showFirstLetterHint: setting.showFirstLetterHint === 'on',
    },
  }));
}

function normalizeWordQuestionDetails(raw) {
  return {
    baseForm: raw?.base_form || '',
    firstLetterHint: raw?.first_letter_hint || '',
    usageNote: raw?.usage_note || '',
    inflections: WORD_INFLECTION_FIELDS.reduce((all, key) => {
      all[key] = raw?.[key] || '';
      return all;
    }, {}),
  };
}

function normalizePhraseChoiceRows(rawRows) {
  const rows = Array.isArray(rawRows) ? rawRows : rawRows ? Object.values(rawRows) : [];
  return rows.map((row) => ({
    id: row?.id ? parseInt(row.id, 10) : null,
    promptSentence: String(row?.prompt_sentence || '').trim(),
    correctPhrase: String(row?.correct_phrase || '').trim(),
    distractorA: String(row?.distractor_a || '').trim(),
    distractorB: String(row?.distractor_b || '').trim(),
    distractorC: String(row?.distractor_c || '').trim(),
    explanation: String(row?.explanation || '').trim(),
  })).filter((row) => (
    row.promptSentence ||
    row.correctPhrase ||
    row.distractorA ||
    row.distractorB ||
    row.distractorC ||
    row.explanation
  ));
}

function normalizeSentenceTokens(tokensText, answerSentence) {
  const source = String(tokensText || answerSentence || '').trim();
  return source ? source.split(/\s+/) : [];
}

function mergeWordQuestionDetails(existing, submitted) {
  const merged = {
    baseForm: submitted.baseForm || existing?.base_form || '',
    firstLetterHint: submitted.firstLetterHint || existing?.first_letter_hint || '',
    usageNote: submitted.usageNote || existing?.usage_note || '',
    inflections: { ...(existing?.inflections || {}) },
  };

  for (const key of WORD_INFLECTION_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(submitted.inflections || {}, key)) {
      const value = submitted.inflections[key];
      if (value !== undefined && value !== null && value !== '') {
        merged.inflections[key] = value;
      }
    }
  }

  return merged;
}

function getPhraseChoiceQuestionForItem(db, itemId, questionId) {
  return db.prepare(
    'SELECT * FROM phrase_choice_questions WHERE id = ? AND item_id = ?'
  ).get(questionId, itemId);
}

router.post('/admin/question-types', (req, res) => {
  const db = req.app.locals.db;
  try {
    queries.updateQuestionTypeSettings(db, normalizeQuestionTypeSettings(req.body.settings));
    res.redirect('/admin/question-types');
  } catch (err) {
    renderWithLayout(res, 'admin/question-types', {
      groups: queries.getQuestionTypeGroups(db),
      error: err.message,
      success: null,
    }, '题型设置');
  }
});

// ── Textbooks ────────────────────────────────────────────────────

router.get('/admin/textbooks', (req, res) => {
  const textbooks = queries.getTextbooks(req.app.locals.db);
  renderWithLayout(res, 'admin/textbooks', { textbooks, error: null }, '课本管理');
});

router.post('/admin/textbooks', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    const textbooks = queries.getTextbooks(req.app.locals.db);
    return renderWithLayout(res, 'admin/textbooks', { textbooks, error: '课本名称不能为空' }, '课本管理');
  }
  queries.createTextbook(req.app.locals.db, name.trim());
  res.redirect('/admin/textbooks');
});

router.post('/admin/textbooks/:id/delete', (req, res) => {
  queries.deleteTextbook(req.app.locals.db, req.params.id);
  res.redirect('/admin/textbooks');
});

// ── Units ────────────────────────────────────────────────────────
router.get('/admin/textbooks/:id/units', (req, res) => {
  const db = req.app.locals.db;
  const textbook = db.prepare('SELECT * FROM textbooks WHERE id = ?').get(req.params.id);
  if (!textbook) return res.redirect('/admin/textbooks');
  const units = queries.getUnitsByTextbook(db, req.params.id);
  renderWithLayout(res, 'admin/units', { textbook, units, error: null }, textbook.name);
});

router.post('/admin/textbooks/:id/units', (req, res) => {
  const { name } = req.body;
  const db = req.app.locals.db;
  const textbook = db.prepare('SELECT * FROM textbooks WHERE id = ?').get(req.params.id);
  if (!name || !name.trim()) {
    const units = queries.getUnitsByTextbook(db, req.params.id);
    return renderWithLayout(res, 'admin/units', { textbook, units, error: '单元名称不能为空' }, textbook.name);
  }
  queries.createUnit(db, req.params.id, name.trim());
  res.redirect(`/admin/textbooks/${req.params.id}/units`);
});

router.post('/admin/units/:id/delete', (req, res) => {
  const unit = queries.getUnitById(req.app.locals.db, req.params.id);
  if (!unit) return res.redirect('/admin/textbooks');
  queries.deleteUnit(req.app.locals.db, req.params.id);
  res.redirect(`/admin/textbooks/${unit.textbook_id}/units`);
});

// ── Items ────────────────────────────────────────────────────────
router.get('/admin/units/:id/items', (req, res) => {
  const db = req.app.locals.db;
  const unit = queries.getUnitById(db, req.params.id);
  if (!unit) return res.redirect('/admin/textbooks');
  const textbook = db.prepare('SELECT * FROM textbooks WHERE id = ?').get(unit.textbook_id);
  const items = queries.getItemsByUnit(db, req.params.id);
  renderWithLayout(res, 'admin/items', { textbook, unit, items, error: null }, unit.name);
});

router.post('/admin/units/:id/items', (req, res) => {
  const db = req.app.locals.db;
  const unit = queries.getUnitById(db, req.params.id);
  if (!unit) return res.redirect('/admin/textbooks');
  const textbook = db.prepare('SELECT * FROM textbooks WHERE id = ?').get(unit.textbook_id);

  const { type, english, chinese, pos, example, examples } = req.body;
  if ((type === 'word' || type === 'phrase') && (!english || !chinese)) {
    const items = queries.getItemsByUnit(db, req.params.id);
    return renderWithLayout(res, 'admin/items', { textbook, unit, items, error: '英文和中文不能为空' }, unit.name);
  }
  queries.createItem(db, {
    unitId: parseInt(req.params.id),
    type,
    english,
    chinese,
    pos,
    example: normalizeExampleText(type, example, examples),
  });
  res.redirect(`/admin/units/${req.params.id}/items`);
});

router.post('/admin/items/batch', (req, res) => {
  const db = req.app.locals.db;
  const { unit_id, data } = req.body;
  const unit = queries.getUnitById(db, unit_id);
  if (!unit) return res.redirect('/admin/textbooks');
  const textbook = db.prepare('SELECT * FROM textbooks WHERE id = ?').get(unit.textbook_id);

  const lines = data.split('\n').filter(l => l.trim());
  const result = queries.batchCreateItems(db, unit_id, lines);

  const items = queries.getItemsByUnit(db, unit_id);
  const msg = result.errors.length > 0
    ? `成功导入 ${result.count} 条；${result.errors.length} 条失败：${result.errors.join('；')}`
    : `成功导入 ${result.count} 条`;
  renderWithLayout(res, 'admin/items', { textbook, unit, items, error: null, success: msg }, unit.name);
});

router.get('/admin/items/:id/edit', (req, res) => {
  const db = req.app.locals.db;
  const item = queries.getItemById(db, req.params.id);
  if (!item) return res.redirect('/admin/textbooks');
  const unit = queries.getUnitById(db, item.unit_id);
  const textbook = db.prepare('SELECT * FROM textbooks WHERE id = ?').get(unit.textbook_id);
  const wordQuestionDetail = queries.getWordQuestionDetails(db, item.id);
  const phraseChoiceQuestions = queries.getPhraseChoiceQuestionsByItem(db, item.id);
  const sentenceOrderDetail = queries.getSentenceOrderDetails(db, item.id);
  renderWithLayout(res, 'admin/item-edit', {
    textbook,
    unit,
    item,
    wordQuestionDetail,
    phraseChoiceQuestions,
    sentenceOrderDetail,
    error: null,
  }, '编辑条目');
});

router.post('/admin/items/:id/edit', (req, res) => {
  const db = req.app.locals.db;
  const item = queries.getItemById(db, req.params.id);
  if (!item) return res.redirect('/admin/textbooks');
  const { type, english, chinese, pos, example, examples } = req.body;
  queries.updateItem(db, req.params.id, {
    type,
    english,
    chinese,
    pos,
    example: normalizeExampleText(type, example, examples),
  });
  if (type === 'word') {
    const existingWordDetail = queries.getWordQuestionDetails(db, req.params.id);
    const submittedWordDetail = normalizeWordQuestionDetails(req.body.word_detail);
    queries.saveWordQuestionDetails(
      db,
      req.params.id,
      mergeWordQuestionDetails(existingWordDetail, submittedWordDetail),
    );
  }
  if (type === 'phrase') {
    for (const row of normalizePhraseChoiceRows(req.body.phrase_choice)) {
      if (row.id) {
        if (getPhraseChoiceQuestionForItem(db, req.params.id, row.id)) {
          queries.updatePhraseChoiceQuestion(db, row.id, row);
        }
      } else {
        queries.savePhraseChoiceQuestion(db, { itemId: req.params.id, ...row });
      }
    }
  }
  if (type === 'grammar') {
    const sentenceOrder = req.body.sentence_order || {};
    queries.saveSentenceOrderDetails(db, req.params.id, {
      answerSentence: String(sentenceOrder.answer_sentence || '').trim(),
      tokens: normalizeSentenceTokens(sentenceOrder.tokens_text, sentenceOrder.answer_sentence),
      hintText: String(sentenceOrder.hint_text || '').trim(),
    });
  }
  res.redirect(`/admin/units/${item.unit_id}/items`);
});

router.post('/admin/items/:itemId/phrase-choice-questions/:id/delete', (req, res) => {
  const db = req.app.locals.db;
  const row = getPhraseChoiceQuestionForItem(db, req.params.itemId, req.params.id);
  if (row) {
    queries.deletePhraseChoiceQuestion(db, req.params.id);
  }
  res.redirect(`/admin/items/${req.params.itemId}/edit`);
});

router.post('/admin/items/:id/delete', (req, res) => {
  const item = queries.getItemById(req.app.locals.db, req.params.id);
  if (!item) return res.redirect('/admin/textbooks');
  queries.deleteItem(req.app.locals.db, req.params.id);
  res.redirect(`/admin/units/${item.unit_id}/items`);
});

// ── Settings ─────────────────────────────────────────────────────
router.get('/admin/settings', (req, res) => {
  const db = req.app.locals.db;
  const config = queries.getConfig(db);
  const cycles = queries.getReviewCycles(db);
  renderWithLayout(res, 'admin/settings', { config, cycles, error: null, success: null }, '系统设置');
});

router.post('/admin/settings', (req, res) => {
  const db = req.app.locals.db;
  const { daily_words, daily_phrases, daily_grammar } = req.body;
  queries.setConfig(db, 'daily_words', daily_words);
  queries.setConfig(db, 'daily_phrases', daily_phrases);
  queries.setConfig(db, 'daily_grammar', daily_grammar);
  res.redirect('/admin/settings');
});

router.post('/admin/cycles', (req, res) => {
  const db = req.app.locals.db;
  const { cycle_type, trigger_days, cover_days } = req.body;
  queries.createReviewCycle(db, { cycle_type, trigger_days, cover_days: parseInt(cover_days) });
  res.redirect('/admin/settings');
});

router.post('/admin/cycles/:id/toggle', (req, res) => {
  queries.toggleReviewCycle(req.app.locals.db, req.params.id);
  res.redirect('/admin/settings');
});

router.post('/admin/cycles/:id/delete', (req, res) => {
  queries.deleteReviewCycle(req.app.locals.db, req.params.id);
  res.redirect('/admin/settings');
});

module.exports = router;
