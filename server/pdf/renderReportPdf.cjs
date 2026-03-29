const { renderMarkdownToPrintHtml } = require('./markdownToPrintHtml.cjs');
const { PdfRendererUnavailableError, getPdfBrowser } = require('./playwrightBrowser.cjs');
const { buildFooterTemplate, buildReportPdfHtml, formatGeneratedAt } = require('./reportPdfTemplate.cjs');

function sanitizeFilenamePart(value = '') {
  return String(value || '')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildReportPdfFilename({ keyword, modelName, includeContact = false, date = new Date() }) {
  const dateText = date.toISOString().split('T')[0];
  const safeKeyword = sanitizeFilenamePart(keyword || '未命名');
  const safeModel = sanitizeFilenamePart(modelName || 'DeepSeek R1');
  const contactSuffix = includeContact ? '_带联系方式' : '';
  return `AI新闻周报_${safeKeyword}_${safeModel}${contactSuffix}_${dateText}.pdf`;
}

async function renderReportPdf(payload) {
  const browser = await getPdfBrowser();
  const page = await browser.newPage({
    viewport: {
      width: 1240,
      height: 1754,
      deviceScaleFactor: 1,
    },
  });

  try {
    const generatedAt = formatGeneratedAt(new Date());
    const reportContentHtml = renderMarkdownToPrintHtml(payload.reportContent);
    const html = buildReportPdfHtml({
      ...payload,
      reportContentHtml,
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
        top: '14mm',
        right: '14mm',
        bottom: '18mm',
        left: '14mm',
      },
    });
  } catch (error) {
    if (error instanceof PdfRendererUnavailableError) {
      throw error;
    }
    throw new Error(`PDF 生成失败: ${error.message}`);
  } finally {
    await page.close().catch(() => {});
  }
}

module.exports = {
  buildReportPdfFilename,
  PdfRendererUnavailableError,
  renderReportPdf,
};
