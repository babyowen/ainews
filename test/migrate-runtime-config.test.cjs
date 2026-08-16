'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { migrateRuntimeConfig } = require('../scripts/migrate-runtime-config.cjs');
const { createConfigStore } = require('../services/configStore.cjs');

function makeConfigDirs() {
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-cfg-'));
  const fromDir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-from-'));

  // 默认层（= 部署后的仓库版本）
  fs.writeFileSync(path.join(configDir, 'prompts.md'), '## System Prompt\n\n```\n默认\n```\n');
  fs.writeFileSync(
    path.join(configDir, 'keyword-prompts.json'),
    JSON.stringify({
      keywords: {
        养老: {
          prompts: [
            { id: 'default', name: '默认配置', description: '默认', systemPrompt: '默认system', userPrompt: '默认user', isDefault: true, updatedAt: '2025-01-01T00:00:00.000Z' },
            { id: 'v2', name: 'v2', description: '二版', systemPrompt: 's2', userPrompt: 'u2', isDefault: false, updatedAt: '2025-01-02T00:00:00.000Z' },
          ],
        },
      },
      metadata: { version: '1.0.0' },
    })
  );
  fs.writeFileSync(path.join(configDir, 'llm-config.json'), JSON.stringify({ activeModel: 'deepseek-r1', models: { a: { provider: 'x' } }, settings: { temperature: 0.7 } }));

  // 生产端旧快照（部署前 cp 的 config 目录）
  fs.writeFileSync(path.join(fromDir, 'prompts.md'), '## System Prompt\n\n```\n生产改过的\n```\n');
  fs.writeFileSync(
    path.join(fromDir, 'keyword-prompts.json'),
    JSON.stringify({
      keywords: {
        养老: {
          prompts: [
            // default 被生产端改过
            { id: 'default', name: '默认配置', description: '默认', systemPrompt: '生产system', userPrompt: '默认user', isDefault: true, updatedAt: '2026-01-01T00:00:00.000Z' },
            // v2 被生产端删除
            // prod-v9 为生产新增
            { id: 'prod-v9', name: 'v9', description: '生产新增', systemPrompt: 's9', userPrompt: 'u9', isDefault: false, updatedAt: '2026-01-01T00:00:00.000Z' },
          ],
        },
      },
      metadata: { version: '1.0.0' },
    })
  );
  fs.writeFileSync(path.join(fromDir, 'llm-config.json'), JSON.stringify({ activeModel: 'kimi-k2', models: { a: { provider: 'x' } }, settings: { temperature: 0.7 } }));
  // 快照里没有 policy_prompts.md / users.json 等 → 应跳过

  return { configDir, fromDir };
}

test('migrate-runtime-config: 只把差异写入运行时层（含墓碑），幂等可重复执行', () => {
  const { configDir, fromDir } = makeConfigDirs();
  const results = migrateRuntimeConfig({ configDir, fromDir });

  const byName = Object.fromEntries(results.map((r) => [r.name, r]));
  assert.equal(byName['prompts.md'].action, 'written');
  assert.equal(byName['keyword-prompts.json'].action, 'written');
  assert.equal(byName['llm-config.json'].action, 'written');
  assert.equal(byName['policy_prompts.md'].action, 'skipped'); // 快照中不存在

  // llm-config 差异只有 activeModel
  const llmRuntime = JSON.parse(fs.readFileSync(path.join(configDir, 'runtime', 'llm-config.json'), 'utf-8'));
  assert.deepEqual(llmRuntime, { activeModel: 'kimi-k2' });

  // 关键词库生效结果：default 来自生产、v2 消失（墓碑）、prod-v9 存在
  const store = createConfigStore({ configDir });
  const effective = store.readEffectiveJson('keyword-prompts.json');
  const ids = effective.keywords.养老.prompts.map((p) => p.id);
  assert.deepEqual(ids.sort(), ['default', 'prod-v9']);
  assert.equal(effective.keywords.养老.prompts.find((p) => p.id === 'default').systemPrompt, '生产system');

  const runtimeRaw = JSON.parse(fs.readFileSync(path.join(configDir, 'runtime', 'keyword-prompts.json'), 'utf-8'));
  assert.deepEqual(runtimeRaw.metadata.deletedIds, ['养老::v2']);

  // 安全保护：运行时层已存在时再次执行默认跳过（避免旧快照覆盖迁移后的人工修改）
  const again = migrateRuntimeConfig({ configDir, fromDir });
  const againByName = Object.fromEntries(again.map((r) => [r.name, r]));
  assert.equal(againByName['prompts.md'].action, 'skipped');
  assert.match(againByName['prompts.md'].reason, /运行时层已存在/);
  assert.equal(againByName['llm-config.json'].action, 'skipped');
  // policy_prompts.md 快照不存在，仍然跳过
  assert.equal(againByName['policy_prompts.md'].action, 'skipped');

  // --force 强制重写后内容与首次迁移一致
  const forced = migrateRuntimeConfig({ configDir, fromDir, force: true });
  assert.equal(forced.find((r) => r.name === 'prompts.md').action, 'written');
  assert.equal(store.readEffectiveText('prompts.md').includes('生产改过的'), true);

  // dry-run 不写盘
  const { configDir: cfg2, fromDir: from2 } = makeConfigDirs();
  migrateRuntimeConfig({ configDir: cfg2, fromDir: from2, dryRun: true });
  assert.equal(fs.existsSync(path.join(cfg2, 'runtime')), false);
});
