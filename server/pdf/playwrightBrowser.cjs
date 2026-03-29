const { chromium } = require('playwright');

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

async function getPdfBrowser() {
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

module.exports = {
  PdfRendererUnavailableError,
  getPdfBrowser,
};
