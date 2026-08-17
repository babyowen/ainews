const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  buildAutoReportConfig,
  createAutoReportService,
  loadPromptPair,
} = require('../services/autoReportService.cjs');
const { createConfigStore } = require('../services/configStore.cjs');
const { createPromptStore } = require('../services/promptStore.cjs');
const { getWeeklyReportModel } = require('../services/weeklyReportModelConfig.cjs');

const rootDir = path.join(__dirname, '..');
const configDir = path.join(rootDir, 'config');

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(configDir, file), 'utf8'));
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

test('production baseline keeps all six automatic report keywords enabled', () => {
  const raw = readJson('auto-report-config.json');
  const config = buildAutoReportConfig(raw);

  assert.equal(raw.enabled, true);
  assert.deepEqual(
    config.enabledKeywords.map((item) => item.keyword),
    ['养老', '公积金', '数字政务', '政府基金', '中国烟草', '烟草服务银行'],
  );
});

test('every automatic report resolves an existing model and an explicit keyword prompt', () => {
  const raw = readJson('auto-report-config.json');
  const config = buildAutoReportConfig(raw);
  const models = readJson('weekly-report-models.json');
  const modelKeys = new Set(Object.keys(models.models || {}));

  for (const item of config.enabledKeywords) {
    assert.ok(modelKeys.has(item.modelKey), `${item.keyword} model ${item.modelKey} must exist`);
    const prompt = loadPromptPair({
      keyword: item.keyword,
      promptId: item.promptId,
      promptConfigPath: path.join(configDir, 'keyword-prompts.json'),
      fallbackPromptsPath: path.join(configDir, 'prompts.md'),
    });
    assert.equal(prompt.promptId, item.promptId, `${item.keyword} must not silently fall back to global prompts`);
  }
});

test('production auto-report execution uses the layered promptStore without changing prompt selection', async () => {
  const raw = readJson('auto-report-config.json');
  const enabled = buildAutoReportConfig(raw).enabledKeywords;
  const rowsByKeyword = Object.fromEntries(enabled.map((item) => [item.keyword, [{
    id: 1,
    title: `${item.keyword}测试新闻`,
    short_summary: '测试摘要',
    content: '测试全文',
    search_keyword: '测试客户',
    score: 5,
  }]]));
  let nextId = 1;
  const pool = {
    async query(sql, params = []) {
      if (sql.includes('FROM scored_news')) return [rowsByKeyword[params[0]] || []];
      if (sql.includes('INSERT INTO weekly_reports') || sql.includes('INSERT INTO auto_report_log')) {
        return [{ insertId: nextId++ }];
      }
      if (sql.includes('UPDATE auto_report_log')) return [{ affectedRows: 1 }];
      return [[]];
    },
  };
  const promptStore = createPromptStore({ configStore: createConfigStore({ configDir }) });
  const calls = new Map();
  const service = createAutoReportService({
    pool,
    config: raw,
    promptStore,
    getWeeklyReportModel,
    callLlm: async ({ keyword, systemPrompt, userPrompt }) => {
      calls.set(keyword, { systemPrompt, userPrompt });
      return '测试周报';
    },
    renderPdf: async () => Buffer.from('%PDF-test'),
    outputDir: fs.mkdtempSync(path.join(os.tmpdir(), 'production-prompt-execution-')),
  });

  for (const item of enabled) {
    await service.generateReportForKeyword({
      ...item,
      startDate: '2026-08-09',
      endDate: '2026-08-15',
      triggerType: 'test',
    });
    const selected = promptStore.findKeywordPrompt(item.keyword, item.promptId);
    assert.ok(selected, `${item.keyword}/${item.promptId} must exist in layered promptStore`);
    assert.equal(calls.get(item.keyword).systemPrompt, selected.systemPrompt);
    assert.ok(calls.get(item.keyword).userPrompt.includes(`${item.keyword}测试新闻`));
  }
});

test('production-edited keyword prompts stay byte stable through the refactor', () => {
  const config = readJson('keyword-prompts.json');
  const expected = [
    {
      keyword: '江苏地区银行',
      id: 'default',
      systemHash: '2012121ff3ed367cfd742c931103a79e15368a04f66bb2943b7b28ff66829771',
      userHash: '45719d752243b7b546f24528dda72381c84474ddc7b4d43a428fa1739a66cd2e',
    },
    {
      keyword: '中国烟草',
      id: '启动v1-202511151621',
      systemHash: 'c56c3176aad748bd8cbc1a889d38f0b2be09c2f7102f4458db9e3da9a3ef7448',
      userHash: '75ac2a31262c3978816fa2089691097d44ec61cf3c9b0da2f656d08789352887',
    },
    {
      keyword: '烟草服务银行',
      id: 'v1',
      systemHash: '36c87e25303f24230e4f9d45c195f82d556c6d21a1c4c81aaec0c4be579efd49',
      userHash: '10f87e3a50de9ea2ccb2e91c89b8af9a54df02835311503f8a64e417a93aa9aa',
    },
  ];

  for (const item of expected) {
    const prompt = config.keywords[item.keyword].prompts.find((candidate) => candidate.id === item.id);
    assert.ok(prompt, `${item.keyword}/${item.id} must exist`);
    assert.equal(sha256(prompt.systemPrompt), item.systemHash);
    assert.equal(sha256(prompt.userPrompt), item.userHash);
  }
});

test('weekly and policy markdown files keep all sections parseable by current production regexes', () => {
  const weekly = fs.readFileSync(path.join(configDir, 'prompts.md'), 'utf8');
  const policy = fs.readFileSync(path.join(configDir, 'policy_prompts.md'), 'utf8');
  const checks = [
    [weekly, /## System Prompt\s*\n\s*```\s*\n([\s\S]*?)\n\s*```/],
    [weekly, /## User Prompt\s*\n\s*```\s*\n([\s\S]*?)\n\s*```/],
    [weekly, /## Modify System Prompt\s*\n\s*```\s*\n([\s\S]*?)\n\s*```/],
    [weekly, /## Modify User Prompt\s*\n\s*```\s*\n([\s\S]*?)\n\s*```/],
    [policy, /## Policy Extraction Prompt[\s\S]*?```\w*\s*([\s\S]*?)\s*```/],
    [policy, /## Policy Comparison Prompt[\s\S]*?```\w*\s*([\s\S]*?)\s*```/],
  ];

  for (const [contents, regex] of checks) {
    const match = contents.match(regex);
    assert.ok(match);
    assert.ok(match[1].trim().length > 0);
  }
});

test('restricted user access matches production while passwords remain outside the baseline assertion', () => {
  const users = readJson('users.json');
  const yzgjj = users.find((user) => user.username === 'yzgjj');

  assert.ok(yzgjj);
  assert.deepEqual(yzgjj.keywords, ['公积金']);
  assert.ok(yzgjj.routes.includes('/auto-report'));
});
