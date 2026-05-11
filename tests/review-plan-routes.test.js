const express = require('express');
const session = require('express-session');
const http = require('http');
const Database = require('better-sqlite3');
const { initDatabase } = require('../db/init');
const queries = require('../db/queries');

function buildAppForRoute(user, routeModule) {
  const app = express();
  const db = new Database(':memory:');
  initDatabase(db);
  // Create the user in the database (idempotent)
  db.prepare('INSERT OR IGNORE INTO users (id, username, password, role) VALUES (?, ?, ?, ?)').run(
    user.id, user.username, 'hash', user.role
  );
  app.locals.db = db;
  app.set('view engine', 'ejs');
  app.set('views', require('path').join(__dirname, '..', 'views'));
  app.use(express.urlencoded({ extended: true }));
  app.use(session({ secret: 'test', resave: false, saveUninitialized: true }));
  app.use((req, res, next) => {
    req.session.user = user;
    res.locals.user = user;
    next();
  });
  app.use(routeModule);
  app.use((err, req, res, next) => {
    console.error('Test error:', err.stack);
    res.status(500).send('Error: ' + err.message);
  });
  app.cleanup = () => db.close();
  return app;
}

function buildApp(user) {
  const app = express();
  const db = new Database(':memory:');
  initDatabase(db);
  app.locals.db = db;
  app.set('view engine', 'ejs');
  app.set('views', require('path').join(__dirname, '..', 'views'));
  app.use(express.urlencoded({ extended: true }));
  app.use(session({ secret: 'test', resave: false, saveUninitialized: true }));
  app.use((req, res, next) => {
    req.session.user = user;
    res.locals.user = user;
    next();
  });
  app.use(require('../routes/admin'));
  app.use((err, req, res, next) => {
    console.error('Test error:', err.stack);
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

describe('admin review plan routes', () => {
  test('admin can open review plan page', async () => {
    const app = buildApp({ id: 1, username: 'admin', role: 'admin' });
    const res = await requestApp(app, 'GET', '/admin/review-plan');

    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('复习计划');
    expect(res.text).toContain('启用此复习计划');
    app.cleanup();
  });

  test('admin pages expose a student practice preview link', async () => {
    const app = buildApp({ id: 1, username: 'admin', role: 'admin' });
    const res = await requestApp(app, 'GET', '/admin/review-plan');

    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('href="/practice"');
    expect(res.text).toContain('学生端预览');
    app.cleanup();
  });

  test('non-admin cannot open review plan page', async () => {
    const app = buildApp({ id: 2, username: 'student', role: 'user' });
    const res = await requestApp(app, 'GET', '/admin/review-plan');

    expect(res.statusCode).toBe(403);
    app.cleanup();
  });

  test('admin can activate selected units', async () => {
    const app = buildApp({ id: 1, username: 'admin', role: 'admin' });
    const db = app.locals.db;
    const textbookId = queries.createTextbook(db, '七年级上册');
    const unitId = queries.createUnit(db, textbookId, 'Unit 1');

    const res = await requestApp(app, 'POST', '/admin/review-plan', {
      name: 'Unit 1 复习',
      unit_ids: String(unitId),
    });

    const active = queries.getActiveReviewPlan(db);
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/admin/review-plan');
    expect(active.name).toBe('Unit 1 复习');
    expect(active.units.map(u => u.id)).toEqual([unitId]);
    app.cleanup();
  });
});

describe('student review plan flow', () => {
  test('student dashboard shows empty state when no active plan exists', async () => {
    const app = buildAppForRoute({ id: 2, username: 'student', role: 'user' }, require('../routes/practice'));

    const res = await requestApp(app, 'GET', '/practice');

    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('暂无复习计划');
    app.cleanup();
  });

  test('student start creates and reuses today review tasks', async () => {
    const app = buildAppForRoute({ id: 2, username: 'student', role: 'user' }, require('../routes/practice'));
    const db = app.locals.db;
    const textbookId = queries.createTextbook(db, '七年级上册');
    const unitId = queries.createUnit(db, textbookId, 'Unit 1');
    for (let i = 1; i <= 6; i++) {
      queries.createItem(db, { unitId, type: 'word', english: `word-${i}`, chinese: `词${i}` });
    }
    const planId = queries.activateReviewPlan(db, { name: 'Unit 1', unitIds: [unitId] });
    queries.setConfig(db, 'daily_words', '3');
    queries.setConfig(db, 'daily_phrases', '0');
    queries.setConfig(db, 'daily_grammar', '0');

    const first = await requestApp(app, 'GET', '/practice/start');
    const savedAfterFirst = db.prepare('SELECT COUNT(*) AS count FROM daily_review_tasks WHERE user_id = 2 AND plan_id = ?').get(planId).count;
    const second = await requestApp(app, 'GET', '/practice/start');
    const savedAfterSecond = db.prepare('SELECT COUNT(*) AS count FROM daily_review_tasks WHERE user_id = 2 AND plan_id = ?').get(planId).count;

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(savedAfterFirst).toBe(3);
    expect(savedAfterSecond).toBe(3);
    app.cleanup();
  });
});
