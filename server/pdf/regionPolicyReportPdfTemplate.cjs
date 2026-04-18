const { renderMarkdownToPrintHtml } = require('./markdownToPrintHtml.cjs');

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripMarkdownFences(content = '') {
  const text = String(content || '').trim();
  const fenceMatch = text.match(/^```(?:markdown)?\s*\n?([\s\S]*?)\n?```\s*$/i);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }
  return text;
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

function joinRegions(regions = []) {
  const safeRegions = Array.isArray(regions) ? regions.filter(Boolean) : [];
  return safeRegions.length > 0 ? safeRegions.join('、') : '未选择';
}

function buildMetaCard(label, value) {
  return `
    <div class="meta-card">
      <div class="meta-label">${escapeHtml(label)}</div>
      <div class="meta-value">${escapeHtml(value)}</div>
    </div>
  `;
}

function buildReferenceList(references = []) {
  const safeReferences = Array.isArray(references) ? references.filter((item) => item?.title) : [];
  if (safeReferences.length === 0) {
    return '';
  }

  return `
    <section class="reference-shell">
      <div class="reference-head">
        <div class="reference-title">参考新闻</div>
        <div class="reference-subtitle">以下条目为本次报告纳入分析的新闻样本清单</div>
      </div>
      <ol class="reference-list">
        ${safeReferences.map((item) => `
          <li>
            <span class="ref-title">${escapeHtml(item.title)}</span>
            <span class="ref-meta">${escapeHtml([
              item.date ? `日期：${item.date}` : '',
              item.source ? `来源：${item.source}` : '',
              item.region ? `地区：${item.region}` : '',
            ].filter(Boolean).join(' ｜ '))}</span>
          </li>
        `).join('')}
      </ol>
    </section>
  `;
}

function buildRegionPolicyReportPdfHtml(payload = {}) {
  const {
    title,
    startDate,
    endDate,
    regions,
    promptVersionName,
    rawNewsCount,
    filteredNewsCount,
    excludedNewsCount,
    reportContent,
    generatedAt,
    newsReferences,
  } = payload;

  const safeTitle = title || '地区政策报告';
  const cleanedContent = stripMarkdownFences(reportContent);
  const markdownHtml = renderMarkdownToPrintHtml(String(cleanedContent || ''), { breaks: true });
  const generatedText = generatedAt
    ? new Date(generatedAt).toLocaleString('zh-CN', { hour12: false })
    : new Date().toLocaleString('zh-CN', { hour12: false });

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(safeTitle)}</title>
    <style>
      @page {
        size: A4;
        margin: 14mm 14mm 18mm;
      }

      :root {
        --ink: #14263f;
        --ink-soft: #5d6c7d;
        --line: rgba(20, 38, 63, 0.14);
        --brand: #173a63;
        --brand-accent: #2f6fae;
        --brand-muted: #d9e7f5;
        --emerald: #dff2e8;
        --amber: #f7eadb;
        --paper: #ffffff;
        --panel: #f4f7fb;
        --panel-strong: #eef3f9;
      }

      * { box-sizing: border-box; }
      html, body {
        margin: 0;
        padding: 0;
        background: var(--paper);
        color: var(--ink);
        font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      body {
        font-size: 11pt;
        line-height: 1.75;
      }

      .page {
        width: 100%;
      }

      .hero {
        padding: 18px 22px 16px;
        border: 1px solid var(--line);
        border-radius: 18px;
        background:
          radial-gradient(circle at top right, rgba(47, 111, 174, 0.14), transparent 34%),
          linear-gradient(135deg, rgba(23, 58, 99, 0.05) 0%, rgba(47, 111, 174, 0.03) 28%, #ffffff 100%);
        position: relative;
        overflow: hidden;
      }

      .hero::after {
        content: "";
        position: absolute;
        top: 0;
        right: 0;
        width: 180px;
        height: 180px;
        background: linear-gradient(180deg, rgba(47, 111, 174, 0.08), rgba(47, 111, 174, 0));
        border-bottom-left-radius: 180px;
      }

      .eyebrow {
        font-size: 10px;
        letter-spacing: 0.22em;
        text-transform: uppercase;
        font-weight: 700;
        color: var(--brand-accent);
        margin-bottom: 10px;
      }

      .hero h1 {
        margin: 0;
        font-size: 27px;
        line-height: 1.2;
        color: var(--brand);
      }

      .hero-top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
      }

      .generated-at {
        margin-top: 4px;
        color: var(--ink-soft);
        font-size: 10.5px;
        white-space: nowrap;
      }

      .meta-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
        margin-top: 14px;
      }

      .meta-card {
        padding: 10px 12px;
        border-radius: 12px;
        background: var(--panel);
        border: 1px solid rgba(20, 38, 63, 0.08);
        position: relative;
        overflow: hidden;
      }

      .meta-card::before {
        content: "";
        position: absolute;
        inset: 0 auto 0 0;
        width: 4px;
        background: linear-gradient(180deg, var(--brand-accent), rgba(47, 111, 174, 0.22));
      }

      .meta-grid .meta-card:nth-child(2)::before,
      .meta-grid .meta-card:nth-child(4)::before {
        background: linear-gradient(180deg, #2f6fae, #8cb5db);
      }

      .meta-grid .meta-card:nth-child(3)::before {
        background: linear-gradient(180deg, #32756a, #8bc5b8);
      }

      .meta-label {
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--ink-soft);
        margin-bottom: 4px;
      }

      .meta-value {
        font-size: 13px;
        font-weight: 700;
        color: var(--ink);
        word-break: break-word;
      }

      .report-shell {
        margin-top: 18px;
        border: 1px solid var(--line);
        border-radius: 18px;
        overflow: hidden;
        background: #fff;
        box-shadow: 0 14px 36px rgba(20, 38, 63, 0.06);
      }

      .report-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 16px;
        padding: 14px 20px;
        background:
          linear-gradient(90deg, rgba(23, 58, 99, 0.08), rgba(47, 111, 174, 0.02) 48%, rgba(47, 111, 174, 0.08));
        border-bottom: 1px solid var(--line);
      }

      .report-header-title {
        font-size: 13px;
        font-weight: 800;
        color: var(--brand);
      }

      .report-header-subtitle {
        font-size: 12px;
        color: var(--ink-soft);
      }

      .markdown-body {
        padding: 24px 28px 28px;
      }

      .markdown-body h1,
      .markdown-body h2,
      .markdown-body h3,
      .markdown-body h4 {
        color: var(--brand);
        page-break-after: avoid;
      }

      .markdown-body h1 {
        font-size: 22px;
        margin: 0 0 18px;
        padding-bottom: 10px;
        border-bottom: 2px solid rgba(23, 58, 99, 0.14);
      }

      .markdown-body h2 {
        font-size: 18px;
        margin: 28px 0 14px;
      }

      .markdown-body h3 {
        font-size: 15px;
        margin: 22px 0 10px;
      }

      .markdown-body p {
        margin: 10px 0;
        color: var(--ink);
      }

      .markdown-body ul,
      .markdown-body ol {
        margin: 10px 0 10px 20px;
        padding: 0;
      }

      .markdown-body li {
        margin: 6px 0;
      }

      .markdown-body blockquote {
        margin: 14px 0;
        padding: 10px 14px;
        border-left: 3px solid rgba(47, 111, 174, 0.45);
        background: rgba(47, 111, 174, 0.05);
        color: var(--ink-soft);
      }

      .markdown-body table {
        width: 100%;
        border-collapse: collapse;
        margin: 14px 0;
      }

      .markdown-body th,
      .markdown-body td {
        border: 1px solid var(--line);
        padding: 8px 10px;
        text-align: left;
      }

      .markdown-body th {
        background: var(--panel);
      }

      .reference-shell {
        margin-top: 18px;
        border: 1px solid var(--line);
        border-radius: 18px;
        background:
          linear-gradient(180deg, rgba(244, 247, 251, 0.9), rgba(255, 255, 255, 0.98));
        overflow: hidden;
      }

      .reference-head {
        padding: 16px 20px 12px;
        border-bottom: 1px solid rgba(20, 38, 63, 0.08);
        background:
          linear-gradient(90deg, rgba(223, 242, 232, 0.92), rgba(247, 234, 219, 0.6));
      }

      .reference-title {
        font-size: 13px;
        font-weight: 800;
        color: var(--brand);
      }

      .reference-subtitle {
        margin-top: 4px;
        font-size: 11px;
        color: var(--ink-soft);
      }

      .reference-list {
        margin: 0;
        padding: 14px 22px 18px 34px;
        font-size: 10.5px;
        line-height: 1.7;
        color: var(--ink-soft);
      }

      .reference-list li + li {
        margin-top: 8px;
      }

      .ref-title {
        display: block;
        color: var(--ink);
      }

      .ref-meta {
        display: block;
        margin-top: 2px;
      }

      .footer-note {
        margin-top: 14px;
        font-size: 11px;
        color: var(--ink-soft);
        text-align: right;
      }
    </style>
  </head>
  <body>
    <main class="page">
      <section class="hero">
        <div class="eyebrow">Region Policy Report</div>
        <div class="hero-top">
          <h1>${escapeHtml(safeTitle)}</h1>
          <div class="generated-at">生成时间：${escapeHtml(generatedText)}</div>
        </div>
        <div class="meta-grid">
          ${buildMetaCard('分析时间', `${formatDate(startDate)} - ${formatDate(endDate)}`)}
          ${buildMetaCard('分析地区', joinRegions(regions))}
          ${buildMetaCard('Prompt 版本', promptVersionName || '默认版本')}
          ${buildMetaCard('新闻统计', `原始 ${rawNewsCount || 0} / 纳入 ${filteredNewsCount || 0} / 排除 ${excludedNewsCount || 0}`)}
        </div>
      </section>

      <section class="report-shell">
        <div class="report-header">
          <div>
            <div class="report-header-title">报告正文</div>
          </div>
        </div>
        <article class="markdown-body">
          ${markdownHtml || '<p>暂无报告内容。</p>'}
        </article>
      </section>
      ${buildReferenceList(newsReferences)}
      <div class="footer-note">地区政策报告</div>
    </main>
  </body>
</html>`;
}

module.exports = {
  buildRegionPolicyReportPdfHtml,
};
