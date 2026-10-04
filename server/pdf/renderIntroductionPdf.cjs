const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { getPdfBrowser } = require('./playwrightBrowser.cjs');

const contentUrl = pathToFileURL(path.join(__dirname, '../../src/introduction/content.mjs')).href;
const stylesheetPath = path.join(__dirname, '../../src/introduction/introduction.css');
const parts = new Set(['general', 'fund', 'all']);

function isIntroductionPart(part) { return parts.has(part); }

async function buildIntroductionPdfHtml(part) {
  if (!isIntroductionPart(part)) throw new Error('无效的介绍导出范围');
  const { renderIntroductionPages, introductionParts } = await import(contentUrl);
  const css = fs.readFileSync(stylesheetPath, 'utf8');
  // Embed only our bundled screenshots; PDF generation remains network-free.
  const markup = renderIntroductionPages(part).replace(/src="\/introduction-assets\/(news|weekly|regions|business|yangzhou)\.jpg"/g, (_, name) => {
    const image = fs.readFileSync(path.join(__dirname, '../../public/introduction-assets', `${name}.jpg`));
    return `src="data:image/jpeg;base64,${image.toString('base64')}"`;
  });
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><title>KeyDigest · ${introductionParts[part].shortLabel}</title><style>${css}</style></head><body><main class="intro-book">${markup}</main></body></html>`;
}

async function renderIntroductionPdf(part) {
  const html = await buildIntroductionPdfHtml(part);
  const browser = await getPdfBrowser();
  const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
  try {
    // This booklet is self-contained; never fetch external content while rendering.
    await page.route('**/*', route => route.abort());
    await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
    await page.emulateMedia({ media: 'print', reducedMotion: 'reduce' });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(Array.from(document.images, image => image.decode()));
    });
    return await page.pdf({ printBackground: true, preferCSSPageSize: true, timeout: 30000 });
  } finally {
    await page.close();
  }
}
module.exports = { isIntroductionPart, buildIntroductionPdfHtml, renderIntroductionPdf };
