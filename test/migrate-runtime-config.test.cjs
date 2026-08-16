'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { migrateRuntimeConfig, hasErrors } = require('../scripts/migrate-runtime-config.cjs');
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

  assert.ok(results.some((r) => r.action === 'warning' && /baseline/.test(r.reason)));
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
