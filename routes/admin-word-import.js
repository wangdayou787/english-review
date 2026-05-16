const express = require('express');
const multer = require('multer');
const queries = require('../db/queries');
const { requireAdmin } = require('../middleware/auth');
const {
  buildWordImportTemplateWorkbook,
  importWordRows,
  parseWordImportWorkbook,
} = require('../services/word-excel-import');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

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

function uploadErrorMessage(err) {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return 'Excel 文件不能超过 2MB';
  }
  return 'Excel 文件上传失败';
}

function renderUploadError(req, res, message) {
  const db = req.app.locals.db;
  const unit = queries.getUnitById(db, req.params.id);
  if (!unit) return res.redirect('/admin/textbooks');
  return renderUnitItems(res, db, unit, { error: message });
}

router.use('/admin', requireAdmin);

router.get('/admin/units/:id/word-import-template', async (req, res) => {
  const db = req.app.locals.db;
  const unit = queries.getUnitById(db, req.params.id);
  if (!unit) return res.redirect('/admin/textbooks');

  const buffer = await buildWordImportTemplateWorkbook();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="word-import-template.xlsx"');
  res.send(buffer);
});

router.post('/admin/units/:id/word-import', (req, res) => {
  upload.single('word_excel')(req, res, async (err) => {
    if (err) {
      return renderUploadError(req, res, uploadErrorMessage(err));
    }

    const db = req.app.locals.db;
    const unit = queries.getUnitById(db, req.params.id);
    if (!unit) return res.redirect('/admin/textbooks');

    if (!req.file || req.file.size === 0) {
      return renderUnitItems(res, db, unit, { error: '请选择要导入的 Excel 文件' });
    }

    if (!req.file.originalname.toLowerCase().endsWith('.xlsx')) {
      return renderUnitItems(res, db, unit, { error: '仅支持 .xlsx 文件' });
    }

    try {
      const parsed = await parseWordImportWorkbook(req.file.buffer);
      const result = importWordRows(db, unit.id, parsed.rows);
      const messages = [`成功导入 ${result.importedCount} 条`];

      if (result.failedRows.length > 0) {
        const failedRows = result.failedRows
          .map(row => `第 ${row.rowNumber} 行：${row.message}`)
          .join('；');
        messages.push(`失败 ${result.failedRows.length} 条：${failedRows}`);
      }

      if (parsed.unknownHeaders.length > 0) {
        messages.push(`未知列：${parsed.unknownHeaders.join('、')}`);
      }

      return renderUnitItems(res, db, unit, { success: messages.join('；') });
    } catch (parseErr) {
      return renderUnitItems(res, db, unit, { error: `Excel 文件解析失败：${parseErr.message}` });
    }
  });
});

module.exports = router;
