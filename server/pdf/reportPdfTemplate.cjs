function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return String(dateString);
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function formatGeneratedAt(date = new Date()) {
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function buildReportPdfHtml({ keyword, startDate, endDate, newsCount, modelName, reportContentHtml, includeContact = false }) {
  const reportTitle = keyword === '江苏省国资委' ? '省属国企新闻周报' : `${keyword}新闻周报`;
  const dateRange = `${formatDate(startDate)} - ${formatDate(endDate)}`;

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(reportTitle)}</title>
    <style>
      @page {
        size: A4;
      }

      :root {
        color-scheme: light;
        --ink: #1f344c;
        --ink-soft: #54687d;
        --line: rgba(27, 56, 90, 0.14);
        --accent: #38a6a5;
        --accent-deep: #203547;
        --paper: #ffffff;
        --panel: #f4f7fb;
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        padding: 0;
        background: var(--paper);
        color: var(--ink);
        font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans SC", "Source Han Sans SC", sans-serif;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      body {
        font-size: 12pt;
        line-height: 1.84;
      }

      .report-document {
        width: 100%;
      }

      .report-cover {
        position: relative;
        margin: 0 0 12mm;
        padding: 11mm 13mm 8.5mm;
        border-radius: 7mm;
        overflow: hidden;
        color: #ffffff;
        background:
          radial-gradient(circle at right top, rgba(123, 191, 255, 0.28), transparent 28%),
          linear-gradient(135deg, #203547 0%, #1f5d68 58%, #38a6a5 100%);
      }

      .report-cover::after {
        content: "";
        position: absolute;
        inset: auto -18mm -22mm auto;
        width: 52mm;
        height: 52mm;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.12);
      }

      .report-cover-inner {
        position: relative;
        z-index: 1;
      }

      .report-brand {
        display: inline-flex;
        align-items: center;
        padding: 2.5mm 4.5mm;
        margin-bottom: 3.4mm;
        border-radius: 999px;
        border: 0.35mm solid rgba(255, 255, 255, 0.18);
        background: rgba(255, 255, 255, 0.10);
        font-size: 9pt;
        font-weight: 600;
        letter-spacing: 0.08em;
      }

      .report-title {
        margin: 0 0 2.1mm;
        max-width: 125mm;
        font-size: 27pt;
        line-height: 1.12;
        font-weight: 800;
        letter-spacing: 0.02em;
      }

      .report-subtitle {
        margin: 0;
        max-width: 110mm;
        color: rgba(255, 255, 255, 0.84);
        font-size: 10.5pt;
        line-height: 1.62;
      }

      .report-meta {
        display: grid;
        grid-template-columns: minmax(56mm, 1.5fr) minmax(32mm, 0.75fr) minmax(38mm, 1fr);
        gap: 3mm;
        margin-top: 5.5mm;
        max-width: 100%;
      }

      .report-meta-card {
        padding: 3.2mm 4mm;
        border-radius: 4.5mm;
        background: rgba(255, 255, 255, 0.94);
        color: var(--ink);
      }

      .report-meta-label {
        display: block;
        margin-bottom: 1.5mm;
        color: #667b92;
        font-size: 7.7pt;
        letter-spacing: 0.08em;
      }

      .report-meta-value {
        display: block;
        font-size: 10.8pt;
        line-height: 1.4;
        font-weight: 700;
      }

      .report-contact {
        margin-top: 3.2mm;
        text-align: right;
        color: rgba(255, 255, 255, 0.66);
        font-size: 7.5pt;
        line-height: 1.45;
        letter-spacing: 0.01em;
      }

      .report-body {
        width: 100%;
      }

      .report-body > :first-child {
        margin-top: 0;
      }

      .report-body h1,
      .report-body h2,
      .report-body h3,
      .report-body h4 {
        color: var(--accent-deep);
        font-weight: 700;
        letter-spacing: 0.02em;
        page-break-after: avoid;
        break-after: avoid-page;
      }

      .report-body h1 {
        margin: 0 0 4.5mm;
        padding-bottom: 2.6mm;
        border-bottom: 0.55mm solid rgba(39, 98, 175, 0.18);
        font-size: 24pt;
        line-height: 1.24;
      }

      .report-body h2 {
        margin: 8mm 0 3mm;
        font-size: 18pt;
        line-height: 1.34;
      }

      .report-body h3 {
        margin: 6mm 0 2.4mm;
        font-size: 14pt;
        line-height: 1.42;
      }

      .report-body h4 {
        margin: 4.5mm 0 2mm;
        font-size: 12pt;
        line-height: 1.48;
        color: #45617f;
      }

      .report-body p,
      .report-body ul,
      .report-body ol,
      .report-body blockquote,
      .report-body pre,
      .report-body table {
        margin: 0 0 3.8mm;
      }

      .report-body p {
        text-align: justify;
        color: #2b3f56;
        orphans: 3;
        widows: 3;
      }

      .report-body ul,
      .report-body ol,
      .report-body blockquote,
      .report-body pre,
      .report-body table {
        page-break-inside: avoid;
        break-inside: avoid;
      }

      .report-body ul,
      .report-body ol {
        padding-left: 6mm;
      }

      .report-body li {
        margin: 0 0 2.3mm;
        color: #2b3f56;
        orphans: 2;
        widows: 2;
      }

      .report-body strong {
        color: #173453;
        font-weight: 700;
      }

      .report-body em {
        color: #50647c;
        font-style: italic;
      }

      .report-body a {
        color: #1b65c2;
        text-decoration: none;
      }

      .report-body blockquote {
        padding: 3.5mm 4mm;
        border-left: 0.9mm solid var(--accent);
        border-radius: 0 3.2mm 3.2mm 0;
        background: linear-gradient(90deg, rgba(46, 121, 216, 0.08), rgba(46, 121, 216, 0.015));
      }

      .report-body pre {
        padding: 3.6mm 4mm;
        border: 0.35mm solid rgba(23, 52, 87, 0.08);
        border-radius: 3.2mm;
        background: var(--panel);
        white-space: pre-wrap;
        word-break: break-word;
        font-size: 9.5pt;
        line-height: 1.7;
        font-family: "SFMono-Regular", "Consolas", "Liberation Mono", monospace;
      }

      .report-body code {
        padding: 0.5mm 1.3mm;
        border-radius: 1.4mm;
        background: rgba(23, 52, 83, 0.08);
        color: #134574;
        font-size: 9.4pt;
        font-family: "SFMono-Regular", "Consolas", "Liberation Mono", monospace;
      }

      .report-body hr {
        margin: 5.2mm 0;
        border: 0;
        border-top: 0.35mm solid var(--line);
      }

      .report-body table {
        width: 100%;
        border-collapse: collapse;
      }

      .report-body th,
      .report-body td {
        padding: 2.4mm 2.8mm;
        border: 0.35mm solid rgba(23, 52, 87, 0.10);
        text-align: left;
        vertical-align: top;
      }

      .report-body th {
        background: #f3f7fb;
        color: #1f3d5e;
        font-weight: 700;
      }
    </style>
  </head>
  <body>
    <main class="report-document">
      <section class="report-cover">
        <div class="report-cover-inner">
          <div class="report-brand">AI新闻周报</div>
          <h1 class="report-title">${escapeHtml(reportTitle)}</h1>
          <p class="report-subtitle">人工智能驱动的新闻分析与洞察</p>
          <div class="report-meta">
            <div class="report-meta-card">
              <span class="report-meta-label">时间区间</span>
              <strong class="report-meta-value">${escapeHtml(dateRange)}</strong>
            </div>
            <div class="report-meta-card">
              <span class="report-meta-label">新闻数量</span>
              <strong class="report-meta-value">${escapeHtml(newsCount)} 条</strong>
            </div>
            <div class="report-meta-card">
              <span class="report-meta-label">AI 模型</span>
              <strong class="report-meta-value">${escapeHtml(modelName || 'DeepSeek R1')}</strong>
            </div>
          </div>
          ${includeContact ? '<div class="report-contact">定制关键词联系人：顾芷西-13305150560</div>' : ''}
        </div>
      </section>

      <article class="report-body">
        ${reportContentHtml}
      </article>
    </main>
  </body>
</html>`;
}

function buildFooterTemplate(generatedAtText) {
  return `
    <div style="
      width: 100%;
      font-size: 9px;
      color: #6c8098;
      padding: 0 10mm;
      box-sizing: border-box;
      font-family: 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif;
      display: flex;
      align-items: center;
      justify-content: space-between;
    ">
      <span>${escapeHtml(generatedAtText)}</span>
      <span>
        第 <span class="pageNumber"></span> / <span class="totalPages"></span> 页
      </span>
    </div>
  `;
}

module.exports = {
  buildFooterTemplate,
  buildReportPdfHtml,
  formatGeneratedAt,
};
