// 一次性冒烟验证（issue #22）：真实拉起 server，验证双层存储核心行为
// 非破坏性：若本地已存在 config/runtime/，会先备份、结束后原样恢复
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const BASE = 'http://127.0.0.1:3457';
const KEYWORD_FILE = path.join(ROOT, 'config/keyword-prompts.json');
const RUNTIME_DIR = path.join(ROOT, 'config/runtime');
const RUNTIME_BACKUP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-runtime-backup-'));

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

async function api(method, urlPath, body, token) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(new URL(urlPath, BASE), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* ignore */ }
  return { status: res.status, data };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 备份本地已有 runtime 层（冒烟会创建/删除 runtime 文件，必须可完整还原）
let hadRuntimeBefore = false;
if (fs.existsSync(RUNTIME_DIR)) {
  hadRuntimeBefore = true;
  fs.cpSync(RUNTIME_DIR, RUNTIME_BACKUP_DIR, { recursive: true });
  console.log('ℹ️ 检测到本地 config/runtime/，已备份，冒烟结束后恢复');
}

process.env.API_PORT = '3457';
const server = spawn(process.execPath, [path.join(ROOT, 'server.cjs')], {
  env: { ...process.env },
  stdio: ['ignore', 'pipe', 'pipe'],
});

try {
  // 等待启动
  let up = false;
  for (let i = 0; i < 40 && !up; i += 1) {
    await sleep(500);
    try {
      const r = await fetch(new URL('/api/keyword-prompts?keyword=养老', BASE));
      if (r.ok) up = true;
    } catch { /* retry */ }
  }
  if (!up) throw new Error('server 未能在 20s 内启动');
  check('server 启动', true);

  // 1. 读：keyword prompts 带来源标记
  const list = await api('GET', '/api/keyword-prompts?keyword=养老');
  check('GET /api/keyword-prompts 200', list.status === 200);
  check('prompt 带来源标记', Array.isArray(list.data) && list.data.every((p) => 'source' in p), `共 ${list.data.length} 条`);

  // 2. 读：config/prompts 聚合
  const prompts = await api('GET', '/api/config/prompts');
  check('GET /api/config/prompts 200', prompts.status === 200 && !!prompts.data.systemPrompt);

  // 3. 无 token 保存 → 401
  const noAuth = await api('POST', '/api/config/keyword-prompts', {
    keyword: '冒烟测试', name: 'smoke', description: 'd', systemPrompt: 's', userPrompt: 'u',
  });
  check('无鉴权保存被拒绝 (401)', noAuth.status === 401, `status=${noAuth.status}`);

  // 3b. 用户管理与模型切换接口同样拒绝匿名访问
  const anonUserPost = await api('POST', '/api/admin/users', { username: 'hacker', password: 'x', role: 'admin' });
  check('匿名创建用户被拒绝 (401)', anonUserPost.status === 401, `status=${anonUserPost.status}`);
  const anonUserDelete = await api('DELETE', '/api/admin/users/yzgjj');
  check('匿名删除用户被拒绝 (401)', anonUserDelete.status === 401, `status=${anonUserDelete.status}`);
  const anonSwitch = await api('POST', '/api/llm/switch-model', { modelKey: 'kimi-k2' });
  check('匿名切换模型被拒绝 (401)', anonSwitch.status === 401, `status=${anonSwitch.status}`);

  // 4. admin 登录 → 带 token 保存 → 写 runtime、默认层不动
  const before = fs.readFileSync(KEYWORD_FILE, 'utf-8');
  const login = await api('POST', '/api/auth/login', { username: 'admin', password: 'citic3104' });
  check('admin 登录', login.status === 200 && !!login.data.token);

  const save = await api('POST', '/api/config/keyword-prompts', {
    keyword: '冒烟测试', name: 'smoke版本', description: '冒烟', systemPrompt: '冒烟system', userPrompt: '冒烟user',
  }, login.data.token);
  check('带鉴权保存成功', save.status === 200 && save.data.success, `promptId=${save.data.prompt?.id}`);

  const after = fs.readFileSync(KEYWORD_FILE, 'utf-8');
  check('默认层文件字节不变', before === after);

  const runtimeFile = path.join(RUNTIME_DIR, 'keyword-prompts.json');
  check('运行时层已生成', fs.existsSync(runtimeFile));

  // 5. 生效读取能查到 runtime 条目
  const found = await api('GET', '/api/keyword-prompts?keyword=冒烟测试');
  check('生效配置包含新增条目', found.status === 200 && found.data.some((p) => p.id === save.data.prompt.id && p.source === 'runtime'));

  // 6. runtime-status / export / reset
  const status = await api('GET', '/api/config/runtime-status', null, login.data.token);
  check('runtime-status 200', status.status === 200 && Array.isArray(status.data.files));
  const kwStatus = status.data.files.find((f) => f.name === 'keyword-prompts.json');
  check('runtime-status 显示覆盖', kwStatus?.overridden === true);

  const exported = await api('GET', '/api/config/prompt-export', null, login.data.token);
  check('prompt-export 200', exported.status === 200 && exported.data.files && 'keyword-prompts.json' in exported.data.files);

  const reset = await api('POST', '/api/config/reset-default', { file: 'keyword-prompts.json' }, login.data.token);
  check('恢复默认成功', reset.status === 200 && reset.data.reset.includes('keyword-prompts.json'));
  check('恢复后 runtime 覆盖清除', !fs.existsSync(runtimeFile));

  // 6b. 条目级恢复默认：保存两条 → 条目级恢复一条 → 另一条仍在 runtime
  const saveA = await api('POST', '/api/config/keyword-prompts', {
    keyword: '冒烟测试', name: '条目A', description: 'd', systemPrompt: 'A', userPrompt: 'A',
  }, login.data.token);
  const saveB = await api('POST', '/api/config/keyword-prompts', {
    keyword: '冒烟测试', name: '条目B', description: 'd', systemPrompt: 'B', userPrompt: 'B',
  }, login.data.token);
  const entryReset = await api('POST', '/api/config/reset-default', {
    file: 'keyword-prompts.json', keyword: '冒烟测试', promptId: saveA.data.prompt.id,
  }, login.data.token);
  check('条目级恢复成功', entryReset.status === 200 && entryReset.data.reset.length === 1);
  const afterEntryReset = await api('GET', '/api/keyword-prompts?keyword=冒烟测试');
  const remainIds = afterEntryReset.data.map((p) => p.id);
  check('条目级恢复只影响目标条目', remainIds.includes(saveB.data.prompt.id) && !remainIds.includes(saveA.data.prompt.id), remainIds.join(','));
  // 清理冒烟数据
  await api('POST', '/api/config/reset-default', { file: 'keyword-prompts.json' }, login.data.token);

  const afterReset = await api('GET', '/api/keyword-prompts?keyword=冒烟测试');
  check('恢复后新增条目消失（回到出厂默认）', afterReset.status === 200 && afterReset.data.length === 0);

  // 7. llm 接口（修复后应可用而非 500）
  const models = await api('GET', '/api/llm/models');
  check('GET /api/llm/models 可用（模块 bug 已修）', models.status === 200 && Array.isArray(models.data));
} finally {
  server.kill('SIGKILL');
  // 还原本地 runtime 层到冒烟前状态
  fs.rmSync(RUNTIME_DIR, { recursive: true, force: true });
  if (hadRuntimeBefore) {
    fs.cpSync(RUNTIME_BACKUP_DIR, RUNTIME_DIR, { recursive: true });
    console.log('ℹ️ 已恢复冒烟前的本地 config/runtime/');
  }
  fs.rmSync(RUNTIME_BACKUP_DIR, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n== 冒烟结果：${results.length - failed.length}/${results.length} 通过 ==`);
process.exit(failed.length ? 1 : 0);
