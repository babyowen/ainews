const { PdfRendererUnavailableError, getPdfBrowser } = require('./playwrightBrowser.cjs');
const { buildFooterTemplate, formatGeneratedAt } = require('./reportPdfTemplate.cjs');
const { buildPolicyComparisonPdfHtml } = require('./policyComparisonPdfTemplate.cjs');

function sanitizeFilenamePart(value = '') {
  return String(value || '')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildPolicyComparisonPdfFilename({ title, startDate, date = new Date() }) {
  const dateText = startDate
    ? String(startDate).slice(0, 10)
    : date.toISOString().split('T')[0];
  const safeTitle = sanitizeFilenamePart(title || '政策对比周报');
  return `${safeTitle}_${dateText}.pdf`;
}

async function renderPolicyComparisonPdf(payload) {
  const browser = await getPdfBrowser();
  const page = await browser.newPage({
    viewport: {
      width: 1600,
      height: 1100,
      deviceScaleFactor: 1,
    },
  });

  try {
    const generatedAt = formatGeneratedAt(new Date());
    const html = buildPolicyComparisonPdfHtml(payload);

    await page.setContent(html, {
      waitUntil: 'load',
    });
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(async () => {
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }
    });

    return await page.pdf({
      format: 'A4',
      landscape: true,
      printBackground: true,
      displayHeaderFooter: true,
      preferCSSPageSize: true,
      headerTemplate: '<div></div>',
      footerTemplate: buildFooterTemplate(generatedAt),
      margin: {
        top: '10mm',
        right: '10mm',
        bottom: '16mm',
        left: '10mm',
      },
    });
  } catch (error) {
    if (error instanceof PdfRendererUnavailableError) {
      throw error;
    }
    throw new Error(`政策对比 PDF 生成失败: ${error.message}`);
  } finally {
    await page.close().catch(() => {});
  }
}

module.exports = {
  buildPolicyComparisonPdfFilename,
  renderPolicyComparisonPdf,
};
