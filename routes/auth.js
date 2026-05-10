const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();

// GET / — redirect to /login
router.get('/', (req, res) => {
  if (req.session.user) {
    return req.session.user.role === 'admin'
      ? res.redirect('/admin')
      : res.redirect('/practice');
  }
  res.redirect('/login');
});

// Helper: render a child view and wrap it in the layout
function renderWithLayout(res, view, data, title) {
  res.render(view, data, (err, body) => {
    if (err) return res.status(500).send('Render error');
    res.render('layout', { title, body });
  });
}

// GET /login
router.get('/login', (req, res) => {
  if (req.session.user) {
    return req.session.user.role === 'admin'
      ? res.redirect('/admin')
      : res.redirect('/practice');
  }
  renderWithLayout(res, 'login', {
    error: null,
    returnTo: req.query.returnTo || '',
  }, '登录');
});

// POST /login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const db = req.app.locals.db;

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return renderWithLayout(res, 'login', {
      error: '用户名或密码错误',
      returnTo: req.body.returnTo || '',
    }, '登录');
  }

  req.session.user = { id: user.id, username: user.username, role: user.role };

  const returnTo = req.body.returnTo
    ? decodeURIComponent(req.body.returnTo)
    : user.role === 'admin' ? '/admin' : '/practice';

  res.redirect(returnTo);
});

// GET /register
router.get('/register', (req, res) => {
  if (req.session.user) {
    return res.redirect('/practice');
  }
  renderWithLayout(res, 'register', { error: null }, '注册');
});

// POST /register
router.post('/register', (req, res) => {
  const { username, password } = req.body;
  const db = req.app.locals.db;

  // Validation
  if (!username || !password) {
    return renderWithLayout(res, 'register', { error: '用户名和密码不能为空' }, '注册');
  }
  if (username.length < 2 || username.length > 20) {
    return renderWithLayout(res, 'register', { error: '用户名长度需要 2-20 个字符' }, '注册');
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return renderWithLayout(res, 'register', { error: '用户名只能包含字母、数字和下划线' }, '注册');
  }
  if (password.length < 6 || password.length > 50) {
    return renderWithLayout(res, 'register', { error: '密码长度需要 6-50 个字符' }, '注册');
  }

  // Check if username exists
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return renderWithLayout(res, 'register', { error: '用户名已被注册' }, '注册');
  }

  // Create user (always 'user' role via registration)
  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare(
    'INSERT INTO users (username, password, role) VALUES (?, ?, ?)'
  ).run(username, hash, 'user');

  req.session.user = { id: result.lastInsertRowid, username, role: 'user' };
  res.redirect('/practice');
});

// GET /logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

module.exports = router;
