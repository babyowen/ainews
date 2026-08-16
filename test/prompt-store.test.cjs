'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  createPromptStore,
  extractSection,
  upsertSection,
} = require('../services/promptStore.cjs');

const REPO_ROOT = path.join(__dirname, '..');

test('promptStore: 统一正则能解析真实的 prompts.md（内嵌 ## 小节不受影响）', () => {
  const content = fs.readFileSync(path.join(REPO_ROOT, 'config/prompts.md'), 'utf-8');

  const system = extractSection(content, 'System Prompt');
  const user = extractSection(content, 'User Prompt');
  const modifySystem = extractSection(content, 'Modify System Prompt');
  const modifyUser = extractSection(content, 'Modify User Prompt');

  assert.ok(system && system.length > 100, 'System Prompt 应有实质内容');
  assert.ok(user && user.includes('{keyword}'), 'User Prompt 应包含 {keyword} 变量');
  assert.ok(modifySystem && modifySystem.length > 50);
  assert.ok(modifyUser && modifyUser.includes('{originalReport}'));

  // 代码块内部的 “## 一、当周新闻综述” 等小节标题不应被当作顶层小节吞掉
  assert.equal(extractSection(content, '一、当周新闻综述'), null);
  assert.equal(extractSection(content, '变量说明'), null);
  // 精确匹配标题行：'System Prompt' 不得命中 '## Modify System Prompt'
  assert.ok(!system.includes('Modify'));
});

test('promptStore: 统一正则能解析真实的 policy_prompts.md', () => {
  const content = fs.readFileSync(path.join(REPO_ROOT, 'config/policy_prompts.md'), 'utf-8');
  const extraction = extractSection(content, 'Policy Extraction Prompt');
  const comparison = extractSection(content, 'Policy Comparison Prompt');
  assert.ok(extraction && extraction.length > 100);
  assert.ok(comparison && comparison.length > 100);
  assert.ok(!extraction.includes('Policy Comparison'));
});

test('promptStore: upsertSection 替换与追加', () => {
  const doc = '# 标题\n\n## Policy Extraction Prompt\n\n```\n旧内容\n```\n\n## 其他\n\n文字\n';
  const replaced = upsertSection(doc, 'Policy Extraction Prompt', '新内容');
  assert.ok(replaced.includes('新内容'));
  assert.ok(!replaced.includes('旧内容'));
  assert.ok(replaced.includes('## 其他'));

  const appended = upsertSection('# 标题\n', 'New Section', '新增内容');
  assert.ok(appended.includes('## New Section'));
  assert.ok(appended.includes('新增内容'));
  assert.equal(extractSection(appended, 'New Section').trim(), '新增内容');
});

function makeStoreWithDefaults() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-store-test-'));
  fs.writeFileSync(path.join(dir, 'prompts.md'), '## System Prompt\n\n```\n默认system\n```\n\n## User Prompt\n\n```\n默认user {keyword}\n```\n', 'utf-8');
  fs.writeFileSync(path.join(dir, 'policy_prompts.md'), '## Policy Extraction Prompt\n\n```\n默认提取\n```\n\n## Policy Comparison Prompt\n\n```\n默认对比\n```\n', 'utf-8');
  fs.writeFileSync(
    path.join(dir, 'keyword-prompts.json'),
    JSON.stringify({
      keywords: {
        养老: {
          prompts: [
            { id: 'default', name: '默认配置', description: '默认', systemPrompt: '默认system', userPrompt: '默认user', isDefault: true, updatedAt: '2025-01-01T00:00:00.000Z' },
          ],
        },
      },
      metadata: { version: '1.0.0' },
    }),
    'utf-8'
  );
  fs.writeFileSync(
    path.join(dir, 'region-policy-report-prompts.json'),
    JSON.stringify({
      prompts: [
        { id: 'single-region-default', name: '单地区', description: 'd', systemPrompt: 's', userPromptSingle: 'u1', userPromptMulti: 'm1', isDefault: true, updatedAt: '2025-01-01T00:00:00.000Z' },
      ],
      metadata: { version: '1.0.0' },
    }),
    'utf-8'
  );
  return { dir, store: createPromptStore({ configDir: dir }) };
}

test('promptStore: 周报/政策 prompt 读取与保存（只写 runtime 层）', () => {
  const { dir, store } = makeStoreWithDefaults();

  let weekly = store.getWeeklyPrompts();
  assert.equal(weekly.systemPrompt, '默认system');
  assert.equal(weekly.source, 'default');

  store.savePolicyPrompt('extraction', '生产改过的提取prompt');
  const policy = store.getPolicyPrompts();
  assert.equal(policy.extractionPrompt, '生产改过的提取prompt');
  assert.equal(policy.comparisonPrompt, '默认对比');
  assert.equal(policy.source, 'runtime');
  // 默认层文件保持不变
  assert.ok(fs.readFileSync(path.join(dir, 'policy_prompts.md'), 'utf-8').includes('默认提取'));
  assert.ok(fs.existsSync(path.join(dir, 'runtime', 'policy_prompts.md')));

  // 保存回默认内容 → runtime 覆盖被清除
  store.savePolicyPrompt('extraction', '默认提取');
  assert.equal(store.getPolicyPrompts().source, 'default');
});

test('promptStore: 关键词 prompt 增删改（写 runtime、删默认条目产生墓碑）', () => {
  const { dir, store } = makeStoreWithDefaults();
  const defaultRaw = fs.readFileSync(path.join(dir, 'keyword-prompts.json'), 'utf-8');

  // 新增一条 → runtime 层
  const saved = store.saveKeywordPrompt({ keyword: '养老', name: '生产版本', description: 'd', systemPrompt: '生产system', userPrompt: '生产user', isDefault: true });
  assert.ok(saved.id);
  const listed = store.listKeywordPrompts('养老');
  assert.equal(listed.length, 2);
  const runtimeEntry = listed.find((p) => p.id === saved.id);
  assert.equal(runtimeEntry.source, 'runtime');
  assert.equal(runtimeEntry.isDefault, true);
  // 默认层文件字节不变
  assert.equal(fs.readFileSync(path.join(dir, 'keyword-prompts.json'), 'utf-8'), defaultRaw);

  // findKeywordPrompt 命中 runtime 条目
  const found = store.findKeywordPrompt('养老', saved.id);
  assert.equal(found.systemPrompt, '生产system');
  assert.equal(store.findKeywordPrompt('养老', '不存在的id'), null);
  assert.equal(store.findKeywordPrompt('不存在的关键词', saved.id), null);

  // 修改默认层条目 → runtime 覆盖该条目（id 保持）
  store.saveKeywordPrompt({ keyword: '养老', promptId: 'default', name: '默认配置', description: '默认', systemPrompt: '改过的system', userPrompt: '默认user', isDefault: false });
  const modified = store.findKeywordPrompt('养老', 'default');
  assert.equal(modified.systemPrompt, '改过的system');
  assert.equal(modified.source, 'runtime');

  // 删除默认层条目 → 墓碑，读取时消失
  store.deleteKeywordPrompt('养老', 'default');
  assert.equal(store.findKeywordPrompt('养老', 'default'), null);
  assert.equal(store.listKeywordPrompts('养老').length, 1);
  const runtimeRaw = JSON.parse(fs.readFileSync(path.join(dir, 'runtime', 'keyword-prompts.json'), 'utf-8'));
  assert.deepEqual(runtimeRaw.metadata.deletedIds, ['养老::default']);

  // 删除不存在的条目 → null
  assert.equal(store.deleteKeywordPrompt('养老', '不存在的id'), null);
  // 默认层文件仍保持不变
  assert.equal(fs.readFileSync(path.join(dir, 'keyword-prompts.json'), 'utf-8'), defaultRaw);
});

test('promptStore: 保存内容与默认层完全一致时清除 runtime 覆盖', () => {
  const { dir, store } = makeStoreWithDefaults();
  store.saveKeywordPrompt({ keyword: '养老', promptId: 'default', name: '默认配置', description: '默认', systemPrompt: '默认system', userPrompt: '默认user', isDefault: true });
  // 内容（忽略 updatedAt）与默认层一致 → 不应产生 runtime 文件
  assert.equal(fs.existsSync(path.join(dir, 'runtime', 'keyword-prompts.json')), false);
});

test('promptStore: 地区报告 prompt 保存与最后一个版本保护', () => {
  const { dir, store } = makeStoreWithDefaults();
  const defaultRaw = fs.readFileSync(path.join(dir, 'region-policy-report-prompts.json'), 'utf-8');

  const saved = store.saveRegionPrompt({ name: '生产版', description: 'd', systemPrompt: 's2', userPromptSingle: 'u2', userPromptMulti: 'm2', isDefault: false });
  assert.ok(saved.id);
  assert.equal(store.getRegionPromptSummaries().length, 2);
  assert.ok(fs.existsSync(path.join(dir, 'runtime', 'region-policy-report-prompts.json')));
  assert.equal(fs.readFileSync(path.join(dir, 'region-policy-report-prompts.json'), 'utf-8'), defaultRaw);

  // 只有 1 个时不允许删到 0：先删非默认条目失败的保护场景
  assert.equal(store.deleteRegionPrompt(saved.id).promptId, saved.id);
  assert.equal(store.getRegionPromptSummaries().length, 1);
  assert.throws(() => store.deleteRegionPrompt('single-region-default'), /至少保留一个/);
});

test('promptStore: 条目级恢复默认（只清该条目覆盖/墓碑，不影响其他定制）', () => {
  const { dir, store } = makeStoreWithDefaults();
  const defaultRaw = fs.readFileSync(path.join(dir, 'keyword-prompts.json'), 'utf-8');

  // 同时制造：一条运行时覆盖 + 一条墓碑（删除默认条目 default）
  store.saveKeywordPrompt({ keyword: '养老', name: '生产版本', description: 'd', systemPrompt: '生产system', userPrompt: '生产user', isDefault: false });
  store.deleteKeywordPrompt('养老', 'default');
  let listed = store.listKeywordPrompts('养老');
  assert.equal(listed.length, 1); // 仅剩生产版本
  assert.equal(listed[0].source, 'runtime');

  // 条目级恢复墓碑：default 条目回归默认层
  assert.deepEqual(store.resetKeywordPrompt('养老', 'default'), { keyword: '养老', promptId: 'default' });
  listed = store.listKeywordPrompts('养老');
  assert.equal(listed.length, 2);
  assert.equal(listed.find((p) => p.id === 'default').source, 'default');

  // 条目级恢复覆盖：生产版本条目的覆盖被清除（回到不存在的默认状态 → 消失）
  const prodId = listed.find((p) => p.source === 'runtime').id;
  assert.ok(store.resetKeywordPrompt('养老', prodId));
  listed = store.listKeywordPrompts('养老');
  assert.equal(listed.length, 1);
  assert.equal(listed[0].source, 'default');
  // 运行时层被清空 → 文件移除，默认层文件始终未动
  assert.equal(fs.existsSync(path.join(dir, 'runtime', 'keyword-prompts.json')), false);
  assert.equal(fs.readFileSync(path.join(dir, 'keyword-prompts.json'), 'utf-8'), defaultRaw);

  // 没有运行时层时条目级恢复返回 null
  assert.equal(store.resetKeywordPrompt('养老', 'default'), null);
});

test('promptStore: 地区报告条目级恢复默认', () => {
  const { dir, store } = makeStoreWithDefaults();
  const saved = store.saveRegionPrompt({ name: '生产版', description: 'd', systemPrompt: 's2', userPromptSingle: 'u2', userPromptMulti: 'm2', isDefault: false });
  assert.equal(store.getRegionPromptSummaries().find((p) => p.id === saved.id).source, 'runtime');

  assert.deepEqual(store.resetRegionPrompt(saved.id), { promptId: saved.id });
  const summaries = store.getRegionPromptSummaries();
  assert.equal(summaries.length, 1);
  assert.equal(summaries.every((p) => p.source === 'default'), true);
  assert.equal(fs.existsSync(path.join(dir, 'runtime', 'region-policy-report-prompts.json')), false);
});
