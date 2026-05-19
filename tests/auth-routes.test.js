const express = require('express');
const session = require('express-session');
const http = require('http');
const path = require('path');
const bcrypt = require('bcrypt');
const Database = require('better-sqlite3');
const { initDatabase } = require('../db/init');

function buildApp() {
  const app = express();
  const db = new Database(':memory:');
  initDatabase(db);
  db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)')
    .run('student', bcrypt.hashSync('secret123', 10), 'user');

  app.locals.db = db;
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.use(express.urlencoded({ extended: true }));
  app.use(session({ secret: 'test', resave: false, saveUninitialized: true }));
  app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
  });
  app.use(require('../routes/auth'));
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

describe('auth routes', () => {
  test('login does not redirect GET requests back to the answer submission endpoint', async () => {
    const app = buildApp();

    const res = await requestApp(app, 'POST', '/login', {
      username: 'student',
      password: 'secret123',
      returnTo: encodeURIComponent('/practice/submit'),
    });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/practice');
    app.cleanup();
  });
});
