const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { applyWeeklyReportEditorialRules } = require('../services/weeklyReportEditorial.cjs');

const {
  buildAutoReportConfig,
  canUserAccessAutoReport,
  createAutoReportService,
  defaultCallLlm,
  getAutoReportWeekRange,
  loadPromptPair,
  normalizeAutoReportConfig,
  sanitizeAutoReportRecord,
  validateAutoReportConfigReferences,
} = require('../services/autoReportService.cjs');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'auto-report-test-'));
}

function makePool(rowsByKeyword = {}, totalsByKeyword = {}) {
  const calls = [];
  let nextId = 100;
  return {
    calls,
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql.includes('COUNT(*) AS total_news_count')) {
        return [[{ total_news_count: totalsByKeyword[params[0]] ?? (rowsByKeyword[params[0]] || []).length }]];
      }
      if (sql.includes('FROM scored_news')) {
        return [rowsByKeyword[params[0]] || []];
      }
      if (sql.includes('INSERT INTO weekly_reports')) {
        return [{ insertId: nextId++ }];
      }
      if (sql.includes('INSERT INTO auto_report_log')) {
        return [{ insertId: nextId++ }];
      }
      if (sql.includes('UPDATE auto_report_log')) {
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('SHOW COLUMNS FROM auto_report_log')) {
        return [[]];
      }
      if (sql.includes('ALTER TABLE auto_report_log')) {
        return [{}];
      }
      if (sql.includes('CREATE TABLE')) {
        return [{}];
      }
      return [[]];
    },
  };
}

const baseConfig = {
  enabled: true,
  defaults: {
    modelKey: 'deepseek-v4-pro',
    promptId: 'default',
    minScore: 4,
    summaryVersion: 'short',
  },
  keywords: {
    '公积金': { enabled: true },
  },
};

test('getAutoReportWeekRange returns previous Sunday through current Saturday for a Sunday run', () => {
  assert.deepEqual(getAutoReportWeekRange(new Date('2026-05-31T05:00:00+08:00')), {
    startDate: '2026-05-24',
    endDate: '2026-05-30',
  });
});

test('getAutoReportWeekRange returns the latest complete Saturday range after the scheduled Sunday', () => {
  assert.deepEqual(getAutoReportWeekRange(new Date('2026-06-01T12:00:00+08:00')), {
    startDate: '2026-05-24',
    endDate: '2026-05-30',
  });
});

test('getAutoReportWeekRange handles Saturday and cross-year ranges', () => {
  assert.deepEqual(getAutoReportWeekRange(new Date('2026-05-30T23:00:00+08:00')), {
    startDate: '2026-05-24',
    endDate: '2026-05-30',
  });
  assert.deepEqual(getAutoReportWeekRange(new Date('2026-01-04T05:00:00+08:00')), {
    startDate: '2025-12-28',
    endDate: '2026-01-03',
  });
});

test('normalizeAutoReportConfig supplies safe disabled defaults', () => {
  const config = normalizeAutoReportConfig(null);
  assert.equal(config.enabled, false);
  assert.equal(config.defaults.modelKey, 'deepseek-v4-pro-0813');
  assert.equal(config.defaults.minScore, 3);
  assert.deepEqual(config.keywords, {});
});

test('normalizeAutoReportConfig rejects dirty numeric values back to defaults', () => {
  const config = normalizeAutoReportConfig({
    enabled: 1,
    defaults: { minScore: 'abc', summaryVersion: 'other' },
    keywords: {
      '公积金': { enabled: 'yes', minScore: 'bad', summaryVersion: 'full' },
    },
  });
  assert.equal(config.enabled, true);
  assert.equal(config.defaults.minScore, 3);
  assert.equal(config.defaults.summaryVersion, 'short');
  assert.equal(config.keywords['公积金'].minScore, '');
  assert.equal(config.keywords['公积金'].summaryVersion, 'full');
});

test('buildAutoReportConfig merges keyword overrides with defaults', () => {
  const config = buildAutoReportConfig({
    ...baseConfig,
    keywords: {
      '公积金': { enabled: true, minScore: 4.5, promptId: 'housing' },
    },
  });
  assert.deepEqual(config.enabledKeywords, [
    {
      keyword: '公积金',
      modelKey: 'deepseek-v4-pro-0813',
      promptId: 'housing',
      minScore: 4.5,
      summaryVersion: 'short',
    },
  ]);
});

test('validateAutoReportConfigReferences rejects missing explicit prompts and models', () => {
  const findKeywordPrompt = (keyword, promptId) => (
    keyword === '公积金' && promptId === 'existing'
      ? { systemPrompt: 'system', userPrompt: 'user' }
      : null
  );
  const getWeeklyPrompts = () => ({ systemPrompt: 'global system', userPrompt: 'global user' });
  const getModel = (modelKey) => {
    assert.equal(modelKey, 'deepseek-v4-pro-0813');
    return { key: modelKey };
  };

  assert.throws(() => validateAutoReportConfigReferences({
    enabled: true,
    defaults: { modelKey: 'deepseek-v4-pro', promptId: 'missing', minScore: 4, summaryVersion: 'short' },
    keywords: { '公积金': { enabled: true } },
  }, { findKeywordPrompt, getWeeklyPrompts, getModel }), /不存在或不完整的 Prompt：missing/);

  assert.throws(() => validateAutoReportConfigReferences({
    enabled: true,
    defaults: { modelKey: 'missing-model', promptId: 'existing', minScore: 4, summaryVersion: 'short' },
    keywords: { '公积金': { enabled: true } },
  }, { findKeywordPrompt, getWeeklyPrompts, getModel: () => { throw new Error('model config unavailable'); } }), /model config unavailable/);
});

test('generateReportForKeyword queries fetchdate as yyyy-mm-dd closed range and min score', async () => {
  const pool = makePool({
    '公积金': [
      { id: 1, title: 'A', short_summary: '短摘要', content: '全文', search_keyword: '南京', score: '4.5' },
    ],
  });
  const service = createAutoReportService({
    pool,
    config: baseConfig,
    getWeeklyReportModel: () => ({ key: 'deepseek-v4-pro', model: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' }),
    callLlm: async ({ userPrompt }) => {
      assert.match(userPrompt, /本次报告期严格为 2026-05-23 至 2026-05-30/);
      assert.ok(userPrompt.indexOf('短摘要') < userPrompt.indexOf('【出稿前必须完成的核对'));
      return '周报内容';
    },
    renderPdf: async () => Buffer.from('pdf'),
    now: () => new Date('2026-05-31T05:00:00+08:00'),
    outputDir: makeTempDir(),
  });

  const result = await service.generateReportForKeyword({
    keyword: '公积金',
    startDate: '2026-05-23',
    endDate: '2026-05-30',
    modelKey: 'deepseek-v4-pro',
    promptId: 'default',
    minScore: 4,
    summaryVersion: 'short',
  });

  const selectCall = pool.calls.find(call => call.sql.includes('FROM scored_news'));
  assert.match(selectCall.sql, /fetchdate BETWEEN \? AND \?/);
  assert.deepEqual(selectCall.params, ['公积金', '2026-05-23', '2026-05-30', 4]);
  assert.equal(result.status, 'success');
  assert.equal(result.newsCount, 1);
});

test('generateReportForKeyword skips without calling LLM when no news matches', async () => {
  let llmCalls = 0;
  const service = createAutoReportService({
    pool: makePool({ '公积金': [] }),
    config: baseConfig,
    getWeeklyReportModel: () => ({ key: 'deepseek-v4-pro', model: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' }),
    callLlm: async () => { llmCalls += 1; return '周报内容'; },
    renderPdf: async () => Buffer.from('pdf'),
    now: () => new Date('2026-05-31T05:00:00+08:00'),
    outputDir: makeTempDir(),
  });

  const result = await service.generateReportForKeyword({
    keyword: '公积金',
    startDate: '2026-05-23',
    endDate: '2026-05-30',
    modelKey: 'deepseek-v4-pro',
    promptId: 'default',
    minScore: 4,
    summaryVersion: 'short',
  });

  assert.equal(result.status, 'skipped');
  assert.equal(result.newsCount, 0);
  assert.equal(llmCalls, 0);
});

test('generateReportForKeyword rejects a missing explicit prompt even when no news matches', async () => {
  const service = createAutoReportService({
    pool: makePool({ '公积金': [] }),
    config: baseConfig,
    promptStore: {
      findKeywordPrompt: () => null,
      getWeeklyPrompts: () => ({ systemPrompt: 'global system', userPrompt: 'global user' }),
    },
    getWeeklyReportModel: () => ({ key: 'deepseek-v4-pro', model: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' }),
    outputDir: makeTempDir(),
  });

  await assert.rejects(() => service.generateReportForKeyword({
    keyword: '公积金',
    startDate: '2026-05-23',
    endDate: '2026-05-30',
    modelKey: 'deepseek-v4-pro',
    promptId: 'missing',
    minScore: 4,
  }), /Prompt 不存在或内容不完整：公积金\/missing/);
});

test('generateReportForKeyword creates contact PDF after successful report insert', async () => {
  const outputDir = makeTempDir();
  let pdfPayload;
  const service = createAutoReportService({
    pool: makePool({
      '公积金': [
        { id: 1, title: 'A', short_summary: '短摘要', content: '全文', search_keyword: '南京', score: '4.5' },
      ],
    }),
    config: baseConfig,
    getWeeklyReportModel: () => ({ key: 'deepseek-v4-pro', model: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' }),
    callLlm: async () => '周报内容',
    renderPdf: async (payload) => { pdfPayload = payload; return Buffer.from('%PDF-test'); },
    now: () => new Date('2026-05-31T05:00:00+08:00'),
    outputDir,
  });

  const result = await service.generateReportForKeyword({
    keyword: '公积金',
    startDate: '2026-05-23',
    endDate: '2026-05-30',
    modelKey: 'deepseek-v4-pro',
    promptId: 'default',
    minScore: 4,
    summaryVersion: 'short',
  });

  assert.equal(pdfPayload.includeContact, true);
  assert.equal(result.pdfStatus, 'success');
  assert.equal(path.isAbsolute(result.pdfPath), false);
  assert.equal(path.basename(result.pdfPath).endsWith('.pdf'), true);
  assert.equal(fs.existsSync(path.join(outputDir, path.basename(result.pdfPath))), true);
});

test('generateReportForKeyword writes run parameters and content metrics to log', async () => {
  const pool = makePool({
    '公积金': [
      { id: 1, title: 'A', short_summary: '短摘要', content: '全文内容', search_keyword: '南京', score: '4.5', wordcount: 120 },
      { id: 2, title: 'B', short_summary: '另一条摘要', content: '另一条全文', search_keyword: '苏州', score: '4.2', wordcount: 80 },
    ],
  });
  const service = createAutoReportService({
    pool,
    config: baseConfig,
    getWeeklyReportModel: () => ({ key: 'deepseek-v4-pro', model: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' }),
    callLlm: async () => '周报内容',
    renderPdf: async () => Buffer.from('pdf'),
    now: () => new Date('2026-05-31T05:00:00+08:00'),
    outputDir: makeTempDir(),
  });

  const result = await service.generateReportForKeyword({
    keyword: '公积金',
    startDate: '2026-05-23',
    endDate: '2026-05-30',
    modelKey: 'deepseek-v4-pro',
    promptId: 'default',
    minScore: 4,
    summaryVersion: 'short',
  });

  const logCall = pool.calls.find(call => call.sql.includes('INSERT INTO auto_report_log'));
  assert.match(logCall.sql, /min_score/);
  assert.match(logCall.sql, /summary_version/);
  assert.match(logCall.sql, /source_word_count/);
  assert.equal(result.newsCount, 2);
  assert.equal(result.sourceWordCount, 200);
  assert.equal(result.minScore, 4);
  assert.equal(result.summaryVersion, 'short');
  assert.equal(result.modelKey, 'deepseek-v4-pro');
  assert.equal(result.promptCharCount > 0, true);
  assert.equal(logCall.params.includes(200), true);
});

test('generateReportForKeyword keeps report success when PDF rendering fails', async () => {
  const service = createAutoReportService({
    pool: makePool({
      '公积金': [
        { id: 1, title: 'A', short_summary: '短摘要', content: '全文', search_keyword: '南京', score: '4.5' },
      ],
    }),
    config: baseConfig,
    getWeeklyReportModel: () => ({ key: 'deepseek-v4-pro', model: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' }),
    callLlm: async () => '周报内容',
    renderPdf: async () => { throw new Error('pdf unavailable'); },
    now: () => new Date('2026-05-31T05:00:00+08:00'),
    outputDir: makeTempDir(),
  });

  const result = await service.generateReportForKeyword({
    keyword: '公积金',
    startDate: '2026-05-23',
    endDate: '2026-05-30',
    modelKey: 'deepseek-v4-pro',
    promptId: 'default',
    minScore: 4,
    summaryVersion: 'short',
  });

  assert.equal(result.status, 'success');
  assert.equal(result.pdfStatus, 'error');
  assert.match(result.pdfErrorMessage, /pdf unavailable/);
});

test('runAutoReportCycle preserves original keyword error when failure logging also fails', async () => {
  const pool = makePool({
    '公积金': [{ id: 1, title: 'A', short_summary: '短摘要', score: '4.5' }],
  });
  pool.query = async (sql, params = []) => {
    pool.calls.push({ sql, params });
    if (sql.includes('COUNT(*) AS total_news_count')) return [[{ total_news_count: 7 }]];
    if (sql.includes('FROM scored_news')) return [[{ id: 1, title: 'A', short_summary: '短摘要', score: '4.5' }]];
    if (sql.includes('INSERT INTO auto_report_log')) throw new Error('log failed');
    return [[]];
  };
  const service = createAutoReportService({
    pool,
    config: baseConfig,
    getWeeklyReportModel: () => ({ key: 'deepseek-v4-pro', model: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' }),
    callLlm: async () => { throw new Error('model failed'); },
    renderPdf: async () => Buffer.from('pdf'),
    now: () => new Date('2026-05-31T05:00:00+08:00'),
    outputDir: makeTempDir(),
  });

  const result = await service.runAutoReportCycle();
  assert.equal(result.results[0].status, 'error');
  assert.equal(result.results[0].errorMessage, 'model failed');
  assert.equal(result.results[0].logErrorMessage, 'log failed');
});

test('loadPromptPair reports missing fallback prompt file with a clear error', () => {
  assert.throws(() => loadPromptPair({
    keyword: '公积金',
    promptId: '',
    promptConfigPath: path.join(makeTempDir(), 'missing-keyword-prompts.json'),
    fallbackPromptsPath: path.join(makeTempDir(), 'missing-prompts.md'),
  }), /Fallback prompt file is not readable/);
});

test('loadPromptPair refuses to silently fall back when an explicit prompt is missing', () => {
  const dir = makeTempDir();
  const promptConfigPath = path.join(dir, 'keyword-prompts.json');
  const fallbackPromptsPath = path.join(dir, 'prompts.md');
  fs.writeFileSync(promptConfigPath, JSON.stringify({ keywords: {} }));
  fs.writeFileSync(fallbackPromptsPath, '## System Prompt\n\n```\nglobal system\n```\n\n## User Prompt\n\n```\nglobal user\n```\n');

  assert.throws(() => loadPromptPair({
    keyword: '公积金',
    promptId: 'missing',
    promptConfigPath,
    fallbackPromptsPath,
  }), /Prompt 不存在或内容不完整：公积金\/missing/);
});

test('defaultCallLlm reports missing API key environment variable clearly', async () => {
  const previous = process.env.MISSING_AUTO_REPORT_KEY;
  delete process.env.MISSING_AUTO_REPORT_KEY;
  try {
    await assert.rejects(
      defaultCallLlm({
        modelConfig: {
          endpoint: 'https://example.invalid/chat',
          apiKey: 'MISSING_AUTO_REPORT_KEY',
        },
        buildChatPayload: () => ({}),
        systemPrompt: 'system',
        userPrompt: 'user',
        fetchImpl: async () => {
          throw new Error('fetch should not be called');
        },
      }),
    error => error.status === 503 && error.code === 'MODEL_API_KEY_MISSING' && error.message.includes('MISSING_AUTO_REPORT_KEY')
    );
  } finally {
    if (previous === undefined) {
      delete process.env.MISSING_AUTO_REPORT_KEY;
    } else {
      process.env.MISSING_AUTO_REPORT_KEY = previous;
    }
  }
});

test('defaultCallLlm aborts hung requests after timeout', async () => {
  const previous = process.env.MISSING_KEY;
  process.env.MISSING_KEY = 'test-key';
  await assert.rejects(
    (async () => {
      try {
        await defaultCallLlm({
          modelConfig: {
            endpoint: 'https://example.invalid/chat',
            apiKey: 'MISSING_KEY',
          },
          buildChatPayload: () => ({}),
          systemPrompt: 'system',
          userPrompt: 'user',
          timeoutMs: 5,
          retryDelayMs: 0,
          fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
            options.signal.addEventListener('abort', () => {
              const error = new Error('aborted');
              error.name = 'AbortError';
              reject(error);
            });
          }),
        });
      } finally {
        if (previous === undefined) {
          delete process.env.MISSING_KEY;
        } else {
          process.env.MISSING_KEY = previous;
        }
      }
    })(),
    /LLM API request timed out/
  );
});

test('defaultCallLlm sends configured API key in authorization header', async () => {
  const previous = process.env.AUTO_REPORT_TEST_KEY;
  process.env.AUTO_REPORT_TEST_KEY = 'configured-key';
  try {
    const content = await defaultCallLlm({
      modelConfig: {
        endpoint: 'https://example.invalid/chat',
        apiKey: 'AUTO_REPORT_TEST_KEY',
      },
      buildChatPayload: () => ({}),
      systemPrompt: 'system',
      userPrompt: 'user',
      fetchImpl: async (_url, options) => {
        assert.equal(options.headers.Authorization, 'Bearer configured-key');
        assert.equal(JSON.parse(options.body).stream, true);
        return new Response('data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
      },
    });
    assert.equal(content, 'ok');
  } finally {
    if (previous === undefined) {
      delete process.env.AUTO_REPORT_TEST_KEY;
    } else {
      process.env.AUTO_REPORT_TEST_KEY = previous;
    }
  }
});

test('runAutoReportCycle does not run keywords when disabled', async () => {
  const service = createAutoReportService({
    pool: makePool({ '公积金': [{ id: 1, title: 'A' }] }),
    config: { ...baseConfig, enabled: false },
    getWeeklyReportModel: () => ({ key: 'deepseek-v4-pro', model: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' }),
    callLlm: async () => '周报内容',
    renderPdf: async () => Buffer.from('pdf'),
    now: () => new Date('2026-05-31T05:00:00+08:00'),
    outputDir: makeTempDir(),
  });

  const result = await service.runAutoReportCycle();
  assert.equal(result.status, 'disabled');
  assert.deepEqual(result.results, []);
});

test('runAutoReportCycle continues after one keyword fails', async () => {
  const service = createAutoReportService({
    pool: makePool({
      '公积金': [{ id: 1, title: 'A', short_summary: '短摘要', score: '4.5' }],
      '养老': [{ id: 2, title: 'B', short_summary: '短摘要', score: '4.5' }],
    }),
    config: {
      ...baseConfig,
      keywords: {
        '公积金': { enabled: true },
        '养老': { enabled: true },
      },
    },
    getWeeklyReportModel: () => ({ key: 'deepseek-v4-pro', model: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' }),
    callLlm: async ({ keyword }) => {
      if (keyword === '公积金') throw new Error('model failed');
      return '周报内容';
    },
    renderPdf: async () => Buffer.from('pdf'),
    now: () => new Date('2026-05-31T05:00:00+08:00'),
    outputDir: makeTempDir(),
  });

  const result = await service.runAutoReportCycle();
  assert.equal(result.results.length, 2);
  assert.equal(result.results[0].status, 'error');
  assert.equal(result.results[1].status, 'success');
});

test('canUserAccessAutoReport allows admin all keywords and restricted users only owned keywords', () => {
  assert.equal(canUserAccessAutoReport({ role: 'admin', keywords: [] }, { keyword: '养老' }), true);
  assert.equal(canUserAccessAutoReport({ role: 'restricted', keywords: ['公积金'] }, { keyword: '公积金' }), true);
  assert.equal(canUserAccessAutoReport({ role: 'restricted', keywords: ['公积金'] }, { keyword: '养老' }), false);
});

test('sanitizeAutoReportRecord hides pdfPath from API responses', () => {
  const record = sanitizeAutoReportRecord({
    id: 1,
    keyword: '公积金',
    pdf_path: '/secret/file.pdf',
    pdf_filename: 'report.pdf',
  });
  assert.equal(Object.hasOwn(record, 'pdf_path'), false);
  assert.equal(record.pdf_filename, 'report.pdf');
});

test('automatic cycles reload runtime enablement and prompts while retaining the dedicated Pro model', async () => {
  const { createConfigStore } = require('../services/configStore.cjs');
  const { createPromptStore } = require('../services/promptStore.cjs');
  const { getWeeklyReportModel } = require('../services/weeklyReportModelConfig.cjs');
  const dir = makeTempDir();
  try {
    const configDir = path.join(dir, 'config');
    fs.cpSync(path.join(__dirname, '../config'), configDir, { recursive: true, filter: p => !path.relative(path.join(__dirname, '../config'), p).split(path.sep).includes('runtime') });
    const configStore = createConfigStore({ configDir });
    const promptStore = createPromptStore({ configStore });
    const selected = promptStore.getKeywordLibrary().keywords['公积金'].prompts[0];
    promptStore.saveKeywordPrompt({ ...selected, keyword: '公积金', promptId: selected.id, systemPrompt: 'AUTO_RUNTIME' });
    const config = {
      enabled: false,
      defaults: { modelKey: 'deepseek-v4-pro', promptId: selected.id, minScore: 4, summaryVersion: 'short' },
      keywords: { 公积金: { enabled: true } },
    };
    configStore.commitJson('auto-report-config.json', config);
    const pool = makePool({ 公积金: [{ id: 1, title: '测试新闻', content: '全文', short_summary: '摘要' }] });
    const calls = [];
    const service = createAutoReportService({
      pool, loadConfig: () => configStore.readEffectiveJson('auto-report-config.json'), promptStore, getWeeklyReportModel,
      callLlm: async args => { calls.push(args); return '完整报告'; },
      renderPdf: async () => Buffer.from('%PDF-test'), outputDir: path.join(dir, 'pdf'),
    });
    assert.equal((await service.runAutoReportCycle()).status, 'disabled');
    assert.equal(pool.calls.length, 0);
    configStore.commitJson('auto-report-config.json', { ...config, enabled: true });
    const result = await service.runAutoReportCycle();
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].status, 'success');
    assert.equal(calls[0].systemPrompt, applyWeeklyReportEditorialRules('AUTO_RUNTIME'));
    assert.equal(calls[0].modelConfig.model, 'deepseek-v4-pro-0813');
    assert.deepEqual(calls[0].modelConfig.thinking, { type: 'enabled' });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('PDF and audit denominator includes low-scored/unscored news, not just selected rows', async () => {
  let payload;
  const pool = makePool({ 公积金: [{ id: 1, title: '已选', short_summary: '摘要' }] }, { 公积金: 123 });
  const service = createAutoReportService({ pool, config: baseConfig,
    getWeeklyReportModel: () => ({ model: 'test' }), callLlm: async () => '完整周报',
    renderPdf: async p => { payload = p; return Buffer.from('pdf'); }, outputDir: makeTempDir() });
  const result = await service.generateReportForKeyword({ keyword: '公积金', startDate: '2026-10-25', endDate: '2026-10-31', minScore: 4, promptId: 'default' });
  assert.equal(payload.newsCount, 1);
  assert.equal(payload.totalNewsCount, 123);
  assert.equal(result.totalNewsCount, 123);
  const countQuery = pool.calls.find(c => c.sql.includes('COUNT(*)'));
  assert.deepEqual(countQuery.params, ['公积金', '2026-10-25', '2026-10-31']);
  assert.doesNotMatch(countQuery.sql, /\bscore\b|LIMIT/);
  assert.equal(pool.calls.find(c => c.sql.includes('INSERT INTO auto_report_log')).params.at(-1), 123);
});

test('failure retains selected counts and input metrics and blocks PDF instead of no-news skip', async () => {
  const pool = makePool({ 公积金: [{ id: 1, title: '已选', short_summary: '具体内容', wordcount: 200 }] }, { 公积金: 123 });
  const service = createAutoReportService({ pool, config: baseConfig,
    getWeeklyReportModel: () => ({ model: 'test' }),
    callLlm: async () => { await new Promise(r => setTimeout(r, 5)); throw new Error('连接超时'); },
    renderPdf: async () => { throw new Error('must not render'); } });
  const { results: [failed] } = await service.runAutoReportCycle();
  assert.equal(failed.status, 'error');
  assert.equal(failed.pdfStatus, 'blocked');
  assert.equal(failed.newsCount, 1);
  assert.equal(failed.totalNewsCount, 123);
  assert.equal(failed.sourceWordCount, 200);
  assert.ok(failed.promptCharCount > 0 && failed.durationMs >= 5);
  assert.equal(pool.calls.some(c => c.sql.includes('INSERT INTO weekly_reports')), false);
});

test('no-news skip explains empty collection versus score filtering', async () => {
  for (const total of [0, 123]) {
    const service = createAutoReportService({ pool: makePool({}, { 公积金: total }), config: baseConfig,
      getWeeklyReportModel: () => ({ model: 'test' }), callLlm: async () => { throw new Error('must not call'); } });
    const { results: [result] } = await service.runAutoReportCycle();
    assert.equal(result.status, 'skipped');
    assert.match(result.errorMessage, total ? /123 条新闻.*4 分门槛/ : /没有采集到/);
  }
});

test('automatic streaming retries transient failures once and discards partial output', async () => {
  process.env.AUTO_RETRY_TEST_KEY = 'fake-test-key';
  const args = { modelConfig: { endpoint: 'https://example.invalid/chat', apiKey: 'AUTO_RETRY_TEST_KEY' }, systemPrompt: 'system', userPrompt: 'user', retryDelayMs: 0 };
  const complete = () => new Response('data: {"choices":[{"delta":{"content":"完整结果"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
  try {
    for (const failure of ['network', 'http', 'partial']) {
      let calls = 0;
      const result = await defaultCallLlm({ ...args, fetchImpl: async (_url, options) => {
        assert.equal(JSON.parse(options.body).stream, true);
        if (++calls > 1) return complete();
        if (failure === 'network') throw new TypeError('fetch failed', { cause: Object.assign(new Error('Headers Timeout Error'), { code: 'UND_ERR_HEADERS_TIMEOUT' }) });
        if (failure === 'http') return new Response('暂时不可用', { status: 503 });
        return new Response('data: {"choices":[{"delta":{"content":"丢弃半成品"}}]}\n\n');
      } });
      assert.equal(result, '完整结果');
      assert.equal(calls, 2);
    }
    let attempts = 0;
    await assert.rejects(defaultCallLlm({ ...args, fetchImpl: async () => { attempts++; throw new TypeError('fetch failed'); } }), /已尝试 2 次/);
    assert.equal(attempts, 2);
    for (const response of [() => new Response('invalid key', { status: 401 }), () => new Response('data: {"choices":[{"delta":{"content":"截断"},"finish_reason":"length"}]}\n\n')]) {
      let calls = 0;
      await assert.rejects(defaultCallLlm({ ...args, fetchImpl: async () => { calls++; return response(); } }));
      assert.equal(calls, 1, 'permanent/truncated failures must not be retried');
    }
  } finally { delete process.env.AUTO_RETRY_TEST_KEY; }
});

test('automatic government weekly requests include verified geography, preserve custom prompts and source fields',async()=>{
  const row={id:160215,keyword:'江苏机关事务',sourceapi:'极致了api',source:'鹭岛后勤',
    link:'https://mp.weixin.qq.com/s?__biz=MzIwMTU0MzE1Nw%3D%3D&mid=123&idx=1',
    title:'我局交流活动',short_summary:'我局赴浙江省杭州市交流。',content:'我局赴浙江省杭州市交流。完整正文。',score:4};
  const before=structuredClone(row),outputDir=makeTempDir();
  try {
    const pool=makePool({'江苏机关事务':[row]});
    let received;
    const service=createAutoReportService({pool,config:baseConfig,outputDir,
      getWeeklyReportModel:require('../services/weeklyReportModelConfig.cjs').getWeeklyReportModel,
      callLlm:async p=>{received=p;return '完整测试报告';},renderPdf:async()=>Buffer.from('pdf')});
    const result=await service.generateReportForKeyword({keyword:'江苏机关事务',startDate:'2026-11-08',endDate:'2026-11-14',minScore:4,summaryVersion:'short'});
    assert.equal(result.status,'success');
    assert.match(received.userPrompt,/来源上下文[^\n]*鹭岛后勤[^\n]*福建省厦门市/);
    assert.ok(received.userPrompt.includes('我局赴浙江省杭州市交流。'));
    assert.match(received.systemPrompt,/账号辖区不等于事件发生地/);
    assert.match(pool.calls.find(c=>c.sql.includes('FROM scored_news')&&!c.sql.includes('COUNT')).sql,/\bsourceapi\b/);
    assert.deepEqual(row,before);
  } finally {fs.rmSync(outputDir,{recursive:true,force:true});}
});
