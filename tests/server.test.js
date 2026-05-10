const http = require('http');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// Use a test-specific database file
const TEST_DB_PATH = path.join(__dirname, '..', 'data', 'test.db');

let server;
let port;

beforeAll((done) => {
  // Clean up test db from previous run
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }

  // Override DB path via env before requiring server
  process.env.DB_PATH = TEST_DB_PATH;
  process.env.PORT = '0'; // random available port

  // Require the server module (it starts listening automatically)
  server = require('../server');

  server.on('listening', () => {
    port = server.address().port;
    done();
  });
}, 10000);

afterAll((done) => {
  if (server) {
    server.close(() => {
      // Clean up test db
      try {
        if (fs.existsSync(TEST_DB_PATH)) {
          fs.unlinkSync(TEST_DB_PATH);
        }
      } catch (e) {
        // Ignore cleanup errors
      }
      done();
    });
  } else {
    done();
  }
}, 10000);

function request(method, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      method,
      path: urlPath,
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, headers: res.headers, body });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

describe('server.js — HTTP server', () => {
  test('server starts and responds on a port', async () => {
    const res = await request('GET', '/');
    expect(res.statusCode).toBeDefined();
  });

  test('GET / redirects unauthenticated users to /login', async () => {
    const res = await request('GET', '/');
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/login');
  });

  test('GET /login returns the login page', async () => {
    const res = await request('GET', '/login');
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('<form');
    expect(res.body).toContain('登录');
  });

  test('GET /register returns the register page', async () => {
    const res = await request('GET', '/register');
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('<form');
    expect(res.body).toContain('注册');
  });

  test('database is initialized on startup (tables exist)', () => {
    const db = new Database(TEST_DB_PATH);
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all().map(r => r.name);
    db.close();

    expect(tables).toContain('users');
    expect(tables).toContain('textbooks');
    expect(tables).toContain('config');
  });

  test('default admin account exists in the database', () => {
    const db = new Database(TEST_DB_PATH);
    const admin = db.prepare('SELECT * FROM users WHERE username = ?').get('admin');
    db.close();

    expect(admin).toBeTruthy();
    expect(admin.role).toBe('admin');
  });

  test('static files from /public are served', async () => {
    // Create a test static file
    const publicDir = path.join(__dirname, '..', 'public');
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    fs.writeFileSync(path.join(publicDir, 'test.txt'), 'hello-test');

    const res = await request('GET', '/test.txt');
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('hello-test');

    fs.unlinkSync(path.join(publicDir, 'test.txt'));
  });

  test('admin routes are protected — redirects non-admin users', async () => {
    const res = await request('GET', '/admin');
    // Unauthenticated user should be redirected to /login
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toMatch(/^\/login/);
  });
});
