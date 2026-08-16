#!/usr/bin/env node
'use strict';

// 一次性迁移脚本（issue #22）：
// 把「生产端旧配置快照」与「仓库默认层」的差异写入 config/runtime/ 运行时层。
//
// 用法：
//   node scripts/migrate-runtime-config.cjs --from config-backup-YYYYMMDD [--dry-run] [--force]
//
// 典型迁移流程见 docs/deployment.md：
//   1. 生产服务器：cp -r config config-backup-<日期>
//   2. 部署新版本（config/ 默认层被仓库版本覆盖，安全：已有备份）
//   3. 执行本脚本，差异进入 config/runtime/
//   4. pm2 restart，到 /config「运行时配置」tab 核对
//
// 安全性：若某文件的运行时层已存在（迁移后又被人工修改过），默认跳过该文件，
// 避免旧快照覆盖新修改；确认无碍后可用 --force 强制重写。--dry-run 仅预览。

const fs = require('fs');
const path = require('path');
const { createConfigStore, MANAGED_FILES } = require('../services/configStore.cjs');

function parseArgs(argv) {
  const args = { from: '', dryRun: false, force: false };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--from') {
      args.from = argv[i + 1] || '';
      i += 1;
    } else if (argv[i] === '--dry-run') {
      args.dryRun = true;
    } else if (argv[i] === '--force') {
      args.force = true;
    }
  }
  return args;
}

function migrateRuntimeConfig({ configDir, fromDir, dryRun = false, force = false }) {
  const store = createConfigStore({ configDir });
  const results = [];

  for (const name of Object.keys(MANAGED_FILES)) {
    const spec = MANAGED_FILES[name];
    const snapshotPath = path.join(fromDir, name);
    if (!fs.existsSync(snapshotPath)) {
      results.push({ name, action: 'skipped', reason: '快照中不存在' });
      continue;
    }

    if (!force && store.isOverridden(name)) {
      results.push({ name, action: 'skipped', reason: '运行时层已存在，为避免覆盖后续人工修改而跳过（可用 --force 强制重写）' });
      continue;
    }

    const raw = fs.readFileSync(snapshotPath, 'utf-8');
    let diff;
    try {
      diff = store.diffAgainstDefault(name, raw);
    } catch (err) {
      results.push({ name, action: 'error', reason: err.message });
      continue;
    }

    if (diff === null) {
      results.push({ name, action: 'skipped', reason: '与默认层一致' });
      continue;
    }

    if (!dryRun) {
      // 复用 importBundle 的公开入口写入运行时层（含文件名白名单校验）
      store.importBundle({ formatVersion: 1, files: { [name]: { type: spec.type, content: diff } } });
    }
    results.push({ name, action: dryRun ? 'would-write' : 'written', reason: '差异已写入运行时层' });
  }

  return results;
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.from) {
    console.error('用法: node scripts/migrate-runtime-config.cjs --from <生产配置快照目录> [--dry-run] [--force]');
    process.exit(1);
  }
  const fromDir = path.resolve(args.from);
  if (!fs.existsSync(fromDir)) {
    console.error(`快照目录不存在: ${fromDir}`);
    process.exit(1);
  }

  const configDir = path.join(__dirname, '..', 'config');
  const results = migrateRuntimeConfig({ configDir, fromDir, dryRun: args.dryRun, force: args.force });

  console.log(args.dryRun ? '== DRY RUN：仅预览，不写入 ==' : '== 迁移执行 ==');
  for (const r of results) {
    const tag = { written: '✅ 已写入运行时层', 'would-write': '💡 将写入运行时层', skipped: '⏭️  跳过', error: '❌ 错误' }[r.action];
    console.log(`${tag} ${r.name} — ${r.reason}`);
  }
  const written = results.filter((r) => r.action === 'written' || r.action === 'would-write').length;
  console.log(`\n共 ${results.length} 个受管文件，${written} 个存在差异${args.dryRun ? '' : '已写入 config/runtime/'}。`);
  console.log('迁移完成后请重启服务（pm2 restart keydigest）。');
}

if (require.main === module) {
  main();
}

module.exports = { migrateRuntimeConfig, parseArgs };
