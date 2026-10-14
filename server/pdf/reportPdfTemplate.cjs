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

function formatDateRange(startDate, endDate) {
  const start = formatDate(startDate).replace(/\//g, '.');
  const end = formatDate(endDate).replace(/\//g, '.');
  const sameYear = /^\d{4}\.\d{2}\.\d{2}$/.test(start)
    && /^\d{4}\.\d{2}\.\d{2}$/.test(end)
    && start.slice(0, 4) === end.slice(0, 4);
  return `${start} - ${sameYear ? end.slice(5) : end}`;
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
  const dateRange = formatDateRange(startDate, endDate);
  const modelLabel = String(modelName || 'DeepSeek R1');

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
        line-height: 1.8;
      }

      .report-document {
        width: 100%;
      }

      .report-cover {
        position: relative;
        margin: 0 0 9mm;
        padding: 8mm 10mm 6mm;
        border-radius: 2.5mm;
        border-top: 1mm solid #5ba7a7;
        overflow: hidden;
        color: #ffffff;
        background: linear-gradient(115deg, #192f40 0%, #244958 100%);
        page-break-inside: avoid;
        break-inside: avoid;
      }

      .report-brand {
        display: flex;
        align-items: center;
        gap: 2.5mm;
        margin-bottom: 3.5mm;
        color: #b5d4d8;
        font-size: 8pt;
        font-weight: 600;
        letter-spacing: 0.16em;
      }

      .report-brand::before {
        content: "";
        width: 7mm;
        height: 0.5mm;
        background: #78b9b7;
      }

      .report-title {
        margin: 0 0 2.5mm;
        font-size: 31.5pt;
        line-height: 1.25;
        font-weight: 700;
        letter-spacing: 0.025em;
        overflow-wrap: anywhere;
      }

      .report-subtitle {
        margin: 0;
        color: #bbccd4;
        font-size: 9pt;
        line-height: 1.6;
        letter-spacing: 0.04em;
      }

      .report-meta {
        display: grid;
        grid-template-columns: minmax(0, 1.08fr) minmax(0, 0.52fr) minmax(0, 1.4fr);
        gap: 4mm;
        margin-top: 5mm;
        padding-top: 4mm;
        border-top: 0.25mm solid rgba(214, 233, 239, 0.25);
      }

      .report-meta-card {
        min-width: 0;
      }

      .report-meta-card + .report-meta-card {
        border-left: 0.25mm solid rgba(214, 233, 239, 0.22);
        padding-left: 4mm;
      }

      .report-meta-label {
        display: block;
        margin-bottom: 1.2mm;
        color: #b2c8d1;
        font-size: 7.5pt;
        line-height: 1.4;
        letter-spacing: 0.08em;
      }

      .report-meta-value {
        display: block;
        color: #ffffff;
        font-size: 10.5pt;
        line-height: 1.4;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        overflow-wrap: anywhere;
      }

      .report-model-value {
        white-space: nowrap;
      }

      /* Preserve unusually long custom model labels instead of clipping them. */
      .report-model-value.is-long {
        white-space: normal;
        font-size: 9.5pt;
      }

      .report-contact {
        margin-top: 3.5mm;
        text-align: right;
        color: #b2c8d1;
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
        margin: 7mm 0 3mm;
        font-size: 18pt;
        line-height: 1.34;
      }

      .report-body h3 {
        margin: 5mm 0 2.4mm;
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

      /* Keep a concluding italic summary together instead of a one-line tail. */
      .report-body > p:last-child:has(> em:only-child) {
        page-break-inside: avoid;
        break-inside: avoid;
      }

      .report-body ul,
      .report-body ol,
      .report-body blockquote,
      .report-body pre,
      .report-body table {
        page-break-inside: auto;
        break-inside: auto;
      }

      .report-body ul,
      .report-body ol {
        padding-left: 6mm;
      }

      .report-body li {
        margin: 0 0 2mm;
        color: #2b3f56;
        orphans: 2;
        widows: 2;
        page-break-inside: avoid;
        break-inside: avoid;
      }

      /* A parent list item must not keep its entire nested list together. */
      .report-body li:has(> ul),
      .report-body li:has(> ol) {
        page-break-inside: auto;
        break-inside: auto;
      }

      .report-body li:last-child {
        margin-bottom: 0;
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

      .report-body thead {
        display: table-header-group;
      }

      .report-body tr {
        page-break-inside: avoid;
        break-inside: avoid;
      }
    </style>
  </head>
  <body>
    <main class="report-document">
      <section class="report-cover">
        <div class="report-cover-inner">
          <div class="report-brand">AI新闻周报</div>
          <h1 class="report-title">${escapeHtml(reportTitle)}</h1>
          <p class="report-subtitle">每周要闻 · 行业动态 · 重点洞察</p>
          <div class="report-meta">
            <div class="report-meta-card">
              <span class="report-meta-label">报告周期</span>
              <strong class="report-meta-value">${escapeHtml(dateRange)}</strong>
            </div>
            <div class="report-meta-card">
              <span class="report-meta-label">新闻数量</span>
              <strong class="report-meta-value">${escapeHtml(newsCount)} 条</strong>
            </div>
            <div class="report-meta-card">
              <span class="report-meta-label">AI 模型</span>
              <strong class="report-meta-value report-model-value${modelLabel.length > 28 ? ' is-long' : ''}">${escapeHtml(modelLabel)}</strong>
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
  formatDateRange,
};
