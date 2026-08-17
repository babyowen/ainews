#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MANAGED_FILES = [
  'prompts.md',
  'policy_prompts.md',
  'keyword-prompts.json',
  'region-policy-report-prompts.json',
  'auto-report-config.json',
  'llm-config.json',
  'weekly-report-models.json',
  'users.json',
];

function parseArgs(argv) {
  const options = { repo: process.cwd(), snapshot: '' };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--repo') options.repo = argv[++index] || '';
    else if (argv[index] === '--snapshot') options.snapshot = argv[++index] || '';
    else if (argv[index] === '--help') options.help = true;
    else throw new Error(`未知参数：${argv[index]}`);
  }
  return options;
}

function usage() {
  console.log('用法：node scripts/verify-production-baseline.cjs --snapshot <生产快照目录> [--repo <仓库目录>]');
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function readFile(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`缺少文件：${filePath}`);
  return fs.readFileSync(filePath);
}

function readJson(filePath) {
  try {
    return JSON.parse(readFile(filePath).toString('utf8'));
  } catch (error) {
    throw new Error(`JSON 无法解析：${filePath}（${error.message}）`);
  }
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function sameJson(left, right) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function withoutPasswords(users) {
  return users.map(({ password, passwordHash, token, secret, ...user }) => user);
}

function modelKeys(config) {
  if (Array.isArray(config.models)) return new Set(config.models.map((item) => item.key));
  return new Set(Object.keys(config.models || {}));
}

function validatePromptConfig(config, errors) {
  for (const [keyword, group] of Object.entries(config.keywords || {})) {
    const prompts = Array.isArray(group.prompts) ? group.prompts : [];
    const seen = new Set();
    let defaultCount = 0;
    for (const prompt of prompts) {
      if (!prompt.id) errors.push(`${keyword} 存在缺少 id 的 Prompt`);
      if (seen.has(prompt.id)) errors.push(`${keyword} 存在重复 Prompt id：${prompt.id}`);
      seen.add(prompt.id);
      if (prompt.isDefault) defaultCount += 1;
      if (typeof prompt.systemPrompt !== 'string' || typeof prompt.userPrompt !== 'string') {
        errors.push(`${keyword}/${prompt.id || '<missing>'} 缺少 systemPrompt 或 userPrompt`);
      }
    }
    if (defaultCount > 1) errors.push(`${keyword} 存在 ${defaultCount} 个默认 Prompt`);
  }
}

function validateAutoReport(autoReport, keywordPrompts, weeklyModels, errors) {
  const models = modelKeys(weeklyModels);
  const enabled = [];
  for (const [keyword, item] of Object.entries(autoReport.keywords || {})) {
    if (!item.enabled) continue;
    enabled.push(keyword);
    const modelKey = item.modelKey || autoReport.defaults?.modelKey || weeklyModels.defaultModelKey || '';
    const promptId = item.promptId || autoReport.defaults?.promptId || '';
    if (!models.has(modelKey)) errors.push(`${keyword} 引用了不存在的模型：${modelKey || '<empty>'}`);
    if (promptId && promptId !== 'default') {
      const prompts = keywordPrompts.keywords?.[keyword]?.prompts || [];
      if (!prompts.some((prompt) => prompt.id === promptId)) {
        errors.push(`${keyword} 引用了不存在的 Prompt：${promptId}`);
      }
    }
  }
  return enabled;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }
  if (!options.snapshot) {
    usage();
    process.exitCode = 2;
    return;
  }

  const repoConfig = path.resolve(options.repo, 'config');
  const snapshotConfig = path.resolve(options.snapshot, 'config');
  const errors = [];

  console.log('生产基线文件清单（仅输出哈希，不输出 Prompt 或密码）');
  for (const file of MANAGED_FILES) {
    const production = readFile(path.join(snapshotConfig, file));
    const canonical = readFile(path.join(repoConfig, file));
    console.log(`${file}\tproduction=${sha256(production).slice(0, 16)}\tcanonical=${sha256(canonical).slice(0, 16)}`);
  }

  const productionPrompts = readFile(path.join(snapshotConfig, 'prompts.md')).toString('utf8');
  const canonicalPrompts = readFile(path.join(repoConfig, 'prompts.md')).toString('utf8');
  if (productionPrompts.trimEnd() !== canonicalPrompts.trimEnd()) {
    errors.push('prompts.md 存在语义内容差异（末尾空白以外）');
  }

  for (const file of ['policy_prompts.md']) {
    if (!readFile(path.join(snapshotConfig, file)).equals(readFile(path.join(repoConfig, file)))) {
      errors.push(`${file} 未与生产快照保持一致`);
    }
  }

  const productionKeywords = readJson(path.join(snapshotConfig, 'keyword-prompts.json'));
  const canonicalKeywords = readJson(path.join(repoConfig, 'keyword-prompts.json'));
  const expectedKeywords = clone(productionKeywords);
  const tenderPrompts = expectedKeywords.keywords?.['潜在招标客户']?.prompts || [];
  if (tenderPrompts.length === 1) tenderPrompts[0].isDefault = true;
  if (!sameJson(expectedKeywords, canonicalKeywords)) {
    errors.push('keyword-prompts.json 不符合生产快照加已确认的默认 Prompt 不变式修正');
  }

  for (const file of ['region-policy-report-prompts.json', 'llm-config.json']) {
    const production = readJson(path.join(snapshotConfig, file));
    const canonical = readJson(path.join(repoConfig, file));
    if (!sameJson(production, canonical)) errors.push(`${file} 未与生产快照保持一致`);
  }

  const productionModels = readJson(path.join(snapshotConfig, 'weekly-report-models.json'));
  const canonicalModels = readJson(path.join(repoConfig, 'weekly-report-models.json'));
  const canonicalModelsWithoutReasoner = clone(canonicalModels);
  delete canonicalModelsWithoutReasoner.models?.['deepseek-reasoner'];
  if (!sameJson(productionModels, canonicalModelsWithoutReasoner)) {
    errors.push('weekly-report-models.json 除显式收口的 deepseek-reasoner 外未与生产快照保持一致');
  }
  const reasoner = canonicalModels.models?.['deepseek-reasoner'];
  if (!reasoner || reasoner.model !== 'deepseek-reasoner' || reasoner.apiKey !== 'DEEPSEEK_API_KEY') {
    errors.push('weekly-report-models.json 缺少已确认的 deepseek-reasoner 配置');
  }

  const productionAutoReport = readJson(path.join(snapshotConfig, 'auto-report-config.json'));
  const expectedAutoReport = clone(productionAutoReport);
  if (expectedAutoReport.keywords?.['烟草服务银行']) {
    expectedAutoReport.keywords['烟草服务银行'].promptId = 'v1';
  }
  const canonicalAutoReport = readJson(path.join(repoConfig, 'auto-report-config.json'));
  if (!sameJson(expectedAutoReport, canonicalAutoReport)) {
    errors.push('auto-report-config.json 不符合生产快照加已确认的烟草服务银行 v1 修正');
  }

  const productionUsers = readJson(path.join(snapshotConfig, 'users.json'));
  const canonicalUsers = readJson(path.join(repoConfig, 'users.json'));
  if (!sameJson(withoutPasswords(productionUsers), withoutPasswords(canonicalUsers))) {
    errors.push('users.json 的非密码字段未与生产快照保持一致');
  }

  validatePromptConfig(canonicalKeywords, errors);
  const enabledKeywords = validateAutoReport(
    canonicalAutoReport,
    canonicalKeywords,
    readJson(path.join(repoConfig, 'weekly-report-models.json')),
    errors,
  );

  const policyDir = path.join(snapshotConfig, 'policies');
  const policySnapshots = fs.existsSync(policyDir)
    ? fs.readdirSync(policyDir).filter((file) => /^policy_\d+\.json$/.test(file)).sort()
    : [];
  console.log(`自动周报启用关键词（${enabledKeywords.length}）：${enabledKeywords.join('、')}`);
  console.log(`生产政策历史快照：${policySnapshots.length} 个（运行时保留，不进入 Git 默认层）`);

  if (errors.length) {
    console.error('\n生产基线校验失败：');
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log('\n生产基线校验通过。');
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
