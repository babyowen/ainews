'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const AUDITED_FILES = [
  'prompts.md', 'policy_prompts.md', 'keyword-prompts.json',
  'region-policy-report-prompts.json', 'auto-report-config.json',
  'weekly-report-models.json',
];
// Semantic SHA-256 of the audited 22bece11/cfc1705d model defaults, plus the
// b65c2600 metadata-only Reasoner addition. Never accept arbitrary old endpoints.
const LEGACY_MODEL_HASHES = {
  'llm-config.json': new Set(['2bac20c39669ee8476232b0bf31ade2989b3a53ba4b772b31029756feb6e1a6a']),
  'weekly-report-models.json': new Set([
    'c7ec8f9abf4ad59556bba3dcabddfb4c7ccc8ac44e622c30da137abd0428277c',
    'c0a1cba8706ca328ef7526926f42bd545c6ce11f7a4e26709136359cef7d1c50',
  ]),
};
const LEGACY_KEYS = new Set(['', 'deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-reasoner', 'deepseek-r1', 'kimi-k2', 'openai-gpt4', 'claude-3-opus']);

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}
function semanticHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}
function readConfig(directory, name) {
  const file = path.join(directory, name);
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${name} 必须是普通文件`);
  const raw = fs.readFileSync(file, 'utf8');
  return name.endsWith('.json') ? JSON.parse(raw) : raw.trimEnd();
}

function auditProductionConfig({ sourceConfig, baselineConfig = path.join(__dirname, '../config') }) {
  const runtime = path.join(sourceConfig, 'runtime');
  if (fs.existsSync(runtime)) {
    const stat = fs.lstatSync(runtime);
    if (stat.isSymbolicLink() || !stat.isDirectory() || fs.readdirSync(runtime).length) {
      throw new Error('源配置包含 runtime 覆盖；本脚本仅用于旧单层配置首次迁移，请保留并复用现有共享运行时目录');
    }
  }
  const files = [];
  const differences = [];
  const transforms = [];
  let sourceKeywords;
  let targetModelKey;
  try {
    sourceKeywords = readConfig(sourceConfig, 'keyword-prompts.json');
    targetModelKey = readConfig(baselineConfig, 'weekly-report-models.json').defaultModelKey;
    if (!targetModelKey) throw new Error('模型默认 key 为空');
  } catch {
    throw new Error('迁移配置审计失败：keyword-prompts.json 或 weekly-report-models.json 缺失或格式不正确');
  }
  // main 已移除 llm-config.json；仅接受审计过的旧默认文件，未知定制不能静默丢弃。
  const retired = 'llm-config.json';
  if (fs.existsSync(path.join(sourceConfig, retired))) {
    try {
      if (!LEGACY_MODEL_HASHES[retired].has(semanticHash(readConfig(sourceConfig, retired)))) differences.push(retired);
      else transforms.push(`${retired}: 已审计旧配置退出使用，统一模型由 weekly-report-models.json 管理`);
    } catch { differences.push(retired); }
  }
  for (const name of AUDITED_FILES) {
    try {
      const source = readConfig(sourceConfig, name);
      const canonical = readConfig(baselineConfig, name);
      const sourceHash = semanticHash(source);
      const canonicalHash = semanticHash(canonical);
      files.push({ name, sourceHash, canonicalHash });
      if (sourceHash === canonicalHash) continue;
      if (LEGACY_MODEL_HASHES[name]?.has(sourceHash)) {
        transforms.push(`${name}: 已审计旧模型配置升级为 ${targetModelKey}`);
        continue;
      }
      if (name === 'keyword-prompts.json') {
        const prompts = source.keywords?.['潜在招标客户']?.prompts || [];
        if (prompts.length === 1) prompts[0].isDefault = true;
      }
      if (name === 'auto-report-config.json') {
        const groups = [source.defaults, ...Object.values(source.keywords || {})];
        for (const group of groups) {
          if (group && LEGACY_KEYS.has(group.modelKey || '')) group.modelKey = targetModelKey;
        }
        const tobacco = source.keywords?.['烟草服务银行'];
        const prompts = sourceKeywords.keywords?.['烟草服务银行']?.prompts || [];
        if (tobacco?.promptId === 'default' && !prompts.some(p => p.id === 'default') && prompts.some(p => p.id === 'v1')) {
          tobacco.promptId = 'v1';
        }
        // Empty keyword modelKey inherits the fixed default and is equivalent.
        for (const group of Object.values(canonical.keywords || {})) {
          if (group && !group.modelKey) group.modelKey = targetModelKey;
        }
      }
      if (semanticHash(source) !== semanticHash(canonical)) differences.push(name);
      else transforms.push(`${name}: 已确认的模型引用、默认 Prompt 标记或烟草服务银行 v1 修正`);
    } catch {
      differences.push(`${name}（缺失、格式错误或非普通文件）`);
    }
  }
  if (differences.length) {
    const error = new Error(`生产配置与待发布默认层存在未确认差异，迁移已中止且未写入文件：${differences.join('、')}。请重新审计生产快照并保留差异，禁止直接覆盖生产配置。`);
    error.code = 'PRODUCTION_CONFIG_DRIFT';
    throw error;
  }
  return { files, transforms };
}

module.exports = { AUDITED_FILES, auditProductionConfig };
