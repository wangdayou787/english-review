const express = require('express');
const session = require('express-session');
const http = require('http');
const path = require('path');
const Database = require('better-sqlite3');
const { initDatabase } = require('../db/init');

function buildApp(user = null) {
  const app = express();
  const db = new Database(':memory:');
  initDatabase(db);
  app.locals.db = db;
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.use(express.urlencoded({ extended: true }));
  app.use(session({ secret: 'test', resave: false, saveUninitialized: true }));
  app.use((req, res, next) => {
    if (user) {
      req.session.user = user;
      res.locals.user = user;
    }
    next();
  });
  app.use(require('../routes/auth'));
  app.use(require('../routes/admin'));
  app.use((req, res) => res.status(404).send('Not Found'));
  app.cleanup = () => db.close();
  return app;
}

function requestApp(app, method, urlPath) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: server.address().port,
        method,
        path: urlPath,
      }, (res) => {
        let text = '';
        res.on('data', chunk => { text += chunk; });
        res.on('end', () => {
          server.close(() => resolve({ statusCode: res.statusCode, headers: res.headers, text }));
        });
      });

      req.on('error', err => server.close(() => reject(err)));
      req.end();
    });
  });
}

describe('route mounting', () => {
  test('non-admin public route misses do not show admin-only errors', async () => {
    const app = buildApp({ id: 2, username: 'student', role: 'user' });

    const res = await requestApp(app, 'GET', '/register-miss');

    expect(res.statusCode).toBe(404);
    expect(res.text).not.toContain('需要管理员权限');
    app.cleanup();
  });
});
