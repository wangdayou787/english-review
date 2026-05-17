const express = require('express');
const router = express.Router();
const queries = require('../db/queries');
const { requireAdmin } = require('../middleware/auth');
const { normalizeExampleText } = require('../lib/item-examples');
const {
  clearSupportData,
  getDraftSupportViewData,
  getItemSupportViewData,
  getPhraseChoiceQuestionForItem,
  saveSupportData,
} = require('../services/admin-item-support');
function renderWithLayout(res, view, data, title) {
  res.render(view, data, (err, body) => {
    if (err) return res.status(500).send('Render error');
    res.render('layout', { title, body });
  });
}
function renderUnitItems(res, db, unit, { error = null, success = null } = {}) {
  const textbook = db.prepare('SELECT * FROM textbooks WHERE id = ?').get(unit.textbook_id);
  const items = queries.getItemsByUnit(db, unit.id);
  renderWithLayout(res, 'admin/items', { textbook, unit, items, error, success }, unit.name);
}
router.use('/admin', requireAdmin);
router.get('/admin', (req, res) => res.redirect('/admin/textbooks'));
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
router.get('/admin/question-types', (req, res) => {
  renderWithLayout(
    res,
    'admin/question-types',
    getQuestionTypeSettingsViewData(req.app.locals.db),
    '题型设置'
  );
});
function getQuestionTypeSettingsViewData(db, { error = null, success = null } = {}) {
  const groups = queries.getQuestionTypeGroups(db);
  const availableTypes = [];
  const plannedTypes = [];

  groups.forEach(group => {
    group.types.forEach(type => {
      const viewType = {
        ...type,
        category_label: group.label,
      };
      if (type.implementation_status === 'available') {
        availableTypes.push(viewType);
      } else {
        plannedTypes.push(viewType);
      }
    });
  });

  return { availableTypes, plannedTypes, error, success };
}
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
router.post('/admin/question-types', (req, res) => {
  const db = req.app.locals.db;
  try {
    queries.updateQuestionTypeSettings(db, normalizeQuestionTypeSettings(req.body.settings));
    res.redirect('/admin/question-types');
  } catch (err) {
    renderWithLayout(
      res,
      'admin/question-types',
      getQuestionTypeSettingsViewData(db, { error: err.message }),
      '题型设置'
    );
  }
});
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
router.get('/admin/units/:id/items', (req, res) => {
  const db = req.app.locals.db;
  const unit = queries.getUnitById(db, req.params.id);
  if (!unit) return res.redirect('/admin/textbooks');
  renderUnitItems(res, db, unit);
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
  renderWithLayout(res, 'admin/item-edit', {
    textbook,
    unit,
    item,
    ...getItemSupportViewData(db, item.id),
    error: null,
  }, '编辑条目');
});
router.post('/admin/items/:id/edit', (req, res) => {
  const db = req.app.locals.db;
  const item = queries.getItemById(db, req.params.id);
  if (!item) return res.redirect('/admin/textbooks');
  const { type, english, chinese, pos, example, examples } = req.body;
  const normalizedEnglish = typeof english === 'string' ? english.trim() : english;
  const normalizedChinese = typeof chinese === 'string' ? chinese.trim() : chinese;
  const normalizedPos = typeof pos === 'string' ? pos.trim() : pos;
  if ((type === 'word' || type === 'phrase') && (!normalizedEnglish || !normalizedChinese)) {
    const unit = queries.getUnitById(db, item.unit_id);
    const textbook = db.prepare('SELECT * FROM textbooks WHERE id = ?').get(unit.textbook_id);
    return renderWithLayout(res, 'admin/item-edit', {
      textbook,
      unit,
      item: {
        ...item,
        type,
        english: normalizedEnglish,
        chinese: normalizedChinese,
        pos: normalizedPos,
        example: normalizeExampleText(type, example, examples),
      },
      ...getDraftSupportViewData(db, item.id, req.body),
      error: '英文和中文不能为空',
    }, '编辑条目');
  }
  if (type !== item.type) {
    clearSupportData(db, req.params.id);
  }
  queries.updateItem(db, req.params.id, {
    type,
    english: normalizedEnglish,
    chinese: normalizedChinese,
    pos: normalizedPos,
    example: normalizeExampleText(type, example, examples),
  });
  saveSupportData(db, req.params.id, type, req.body);
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
