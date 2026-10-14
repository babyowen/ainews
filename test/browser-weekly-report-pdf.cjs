// Optional real-Chromium regression. No DB, model calls, config writes or cron.
// Requires Poppler: PDFTOTEXT_BIN=/path/to/pdftotext node test/browser-weekly-report-pdf.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { renderReportPdf } = require('../server/pdf/renderReportPdf.cjs');
const { getPdfBrowser } = require('../server/pdf/playwrightBrowser.cjs');
const { buildReportPdfHtml } = require('../server/pdf/reportPdfTemplate.cjs');
const { renderWeeklyReportMarkdown } = require('../server/pdf/weeklyReportMarkdown.cjs');

const output = process.env.PDF_TEST_OUTPUT_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'weekly-pdf-'));
const markers = [];
function marker(prefix, i) {
  const value = `${prefix}${String(i).padStart(3, '0')}`;
  markers.push(value);
  return value;
}
const lines = [
  '一、当周新闻综述', '本周新闻综述测试内容。', '',
  '## 二、当周重点新闻情况', '', '### 1. 长列表', '',
  ...Array.from({ length: 24 }, (_, i) => `- ${marker('LIST', i)} 这是需要完整保留的新闻内容。${'正文说明。'.repeat(10)}`), '',
  '### 2. 嵌套列表', '', '- 父条目',
  ...Array.from({ length: 16 }, (_, i) => `  - ${marker('NEST', i)} 嵌套新闻条目。${'新闻详情。'.repeat(6)}`), '',
  '### 3. 长引用', '',
  ...Array.from({ length: 22 }, (_, i) => `> ${marker('QUOTE', i)} ${'引用内容完整保留。'.repeat(5)}\n>`), '',
  '### 4. 长表格', '', '| TABLE_HEADER | 内容 |', '| --- | --- |',
  ...Array.from({ length: 40 }, (_, i) => `| ${marker('ROW', i)} | ${'表格内容。'.repeat(8)} |`),
  `| ${marker('TALL', 0)} | ${Array.from({ length: 65 }, (_, i) => `${marker('CELL', i)} ${'单行内容跨页保留。'.repeat(5)}`).join('<br>')} |`, '',
  '### 5. 超过一页的单条新闻', '',
  `- ${Array.from({ length: 65 }, (_, i) => `${marker('ITEM', i)} ${'同一条新闻的详细内容。'.repeat(4)}`).join(' ')}`, '',
  '### 6. 长代码块', '', '```text',
  ...Array.from({ length: 65 }, (_, i) => `${marker('CODE', i)} 示例文本`), '```', '',
  '## 三、当周核心观点摘录', '', '- 最后观点。', '', '*总结内容完整保留。*',
];
const payload = {
  keyword: '排版回归测试', startDate: '2026-10-04', endDate: '2026-10-10',
  newsCount: 1, modelName: '固定正文，无模型调用', reportContent: lines.join('\n'), includeContact: false,
};

(async () => {
  const browser = await getPdfBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(buildReportPdfHtml({ ...payload, reportContentHtml: renderWeeklyReportMarkdown(payload.reportContent) }));
    await page.emulateMedia({ media: 'print' });
    const headings = await page.locator('.report-body h2').evaluateAll(nodes => nodes.map(node => ({
      text: node.textContent, size: getComputedStyle(node).fontSize, weight: getComputedStyle(node).fontWeight,
    })));
    assert.equal(headings.length, 3);
    assert.ok(headings.every(h => h.size === '24px' && h.weight === '700'));
    await page.close();

    fs.mkdirSync(output, { recursive: true });
    const pdf = path.join(output, 'pagination-edge-cases.pdf');
    fs.writeFileSync(pdf, await renderReportPdf(payload));
    const text = execFileSync(process.env.PDFTOTEXT_BIN || 'pdftotext', ['-layout', pdf, '-'], { encoding: 'utf8' });
    for (const value of markers) {
      assert.equal(text.split(value).length - 1, 1, `${value} must appear exactly once, including oversized rows/items`);
    }
    assert.ok(text.split('TABLE_HEADER').length - 1 >= 2, 'A split table must repeat its header');
    const pages = text.split('\f').filter(p => p.trim());
    assert.ok(pages.length > 3, 'Fixture must exercise pagination');
    for (const [i, content] of pages.entries()) {
      assert.ok(content.replace(/第\s*\d+\s*\/\s*\d+\s*页/g, '').replace(/\d{4}\/\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}/g, '').trim(), `Page ${i + 1} must have body content`);
    }
    console.log(JSON.stringify({ status: 'passed', markers: markers.length, pages: pages.length, pdf }));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
