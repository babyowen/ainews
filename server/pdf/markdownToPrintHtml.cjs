const MarkdownIt = require('markdown-it');

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: false,
  typographer: false,
});

function renderMarkdownToPrintHtml(markdown = '') {
  return md
    .render(String(markdown || ''))
    .replace(/&lt;br\s*\/?&gt;/gi, '<br />');
}

module.exports = {
  renderMarkdownToPrintHtml,
};
