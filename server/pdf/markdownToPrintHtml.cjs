const MarkdownIt = require('markdown-it');

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: false,
  typographer: false,
});

const mdBreaks = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: false,
});

function renderMarkdownToPrintHtml(markdown = '', options = {}) {
  const renderer = options.breaks ? mdBreaks : md;
  return renderer
    .render(String(markdown || ''))
    .replace(/&lt;br\s*\/?&gt;/gi, '<br />');
}

module.exports = {
  renderMarkdownToPrintHtml,
};
