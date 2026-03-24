const { chromium } = require('playwright');
const { renderMarkdownToPrintHtml } = require('./markdownToPrintHtml.cjs');
const { buildFooterTemplate, buildReportPdfHtml, formatGeneratedAt } = require('./reportPdfTemplate.cjs');

class PdfRendererUnavailableError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'PdfRendererUnavailableError';
    this.code = 'PDF_RENDERER_UNAVAILABLE';
    this.statusCode = 503;
    this.cause = cause;
  }
}

let browserPromise = null;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      args: [
        '--disable-dev-shm-usage',
        '--font-render-hinting=medium',
      ],
    }).then((browser) => {
      browser.on('disconnected', () => {
        browserPromise = null;
      });
      return browser;
    }).catch((error) => {
      browserPromise = null;
      throw new PdfRendererUnavailableError(`Playwright Chromium 启动失败: ${error.message}`, error);
    });
  }

  return browserPromise;
}

function sanitizeFilenamePart(value = '') {
  return String(value || '')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildReportPdfFilename({ keyword, modelName, date = new Date() }) {
  const dateText = date.toISOString().split('T')[0];
  const safeKeyword = sanitizeFilenamePart(keyword || '未命名');
  const safeModel = sanitizeFilenamePart(modelName || 'DeepSeek R1');
  return `AI新闻周报_${safeKeyword}_${safeModel}_${dateText}.pdf`;
}

async function renderReportPdf(payload) {
  const browser = await getBrowser();
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
