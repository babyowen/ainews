const MarkdownIt = require('markdown-it');

// Historical weekly reports sometimes omit the Markdown heading marker. Keep this
// compatibility rule local to weekly PDFs, and only promote exact chapter names.
const LEGACY_CHAPTERS = new Set([
  '一、当周新闻综述',
  '二、当周重点新闻情况',
  '三、当周核心观点摘录',
  '二、服务银行动态分类简述',
]);

function legacyChapter(state, startLine, endLine, silent) {
  if (silent || state.level !== 0 || state.sCount[startLine] >= 4) return false;
  // Let Markdown handle an existing setext heading, including its underline.
  if (startLine + 1 < endLine) {
    const next = state.src.slice(state.bMarks[startLine + 1], state.eMarks[startLine + 1]);
    if (/^ {0,3}(?:=+|-+)\s*$/.test(next)) return false;
  }
  const start = state.bMarks[startLine] + state.tShift[startLine];
  let title = state.src.slice(start, state.eMarks[startLine]).trim();
  title = title.replace(/^#{1,6}\s*/, '');
  if (title.startsWith('**') && title.endsWith('**')) title = title.slice(2, -2).trim();
  if (!LEGACY_CHAPTERS.has(title)) return false;

  const open = state.push('heading_open', 'h2', 1);
  open.map = [startLine, startLine + 1];
  open.markup = '##';
  const inline = state.push('inline', '', 0);
  inline.content = title;
  inline.map = open.map;
  inline.children = [];
  state.push('heading_close', 'h2', -1).markup = '##';
  state.line = startLine + 1;
  return true;
}

const md = new MarkdownIt({ html: false, linkify: true, breaks: false, typographer: false });
// Only recognize a new block, never interrupt an existing prose paragraph or
// a multiline inline-code span merely because it mentions a chapter name.
md.block.ruler.before('lheading', 'weekly_chapter', legacyChapter);

function renderWeeklyReportMarkdown(markdown = '') {
  const tokens = md.parse(String(markdown || ''), {});
  // Explicit top-level Chinese-numbered chapters may use #, ## or ###. Their
  // rank is a weekly chapter; preserve custom wording and all nested headings.
  for (let i = 0; i < tokens.length - 2; i += 1) {
    const open = tokens[i];
    if (open.type !== 'heading_open' || open.level !== 0) continue;
    const inline = tokens[i + 1];
    const text = inline.children.map(token => token.content).join('');
    if (/^[一二三四五六七八九十百]+、\S/.test(text)) {
      open.tag = 'h2';
      tokens[i + 2].tag = 'h2';
    }
  }
  return md.renderer.render(tokens, md.options, {}).replace(/&lt;br\s*\/?&gt;/gi, '<br />');
}

module.exports = { renderWeeklyReportMarkdown };
