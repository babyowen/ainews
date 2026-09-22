const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const test = require('node:test');
const root = path.resolve(__dirname, '..');
const actualRequire = createRequire(path.join(root, 'server.cjs'));
const actualPolicy = actualRequire('./services/policyExtraction.cjs');
const policy = { 政策领域: [{ 政策类别: [{ 政策明细: [{ 内容: '额度80万元' }] }] }] };

// Execute actual registered routes with isolated SQL and model clients; never connect to production DB.
function loadApp({ failure, completion = '完整报告' } = {}) {
  const calls = [];
  const writes = [];
  const model = {
    redactError: String,
    async completeChat(messages, options) {
      calls.push({ messages, options });
      if (failure) throw new Error(failure);
      return options?.extra?.response_format ? JSON.stringify(policy) : completion;
    },
    async streamChat(messages, onDelta, options) {
      calls.push({ messages, options });
      onDelta('content', failure ? '部分内容' : completion);
      if (failure) throw new Error(failure);
      return completion;
    },
  };
  const fakePool = { async query(sql, args) {
    if (sql.includes('INSERT INTO weekly_reports')) { writes.push(args); return [{ insertId: 1 }]; }
    if (sql.includes('FROM scored_news')) return [[{
      id: 1, region: '南京', title: '南京提高公积金贷款额度', content: '南京发布新政策，提高公积金贷款额度至80万元。',
      short_summary: '南京发布新政策，提高贷款额度至80万元。', fetchdate: '2026-09-15', score: 5,
    }]];
    throw new Error(`Unexpected SQL in model route test: ${sql}`);
  } };
  function isolatedRequire(name) {
    if (name === 'dotenv') return { config() {} };
    if (name === 'mysql2/promise') return { createPool: () => fakePool };
    if (name === 'node-cron') return { schedule() { throw new Error('Tests must not start scheduled jobs'); } };
    if (name === './services/modelClient.cjs') return model;
    if (name === './services/policyExtraction.cjs') return {
      ...actualPolicy,
      extractPolicy: (system, user, options) => actualPolicy.extractPolicy(system, user, { ...options, call: model.completeChat }),
    };
    return actualRequire(name);
  }
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'server.cjs'), 'utf8'), {
    require: isolatedRequire, module, __dirname: root, process, Buffer,
    console: { log() {}, warn() {}, error() {} },
  }, { filename: 'server.cjs' });
  const app = module.exports;
  async function request(url, body, method = 'post') {
    const layer = app._router.stack.find(layer => layer.route?.methods[method] && (
      Array.isArray(layer.route.path) ? layer.route.path.includes(url) : layer.route.path === url
    ));
    assert.ok(layer, `route exists: ${url}`);
    const res = {
      statusCode: 200, headersSent: false, text: '',
      status(code) { this.statusCode = code; return this; },
      json(data) { this.data = data; return this; },
      setHeader() {}, flushHeaders() { this.headersSent = true; },
      write(text) { this.text += text; }, end() {},
    };
    await layer.route.stack[0].handle({ body, query: {}, headers: {} }, res);
    return res;
  }
  return { calls, writes, request };
}
const reportBody = { keyword: '公积金', startDate: '2026-09-13', endDate: '2026-09-19', selectedNews: [{ title: '政策新闻', content: '测试政策正文' }], modelKey: 'deepseek-v4-pro' };

test('manual and legacy KIMI/SiliconFlow report routes use the unified model and save its real ID', async () => {
  for (const route of ['/api/generate-report', '/api/generate-kimi-report', '/api/generate-siliconflow-report']) {
    const app = loadApp();
    const res = await app.request(route, reportBody);
    assert.equal(res.statusCode, 200);
    assert.equal(app.calls[0].options.modelConfig.model, 'DeepSeek-V4.1-Flash');
    assert.equal(app.writes[0][4], 'DeepSeek-V4.1-Flash');
    assert.equal(res.data.debug.model, 'DeepSeek V4.1 Flash');
  }
});

test('failed/truncated manual reports are not saved and expose an actionable error', async () => {
  for (const stream of [false, true]) {
    const app = loadApp({ failure: '模型输出已截断' });
    const res = await app.request('/api/generate-report', { ...reportBody, stream });
    assert.equal(app.writes.length, 0);
    if (stream) {
      assert.match(res.text, /"type":"error"/);
      assert.doesNotMatch(res.text, /"type":"done"/);
    } else {
      assert.equal(res.statusCode, 500);
      assert.match(res.data.details, /截断/);
    }
  }
});

test('streaming success is saved once and includes a done event', async () => {
  const app = loadApp();
  const res = await app.request('/api/generate-report', { ...reportBody, stream: true });
  assert.equal(app.writes.length, 1);
  assert.match(res.text, /"type":"done"/);
});

test('report modification uses the same provider for both transport modes', async () => {
  for (const stream of [false, true]) {
    const app = loadApp();
    const res = await app.request('/api/modify-report', { ...reportBody, originalReport: '报告', modifyRequest: '精简', stream });
    assert.equal(res.statusCode, 200);
    assert.equal(app.calls[0].options.modelConfig.provider, 'agent-router');
    assert.equal(app.writes.length, 0);
  }
});

test('policy extraction/compare reject empty inputs and use unified configuration', async () => {
  const app = loadApp();
  let res = await app.request('/api/policy/compare', { extractedPolicy: {} });
  assert.equal(res.statusCode, 400);
  assert.equal(app.calls.length, 0);
  res = await app.request('/api/policy/extract', { reportContent: '测试周报', modelKey: 'deepseek-v4-pro' });
  assert.equal(res.statusCode, 200);
  assert.equal(actualPolicy.countPolicyDetails(res.data.result), 1);
  assert.equal(app.calls[0].options.modelConfig.provider, 'agent-router');
  res = await app.request('/api/policy/compare', { extractedPolicy: policy, currentPolicy: policy });
  assert.equal(res.statusCode, 200);
  assert.equal(res.data.debug.modelId, 'DeepSeek-V4.1-Flash');
  assert.equal(app.writes.length, 0);
});

test('region reports retain filtering and route the actual generation to the unified model', async () => {
  const app = loadApp();
  const res = await app.request('/api/policy/region-report/generate', {
    startDate: '2026-09-13', endDate: '2026-09-19', regions: [{ name: '南京', level: 'city' }],
    manualOverrides: { 1: true },
  });
  assert.equal(res.statusCode, 200, JSON.stringify(res.data));
  assert.equal(res.data.meta.modelName, 'DeepSeek-V4.1-Flash');
  assert.equal(app.calls[0].options.modelConfig.provider, 'agent-router');
});
