'use strict';

// config 双层存储引擎（issue #22）：
//   默认层  config/<name>          —— git 追踪，随代码部署，出厂默认值
//   运行时层 config/runtime/<name>  —— 生产端自定义（.gitignore，部署包不含，永不覆盖）
//
// 读取 = 默认层 + 运行时层按语义合并；写入 = 先在生效内容上修改，再通过 commit* 把
// 「与默认层的差异」写入运行时层（无差异则移除运行时覆盖）。因此运行时层永远是纯差异，
// 开发端后续改良的出厂默认对未被自定义的部分自动生效。

const fs = require('fs');
const path = require('path');

const MANAGED_FILES = {
  'prompts.md': { type: 'text', label: '周报默认 Prompt' },
  'policy_prompts.md': { type: 'text', label: '政策提取/对比 Prompt' },
  'keyword-prompts.json': { type: 'json', merge: 'keyword-prompts', label: '关键词 Prompt 库' },
  'region-policy-report-prompts.json': { type: 'json', merge: 'id-list', label: '地区政策报告 Prompt' },
  'auto-report-config.json': { type: 'json', merge: 'shallow', deepKeys: ['keywords'], label: '自动周报配置' },
  'llm-config.json': { type: 'json', merge: 'shallow', deepKeys: ['models'], label: 'LLM 模型配置' },
  'users.json': { type: 'json', merge: 'replace', label: '用户账号' },
};

const BUNDLE_FORMAT_VERSION = 1;
// 条目中随时间变化、不参与「是否被自定义」比较的字段
const VOLATILE_ENTRY_FIELDS = ['updatedAt', 'createdAt', 'source'];

function stableEntryJson(entry) {
  const keys = Object.keys(entry)
    .filter((k) => !VOLATILE_ENTRY_FIELDS.includes(k))
    .sort();
  const clone = {};
  for (const k of keys) clone[k] = entry[k];
  return JSON.stringify(clone);
}

function stripSource(entry) {
  const { source, ...rest } = entry;
  return rest;
}

function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// 每关键词 isDefault 唯一：运行时层的默认标记优先，压掉默认层的旧默认
function normalizeDefaultFlags(prompts) {
  const runtimeDefault = prompts.some((p) => p.source === 'runtime' && p.isDefault);
  if (!runtimeDefault) return prompts;
  return prompts.map((p) => (p.source === 'default' && p.isDefault ? { ...p, isDefault: false } : p));
}

function mergeMetadata(base, override, deletedIds) {
  const baseMeta = (base && base.metadata) || {};
  const overrideMeta = (override && override.metadata) || {};
  const merged = { ...baseMeta, ...overrideMeta };
  if (deletedIds && deletedIds.length) merged.deletedIds = deletedIds;
  else delete merged.deletedIds;
  return merged;
}

function tombstonesOf(override) {
  return new Set(((override && override.metadata) || {}).deletedIds || []);
}

// ---- keyword-prompts.json：{ keywords: { <kw>: { prompts: [...] } }, metadata } ----
// prompt id 仅在关键词内唯一，墓碑键为 "<keyword>::<promptId>"。

function mergeKeywordPrompts(base, override) {
  const baseKws = (base && base.keywords) || {};
  const overrideKws = (override && override.keywords) || {};
  const deleted = tombstonesOf(override);
  const keywords = {};
  for (const kw of new Set([...Object.keys(baseKws), ...Object.keys(overrideKws)])) {
    const basePrompts = ((baseKws[kw] || {}).prompts) || [];
    const overridePrompts = ((overrideKws[kw] || {}).prompts) || [];
    const overrideById = new Map(overridePrompts.map((p) => [p.id, p]));
    const prompts = [];
    for (const p of basePrompts) {
      if (deleted.has(`${kw}::${p.id}`)) continue;
      const o = overrideById.get(p.id);
      prompts.push(o ? { ...o, source: 'runtime' } : { ...p, source: 'default' });
    }
    for (const p of overridePrompts) {
      if (!basePrompts.some((b) => b.id === p.id)) prompts.push({ ...p, source: 'runtime' });
    }
    const normalized = normalizeDefaultFlags(prompts);
    if (normalized.length) keywords[kw] = { prompts: normalized };
  }
  return { keywords, metadata: mergeMetadata(base, override) };
}

function diffKeywordPrompts(effective, base) {
  const effKws = (effective && effective.keywords) || {};
  const baseKws = (base && base.keywords) || {};
  const keywords = {};
  const deletedIds = [];
  for (const kw of new Set([...Object.keys(effKws), ...Object.keys(baseKws)])) {
    const effPrompts = ((effKws[kw] || {}).prompts) || [];
    const basePrompts = ((baseKws[kw] || {}).prompts) || [];
    const baseStableById = new Map(basePrompts.map((p) => [p.id, stableEntryJson(p)]));
    const effIds = new Set(effPrompts.map((p) => p.id));
    const changed = effPrompts
      .filter((p) => {
        const stable = baseStableById.get(p.id);
        return stable === undefined || stable !== stableEntryJson(p);
      })
      .map(stripSource);
    for (const b of basePrompts) {
      if (!effIds.has(b.id)) deletedIds.push(`${kw}::${b.id}`);
    }
    if (changed.length) keywords[kw] = { prompts: changed };
  }
  if (!Object.keys(keywords).length && !deletedIds.length) return null;
  return { keywords, metadata: mergeMetadata(null, effective, deletedIds) };
}

// ---- region-policy-report-prompts.json：{ prompts: [...], metadata }，id 全局唯一 ----

function mergeIdList(base, override) {
  const basePrompts = (base && base.prompts) || [];
  const overridePrompts = (override && override.prompts) || [];
  const deleted = tombstonesOf(override);
  const overrideById = new Map(overridePrompts.map((p) => [p.id, p]));
  const prompts = [];
  for (const p of basePrompts) {
    if (deleted.has(p.id)) continue;
    const o = overrideById.get(p.id);
    prompts.push(o ? { ...o, source: 'runtime' } : { ...p, source: 'default' });
  }
  for (const p of overridePrompts) {
    if (!basePrompts.some((b) => b.id === p.id)) prompts.push({ ...p, source: 'runtime' });
  }
  return { prompts: normalizeDefaultFlags(prompts), metadata: mergeMetadata(base, override) };
}

function diffIdList(effective, base) {
  const effPrompts = (effective && effective.prompts) || [];
  const basePrompts = (base && base.prompts) || [];
  const baseStableById = new Map(basePrompts.map((p) => [p.id, stableEntryJson(p)]));
  const effIds = new Set(effPrompts.map((p) => p.id));
  const changed = effPrompts
    .filter((p) => {
      const stable = baseStableById.get(p.id);
      return stable === undefined || stable !== stableEntryJson(p);
    })
    .map(stripSource);
  const deletedIds = basePrompts.filter((b) => !effIds.has(b.id)).map((b) => b.id);
  if (!changed.length && !deletedIds.length) return null;
  return { prompts: changed, metadata: mergeMetadata(null, effective, deletedIds) };
}

// ---- 浅合并（llm-config.json / auto-report-config.json）----
// 深层子对象（deepKeys）按键合并，子项值为 null 表示「删除该子项」。
// 只对默认层已有的顶层键做差异比较，历史遗留的多余键（如曾被 switchModel
// 误写入 llm-config.json 的 prompts 对象）不会进入运行时层。

function mergeShallow(base, override, deepKeys) {
  const merged = { ...base };
  const overrideObj = override || {};
  for (const key of Object.keys(overrideObj)) {
    const value = overrideObj[key];
    if (deepKeys.includes(key) && value && typeof value === 'object' && !Array.isArray(value)) {
      const sub = { ...(base[key] || {}) };
      for (const subKey of Object.keys(value)) {
        if (value[subKey] === null) delete sub[subKey];
        else sub[subKey] = value[subKey];
      }
      merged[key] = sub;
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

function diffShallow(effective, base, deepKeys) {
  const baseObj = base || {};
  const effObj = effective || {};
  const out = {};
  for (const key of Object.keys(baseObj)) {
    if (!(key in effObj)) continue;
    if (deepKeys.includes(key)) {
      const baseSub = baseObj[key] || {};
      const effSub = effObj[key] || {};
      const subDiff = {};
      for (const subKey of Object.keys(effSub)) {
        if (!sameJson(effSub[subKey], baseSub[subKey])) subDiff[subKey] = effSub[subKey];
      }
      for (const subKey of Object.keys(baseSub)) {
        if (!(subKey in effSub)) subDiff[subKey] = null; // 墓碑：显式删除子项
      }
      if (Object.keys(subDiff).length) out[key] = subDiff;
    } else if (!sameJson(effObj[key], baseObj[key])) {
      out[key] = effObj[key];
    }
  }
  return Object.keys(out).length ? out : null;
}

// ---- users.json：整文件覆盖 ----

function createConfigStore(options = {}) {
  const configDir = options.configDir || path.join(__dirname, '..', 'config');
  const runtimeDir = path.join(configDir, 'runtime');

  function specOf(name) {
    const spec = MANAGED_FILES[name];
    if (!spec) throw new Error(`未纳入管理的配置文件: ${name}`);
    return spec;
  }

  const defaultPathOf = (name) => path.join(configDir, name);
  const runtimePathOf = (name) => path.join(runtimeDir, name);

  function readTextFile(filePath) {
    try {
      return fs.readFileSync(filePath, 'utf-8');
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }

  function readJsonFile(filePath) {
    const text = readTextFile(filePath);
    if (text === null) return null;
    try {
      return JSON.parse(text);
    } catch (err) {
      throw new Error(`${filePath} 不是合法 JSON: ${err.message}`);
    }
  }

  function readDefaultJson(name) {
    specOf(name);
    return readJsonFile(defaultPathOf(name));
  }

  function readRuntimeJson(name) {
    specOf(name);
    return readJsonFile(runtimePathOf(name));
  }

  function readEffectiveText(name) {
    const spec = specOf(name);
    if (spec.type !== 'text') throw new Error(`${name} 不是文本配置`);
    return readTextFile(runtimePathOf(name)) ?? readTextFile(defaultPathOf(name));
  }

  function readEffectiveJson(name) {
    const spec = specOf(name);
    if (spec.type !== 'json') throw new Error(`${name} 不是 JSON 配置`);
    const base = readDefaultJson(name);
    const override = readRuntimeJson(name);
    if (spec.merge === 'keyword-prompts') {
      if (!base && !override) return null;
      return mergeKeywordPrompts(base || { keywords: {}, metadata: {} }, override);
    }
    if (spec.merge === 'id-list') {
      if (!base && !override) return null;
      return mergeIdList(base || { prompts: [], metadata: {} }, override);
    }
    if (spec.merge === 'shallow') {
      if (!base && !override) return null;
      return mergeShallow(base || {}, override, spec.deepKeys || []);
    }
    return override ?? base ?? null; // replace
  }

  function ensureRuntimeDir() {
    fs.mkdirSync(runtimeDir, { recursive: true });
  }

  function writeRuntimeRaw(name, content) {
    const spec = specOf(name);
    ensureRuntimeDir();
    const targetPath = runtimePathOf(name);
    const tempPath = path.join(runtimeDir, `.${name}.${process.pid}.${Date.now()}.tmp`);
    try {
      fs.writeFileSync(tempPath, content, { encoding: 'utf-8', mode: spec.type === 'json' ? 0o600 : 0o640 });
      fs.renameSync(tempPath, targetPath);
    } finally {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    }
  }

  function clearRuntime(name) {
    specOf(name);
    const filePath = runtimePathOf(name);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  function isOverridden(name) {
    specOf(name);
    return fs.existsSync(runtimePathOf(name));
  }

  // 把生效内容与默认层的差异写入运行时层；与默认层一致时移除覆盖
  function diffAgainstDefault(name, effectiveContent) {
    const spec = specOf(name);
    if (spec.type === 'text') {
      const defaultText = readTextFile(defaultPathOf(name)) ?? '';
      return sameJson(effectiveContent, defaultText) ? null : effectiveContent;
    }
    let effectiveObj = effectiveContent;
    if (typeof effectiveObj === 'string') {
      try {
        effectiveObj = JSON.parse(effectiveObj);
      } catch (err) {
        throw new Error(`${name} 内容不是合法 JSON: ${err.message}`);
      }
    }
    const base = readDefaultJson(name);
    if (spec.merge === 'keyword-prompts') return diffKeywordPrompts(effectiveObj, base);
    if (spec.merge === 'id-list') return diffIdList(effectiveObj, base);
    if (spec.merge === 'shallow') return diffShallow(effectiveObj, base, spec.deepKeys || []);
    return sameJson(effectiveObj, base) ? null : effectiveObj; // replace
  }

  function commitText(name, text) {
    const spec = specOf(name);
    if (spec.type !== 'text') throw new Error(`${name} 不是文本配置`);
    const diff = diffAgainstDefault(name, text);
    if (diff === null) clearRuntime(name);
    else writeRuntimeRaw(name, diff);
  }

  function commitJson(name, effectiveData) {
    const spec = specOf(name);
    if (spec.type !== 'json') throw new Error(`${name} 不是 JSON 配置`);
    const diff = diffAgainstDefault(name, effectiveData);
    if (diff === null) clearRuntime(name);
    else writeRuntimeRaw(name, `${JSON.stringify(diff, null, 2)}\n`);
  }

  function runtimeStatus() {
    return Object.keys(MANAGED_FILES).map((name) => {
      const spec = MANAGED_FILES[name];
      const overridden = isOverridden(name);
      const entry = { name, label: spec.label, type: spec.type, overridden };
      if (overridden) {
        const stat = fs.statSync(runtimePathOf(name));
        entry.runtimeLastModified = stat.mtime.toISOString();
      }
      if (spec.merge === 'keyword-prompts' || spec.merge === 'id-list') {
        const effective = spec.merge === 'keyword-prompts' ? readEffectiveJson(name) : readEffectiveJson(name);
        if (effective) {
          if (spec.merge === 'keyword-prompts') {
            const prompts = Object.values(effective.keywords || {}).flatMap((k) => k.prompts || []);
            entry.keywordCount = Object.keys(effective.keywords || {}).length;
            entry.promptCount = prompts.length;
            entry.runtimeOverrideCount = prompts.filter((p) => p.source === 'runtime').length;
            entry.deletedCount = (((readRuntimeJson(name) || {}).metadata) || {}).deletedIds?.length || 0;
          } else {
            entry.promptCount = (effective.prompts || []).length;
            entry.runtimeOverrideCount = (effective.prompts || []).filter((p) => p.source === 'runtime').length;
            entry.deletedCount = (((readRuntimeJson(name) || {}).metadata) || {}).deletedIds?.length || 0;
          }
        }
      }
      return entry;
    });
  }

  function exportBundle() {
    const files = {};
    for (const name of Object.keys(MANAGED_FILES)) {
      if (!isOverridden(name)) continue;
      const spec = MANAGED_FILES[name];
      const raw = readTextFile(runtimePathOf(name));
      if (raw === null) continue;
      files[name] = { type: spec.type, content: spec.type === 'json' ? JSON.parse(raw) : raw };
    }
    return { formatVersion: BUNDLE_FORMAT_VERSION, exportedAt: new Date().toISOString(), files };
  }

  function importBundle(bundle, opts = {}) {
    if (!bundle || bundle.formatVersion !== BUNDLE_FORMAT_VERSION) {
      throw new Error('prompt 包格式不正确（formatVersion 不匹配）');
    }
    if (!bundle.files || typeof bundle.files !== 'object') {
      throw new Error('prompt 包缺少 files 字段');
    }
    const imported = [];
    for (const [name, file] of Object.entries(bundle.files)) {
      const spec = specOf(name); // 未知文件名直接抛错，拒绝导入
      if (file === null || file === undefined) continue;
      if (file.type && file.type !== spec.type) {
        throw new Error(`${name} 的类型不匹配：期望 ${spec.type}，实际 ${file.type}`);
      }
      const content = spec.type === 'json' ? `${JSON.stringify(file.content, null, 2)}\n` : String(file.content);
      if (opts.skipUnchanged && sameJson(content, readTextFile(runtimePathOf(name)))) continue;
      writeRuntimeRaw(name, content);
      imported.push(name);
    }
    return imported;
  }

  return {
    configDir,
    runtimeDir,
    defaultPathOf,
    runtimePathOf,
    readDefaultJson,
    readRuntimeJson,
    readEffectiveText,
    readEffectiveJson,
    commitText,
    commitJson,
    diffAgainstDefault,
    clearRuntime,
    isOverridden,
    runtimeStatus,
    exportBundle,
    importBundle,
  };
}

module.exports = { createConfigStore, MANAGED_FILES };
