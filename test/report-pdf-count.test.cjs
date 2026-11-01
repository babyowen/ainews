const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createIsolatedApp } = require('./helpers/isolatedApp.cjs');
const { buildReportPdfHtml } = require('../server/pdf/reportPdfTemplate.cjs');

test('manual standard/contact PDF counts all period news on the server regardless of supplied denominator', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-count-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const configDir = path.join(dir, 'config');
  fs.cpSync(path.join(__dirname, '../config'), configDir, { recursive: true, filter: p => !p.split(path.sep).includes('runtime') });
  const calls = [];
  const payloads = [];
  const request = createIsolatedApp({ configDir, dataDir: dir,
    pool: { async query(sql, params) { calls.push({ sql, params }); return [[{ total_news_count: 123 }]]; } },
    reportPdfRenderer: async payload => { payloads.push(payload); return Buffer.from('pdf'); } });
  for (const includeContact of [false, true]) {
    const result = await request('POST', '/api/reports/export-pdf', { keyword: '公积金', startDate: '2026-10-25', endDate: '2026-10-31', newsCount: 21,
      totalNewsCount: 999, modelName: '测试模型', reportContent: '测试报告', includeContact });
    assert.equal(result.status, 200);
    const payload = payloads.at(-1);
    assert.equal(payload.newsCount, 21);
    assert.equal(payload.totalNewsCount, 123);
    assert.equal(payload.includeContact, includeContact);
    assert.deepEqual(calls.at(-1).params, ['公积金', '2026-10-25', '2026-10-31']);
    assert.doesNotMatch(calls.at(-1).sql, /\bscore\b|LIMIT/);
  }
});

test('all PDF variants show selected/total and never invent a historical total', () => {
  for (const includeContact of [false, true]) {
    const html = buildReportPdfHtml({ keyword: '公积金', newsCount: 21, totalNewsCount: 123, includeContact, reportContentHtml: '<p>正文</p>' });
    assert.match(html, /<span>21<\/span><span class="report-news-total">\/123<\/span>/);
    assert.match(html, /\.report-news-count\s*\{\s*white-space: nowrap/);
  }
  assert.match(buildReportPdfHtml({ newsCount: 21 }), /report-news-total">\/—/);
});
