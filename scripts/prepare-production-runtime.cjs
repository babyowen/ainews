#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function usage() {
  return [
    '用法：',
    '  node scripts/prepare-production-runtime.cjs \\',
    '    --source-config /旧生产目录/config \\',
    '    --target-root /部署根目录/shared [--dry-run] [--force-users]',
    '',
    '只迁移生产 users.json 与 config/policies 历史。Prompt 已进入 Git 默认基线，不在这里重复导入。',
  ].join('\n');
}

function parseArgs(argv) {
  const args = { dryRun: false, forceUsers: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--dry-run') args.dryRun = true;
    else if (value === '--force-users') args.forceUsers = true;
    else if (value === '--source-config') args.sourceConfig = argv[++index];
    else if (value === '--target-root') args.targetRoot = argv[++index];
    else if (value === '--help' || value === '-h') args.help = true;
    else throw new Error(`未知参数：${value}`);
  }
  return args;
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function readAndValidateJson(filePath, label) {
  let raw;
  try {
    raw = fs.readFileSync(filePath);
  } catch (error) {
    throw new Error(`${label} 不可读：${filePath}（${error.message}）`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw.toString('utf8'));
  } catch (error) {
    throw new Error(`${label} 不是合法 JSON：${filePath}（${error.message}）`);
  }
  return { raw, parsed, hash: sha256(raw) };
}

function assertSafeDirectory(directory, label) {
  if (!fs.existsSync(directory)) return;
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`${label} 必须是普通目录，不能是符号链接：${directory}`);
  }
}

function planFile({ sourcePath, targetPath, label, allowReplace = false }) {
  const source = readAndValidateJson(sourcePath, label);
  if (fs.existsSync(targetPath)) {
    const target = readAndValidateJson(targetPath, `${label} 目标`);
    if (source.hash === target.hash) return { action: 'skip', sourcePath, targetPath, ...source };
    if (!allowReplace) throw new Error(`${label} 目标已存在且内容不同，拒绝覆盖：${targetPath}`);
    return { action: 'replace', sourcePath, targetPath, ...source };
  }
  return { action: 'copy', sourcePath, targetPath, ...source };
}

function atomicWrite(targetPath, raw, mode) {
  const directory = path.dirname(targetPath);
  fs.mkdirSync(directory, { recursive: true });
  const tempPath = path.join(directory, `.${path.basename(targetPath)}.${process.pid}.${Date.now()}.tmp`);
  try {
    fs.writeFileSync(tempPath, raw, { mode });
    fs.renameSync(tempPath, targetPath);
    fs.chmodSync(targetPath, mode);
  } finally {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  }
}

function prepareProductionRuntime(options) {
  if (!options.sourceConfig || !options.targetRoot) throw new Error('必须提供 --source-config 和 --target-root');

  const sourceConfig = path.resolve(options.sourceConfig);
  const targetRoot = path.resolve(options.targetRoot);
  const sourcePolicies = path.join(sourceConfig, 'policies');
  const targetConfig = path.join(targetRoot, 'config');
  const targetRuntime = path.join(targetConfig, 'runtime');
  const targetPolicies = path.join(targetConfig, 'policies');

  assertSafeDirectory(sourceConfig, '源 config');
  assertSafeDirectory(sourcePolicies, '源 policies');
  assertSafeDirectory(targetRoot, '目标根目录');
  assertSafeDirectory(targetConfig, '目标 config');
  assertSafeDirectory(targetRuntime, '目标 runtime');
  assertSafeDirectory(targetPolicies, '目标 policies');

  const userPlan = planFile({
    sourcePath: path.join(sourceConfig, 'users.json'),
    targetPath: path.join(targetRuntime, 'users.json'),
    label: '生产 users.json',
    allowReplace: options.forceUsers === true,
  });
  if (!Array.isArray(userPlan.parsed) || userPlan.parsed.length === 0) {
    throw new Error('生产 users.json 必须是非空数组');
  }
  for (const user of userPlan.parsed) {
    if (!user || typeof user.username !== 'string' || !user.username.trim() || typeof user.password !== 'string' || !user.password) {
      throw new Error('生产 users.json 中每个用户都必须包含非空 username 和 password');
    }
  }

  const policyNames = fs.readdirSync(sourcePolicies)
    .filter((name) => /^policy_[A-Za-z0-9_-]+\.json$/.test(name))
    .sort();
  if (policyNames.length === 0) throw new Error(`源 policies 目录没有 policy_*.json：${sourcePolicies}`);

  const policyPlans = policyNames.map((name) => planFile({
    sourcePath: path.join(sourcePolicies, name),
    targetPath: path.join(targetPolicies, name),
    label: `政策历史 ${name}`,
    allowReplace: false,
  }));
  const plans = [userPlan, ...policyPlans];

  if (!options.dryRun) {
    for (const plan of plans) {
      if (plan.action === 'skip') continue;
      atomicWrite(plan.targetPath, plan.raw, plan === userPlan ? 0o600 : 0o640);
    }
  }

  return {
    dryRun: options.dryRun === true,
    sourceConfig,
    targetRoot,
    users: { action: userPlan.action, sha256: userPlan.hash },
    policies: policyPlans.map((plan) => ({
      name: path.basename(plan.targetPath),
      action: plan.action,
      sha256: plan.hash,
    })),
  };
}

if (require.main === module) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      process.stdout.write(`${usage()}\n`);
      process.exit(0);
    }
    const result = prepareProductionRuntime(args);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`迁移准备失败：${error.message}\n\n${usage()}\n`);
    process.exit(1);
  }
}

module.exports = { parseArgs, prepareProductionRuntime };
