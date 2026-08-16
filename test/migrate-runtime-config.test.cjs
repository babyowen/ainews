'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { migrateRuntimeConfig, hasErrors, resolveBaseline } = require('../scripts/migrate-runtime-config.cjs');
const { createConfigStore } = require('../services/configStore.cjs');

function mkdtemp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// 场景素材：
// 旧默认层（baseline）：养老有 default(A) + v2(B) + 旧共享条目(C)
// 生产快照：A 被生产改过；B 被生产删除；C 生产没动；另有生产自建 prod-x
// 新默认层：A 被开发端改良（新内容）；B 已被开发端移除；C 保留；新增「烟草服务银行」(T)
function buildScenario() {
  const configDir = mkdtemp('migrate-cfg-');
  const fromDir = mkdtemp('migrate-from-');
  const baselineDir = mkdtemp('migrate-base-');

  const entryA_old = { id: 'default', name: '默认', description: 'd', systemPrompt: '旧system', userPrompt: '旧user', isDefault: true, updatedAt: '2025-01-01T00:00:00.000Z' };
  const entryA_prod = { ...entryA_old, systemPrompt: '生产改过的system', updatedAt: '2026-01-01T00:00:00.000Z' };
  const entryA_new = { ...entryA_old, systemPrompt: '开发端改良的system', updatedAt: '2026-08-01T00:00:00.000Z' };
  const entryB = { id: 'v2', name: 'v2', description: 'd', systemPrompt: 's2', userPrompt: 'u2', isDefault: false, updatedAt: '2025-01-01T00:00:00.000Z' };
  const entryC = { id: 'shared', name: '共享', description: 'd', systemPrompt: '共享system', userPrompt: '共享user', isDefault: false, updatedAt: '2025-01-01T00:00:00.000Z' };
  const entryProdX = { id: 'prod-x', name: '生产自建', description: 'd', systemPrompt: 'sx', userPrompt: 'ux', isDefault: false, updatedAt: '2026-01-01T00:00:00.000Z' };
  const entryT = { id: 'default', name: '烟草默认', description: 'd', systemPrompt: 'ts', userPrompt: 'tu', isDefault: true, updatedAt: '2026-07-17T00:00:00.000Z' };

  const kwFile = (keywords) => JSON.stringify({ keywords, metadata: { version: '1.0.0' } });

  // 旧默认层（上次部署包的 config-baseline）
  fs.writeFileSync(path.join(baselineDir, 'keyword-prompts.json'), kwFile({
    养老: { prompts: [entryA_old, entryB, entryC] },
  }));
  fs.writeFileSync(path.join(baselineDir, 'prompts.md'), '## System Prompt\n\n```\n旧默认\n```\n');
  fs.writeFileSync(path.join(baselineDir, 'llm-config.json'), JSON.stringify({ activeModel: 'deepseek-r1', models: { a: { provider: 'x' } }, settings: { temperature: 0.7 } }));

  // 生产快照（部署前 cp 的 config 目录 = 旧默认 + 生产修改）
  fs.writeFileSync(path.join(fromDir, 'keyword-prompts.json'), kwFile({
    养老: { prompts: [entryA_prod, entryC, entryProdX] }, // A 改过、B 被删、C 没动、prod-x 自建
  }));
  fs.writeFileSync(path.join(fromDir, 'prompts.md'), '## System Prompt\n\n```\n生产没改过（与旧默认一致）\n```\n');
  fs.writeFileSync(path.join(baselineDir, 'prompts.md'), '## System Prompt\n\n```\n生产没改过（与旧默认一致）\n```\n');
  fs.writeFileSync(path.join(fromDir, 'llm-config.json'), JSON.stringify({ activeModel: 'kimi-k2', models: { a: { provider: 'x' } }, settings: { temperature: 0.7 } }));

  // 新默认层（部署后的仓库版本）
  fs.writeFileSync(path.join(configDir, 'keyword-prompts.json'), kwFile({
    养老: { prompts: [entryA_new, entryC] }, // A 改良、B 已移除、C 保留
    烟草服务银行: { prompts: [entryT] },      // 新版新增
  }));
  fs.writeFileSync(path.join(configDir, 'prompts.md'), '## System Prompt\n\n```\n新默认（开发端改良）\n```\n');
  fs.writeFileSync(path.join(configDir, 'llm-config.json'), JSON.stringify({ activeModel: 'deepseek-r1', models: { a: { provider: 'x' } }, settings: { temperature: 0.7 } }));

  return { configDir, fromDir, baselineDir };
}

test('migrate 三方比较：生产修改保留、新默认改良生效、新增条目不误删', () => {
  const { configDir, fromDir, baselineDir } = buildScenario();
  const results = migrateRuntimeConfig({ configDir, fromDir, baselineDir });
  assert.equal(hasErrors(results), false, JSON.stringify(results));

  const store = createConfigStore({ configDir });
  const effective = store.readEffectiveJson('keyword-prompts.json');
  const prompts = effective.keywords.养老.prompts;
  const byId = Object.fromEntries(prompts.map((p) => [p.id, p]));

  // 1) 生产改过的 A → 固定生产版本（不被新默认覆盖，也不丢生产修改）
  assert.equal(byId.default.systemPrompt, '生产改过的system');
  assert.equal(byId.default.source, 'runtime');

  // 2) 生产没动的 C → 自动采用新默认（内容一致，不产生运行时覆盖）
  assert.equal(byId.shared.source, 'default');

  // 3) 新版新增的「烟草服务银行」→ 正常出现，绝不被误判为生产删除（review 关键场景）
  assert.ok(effective.keywords.烟草服务银行, '新版新增关键词必须出现');
  assert.equal(effective.keywords.烟草服务银行.prompts[0].source, 'default');
  const runtimeRaw = JSON.parse(fs.readFileSync(path.join(configDir, 'runtime', 'keyword-prompts.json'), 'utf-8'));
  assert.equal((runtimeRaw.metadata.deletedIds || []).includes('烟草服务银行::default'), false);

  // 4) 生产删除的 B：新默认层已移除 → 无需墓碑；墓碑列表为空
  assert.equal(byId.v2, undefined);
  assert.deepEqual(runtimeRaw.metadata.deletedIds || [], []);

  // 5) 生产自建 prod-x → 保留
  assert.equal(byId['prod-x'].source, 'runtime');

  // 6) prompts.md：生产没改（快照=旧默认）→ 跟随新默认，不产生运行时覆盖
  assert.equal(store.readEffectiveText('prompts.md').includes('新默认'), true);
  assert.equal(store.isOverridden('prompts.md'), false);

  // 7) llm-config：生产切过模型（activeModel 与旧默认不同）→ 运行时层仅含 activeModel
  const llmRuntime = JSON.parse(fs.readFileSync(path.join(configDir, 'runtime', 'llm-config.json'), 'utf-8'));
  assert.deepEqual(llmRuntime, { activeModel: 'kimi-k2' });
});

test('migrate 三方比较：生产删除且新版仍内置的条目 → 墓碑', () => {
  const { configDir, fromDir, baselineDir } = buildScenario();
  // 改造场景：v2 在新默认层仍存在（模拟开发端保留、生产删除）
  const cfg = JSON.parse(fs.readFileSync(path.join(configDir, 'keyword-prompts.json'), 'utf-8'));
  cfg.keywords.养老.prompts.push({ id: 'v2', name: 'v2', description: 'd', systemPrompt: 's2-新', userPrompt: 'u2', isDefault: false, updatedAt: '2026-08-01T00:00:00.000Z' });
  fs.writeFileSync(path.join(configDir, 'keyword-prompts.json'), JSON.stringify(cfg));

  const results = migrateRuntimeConfig({ configDir, fromDir, baselineDir });
  assert.equal(hasErrors(results), false);

  const effective = createConfigStore({ configDir }).readEffectiveJson('keyword-prompts.json');
  assert.equal(effective.keywords.养老.prompts.find((p) => p.id === 'v2'), undefined, '生产删除的条目应被墓碑挡住');
  const runtimeRaw = JSON.parse(fs.readFileSync(path.join(configDir, 'runtime', 'keyword-prompts.json'), 'utf-8'));
  assert.deepEqual(runtimeRaw.metadata.deletedIds, ['养老::v2']);
});

test('migrate 无 baseline 降级：不写墓碑（不误杀新版新增条目）并给出警告', () => {
  const { configDir, fromDir } = buildScenario();
  const results = migrateRuntimeConfig({ configDir, fromDir }); // 不传 baselineDir

  assert.ok(results.some((r) => r.action === 'warning' && /基线/.test(r.reason)));
  assert.equal(hasErrors(results), false);

  const store = createConfigStore({ configDir });
  // 关键保护：新版新增的烟草服务银行不能被墓碑（无 baseline 的两方比较里它“只在新默认存在”）
  const effective = store.readEffectiveJson('keyword-prompts.json');
  assert.ok(effective.keywords.烟草服务银行);
  const runtimeRaw = JSON.parse(fs.readFileSync(path.join(configDir, 'runtime', 'keyword-prompts.json'), 'utf-8'));
  assert.deepEqual(runtimeRaw.metadata.deletedIds || [], []);
});

test('migrate 非法 JSON → error 结果且 hasErrors 为真（CLI 将以非零码退出）', () => {
  const { configDir, fromDir, baselineDir } = buildScenario();
  fs.writeFileSync(path.join(fromDir, 'users.json'), '{ 这不是合法 JSON');
  const results = migrateRuntimeConfig({ configDir, fromDir, baselineDir });
  const users = results.find((r) => r.name === 'users.json');
  assert.equal(users.action, 'error');
  assert.equal(hasErrors(results), true);
});

test('migrate 防覆盖保护与 dry-run', () => {
  const { configDir, fromDir, baselineDir } = buildScenario();
  // dry-run 不写盘
  migrateRuntimeConfig({ configDir, fromDir, baselineDir, dryRun: true });
  assert.equal(fs.existsSync(path.join(configDir, 'runtime')), false);

  // 运行时层已存在时默认跳过
  migrateRuntimeConfig({ configDir, fromDir, baselineDir });
  const again = migrateRuntimeConfig({ configDir, fromDir, baselineDir });
  const kw = again.find((r) => r.name === 'keyword-prompts.json');
  assert.equal(kw.action, 'skipped');
  assert.match(kw.reason, /运行时层已存在/);

  // --force 重写
  const forced = migrateRuntimeConfig({ configDir, fromDir, baselineDir, force: true });
  assert.equal(forced.find((r) => r.name === 'keyword-prompts.json').action, 'written');
});

// ===== 基线发现机制（第三轮 review 的 P1：包自带 baseline 不能当旧基线用）=====

function buildBaselineScenario() {
  const projectRoot = mkdtemp('migrate-root-');
  const configDir = path.join(projectRoot, 'config');
  fs.mkdirSync(configDir, { recursive: true });

  const oldDefault = { keywords: { 养老: { prompts: [{ id: 'default', name: '默认', description: 'd', systemPrompt: '旧默认', userPrompt: 'u', isDefault: true, updatedAt: '2025-01-01T00:00:00.000Z' }] } }, metadata: { version: '1.0.0' } };
  const newDefault = { ...oldDefault, keywords: { ...oldDefault.keywords, 烟草服务银行: { prompts: [{ id: 'default', name: '烟草', description: 'd', systemPrompt: '新关键词', userPrompt: 'u', isDefault: true, updatedAt: '2026-07-17T00:00:00.000Z' }] } } };

  fs.writeFileSync(path.join(configDir, 'keyword-prompts.json'), JSON.stringify(newDefault));

  // 旧基线目录（上一版默认层）与新包自带快照（= 当前默认层）
  const oldBaseDir = path.join(projectRoot, 'config-baseline-oldsha-20260601');
  const selfBaseDir = path.join(projectRoot, 'config-baseline-newsha-20260816');
  fs.mkdirSync(oldBaseDir, { recursive: true });
  fs.mkdirSync(selfBaseDir, { recursive: true });
  fs.writeFileSync(path.join(oldBaseDir, 'keyword-prompts.json'), JSON.stringify(oldDefault));
  fs.writeFileSync(path.join(selfBaseDir, 'keyword-prompts.json'), JSON.stringify(newDefault));
  fs.writeFileSync(path.join(projectRoot, 'RELEASE_VERSION'), 'newsha-20260816\n');

  // 控制 mtime：旧基线更早，自建场景里即使顺序写入也要稳定
  const past = new Date(Date.now() - 86400000);
  fs.utimesSync(oldBaseDir, past, past);
  fs.utimesSync(selfBaseDir, new Date(), new Date());

  return { projectRoot, configDir, oldDefault, newDefault, oldBaseDir, selfBaseDir };
}

test('基线发现：排除本包自带快照，自动拾取上一版基线', () => {
  const { projectRoot, configDir, oldBaseDir } = buildBaselineScenario();
  const resolved = resolveBaseline({ projectRoot, configDir, explicit: '', noBaseline: false });
  assert.equal(resolved.dir, oldBaseDir);
  assert.match(resolved.reason, /newsha-20260816/);
});

test('基线发现：仅有本包自带快照（首次迁移）→ 拒用并降级，不误当旧基线', () => {
  const { projectRoot, configDir, selfBaseDir } = buildBaselineScenario();
  fs.rmSync(path.join(projectRoot, 'config-baseline-oldsha-20260601'), { recursive: true });
  // 场景 A：靠 RELEASE_VERSION 排除自身快照
  const resolvedA = resolveBaseline({ projectRoot, configDir, explicit: '', noBaseline: false });
  assert.equal(resolvedA.dir, null);
  assert.match(resolvedA.reason, /首次迁移|自身快照|之外/);

  // 场景 B：即使没有 RELEASE_VERSION（旧包），内容级兜底也要识别自身快照
  fs.rmSync(path.join(projectRoot, 'RELEASE_VERSION'));
  fs.mkdirSync(path.join(projectRoot, 'config-baseline-oldsha-20260601'), { recursive: true }); // 恢复旧基线供对照
  const resolvedB = resolveBaseline({ projectRoot, configDir, explicit: '', noBaseline: false });
  // 剩两个目录且无 RELEASE_VERSION：若最新的是自身快照，内容兜底应拒用并回退到更旧的真基线或 null
  assert.ok(resolvedB.dir === null || resolvedB.dir === path.join(projectRoot, 'config-baseline-oldsha-20260601'));
});

test('基线发现：显式指定的基线若是自身快照 → 拒绝使用', () => {
  const { projectRoot, configDir, selfBaseDir } = buildBaselineScenario();
  const resolved = resolveBaseline({ projectRoot, configDir, explicit: selfBaseDir, noBaseline: false });
  assert.equal(resolved.dir, null);
  assert.match(resolved.reason, /完全一致/);
});

test('端到端：仅剩本包自带快照时迁移不产生墓碑，新版新增关键词正常出现（AI1 场景）', () => {
  const { projectRoot, configDir, oldDefault, newDefault, selfBaseDir } = buildBaselineScenario();
  fs.rmSync(path.join(projectRoot, 'config-baseline-oldsha-20260601'), { recursive: true });

  // 生产快照 = 旧默认 + 一条手改 prompt（不含新版新增的烟草服务银行）
  const snapshot = JSON.parse(JSON.stringify(oldDefault));
  snapshot.keywords.养老.prompts[0].systemPrompt = '生产手改';
  const fromDir = mkdtemp('migrate-e2e-');
  fs.writeFileSync(path.join(fromDir, 'keyword-prompts.json'), JSON.stringify(snapshot));

  const { dir: baselineDir } = resolveBaseline({ projectRoot, configDir, explicit: '', noBaseline: false });
  assert.equal(baselineDir, null, '自带快照不得被当作基线');

  const results = migrateRuntimeConfig({ configDir, fromDir, baselineDir });
  assert.equal(hasErrors(results), false);
  const effective = createConfigStore({ configDir }).readEffectiveJson('keyword-prompts.json');

  // 新版新增关键词必须可见（不得被墓碑）
  assert.ok(effective.keywords.烟草服务银行, '烟草服务银行必须出现');
  // 生产手改必须保留
  assert.equal(effective.keywords.养老.prompts[0].systemPrompt, '生产手改');
  const runtimeRaw = JSON.parse(fs.readFileSync(path.join(configDir, 'runtime', 'keyword-prompts.json'), 'utf-8'));
  assert.deepEqual(runtimeRaw.metadata.deletedIds || [], []);
});

test('端到端：有正确旧基线时，三方比较完整生效（生产 lag 多版本同理）', () => {
  const { projectRoot, configDir, oldDefault, oldBaseDir } = buildBaselineScenario();

  const snapshot = JSON.parse(JSON.stringify(oldDefault));
  snapshot.keywords.养老.prompts[0].systemPrompt = '生产手改';
  const fromDir = mkdtemp('migrate-e2e2-');
  fs.writeFileSync(path.join(fromDir, 'keyword-prompts.json'), JSON.stringify(snapshot));

  const { dir: baselineDir } = resolveBaseline({ projectRoot, configDir, explicit: '', noBaseline: false });
  assert.equal(baselineDir, oldBaseDir);

  const results = migrateRuntimeConfig({ configDir, fromDir, baselineDir });
  assert.equal(hasErrors(results), false);
  const effective = createConfigStore({ configDir }).readEffectiveJson('keyword-prompts.json');
  assert.ok(effective.keywords.烟草服务银行, '新版新增关键词出现');
  assert.equal(effective.keywords.养老.prompts[0].systemPrompt, '生产手改', '生产手改保留');
  assert.equal(effective.keywords.养老.prompts[0].source, 'runtime');
});
