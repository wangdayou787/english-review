const express = require('express');
const session = require('express-session');
const http = require('http');
const Database = require('better-sqlite3');
const { initDatabase } = require('../db/init');
const queries = require('../db/queries');

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
