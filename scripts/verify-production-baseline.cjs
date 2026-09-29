#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { auditProductionConfig } = require('../services/productionConfigAudit.cjs');

function main(argv = process.argv.slice(2)) {
  const options = { repo: process.cwd(), snapshot: '' };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--repo') options.repo = argv[++index] || '';
    else if (argv[index] === '--snapshot') options.snapshot = argv[++index] || '';
    else if (argv[index] === '--help') options.help = true;
    else throw new Error(`未知参数：${argv[index]}`);
  }
  if (options.help || !options.snapshot) {
    console.log('用法：node scripts/verify-production-baseline.cjs --snapshot <生产快照目录> [--repo <仓库目录>]');
    return options.help ? 0 : 2;
  }
  const audit = auditProductionConfig({
    sourceConfig: path.resolve(options.snapshot, 'config'),
    baselineConfig: path.resolve(options.repo, 'config'),
  });
  console.log('生产配置审计（仅输出语义哈希，不输出 Prompt 或密码）');
  for (const file of audit.files) console.log(`${file.name}\tproduction=${file.sourceHash}\tcanonical=${file.canonicalHash}`);
  for (const change of audit.transforms) console.log(`已确认转换：${change}`);
  console.log('生产配置审计通过。用户、政策历史、审计和 PDF 的迁移校验由 prepare-production-runtime.cjs 执行。');
  return 0;
}

if (require.main === module) {
  try { process.exitCode = main(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { main };
