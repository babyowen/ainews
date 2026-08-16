#!/usr/bin/env node
'use strict';

// 一次性迁移脚本（issue #22）：
// 把「生产端真实修改」从旧配置快照中提取出来，写入 config/runtime/ 运行时层。
//
// 用法：
//   node scripts/migrate-runtime-config.cjs --from <生产配置快照目录> [--baseline <旧默认层目录>] [--dry-run] [--force]
//
// 三方比较（推荐，需要 baseline）：
//   baseline = 生产「当前部署版本」的出厂默认层（新部署包自带的 config-baseline/ 目录）
//   from     = 部署前 cp 下来的生产配置快照（旧默认 + 生产修改的混合体）
//   新默认层 = 部署后仓库里的 config/
//   只迁移「快照相对 baseline 的真实修改」：
//     - 生产改过/新增的条目 → 写入运行时层
//     - 生产删除且新版仍内置的条目 → 墓碑
//     - 生产未动、新版改良过的条目 → 自动采用新默认（不被旧版本固定）
//     - 新版新增的条目（如「烟草服务银行」）→ 正常出现，绝不误判为生产删除
//
// 无 baseline 时自动降级为「两方比较（不写墓碑）」并给出警告：
//   不会误杀新版新增条目，但生产未修改过的条目会被旧版本固定，
//   可之后在 /config「运行时配置」里按条目「恢复默认」。
//
// 退出码：任何文件解析/处理错误 → 1（部署流程应据此阻断）；正常（含跳过）→ 0。

const fs = require('fs');
const path = require('path');
const { createConfigStore, MANAGED_FILES } = require('../services/configStore.cjs');

const VOLATILE_ENTRY_FIELDS = ['updatedAt', 'createdAt', 'source'];

function stableEntryJson(entry) {
  const keys = Object.keys(entry)
    .filter((k) => !VOLATILE_ENTRY_FIELDS.includes(k))
    .sort();
  const clone = {};
  for (const k of keys) clone[k] = entry[k];
  return JSON.stringify(clone);
}

const stripVolatile = (entry) => {
  const clone = { ...entry };
  delete clone.source;
  return clone;
};

function parseArgs(argv) {
  const args = { from: '', baseline: '', dryRun: false, force: false };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--from') {
      args.from = argv[i + 1] || '';
      i += 1;
    } else if (argv[i] === '--baseline') {
      args.baseline = argv[i + 1] || '';
      i += 1;
    } else if (argv[i] === '--dry-run') {
      args.dryRun = true;
    } else if (argv[i] === '--force') {
      args.force = true;
    }
  }
  return args;
}

// ---------- 三方比较：按 id 合并的 prompt 库 ----------

function threeWayIdList({ snapshot, baseline, spec }) {
  const isKeywordType = spec.merge === 'keyword-prompts';
  const collect = (obj) => {
    if (isKeywordType) {
      const map = {};
      for (const [kw, cfg] of Object.entries((obj && obj.keywords) || {})) {
        map[kw] = (cfg && cfg.prompts) || [];
      }
      return map;
    }
    return { __all__: (obj && obj.prompts) || [] };
  };
  const baseMap = collect(baseline);
  const snapMap = collect(snapshot);
  const outGroups = {};
  const deletedIds = [];
  const groupKeys = new Set([...Object.keys(baseMap), ...Object.keys(snapMap)]);

  for (const group of groupKeys) {
    const basePrompts = baseMap[group] || [];
    const snapPrompts = snapMap[group] || [];
    const baseById = new Map(basePrompts.map((p) => [p.id, p]));
    const snapById = new Map(snapPrompts.map((p) => [p.id, p]));
    const changed = [];
    for (const snapEntry of snapPrompts) {
      const baseEntry = baseById.get(snapEntry.id);
      const prodModified = !baseEntry || stableEntryJson(baseEntry) !== stableEntryJson(snapEntry);
      if (prodModified) changed.push(stripVolatile(snapEntry));
    }
    for (const baseEntry of basePrompts) {
      if (!snapById.has(baseEntry.id)) {
        // 生产删除的条目 → 仅当新版默认层仍内置时才记墓碑
        deletedIds.push(isKeywordType ? `${group}::${baseEntry.id}` : baseEntry.id);
      }
    }
    if (changed.length) outGroups[group] = isKeywordType ? { prompts: changed } : changed;
  }

  if (!Object.keys(outGroups).length && !deletedIds.length) return null;
  const metadata = { ...((snapshot && snapshot.metadata) || {}) };
  if (deletedIds.length) metadata.deletedIds = deletedIds;
  else delete metadata.deletedIds;
  return isKeywordType
    ? { keywords: outGroups, metadata }
    : { prompts: Object.values(outGroups).flat(), metadata };
}

// 墓碑需要对照「新版默认层」过滤：生产删除、但新版也已移除的条目无需墓碑
function filterTombstonesAgainstNewDefaults(runtime, newDefault, spec) {
  if (!runtime || !newDefault) return runtime;
  const dels = (runtime.metadata && runtime.metadata.deletedIds) || [];
  if (!dels.length) return runtime;
  const keep = [];
  for (const tombstone of dels) {
    let stillShipped;
    if (spec.merge === 'keyword-prompts') {
      const [kw, id] = tombstone.split('::');
      const prompts = ((newDefault.keywords || {})[kw] || {}).prompts || [];
      stillShipped = prompts.some((p) => p.id === id);
    } else {
      stillShipped = (newDefault.prompts || []).some((p) => p.id === tombstone);
    }
    if (stillShipped) keep.push(tombstone);
  }
  const metadata = { ...runtime.metadata };
  if (keep.length) metadata.deletedIds = keep;
  else delete metadata.deletedIds;
  const next = { ...runtime, metadata };
  const hasContent =
    (spec.merge === 'keyword-prompts' && Object.keys(next.keywords || {}).length) ||
    (spec.merge === 'id-list' && (next.prompts || []).length) ||
    keep.length;
  return hasContent ? next : null;
}

// ---------- 三方比较：浅合并配置（llm-config / auto-report-config）----------

function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function threeWayShallow({ snapshot, baseline, newDefault, deepKeys }) {
  const out = {};
  for (const key of new Set([...Object.keys(baseline || {}), ...Object.keys(snapshot || {})])) {
    const inBase = baseline && key in baseline;
    const inSnap = snapshot && key in snapshot;
    if (inBase && inSnap) {
      if (deepKeys.includes(key)) {
        const baseSub = baseline[key] || {};
        const snapSub = snapshot[key] || {};
        const newSub = (newDefault && newDefault[key]) || {};
        const subOut = {};
        for (const subKey of new Set([...Object.keys(baseSub), ...Object.keys(snapSub)])) {
          if (!(subKey in snapSub)) {
            // 生产删除的子项：仅当新版默认层仍内置时记墓碑
            if (subKey in newSub) subOut[subKey] = null;
            continue;
          }
          if (!(subKey in baseSub) || !sameJson(snapSub[subKey], baseSub[subKey])) {
            subOut[subKey] = snapSub[subKey];
          }
        }
        if (Object.keys(subOut).length) out[key] = subOut;
      } else if (!sameJson(snapshot[key], baseline[key])) {
        out[key] = snapshot[key];
      }
    } else if (!inBase && inSnap) {
      // 生产新增的顶层键（或 baseline 缺失该键）→ 原样保留
      out[key] = snapshot[key];
    }
  }
  return Object.keys(out).length ? out : null;
}

// ---------- 主流程 ----------

function migrateRuntimeConfig({ configDir, fromDir, baselineDir, dryRun = false, force = false }) {
  const store = createConfigStore({ configDir });
  const results = [];

  const baselinePathOf = (name) => (baselineDir ? path.join(baselineDir, name) : null);
  const readOptionalFile = (filePath) => {
    if (!filePath || !fs.existsSync(filePath)) return undefined;
    return fs.readFileSync(filePath, 'utf-8');
  };

  const hasBaseline = baselineDir && fs.existsSync(baselineDir);
  if (!hasBaseline) {
    results.push({
      name: '(模式)',
      action: 'warning',
      reason: '未提供 --baseline（旧默认层目录），降级为两方比较且不写墓碑：新版新增条目不会误删，但未修改条目会被旧版本固定',
    });
  }

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

    const snapshotRaw = fs.readFileSync(snapshotPath, 'utf-8');
    const baselineRaw = readOptionalFile(baselinePathOf(name));

    try {
      let runtimeContent; // 运行时层应写入的内容；null = 无需覆盖
      if (spec.type === 'text') {
        // 三方：快照与旧默认一致 → 跟随新默认；不同 → 生产改过，固定快照
        if (baselineRaw !== undefined) {
          runtimeContent = snapshotRaw === baselineRaw ? null : snapshotRaw;
        } else {
          const newDefaultRaw = fs.readFileSync(path.join(configDir, name), 'utf-8');
          runtimeContent = snapshotRaw === newDefaultRaw ? null : snapshotRaw;
        }
      } else {
        const snapshotObj = JSON.parse(snapshotRaw);
        const baselineObj = baselineRaw === undefined ? null : JSON.parse(baselineRaw);
        if (spec.merge === 'keyword-prompts' || spec.merge === 'id-list') {
          if (baselineObj) {
            const newDefaultObj = store.readDefaultJson(name) || {};
            runtimeContent = filterTombstonesAgainstNewDefaults(
              threeWayIdList({ snapshot: snapshotObj, baseline: baselineObj, spec }),
              newDefaultObj,
              spec
            );
          } else {
            // 无 baseline 降级：两方差异，但去掉墓碑（避免误杀新版新增条目）
            const twoWay = store.diffAgainstDefault(name, snapshotObj);
            if (twoWay && twoWay.metadata) {
              delete twoWay.metadata.deletedIds;
              const empty =
                (spec.merge === 'keyword-prompts' && !Object.keys(twoWay.keywords || {}).length) ||
                (spec.merge === 'id-list' && !(twoWay.prompts || []).length);
              runtimeContent = empty ? null : twoWay;
            } else {
              runtimeContent = twoWay;
            }
          }
        } else if (spec.merge === 'shallow') {
          if (baselineObj) {
            runtimeContent = threeWayShallow({
              snapshot: snapshotObj,
              baseline: baselineObj,
              newDefault: store.readDefaultJson(name) || {},
              deepKeys: spec.deepKeys || [],
            });
          } else {
            const twoWay = store.diffAgainstDefault(name, snapshotObj) || {};
            for (const key of Object.keys(twoWay)) {
              if (twoWay[key] && typeof twoWay[key] === 'object' && !Array.isArray(twoWay[key])) {
                for (const subKey of Object.keys(twoWay[key])) {
                  if (twoWay[key][subKey] === null) delete twoWay[key][subKey];
                }
                if (!Object.keys(twoWay[key]).length) delete twoWay[key];
              }
            }
            runtimeContent = Object.keys(twoWay).length ? twoWay : null;
          }
        } else {
          // replace（users.json）
          if (baselineObj) runtimeContent = sameJson(snapshotObj, baselineObj) ? null : snapshotObj;
          else runtimeContent = store.diffAgainstDefault(name, snapshotObj);
        }
      }

      if (runtimeContent === null || runtimeContent === undefined) {
        results.push({ name, action: 'skipped', reason: baselineRaw !== undefined || spec.type === 'text' ? '相对旧默认层无生产修改' : '与默认层一致' });
        continue;
      }

      if (!dryRun) {
        store.importBundle({ formatVersion: 1, files: { [name]: { type: spec.type, content: runtimeContent } } });
      }
      results.push({ name, action: dryRun ? 'would-write' : 'written', reason: '生产修改已写入运行时层' });
    } catch (err) {
      results.push({ name, action: 'error', reason: err.message });
    }
  }

  return results;
}

function hasErrors(results) {
  return results.some((r) => r.action === 'error');
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.from) {
    console.error('用法: node scripts/migrate-runtime-config.cjs --from <生产配置快照目录> [--baseline <旧默认层目录>] [--dry-run] [--force]');
    process.exit(1);
  }
  const fromDir = path.resolve(args.from);
  if (!fs.existsSync(fromDir)) {
    console.error(`快照目录不存在: ${fromDir}`);
    process.exit(1);
  }

  const configDir = path.join(__dirname, '..', 'config');
  // baseline 默认取上次部署包自带的 config-baseline/（与项目根同级解压后的位置）
  const defaultBaseline = path.join(__dirname, '..', 'config-baseline');
  const baselineDir = args.baseline ? path.resolve(args.baseline) : fs.existsSync(defaultBaseline) ? defaultBaseline : null;

  const results = migrateRuntimeConfig({ configDir, fromDir, baselineDir, dryRun: args.dryRun, force: args.force });

  console.log(args.dryRun ? '== DRY RUN：仅预览，不写入 ==' : '== 迁移执行 ==');
  for (const r of results) {
    const tag = {
      written: '✅ 已写入运行时层',
      'would-write': '💡 将写入运行时层',
      skipped: '⏭️  跳过',
      warning: '⚠️  警告',
      error: '❌ 错误',
    }[r.action];
    console.log(`${tag} ${r.name} — ${r.reason}`);
  }

  if (hasErrors(results)) {
    console.error('\n❌ 存在处理错误，迁移不完整——请勿重启服务上线！修复错误后重新执行。');
    process.exit(1);
  }

  const written = results.filter((r) => r.action === 'written' || r.action === 'would-write').length;
  console.log(`\n共 ${results.length} 个受管文件，${written} 个存在生产修改${args.dryRun ? '' : '已写入 config/runtime/'}。`);
  console.log('迁移完成后请重启服务（pm2 restart keydigest）。');
}

if (require.main === module) {
  main();
}

module.exports = { migrateRuntimeConfig, hasErrors, threeWayIdList, threeWayShallow, parseArgs };
