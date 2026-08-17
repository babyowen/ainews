'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createConfigStore } = require('../services/configStore.cjs');

function makeTempConfigDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-store-test-'));
  return dir;
}

function writeDefaults(dir, files) {
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content, 'utf-8');
  }
}

function sampleKeywordDefaults() {
  return {
    keywords: {
      养老: {
        prompts: [
          { id: 'default', name: '默认配置', description: '默认', systemPrompt: '养老默认system', userPrompt: '养老默认user', isDefault: true, updatedAt: '2025-01-01T00:00:00.000Z' },
          { id: 'v2', name: 'v2', description: '第二版', systemPrompt: '养老v2system', userPrompt: '养老v2user', isDefault: false, updatedAt: '2025-01-02T00:00:00.000Z' },
        ],
      },
      公积金: {
        prompts: [
          { id: 'default', name: '默认配置', description: '默认', systemPrompt: '公积金system', userPrompt: '公积金user', isDefault: true, updatedAt: '2025-01-01T00:00:00.000Z' },
        ],
      },
    },
    metadata: { version: '1.0.0', description: '关键词prompt配置' },
  };
}

test('configStore: 文本文件分层读取与提交', () => {
  const dir = makeTempConfigDir();
  writeDefaults(dir, { 'prompts.md': '# 默认\n\n## System Prompt\n\n```\n默认内容\n```\n' });
  const store = createConfigStore({ configDir: dir });

  assert.equal(store.readEffectiveText('prompts.md'), '# 默认\n\n## System Prompt\n\n```\n默认内容\n```\n');
  assert.equal(store.isOverridden('prompts.md'), false);

  store.commitText('prompts.md', '# 生产改过的默认\n\n## System Prompt\n\n```\n生产内容\n```\n');
  assert.equal(store.isOverridden('prompts.md'), true);
  assert.ok(fs.existsSync(path.join(dir, 'runtime', 'prompts.md')));
  // 默认层文件必须保持字节不变
  assert.equal(fs.readFileSync(path.join(dir, 'prompts.md'), 'utf-8'), '# 默认\n\n## System Prompt\n\n```\n默认内容\n```\n');
  assert.equal(store.readEffectiveText('prompts.md'), '# 生产改过的默认\n\n## System Prompt\n\n```\n生产内容\n```\n');

  // 恢复为默认内容后，运行时覆盖应被移除
  store.commitText('prompts.md', '# 默认\n\n## System Prompt\n\n```\n默认内容\n```\n');
  assert.equal(store.isOverridden('prompts.md'), false);
});

test('configStore: keyword-prompts 合并（覆盖/新增/墓碑/默认标记）', () => {
  const dir = makeTempConfigDir();
  writeDefaults(dir, { 'keyword-prompts.json': JSON.stringify(sampleKeywordDefaults(), null, 2) });
  const store = createConfigStore({ configDir: dir });

  const override = {
    keywords: {
      养老: {
        prompts: [
          // 修改 default 的内容，并把 isDefault 让给新增的 v3
          { id: 'default', name: '默认配置', description: '默认', systemPrompt: '生产改过的system', userPrompt: '养老默认user', isDefault: false, updatedAt: '2026-01-01T00:00:00.000Z' },
          { id: 'v3', name: 'v3', description: '生产新增', systemPrompt: 'v3system', userPrompt: 'v3user', isDefault: true, updatedAt: '2026-01-01T00:00:00.000Z' },
        ],
      },
    },
    metadata: { version: '1.0.0', description: '关键词prompt配置', lastUpdated: '2026-01-01T00:00:00.000Z', deletedIds: ['公积金::default'] },
  };
  fs.mkdirSync(path.join(dir, 'runtime'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'runtime', 'keyword-prompts.json'), JSON.stringify(override), 'utf-8');

  const effective = store.readEffectiveJson('keyword-prompts.json');
  const yang = effective.keywords.养老.prompts;
  assert.equal(yang.length, 3); // default(覆盖) + v2(默认层) + v3(新增)
  assert.equal(yang.find((p) => p.id === 'default').systemPrompt, '生产改过的system');
  assert.equal(yang.find((p) => p.id === 'default').source, 'runtime');
  assert.equal(yang.find((p) => p.id === 'v2').source, 'default');
  assert.equal(yang.find((p) => p.id === 'v3').source, 'runtime');
  // 运行时层 v3 是默认 → 默认层 default 的 isDefault 被压掉
  assert.equal(yang.find((p) => p.id === 'default').isDefault, false);
  assert.equal(yang.find((p) => p.id === 'v3').isDefault, true);
  // 公积金唯一条目被墓碑 → 整个关键词消失
  assert.equal(effective.keywords.公积金, undefined);
});

test('configStore: keyword-prompts 差异往返性质（diff→merge 还原生效内容）', () => {
  const dir = makeTempConfigDir();
  const defaults = sampleKeywordDefaults();
  writeDefaults(dir, { 'keyword-prompts.json': JSON.stringify(defaults, null, 2) });
  const store = createConfigStore({ configDir: dir });

  const effective = {
    keywords: {
      养老: {
        prompts: [
          { ...defaults.keywords.养老.prompts[0], systemPrompt: '改过', updatedAt: '2026-02-02T00:00:00.000Z' },
          // v2 被删除（应产生墓碑）
          { id: 'v9', name: 'v9', description: '新增', systemPrompt: 's', userPrompt: 'u', isDefault: false, updatedAt: '2026-02-02T00:00:00.000Z' },
        ],
      },
      // 公积金保持不变 → 不应出现在运行时层
      公积金: defaults.keywords.公积金,
    },
    metadata: { version: '1.0.0', description: '关键词prompt配置' },
  };

  const diff = store.diffAgainstDefault('keyword-prompts.json', effective);
  assert.ok(diff, '存在差异时应返回运行时层内容');
  assert.deepEqual(Object.keys(diff.keywords), ['养老']);
  assert.equal(diff.keywords.养老.prompts.length, 2); // 改过的 default + 新增 v9
  assert.deepEqual(diff.metadata.deletedIds, ['养老::v2']);

  // 往返：把 diff 写入运行时层后，读出生效内容应与原生效内容一致（忽略 source 字段）
  fs.mkdirSync(path.join(dir, 'runtime'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'runtime', 'keyword-prompts.json'), JSON.stringify(diff), 'utf-8');
  const merged = store.readEffectiveJson('keyword-prompts.json');
  const strip = (o) => JSON.parse(JSON.stringify(o, (k, v) => (k === 'source' ? undefined : v)));
  assert.deepEqual(strip(merged), strip(effective));

  // 与默认层完全一致时 diff 应为 null（不产生运行时覆盖）
  const noDiff = store.diffAgainstDefault('keyword-prompts.json', defaults);
  assert.equal(noDiff, null);
});

test('configStore: region prompts id 列表合并与差异往返', () => {
  const dir = makeTempConfigDir();
  const defaults = {
    prompts: [
      { id: 'single-region-default', name: '单地区', description: 'd1', systemPrompt: 's1', userPromptSingle: 'u1', userPromptMulti: 'm1', isDefault: false, createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z' },
      { id: 'multi-region-default', name: '多地区', description: 'd2', systemPrompt: 's2', userPromptSingle: 'u2', userPromptMulti: 'm2', isDefault: true, createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z' },
    ],
    metadata: { version: '1.0.0', description: '地区政策报告' },
  };
  writeDefaults(dir, { 'region-policy-report-prompts.json': JSON.stringify(defaults, null, 2) });
  const store = createConfigStore({ configDir: dir });

  const effective = {
    prompts: [
      { ...defaults.prompts[0], systemPrompt: '生产改过的', updatedAt: '2026-03-03T00:00:00.000Z' },
      // multi-region-default 被删除 → 墓碑
      { id: 'prod-extra', name: '生产自建', description: 'd3', systemPrompt: 's3', userPromptSingle: 'u3', userPromptMulti: 'm3', isDefault: true, createdAt: '2026-03-03T00:00:00.000Z', updatedAt: '2026-03-03T00:00:00.000Z' },
    ],
    metadata: { version: '1.0.0', description: '地区政策报告' },
  };

  const diff = store.diffAgainstDefault('region-policy-report-prompts.json', effective);
  assert.equal(diff.prompts.length, 2);
  assert.deepEqual(diff.metadata.deletedIds, ['multi-region-default']);

  fs.mkdirSync(path.join(dir, 'runtime'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'runtime', 'region-policy-report-prompts.json'), JSON.stringify(diff), 'utf-8');
  const merged = store.readEffectiveJson('region-policy-report-prompts.json');
  const strip = (o) => JSON.parse(JSON.stringify(o, (k, v) => (k === 'source' ? undefined : v)));
  assert.deepEqual(strip(merged), strip(effective));
});

test('configStore: 浅合并（llm-config）+ 深层墓碑', () => {
  const dir = makeTempConfigDir();
  const defaults = {
    activeModel: 'deepseek-r1',
    models: {
      'deepseek-r1': { provider: 'deepseek', model: 'deepseek-reasoner' },
      'kimi-k2': { provider: 'moonshot', model: 'kimi-k2' },
    },
    settings: { temperature: 0.7 },
  };
  writeDefaults(dir, { 'llm-config.json': JSON.stringify(defaults, null, 2) });
  const store = createConfigStore({ configDir: dir });

  // 只切换 activeModel → 运行时层仅含 activeModel
  const diff = store.diffAgainstDefault('llm-config.json', { ...defaults, activeModel: 'kimi-k2' });
  assert.deepEqual(diff, { activeModel: 'kimi-k2' });

  // 历史遗留的多余键（如 switchModel 曾误写入的 prompts）不应进入运行时层
  const polluted = { ...defaults, activeModel: 'kimi-k2', prompts: { systemPrompt: '污染' } };
  const diff2 = store.diffAgainstDefault('llm-config.json', polluted);
  assert.deepEqual(diff2, { activeModel: 'kimi-k2' });

  // 深层删除：删除 kimi-k2 模型 → 子项墓碑 null
  const removed = { ...defaults, activeModel: 'deepseek-r1', models: { 'deepseek-r1': defaults.models['deepseek-r1'] } };
  const diff3 = store.diffAgainstDefault('llm-config.json', removed);
  assert.deepEqual(diff3, { models: { 'kimi-k2': null } });
  fs.mkdirSync(path.join(dir, 'runtime'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'runtime', 'llm-config.json'), JSON.stringify(diff3), 'utf-8');
  const merged = store.readEffectiveJson('llm-config.json');
  assert.deepEqual(Object.keys(merged.models), ['deepseek-r1']);

  // auto-report keywords 子对象合并
  const arDir = makeTempConfigDir();
  const arDefaults = { enabled: false, defaults: { modelKey: 'deepseek-v4-flash' }, keywords: { 养老: { enabled: true } } };
  writeDefaults(arDir, { 'auto-report-config.json': JSON.stringify(arDefaults) });
  const arStore = createConfigStore({ configDir: arDir });
  const arDiff = arStore.diffAgainstDefault('auto-report-config.json', { ...arDefaults, enabled: true });
  assert.deepEqual(arDiff, { enabled: true });
});

test('configStore: users.json 整文件覆盖', () => {
  const dir = makeTempConfigDir();
  const defaults = { users: [{ username: 'admin', role: 'admin' }] };
  writeDefaults(dir, { 'users.json': JSON.stringify(defaults) });
  const store = createConfigStore({ configDir: dir });

  assert.deepEqual(store.readEffectiveJson('users.json'), defaults);
  const changed = { users: [{ username: 'admin', role: 'admin' }, { username: 'new', role: 'restricted' }] };
  store.commitJson('users.json', changed);
  assert.deepEqual(store.readEffectiveJson('users.json'), changed);
  // 改回默认 → 覆盖被清除
  store.commitJson('users.json', defaults);
  assert.equal(store.isOverridden('users.json'), false);
});

test('configStore: exportBundle / importBundle 往返', () => {
  const sourceDir = makeTempConfigDir();
  writeDefaults(sourceDir, {
    'prompts.md': '默认',
    'keyword-prompts.json': JSON.stringify(sampleKeywordDefaults()),
  });
  const source = createConfigStore({ configDir: sourceDir });
  source.commitText('prompts.md', '生产版');

  const bundle = source.exportBundle();
  assert.deepEqual(Object.keys(bundle.files), ['prompts.md']);

  const targetDir = makeTempConfigDir();
  writeDefaults(targetDir, {
    'prompts.md': '默认',
    'keyword-prompts.json': JSON.stringify(sampleKeywordDefaults()),
  });
  const target = createConfigStore({ configDir: targetDir });
  const imported = target.importBundle(bundle);
  assert.deepEqual(imported, ['prompts.md']);
  assert.equal(target.readEffectiveText('prompts.md'), '生产版');
  assert.equal(target.isOverridden('keyword-prompts.json'), false);
  assert.equal(fs.readdirSync(path.join(targetDir, 'runtime')).some((name) => name.endsWith('.tmp')), false);

  // 非法文件名拒绝导入
  assert.throws(() => target.importBundle({ formatVersion: 1, files: { 'evil.json': { type: 'json', content: {} } } }), /未纳入管理/);
  assert.throws(
    () => target.importBundle({ formatVersion: 1, files: { 'prompts.md': { type: 'json', content: {} } } }),
    /类型不匹配/,
  );
});

test('configStore: runtimeStatus 汇总覆盖状态', () => {
  const dir = makeTempConfigDir();
  writeDefaults(dir, { 'keyword-prompts.json': JSON.stringify(sampleKeywordDefaults()) });
  const store = createConfigStore({ configDir: dir });
  store.commitText('prompts.md', '随便');

  const status = store.runtimeStatus();
  const promptsMd = status.find((s) => s.name === 'prompts.md');
  assert.equal(promptsMd.overridden, true);
  const keyword = status.find((s) => s.name === 'keyword-prompts.json');
  assert.equal(keyword.overridden, false);
  assert.equal(keyword.keywordCount, 2);
  assert.equal(keyword.promptCount, 3);
});
