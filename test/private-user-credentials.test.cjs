const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const test = require('node:test');
const { createIsolatedApp } = require('./helpers/isolatedApp.cjs');

function fixture(t, env = {}, runtime) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'private-users-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const configDir = path.join(dir, 'config');
  fs.cpSync(path.join(__dirname, '../config'), configDir, {
    recursive: true,
    filter: source => !source.split(path.sep).includes('runtime'),
  });
  const usersPath = path.join(configDir, 'users.json');
  const users = JSON.parse(fs.readFileSync(usersPath));
  const legacyPassword = randomUUID();
  users.find(u => u.username === 'admin').password = legacyPassword;
  fs.writeFileSync(usersPath, JSON.stringify(users));
  const runtimePath = path.join(configDir, 'runtime/users.json');
  if (runtime !== undefined) {
    fs.mkdirSync(path.dirname(runtimePath), { recursive: true });
    fs.writeFileSync(runtimePath, JSON.stringify(runtime));
  }
  const request = createIsolatedApp({ configDir, dataDir: path.join(dir, 'data'), env });
  return { request, legacyPassword, runtimePath };
}

test('tracked user templates contain no credentials', () => {
  const users = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/users.json')));
  assert.ok(users.every(u => !Object.hasOwn(u, 'password')));
});

test('legacy tracked passwords, empty passwords and VITE passwords cannot log in', async t => {
  const vitePassword = randomUUID();
  const { request, legacyPassword } = fixture(t, { VITE_ADMIN_PASSWORD: vitePassword });
  for (const password of [legacyPassword, '', vitePassword]) {
    assert.equal((await request('POST', '/api/auth/login', { username: 'admin', password })).status, 401);
  }
});

test('server environment provisions credentials when private users are absent', async t => {
  const password = randomUUID();
  const { request, legacyPassword } = fixture(t, { KEYDIGEST_ADMIN_PASSWORD: password });
  assert.equal((await request('POST', '/api/auth/login', { username: 'admin', password })).status, 200);
  assert.equal((await request('POST', '/api/auth/login', { username: 'admin', password: legacyPassword })).status, 401);
});

test('private passwords take precedence and remain unchanged by environment settings', async t => {
  const password = randomUUID();
  const envPassword = randomUUID();
  const templates = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/users.json')));
  const runtime = templates.map(u => ({ ...u, password: u.username === 'admin' ? password : randomUUID() }));
  const { request, runtimePath } = fixture(t, { KEYDIGEST_ADMIN_PASSWORD: envPassword }, runtime);
  const before = fs.readFileSync(runtimePath, 'utf8');
  assert.equal((await request('POST', '/api/auth/login', { username: 'admin', password })).status, 200);
  assert.equal((await request('POST', '/api/auth/login', { username: 'admin', password: envPassword })).status, 401);
  assert.equal(fs.readFileSync(runtimePath, 'utf8'), before);
});

test('empty private password disables login without falling back to environment', async t => {
  const password = randomUUID();
  const { request } = fixture(t, { KEYDIGEST_ADMIN_PASSWORD: password }, [{ username: 'admin', role: 'admin', password: '', keywords: [], routes: [] }]);
  for (const candidate of ['', password]) {
    assert.equal((await request('POST', '/api/auth/login', { username: 'admin', password: candidate })).status, 401);
  }
});
