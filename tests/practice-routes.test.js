const express = require('express');
const session = require('express-session');
const http = require('http');
const path = require('path');
const Database = require('better-sqlite3');
const { initDatabase } = require('../db/init');
const queries = require('../db/queries');

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
  app.use(require('../routes/practice'));
  app.use((err, req, res, next) => {
    res.status(500).send('Error: ' + err.message);
  });
  app.cleanup = () => db.close();
  return app;
}

function requestApp(app, method, urlPath, formBody, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const payload = formBody ? new URLSearchParams(formBody).toString() : '';
      const headers = formBody
        ? {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(payload),
          }
        : {};
      Object.assign(headers, extraHeaders);

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

function seedItem(db) {
  const textbookId = queries.createTextbook(db, 'Practice Book');
  const unitId = queries.createUnit(db, textbookId, 'Unit 1');
  return queries.createItem(db, {
    unitId,
    type: 'phrase',
    english: 'look after',
    chinese: '照顾',
    pos: '',
    example: '',
  });
}

describe('practice routes', () => {
  test('practice submit recomputes single-point scoring metadata on the server', async () => {
    const app = buildApp({ id: 2, username: 'student', role: 'user' });
    const itemId = seedItem(app.locals.db);
    queries.savePhraseChoiceQuestion(app.locals.db, {
      itemId,
      promptSentence: 'She often ___ her sister.',
      correctPhrase: 'looks after',
      distractorA: 'looks up',
      distractorB: 'looks for',
      distractorC: 'looks at',
      explanation: '固定搭配。',
    });

    const res = await requestApp(app, 'POST', '/practice/submit', {
      'answers[0][item_id]': String(itemId),
      'answers[0][exercise_type]': 'phrase_choice',
      'answers[0][answer]': 'looks for',
      'answers[0][correct_answer]': 'looks for',
      'answers[0][explanation]': '伪造说明',
    });

    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('错误');
    expect(res.text).toContain('正确答案：');
    expect(res.text).toContain('looks after');
    expect(res.text).toContain('辨析说明：');
    expect(res.text).toContain('固定搭配。');
    expect(res.text).not.toContain('伪造说明');

    app.cleanup();
  });

  test('marking an item known does not redirect back to the submit endpoint', async () => {
    const app = buildApp({ id: 2, username: 'student', role: 'user' });
    const itemId = seedItem(app.locals.db);

    const res = await requestApp(
      app,
      'POST',
      `/practice/item/${itemId}/known`,
      {},
      { Referer: 'http://localhost:3000/practice/submit' },
    );

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/practice');
    app.cleanup();
  });
});
