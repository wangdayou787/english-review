const express = require('express');
const session = require('express-session');
const http = require('http');
const path = require('path');
const Database = require('better-sqlite3');
const { initDatabase } = require('../db/init');

function buildApp(user) {
  const app = express();
  const db = new Database(':memory:');
  initDatabase(db);
  db.prepare('INSERT OR IGNORE INTO users (id, username, password, role) VALUES (?, ?, ?, ?)')
    .run(user.id, user.username, 'hash', user.role);
  app.locals.db = db;
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.use(express.urlencoded({ extended: true }));
  app.use(session({ secret: 'test', resave: false, saveUninitialized: true }));
  app.use((req, res, next) => {
    req.session.user = user;
    res.locals.user = user;
    next();
  });
  app.use(require('../routes/admin'));
  app.use((err, req, res, next) => {
    res.status(500).send('Error: ' + err.message);
  });
  app.cleanup = () => db.close();
  return app;
}

function requestApp(app, method, urlPath, formBody) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const payload = formBody ? new URLSearchParams(formBody).toString() : '';
      const headers = formBody
        ? {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(payload),
          }
        : {};

      const req = http.request({
        hostname: '127.0.0.1',
        port: server.address().port,
        method,
        path: urlPath,
        headers,
      }, (res) => {
        let text = '';
        res.on('data', chunk => { text += chunk; });
        res.on('end', () => {
          server.close(() => resolve({ statusCode: res.statusCode, headers: res.headers, text }));
        });
      });

      req.on('error', (err) => {
        server.close(() => reject(err));
      });

      if (payload) req.write(payload);
      req.end();
    });
  });
}

describe('admin question type settings routes', () => {
  test('admin can open question type settings page', async () => {
    const app = buildApp({ id: 1, username: 'admin', role: 'admin' });
    const res = await requestApp(app, 'GET', '/admin/question-types');
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('题型设置');
    expect(res.text).toContain('单词词汇类');
    expect(res.text).toContain('可用于练习');
    expect(res.text).toContain('后续支持');
    app.cleanup();
  });

  test('question type settings separates available and planned types', async () => {
    const app = buildApp({ id: 1, username: 'admin', role: 'admin' });
    const res = await requestApp(app, 'GET', '/admin/question-types');

    expect(res.statusCode).toBe(200);
    expect(res.text.indexOf('可用于练习')).toBeGreaterThan(-1);
    expect(res.text.indexOf('后续支持')).toBeGreaterThan(res.text.indexOf('可用于练习'));
    expect(res.text).toContain('value="vocab_en_cn_choice"');
    expect(res.text).not.toContain('value="vocab_word_bank_fill"');
    expect(res.text).toContain('选词填空');
    expect(res.text).toContain('从词库中选择合适单词填入句子。');

    app.cleanup();
  });

  test('non-admin cannot open question type settings page', async () => {
    const app = buildApp({ id: 2, username: 'student', role: 'user' });
    const res = await requestApp(app, 'GET', '/admin/question-types');
    expect(res.statusCode).toBe(403);
    app.cleanup();
  });

  test('admin can save question type settings', async () => {
    const app = buildApp({ id: 1, username: 'admin', role: 'admin' });
    const res = await requestApp(app, 'POST', '/admin/question-types', {
      'settings[0][code]': 'vocab_en_cn_choice',
      'settings[0][enabled]': 'on',
      'settings[0][weight]': '17',
      'settings[0][instructionText]': '选择最准确的答案。',
      'settings[0][primaryActionText]': '提交本题',
      'settings[0][hintText]': '认真比较选项。',
      'settings[0][showExample]': 'on',
      'settings[0][showPartOfSpeech]': 'on',
    });
    const saved = app.locals.db.prepare('SELECT * FROM question_type_settings WHERE question_type_code = ?').get('vocab_en_cn_choice');
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/admin/question-types');
    expect(saved.weight).toBe(17);
    expect(saved.instruction_text).toBe('选择最准确的答案。');
    expect(JSON.parse(saved.display_options).showExample).toBe(true);
    app.cleanup();
  });

  test('invalid weight renders validation error', async () => {
    const app = buildApp({ id: 1, username: 'admin', role: 'admin' });
    const res = await requestApp(app, 'POST', '/admin/question-types', {
      'settings[0][code]': 'vocab_en_cn_choice',
      'settings[0][enabled]': 'on',
      'settings[0][weight]': '101',
      'settings[0][instructionText]': '选择正确答案。',
      'settings[0][primaryActionText]': '提交答案',
      'settings[0][hintText]': '提示',
    });
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('题型比例必须是 0 到 100 的整数');
    app.cleanup();
  });
});
