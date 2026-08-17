const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');

const USERS_CONFIG_PATH = path.join(__dirname, '..', 'config', 'users.json');
const RUNTIME_USERS_PATH = path.join(__dirname, '..', 'config', 'runtime', 'users.json');
const TEST_API_PORT = Number(process.env.TEST_API_PORT || 3456);
const BASE_URL = `http://127.0.0.1:${TEST_API_PORT}`;

let originalConfig;
let originalRuntimeConfig;
let serverProc;
let adminToken = '';

function backupConfig() {
  originalConfig = fs.readFileSync(USERS_CONFIG_PATH, 'utf-8');
  originalRuntimeConfig = fs.existsSync(RUNTIME_USERS_PATH) ? fs.readFileSync(RUNTIME_USERS_PATH, 'utf-8') : null;
}

function restoreConfig() {
  fs.writeFileSync(USERS_CONFIG_PATH, originalConfig, 'utf-8');
  if (originalRuntimeConfig === null) {
    if (fs.existsSync(RUNTIME_USERS_PATH)) fs.unlinkSync(RUNTIME_USERS_PATH);
  } else {
    fs.writeFileSync(RUNTIME_USERS_PATH, originalRuntimeConfig, 'utf-8');
  }
}

// 生效配置 = config/runtime/users.json（若存在）整文件覆盖 config/users.json
function readEffectiveUsers() {
  const filePath = fs.existsSync(RUNTIME_USERS_PATH) ? RUNTIME_USERS_PATH : USERS_CONFIG_PATH;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function request(method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE_URL);
    const options = { method, hostname: url.hostname, port: url.port, path: `${url.pathname}${url.search}`, headers: {} };
    if (token) options.headers.Authorization = `Bearer ${token}`;
    let payload;
    if (body) {
      payload = JSON.stringify(body);
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(payload);
    }
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({ status: res.statusCode, body: JSON.parse(data) });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// 启动 server
test.before(async () => {
  backupConfig();
  // 需要设置环境变量让 server 能启动
  if (!process.env.DB_HOST) {
    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  }
  // 以子进程方式启动较复杂，直接 require server（它会 listen）
  // 但 server 已经在运行中的情况下会报端口冲突，所以用 spawn
  const { spawn } = require('child_process');
  serverProc = spawn(process.execPath, [path.join(__dirname, '..', 'server.cjs')], {
    stdio: 'pipe',
    env: { ...process.env, API_PORT: String(TEST_API_PORT) },
  });
  await new Promise((resolve) => {
    serverProc.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('running')) resolve();
    });
    setTimeout(resolve, 4000);
  });
  // 以 admin 登录获取 token（管理接口现已要求 admin 鉴权）
  const login = await request('POST', '/api/auth/login', { username: 'admin', password: 'citic3104' });
  if (login.status === 200 && login.body.token) {
    adminToken = login.body.token;
  }
});

test.after(() => {
  restoreConfig();
  if (serverProc) serverProc.kill();
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
    password: 'test123',
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
  assert.equal(JSON.stringify(exported.body).includes('test123'), false);

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
  const runtimePath = path.join(__dirname, '..', 'config/runtime/policy_prompts.md');
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
  const defaultPolicyPath = path.join(__dirname, '..', 'config/policy_prompts.md');
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
  await request('PUT', '/api/admin/users/autotest', { password: 'newpass999' }, adminToken);
  const login = await request('POST', '/api/auth/login', { username: 'autotest', password: 'newpass999' });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.username, 'autotest');
  // 旧密码应失败
  const oldLogin = await request('POST', '/api/auth/login', { username: 'autotest', password: 'test123' });
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
  const login = await request('POST', '/api/auth/login', { username: 'admin', password: 'citic3104' });
  assert.equal(login.status, 200);
  const profile = login.body.user;
  assert.ok(profile.keywords.length > 0, 'admin should have keywords');
  assert.ok(profile.routes.includes('/user-management'), 'admin routes should include /user-management');
  assert.ok(profile.routes.includes('/summary'), 'admin routes should include /summary');
  // yzgjj 不应包含 /user-management
  const yzgjj = await request('POST', '/api/auth/login', { username: 'yzgjj', password: 'yzgjj' });
  assert.equal(yzgjj.status, 200);
  assert.ok(!yzgjj.body.user.routes.includes('/user-management'), 'yzgjj should not have /user-management');
  assert.ok(yzgjj.body.user.routes.includes('/summary'), 'yzgjj should have /summary');
});
