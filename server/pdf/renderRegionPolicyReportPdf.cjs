const { PdfRendererUnavailableError, getPdfBrowser } = require('./playwrightBrowser.cjs');
const { buildFooterTemplate, formatGeneratedAt } = require('./reportPdfTemplate.cjs');
const { buildRegionPolicyReportPdfHtml } = require('./regionPolicyReportPdfTemplate.cjs');

function sanitizeFilenamePart(value = '') {
  return String(value || '')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildRegionPolicyReportPdfFilename({ title, startDate, date = new Date() }) {
  const dateText = startDate
    ? String(startDate).slice(0, 10)
    : date.toISOString().split('T')[0];
  const safeTitle = sanitizeFilenamePart(title || '地区政策报告');
  return `${safeTitle}_${dateText}.pdf`;
}

async function renderRegionPolicyReportPdf(payload) {
  const browser = await getPdfBrowser();
  const page = await browser.newPage({
    viewport: {
      width: 1280,
      height: 1800,
      deviceScaleFactor: 1,
    },
  });

  try {
    const generatedAt = formatGeneratedAt(new Date());
    const html = buildRegionPolicyReportPdfHtml({
      ...payload,
      generatedAt: payload.generatedAt || new Date().toISOString(),
    });

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
      printBackground: true,
      displayHeaderFooter: true,
      preferCSSPageSize: true,
      headerTemplate: '<div></div>',
      footerTemplate: buildFooterTemplate(generatedAt),
      margin: {
        top: '8mm',
        right: '8mm',
        bottom: '16mm',
        left: '8mm',
      },
    });
  } catch (error) {
    if (error instanceof PdfRendererUnavailableError) {
      throw error;
    }
    throw new Error(`地区政策报告 PDF 生成失败: ${error.message}`);
  } finally {
    await page.close().catch(() => {});
  }
}

module.exports = {
  PdfRendererUnavailableError,
  buildRegionPolicyReportPdfFilename,
  renderRegionPolicyReportPdf,
};
