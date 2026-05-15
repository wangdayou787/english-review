const express = require('express');
const session = require('express-session');
const path = require('path');
const Database = require('better-sqlite3');
const { initDatabase } = require('./db/init');

const app = express();

// ── Database ─────────────────────────────────────────────────────
const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'english.db');
const db = new Database(dbPath);
initDatabase(db);

// Make db accessible to routes via app.locals
app.locals.db = db;

// ── Middleware ────────────────────────────────────────────────────
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session
app.use(session({
  secret: 'english-review-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }, // 7 days
}));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Make user available to all templates
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// ── View engine ───────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ── Routes ────────────────────────────────────────────────────────
app.use('/', require('./routes/auth'));
app.use('/', require('./routes/admin'));
app.use('/', require('./routes/admin-word-import'));
app.use('/', require('./routes/practice'));
app.use('/', require('./routes/stats'));

// ── Error handler ─────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Internal Server Error');
});

// ── Start server ──────────────────────────────────────────────────
const port = process.env.PORT || 3000;
const server = app.listen(port, () => {
  console.log(`English Review Tool running at http://localhost:${port}`);
});

// Attach db to server for test cleanup
server.db = db;

module.exports = server;
