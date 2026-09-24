const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const test = require('node:test');
const { createIsolatedApp } = require('./helpers/isolatedApp.cjs');

const root = path.join(__dirname, '..');
let tempDir;
let configDir;
let request;
let adminToken;
const passwords = { admin: randomUUID(), yzgjj: randomUUID(), created: randomUUID(), updated: randomUUID() };

function readEffectiveUsers() {
  const runtime = path.join(configDir, 'runtime/users.json');
  return JSON.parse(fs.readFileSync(fs.existsSync(runtime) ? runtime : path.join(configDir, 'users.json'), 'utf8'));
}

test.before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keydigest-users-test-'));
  configDir = path.join(tempDir, 'config');
  fs.cpSync(path.join(root, 'config'), configDir, {
    recursive: true,
    filter: source => !path.relative(path.join(root, 'config'), source).split(path.sep).includes('runtime'),
  });
  const users = JSON.parse(fs.readFileSync(path.join(configDir, 'users.json'), 'utf8'));
  for (const user of users) user.password = passwords[user.username] || randomUUID();
  fs.writeFileSync(path.join(configDir, 'users.json'), JSON.stringify(users));
  request = createIsolatedApp({ configDir, dataDir: path.join(tempDir, 'data') });
  const login = await request('POST', '/api/auth/login', { username: 'admin', password: passwords.admin });
  assert.equal(login.status, 200);
  adminToken = login.body.token;
});

test.after(() => {
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
});

// ===== 测试 1: GET /api/admin/users 返回正确结构 =====
test('GET /api/admin/users returns users, allKeywords, and availableRoutes', async () => {
  const res = await request('GET', '/api/admin/users', null, adminToken);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.users));
  assert.ok(Array.isArray(res.body.allKeywords));
  assert.ok(Array.isArray(res.body.availableRoutes));
  assert.ok(res.body.availableRoutes.length > 0);
  assert.ok(res.body.availableRoutes[0].path);
  assert.ok(res.body.availableRoutes[0].label);
  assert.ok(res.body.availableRoutes[0].group);
  // 密码字段脱敏
  res.body.users.forEach(u => assert.equal(u.password, ''));

  const loginStats = await request('GET', '/api/auth/login-stats', null, adminToken);
  assert.equal(loginStats.status, 200);
  assert.ok(Array.isArray(loginStats.body.summary));
  assert.ok(Array.isArray(loginStats.body.records));
});

// ===== 测试 1b: 管理接口要求 admin 鉴权，匿名访问被拒 =====
test('admin user management endpoints reject anonymous requests', async () => {
  const anonGet = await request('GET', '/api/admin/users');
  assert.equal(anonGet.status, 401);
  const anonPost = await request('POST', '/api/admin/users', { username: 'hacker', password: 'x', role: 'admin' });
  assert.equal(anonPost.status, 401);
  const anonDelete = await request('DELETE', '/api/admin/users/yzgjj');
  assert.equal(anonDelete.status, 401);
  const anonSwitch = await request('POST', '/api/llm/switch-model', { modelKey: 'kimi-k2' });
  assert.equal(anonSwitch.status, 401);
  const anonLoginStats = await request('GET', '/api/auth/login-stats');
  assert.equal(anonLoginStats.status, 401);
});

// ===== 测试 2: POST /api/admin/users 创建用户成功 =====
test('POST /api/admin/users creates a new user', async () => {
  const res = await request('POST', '/api/admin/users', {
    username: 'autotest',
    displayName: 'AutoTest',
    password: passwords.created,
    role: 'restricted',
    keywords: ['公积金'],
    routes: ['/summary', '/report'],
  }, adminToken);
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.user.username, 'autotest');
  assert.equal(res.body.user.password, '');
  // 验证已写入生效配置（运行时层）
  const config = readEffectiveUsers();
  const created = config.find(u => u.username === 'autotest');
  assert.ok(created);
  assert.deepEqual(created.keywords, ['公积金']);
  assert.deepEqual(created.routes, ['/summary', '/report']);
});

test('prompt bundle export never includes users and import rejects users.json', async () => {
  const exported = await request('GET', '/api/config/prompt-export', null, adminToken);
  assert.equal(exported.status, 200);
  assert.equal(Object.prototype.hasOwnProperty.call(exported.body.files, 'users.json'), false);
  assert.equal(JSON.stringify(exported.body).includes(passwords.created), false);

  const rejected = await request('POST', '/api/config/prompt-import', {
    formatVersion: 1,
    files: {
      'users.json': { type: 'json', content: [{ username: 'injected', password: 'secret' }] },
    },
  }, adminToken);
  assert.equal(rejected.status, 400);
  assert.match(rejected.body.details, /users\.json 不允许/);

  const resetRejected = await request('POST', '/api/config/reset-default', { file: 'users.json' }, adminToken);
  assert.equal(resetRejected.status, 400);
  assert.ok(readEffectiveUsers().some((user) => user.username === 'autotest'));
});

test('policy prompt endpoint rejects nested Markdown fences without changing the file', async () => {
  const runtimePath = path.join(configDir, 'runtime/policy_prompts.md');
  const before = fs.existsSync(runtimePath) ? fs.readFileSync(runtimePath, 'utf8') : null;
  const rejected = await request('POST', '/api/config/policy-prompt', {
    type: 'extraction',
    prompt: '示例：\n```json\n{"ok":true}\n```',
  }, adminToken);

  assert.equal(rejected.status, 400);
  assert.match(rejected.body.error, /三反引号/);
  const after = fs.existsSync(runtimePath) ? fs.readFileSync(runtimePath, 'utf8') : null;
  assert.equal(after, before);
});

test('prompt bundle dry-run rejects nested Markdown fences before import', async () => {
  const defaultPolicyPath = path.join(configDir, 'policy_prompts.md');
  const unsafePolicy = fs.readFileSync(defaultPolicyPath, 'utf8').replace(
    '```\n',
    '```\n示例：\n```json\n{"ok":true}\n```\n',
  );
  const rejected = await request('POST', '/api/config/prompt-import?dryRun=1', {
    formatVersion: 1,
    files: {
      'policy_prompts.md': { type: 'text', content: unsafePolicy },
    },
  }, adminToken);

  assert.equal(rejected.status, 400);
  assert.match(rejected.body.details, /嵌套或格式异常/);
});

// ===== 测试 3: POST /api/admin/users 拒绝重复用户名 =====
test('POST /api/admin/users rejects duplicate username', async () => {
  const res = await request('POST', '/api/admin/users', {
    username: 'autotest',
    displayName: 'Duplicate',
    password: 'whatever',
    role: 'restricted',
    keywords: [],
    routes: [],
  }, adminToken);
  assert.equal(res.status, 409);
  assert.equal(res.body.error, '用户名已存在');
});

// ===== 测试 4: POST /api/admin/users 拒绝空用户名或密码 =====
test('POST /api/admin/users rejects empty username or password', async () => {
  const noName = await request('POST', '/api/admin/users', { username: '', password: 'x' }, adminToken);
  assert.equal(noName.status, 400);
  const noPass = await request('POST', '/api/admin/users', { username: 'someone', password: '' }, adminToken);
  assert.equal(noPass.status, 400);
});

// ===== 测试 5: PUT /api/admin/users 更新显示名和关键词 =====
test('PUT /api/admin/users updates display name and keywords', async () => {
  const res = await request('PUT', '/api/admin/users/autotest', {
    displayName: 'AutoTest Updated',
    keywords: ['公积金', '养老'],
  }, adminToken);
  assert.equal(res.status, 200);
  assert.equal(res.body.user.displayName, 'AutoTest Updated');
  assert.deepEqual(res.body.user.keywords, ['公积金', '养老']);
});

// ===== 测试 6: PUT 更新密码后可用新密码登录 =====
test('Password update allows login with new password', async () => {
  await request('PUT', '/api/admin/users/autotest', { password: passwords.updated }, adminToken);
  const login = await request('POST', '/api/auth/login', { username: 'autotest', password: passwords.updated });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.username, 'autotest');
  // 旧密码应失败
  const oldLogin = await request('POST', '/api/auth/login', { username: 'autotest', password: passwords.created });
  assert.equal(oldLogin.status, 401);
});

// ===== 测试 7: PUT /api/admin/users/admin 阻止 admin 降级 =====
test('PUT /api/admin/users/admin prevents role downgrade', async () => {
  const res = await request('PUT', '/api/admin/users/admin', { role: 'restricted' }, adminToken);
  assert.equal(res.status, 403);
  assert.equal(res.body.error, 'admin 用户不可降级');
});

// ===== 测试 8: DELETE /api/admin/users/:username 删除用户成功 =====
test('DELETE /api/admin/users/:username deletes a non-admin user', async () => {
  const res = await request('DELETE', '/api/admin/users/autotest', null, adminToken);
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  // 确认已从生效配置中移除
  const config = readEffectiveUsers();
  assert.ok(!config.find(u => u.username === 'autotest'));
});

// ===== 测试 9: DELETE /api/admin/users/admin 阻止删除 =====
test('DELETE /api/admin/users/admin prevents admin deletion', async () => {
  const res = await request('DELETE', '/api/admin/users/admin', null, adminToken);
  assert.equal(res.status, 403);
  assert.equal(res.body.error, 'admin 用户不可删除');
});

// ===== 测试 10: 登录返回的 profile 包含动态关键词和路由 =====
test('Login returns dynamic keywords and routes from config', async () => {
  // 先确认 admin 的 routes 包含 /user-management
  const login = await request('POST', '/api/auth/login', { username: 'admin', password: passwords.admin });
  assert.equal(login.status, 200);
  const profile = login.body.user;
  assert.ok(profile.keywords.length > 0, 'admin should have keywords');
  assert.ok(profile.routes.includes('/user-management'), 'admin routes should include /user-management');
  assert.ok(profile.routes.includes('/summary'), 'admin routes should include /summary');
  // yzgjj 不应包含 /user-management
  const yzgjj = await request('POST', '/api/auth/login', { username: 'yzgjj', password: passwords.yzgjj });
  assert.equal(yzgjj.status, 200);
  assert.ok(!yzgjj.body.user.routes.includes('/user-management'), 'yzgjj should not have /user-management');
  assert.ok(yzgjj.body.user.routes.includes('/summary'), 'yzgjj should have /summary');
});


test('readiness uses the fixed model and shared configuration without retired llm-config.json', async () => {
  assert.equal(fs.existsSync(path.join(configDir, 'llm-config.json')), false);
  fs.mkdirSync(path.join(tempDir, 'dist'));
  fs.writeFileSync(path.join(tempDir, 'dist/index.html'), '<!doctype html><title>Test</title>');
  fs.writeFileSync(path.join(tempDir, '.release-commit'), 'test-commit');
  fs.writeFileSync(path.join(tempDir, '.release-id'), 'test-release');
  const readyRequest = createIsolatedApp({ configDir, dataDir: path.join(tempDir, 'data'), readiness: true });
  const res = await readyRequest('GET', '/api/readiness');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: 'ready', releaseCommit: 'test-commit', releaseId: 'test-release' });
});
