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

      req.on('error', err => server.close(() => reject(err)));
      if (payload) req.write(payload);
      req.end();
    });
  });
}

function seedWrongItems(db, userId) {
  const textbookId = queries.createTextbook(db, '错题课本');
  const unitId = queries.createUnit(db, textbookId, 'Unit 1');
  const wordId = queries.createItem(db, { unitId, type: 'word', english: 'study', chinese: '学习' });
  const phraseId = queries.createItem(db, { unitId, type: 'phrase', english: 'look after', chinese: '照顾' });
  db.prepare(
    `INSERT INTO review_records (user_id, item_id, exercise_type, user_answer, is_correct)
     VALUES (?, ?, 'en2cn', '错误答案', 0)`
  ).run(userId, wordId);
  db.prepare(
    `INSERT INTO review_records (user_id, item_id, exercise_type, user_answer, is_correct)
     VALUES (?, ?, 'cn2en', 'wrong phrase', 0)`
  ).run(userId, phraseId);
  return { wordId, phraseId };
}

function seedWordWrongItem(db, userId) {
  const textbookId = queries.createTextbook(db, '错题课本');
  const unitId = queries.createUnit(db, textbookId, 'Unit 1');
  const wordId = queries.createItem(db, { unitId, type: 'word', english: 'study', chinese: '学习' });
  db.prepare(
    `INSERT INTO review_records (user_id, item_id, exercise_type, user_answer, is_correct)
     VALUES (?, ?, 'en2cn', '错误答案', 0)`
  ).run(userId, wordId);
  return { wordId };
}

function seedPhraseChoiceWrongItem(db, userId) {
  const textbookId = queries.createTextbook(db, '閿欓璇炬湰');
  const unitId = queries.createUnit(db, textbookId, 'Unit 1');
  const phraseId = queries.createItem(db, {
    unitId,
    type: 'phrase',
    english: 'look after',
    chinese: '鐓ч【',
  });
  queries.savePhraseChoiceQuestion(db, {
    itemId: phraseId,
    promptSentence: 'Please ___ your little sister.',
    correctPhrase: 'look after',
    distractorA: 'look up',
    distractorB: 'look for',
    distractorC: 'look into',
    explanation: 'look after means take care of someone.',
  });
  db.prepare(
    `INSERT INTO review_records (user_id, item_id, exercise_type, user_answer, is_correct)
     VALUES (?, ?, 'phrase_choice', 'look up', 0)`
  ).run(userId, phraseId);
  return { phraseId };
}

describe('wrong answer routes', () => {
  test('practice dashboard exposes wrong-answer entry point', async () => {
    const app = buildApp({ id: 2, username: 'student', role: 'user' });
    seedWrongItems(app.locals.db, 2);

    const res = await requestApp(app, 'GET', '/practice');

    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('错题本');
    expect(res.text).toContain('开始错题专项复习');
    expect(res.text).toContain('当前错题');
    app.cleanup();
  });

  test('student can open wrong-answer notebook with current wrong items', async () => {
    const app = buildApp({ id: 2, username: 'student', role: 'user' });
    seedWrongItems(app.locals.db, 2);

    const res = await requestApp(app, 'GET', '/wrong-items');

    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('错题本');
    expect(res.text).toContain('study');
    expect(res.text).toContain('错误答案');
    expect(res.text).toContain('开始错题专项复习');
    app.cleanup();
  });

  test('wrong-answer notebook filters by type', async () => {
    const app = buildApp({ id: 2, username: 'student', role: 'user' });
    seedWrongItems(app.locals.db, 2);

    const res = await requestApp(app, 'GET', '/wrong-items?type=phrase');

    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('look after');
    expect(res.text).not.toContain('study');
    app.cleanup();
  });

  test('wrong-answer notebook does not show filtered practice action for empty filters', async () => {
    const app = buildApp({ id: 2, username: 'student', role: 'user' });
    seedWordWrongItem(app.locals.db, 2);

    const res = await requestApp(app, 'GET', '/wrong-items?type=grammar');

    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('暂无错题');
    expect(res.text).not.toContain('href="/practice/wrong?type=grammar"');
    expect(res.text).not.toContain('开始错题专项复习');
    app.cleanup();
  });

  test('student can open wrong-answer detail with answer metadata and history', async () => {
    const app = buildApp({ id: 2, username: 'student', role: 'user' });
    const { phraseId } = seedPhraseChoiceWrongItem(app.locals.db, 2);

    const res = await requestApp(app, 'GET', `/wrong-items/${phraseId}`);

    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('错题详情');
    expect(res.text).toContain('look after');
    expect(res.text).toContain('look up');
    expect(res.text).toContain('look after means take care of someone.');
    expect(res.text).toContain('最近作答记录');
    app.cleanup();
  });

  test('wrong-answer detail redirects after the item is resolved', async () => {
    const app = buildApp({ id: 2, username: 'student', role: 'user' });
    const { wordId } = seedWordWrongItem(app.locals.db, 2);
    app.locals.db.prepare(
      `INSERT INTO review_records (user_id, item_id, exercise_type, user_answer, is_correct)
       VALUES (?, ?, 'en2cn', '瀛︿範', 1)`
    ).run(2, wordId);

    const res = await requestApp(app, 'GET', `/wrong-items/${wordId}`);

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/wrong-items');
    app.cleanup();
  });

  test('wrong-answer detail does not expose another user item', async () => {
    const app = buildApp({ id: 2, username: 'student', role: 'user' });
    app.locals.db.prepare("INSERT INTO users (id, username, password, role) VALUES (3, 'other', 'hash', 'user')").run();
    const { wordId } = seedWordWrongItem(app.locals.db, 3);

    const res = await requestApp(app, 'GET', `/wrong-items/${wordId}`);

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/wrong-items');
    app.cleanup();
  });

  test('wrong-answer practice renders exercises from current wrong items', async () => {
    const app = buildApp({ id: 2, username: 'student', role: 'user' });
    seedWrongItems(app.locals.db, 2);

    const res = await requestApp(app, 'GET', '/practice/wrong?type=word');

    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('错题专项复习');
    expect(res.text).toContain('study');
    expect(res.text).toContain('answers[0][item_id]');
    app.cleanup();
  });

  test('wrong-answer practice preserves active filter when redirecting with no filtered items', async () => {
    const app = buildApp({ id: 2, username: 'student', role: 'user' });
    seedWordWrongItem(app.locals.db, 2);

    const res = await requestApp(app, 'GET', '/practice/wrong?type=grammar');

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/wrong-items?type=grammar');
    app.cleanup();
  });

  test('wrong-answer practice redirects safely when no wrong items exist', async () => {
    const app = buildApp({ id: 2, username: 'student', role: 'user' });

    const res = await requestApp(app, 'GET', '/practice/wrong');

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/wrong-items');
    app.cleanup();
  });
});
