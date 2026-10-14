const assert = require('node:assert/strict');
const test = require('node:test');
const { renderWeeklyReportMarkdown: render } = require('../server/pdf/weeklyReportMarkdown.cjs');
const { renderMarkdownToPrintHtml: genericRender } = require('../server/pdf/markdownToPrintHtml.cjs');

test('historical chapter variants become equal-rank headings even without a blank before prose', () => {
  for (const line of ['一、当周新闻综述', '**一、当周新闻综述**', '##一、当周新闻综述', '# 一、当周新闻综述', '## 一、当周新闻综述', '### 一、当周新闻综述']) {
    assert.equal(render(`${line}\n本周综述内容。`), '<h2>一、当周新闻综述</h2>\n<p>本周综述内容。</p>\n', line);
  }
});

test('mixed historical chapters preserve wording, lower-level headings and content order', () => {
  const markdown = '一、当周新闻综述\n\n摘要。\n\n二、当周重点新闻情况\n\n### 1. 分类\n\n- **事件**详情。\n\n## 三、当周核心观点摘录\n\n观点。';
  const html = render(markdown);
  assert.equal((html.match(/<h2>/g) || []).length, 3);
  assert.match(html, /<h3>1\. 分类<\/h3>/);
  assert.match(html, /<li><strong>事件<\/strong>详情。<\/li>/);
  assert.ok(html.indexOf('摘要。') < html.indexOf('事件'));
});

test('two-chapter and custom explicit chapter structures are retained', () => {
  const html = render('# 一、当周新闻综述\n\n摘要。\n\n# 二、服务银行动态分类简述\n\n### 1. 江苏地区重点动态\n\n新闻。');
  assert.equal((html.match(/<h2>/g) || []).length, 2);
  assert.doesNotMatch(html, /三、|核心观点/);
  assert.match(render('# 一、其他主题专属章节'), /<h2>一、其他主题专属章节<\/h2>/);
  assert.equal(render('一、其他普通编号'), '<p>一、其他普通编号</p>\n');
  assert.equal(render('# 报告总标题'), '<h1>报告总标题</h1>\n');
  assert.equal(render('一、当周新闻综述\n==='), '<h2>一、当周新闻综述</h2>\n');
});

test('prose, lists, quotes, tables and code cannot be promoted accidentally', () => {
  const samples = [
    '正文提到一、当周新闻综述，不是章节。',
    '**一、当周新闻综述**是文中的示例。',
    '- 一、当周新闻综述',
    '1. 一、当周新闻综述',
    '- 新闻\n  - **一、当周新闻综述**',
    '> 一、当周新闻综述',
    '> # 一、当周新闻综述',
    '    一、当周新闻综述',
    '```markdown\n##一、当周新闻综述\n一、当周新闻综述\n```',
    '`一、当周新闻综述`',
    '正文 `跨行示例\n一、当周新闻综述\n结束`。',
    '| 列名 |\n| --- |\n| 一、当周新闻综述 |',
  ];
  for (const input of samples) assert.equal(render(input), genericRender(input), input);
});

test('shared policy renderer and HTML escaping retain their existing behavior', () => {
  assert.equal(genericRender('一、当周新闻综述'), '<p>一、当周新闻综述</p>\n');
  const html = render('一、当周新闻综述\n\n<script>alert(1)</script>\n\n换行<br>继续');
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /换行<br \/>继续/);
});
