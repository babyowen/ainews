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

function renderInlineHtml(text = '') {
  const normalized = String(text ?? '').replace(/__(.+?)__/g, '**$1**');
  const escaped = escapeHtml(normalized);
  return escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function renderParagraphList(entries = [], emptyText = '暂无内容') {
  const safeEntries = Array.isArray(entries) ? entries.filter(Boolean) : [];
  const list = safeEntries.length > 0 ? safeEntries : [emptyText];
  return list.map((entry) => `<p>${renderInlineHtml(entry)}</p>`).join('');
}

function groupMissingByCity(missing = []) {
  return (Array.isArray(missing) ? missing : []).reduce((acc, item) => {
    const cityName = item?.city || '其他城市';
    if (!acc[cityName]) acc[cityName] = [];
    acc[cityName].push(item);
    return acc;
  }, {});
}

function getPolicyComparisonStats(structuredReport = {}) {
  const cities = Array.isArray(structuredReport?.cities) ? structuredReport.cities : [];
  const totalMatched = cities.reduce(
    (sum, city) => sum + city.categories.reduce((acc, category) => acc + category.items.length, 0),
    0
  );
  const totalCategories = new Set(
    cities.flatMap((city) => city.categories.map((category) => category.title))
  ).size;

  return {
    cityCount: cities.length,
    totalMatched,
    totalCategories,
  };
}

function getSourceModeLabel(sourceMode) {
  return sourceMode === 'news' ? '当周新闻模式' : '历史周报模式';
}

function buildCitySections(cities = []) {
  return cities.map((city) => {
    const categorySections = (city?.categories || []).map((category) => `
      <section class="category-panel">
        <div class="category-heading">
          <div class="category-title">${escapeHtml(category.title || '未分类')}</div>
          <div class="category-count">${escapeHtml(category.items?.length || 0)} 项</div>
        </div>
        <div class="comparison-item-list">
          ${(category?.items || []).map((item) => `
            <article class="comparison-item-card">
              <div class="comparison-item-header">
                <h4>${escapeHtml(item.title || '政策对比项')}</h4>
              </div>
              <div class="comparison-lanes">
                <section class="comparison-lane other">
                  <div class="comparison-lane-label">${escapeHtml(city.name || '其他城市')}</div>
                  <div class="comparison-lane-body">
                    ${renderParagraphList(item.localEntries, '未提取到对应政策内容。')}
                  </div>
                </section>
                <section class="comparison-lane yangzhou">
                  <div class="comparison-lane-label">扬州</div>
                  <div class="comparison-lane-body">
                    ${renderParagraphList(item.yangzhouEntries, '未提取到扬州对应政策内容。')}
                  </div>
                </section>
                <section class="comparison-lane diff">
                  <div class="comparison-lane-label">差异观察</div>
                  <div class="comparison-lane-body">
                    ${renderParagraphList(item.diffEntries, '差异结论未生成。')}
                  </div>
                </section>
              </div>
            </article>
          `).join('')}
        </div>
      </section>
    `).join('');

    const cityItemCount = (city?.categories || []).reduce((sum, category) => sum + (category.items?.length || 0), 0);
    const citySummary = Array.isArray(city?.summary) ? city.summary.filter(Boolean).join(' ') : '';

    return `
      <section class="city-section">
        <div class="city-header">
          <div class="city-header-main">
            <div class="city-eyebrow">City Comparison</div>
            <h3>${escapeHtml(city.name || '其他城市')}</h3>
            <p>${renderInlineHtml(citySummary || `共 ${cityItemCount} 条对比事项，覆盖 ${(city?.categories || []).length} 个政策类别。`)}</p>
          </div>
          <div class="city-stats">
            <div class="city-stat">
              <strong>${escapeHtml((city?.categories || []).length)}</strong>
              <span>类别</span>
            </div>
            <div class="city-stat">
              <strong>${escapeHtml(cityItemCount)}</strong>
              <span>事项</span>
            </div>
          </div>
        </div>
        <div class="category-stack">
          ${categorySections}
        </div>
      </section>
    `;
  }).join('');
}

function buildMissingSection(missing = []) {
  if (!Array.isArray(missing) || missing.length === 0) return '';

  const grouped = groupMissingByCity(missing);
  const groupsHtml = Object.entries(grouped).map(([cityName, items]) => `
    <section class="missing-city-card">
      <div class="missing-city-title">
        <span>${escapeHtml(cityName)}</span>
        <strong>${escapeHtml(items.length)} 项</strong>
      </div>
      <div class="missing-item-list">
        ${items.map((item) => `
          <article class="missing-item-card">
            <div class="missing-item-meta">${escapeHtml(item.category || '未分类')}</div>
            <h4>${escapeHtml(item.title || '待补政策')}</h4>
            <div class="missing-item-body">
              ${renderParagraphList(item.localEntries, '未提取到外地政策内容。')}
            </div>
          </article>
        `).join('')}
      </div>
    </section>
  `).join('');

  return `
    <section class="missing-section">
      <div class="missing-header">
        <div class="missing-eyebrow">Gap Summary</div>
        <h3>扬州暂未覆盖政策</h3>
        <p>以下政策在外地周报中出现，但当前扬州政策库未找到明确对应条款，统一列示以便后续补充。</p>
      </div>
      <div class="missing-grid">
        ${groupsHtml}
      </div>
    </section>
  `;
}

function buildPolicyComparisonPdfHtml({ title, startDate, endDate, sourceMode, structuredReport }) {
  const safeReport = structuredReport || { intro: [], cities: [], missing: [] };
  const { cityCount, totalMatched, totalCategories } = getPolicyComparisonStats(safeReport);
  const sourceLabel = getSourceModeLabel(sourceMode);
  const introLines = Array.isArray(safeReport?.intro) ? safeReport.intro.filter(Boolean) : [];
  const dateRange = `${formatDate(startDate)} - ${formatDate(endDate)}`;
  const summaryHtml = introLines.length > 0
    ? introLines.map((line) => `<p>${renderInlineHtml(line)}</p>`).join('')
    : '<p>已按城市归并呈现周报中的政策差异，扬州未覆盖的外地政策已统一收纳到文末，便于横向比对与政策补充。</p>';

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title || '政策对比周报')}</title>
    <style>
      @page {
        size: A4 landscape;
      }

      :root {
        color-scheme: light;
        --ink: #18324d;
        --ink-soft: #5c7288;
        --line: rgba(24, 50, 77, 0.12);
        --brand-deep: #0c2240;
        --brand-mid: #174579;
        --brand-accent: #2a7ae4;
        --paper: #ffffff;
        --panel: #f4f8fc;
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
        font-size: 10.5pt;
        line-height: 1.7;
      }

      .report-document {
        width: 100%;
      }

      .report-cover {
        position: relative;
        margin: 0 0 8mm;
        padding: 10mm 11mm 8mm;
        border-radius: 6mm;
        overflow: hidden;
        color: #ffffff;
        background:
          radial-gradient(circle at 86% 18%, rgba(255, 255, 255, 0.16), transparent 18%),
          radial-gradient(circle at 16% 16%, rgba(109, 184, 255, 0.18), transparent 20%),
          linear-gradient(135deg, #0b1d35 0%, #12345b 54%, #1b63bb 100%);
      }

      .report-cover::after {
        content: "";
        position: absolute;
        inset: auto -12mm -14mm auto;
        width: 42mm;
        height: 42mm;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.1);
      }

      .report-cover-inner {
        position: relative;
        z-index: 1;
      }

      .report-brand {
        display: inline-flex;
        align-items: center;
        padding: 2mm 4mm;
        margin-bottom: 3mm;
        border-radius: 999px;
        border: 0.35mm solid rgba(255, 255, 255, 0.18);
        background: rgba(255, 255, 255, 0.1);
        font-size: 8pt;
        font-weight: 700;
        letter-spacing: 0.08em;
      }

      .report-title {
        margin: 0 0 2mm;
        font-size: 26pt;
        line-height: 1.08;
        font-weight: 800;
        letter-spacing: 0.01em;
        max-width: 160mm;
      }

      .report-subtitle {
        margin: 0;
        color: rgba(255, 255, 255, 0.84);
        font-size: 10.5pt;
        line-height: 1.55;
        max-width: 175mm;
      }

      .report-meta {
        display: grid;
        grid-template-columns: minmax(58mm, 1.4fr) repeat(3, minmax(34mm, 0.72fr));
        gap: 3mm;
        margin-top: 5mm;
      }

      .report-meta-card {
        padding: 3mm 4mm;
        border-radius: 4mm;
        background: rgba(255, 255, 255, 0.94);
        color: var(--ink);
      }

      .report-meta-label {
        display: block;
        margin-bottom: 1mm;
        color: #667b92;
        font-size: 7pt;
        letter-spacing: 0.08em;
      }

      .report-meta-value {
        display: block;
        font-size: 11pt;
        font-weight: 800;
        line-height: 1.4;
      }

      .summary-panel {
        margin-bottom: 8mm;
        padding: 5mm 5.5mm;
        border-radius: 5mm;
        border: 0.35mm solid rgba(24, 50, 77, 0.08);
        background: linear-gradient(180deg, rgba(244, 248, 252, 0.96), rgba(255, 255, 255, 0.98));
        box-shadow: 0 8px 22px rgba(15, 23, 42, 0.05);
      }

      .summary-heading {
        margin: 0 0 2mm;
        color: var(--brand-deep);
        font-size: 14pt;
        line-height: 1.2;
        font-weight: 800;
      }

      .summary-body p {
        margin: 0;
        color: #30465c;
      }

      .summary-body p + p {
        margin-top: 2mm;
      }

      .city-section,
      .missing-section {
        margin-top: 8mm;
      }

      .city-section {
        break-inside: auto;
      }

      .city-header,
      .missing-header {
        position: relative;
        overflow: hidden;
        border-radius: 5mm;
        padding: 5mm 5.5mm 4.5mm;
        color: #ffffff;
        background:
          radial-gradient(circle at right top, rgba(255, 255, 255, 0.14), transparent 24%),
          linear-gradient(180deg, #102846 0%, #19416d 100%);
        page-break-after: avoid;
        break-after: avoid-page;
      }

      .missing-header {
        background:
          radial-gradient(circle at right top, rgba(255, 255, 255, 0.12), transparent 24%),
          linear-gradient(180deg, #182033 0%, #30405c 100%);
      }

      .city-header {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 8mm;
      }

      .city-header-main {
        flex: 1;
        min-width: 0;
      }

      .city-eyebrow,
      .missing-eyebrow {
        font-size: 8pt;
        font-weight: 800;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.72);
      }

      .city-header h3,
      .missing-header h3 {
        margin: 1.4mm 0 1mm;
        font-size: 21pt;
        line-height: 1.05;
        letter-spacing: -0.03em;
        font-weight: 800;
      }

      .city-header p,
      .missing-header p {
        margin: 0;
        color: rgba(255, 255, 255, 0.82);
        font-size: 10pt;
        line-height: 1.55;
      }

      .city-stats {
        display: flex;
        gap: 3mm;
      }

      .city-stat {
        min-width: 26mm;
        padding: 2.8mm 3.2mm 2.4mm;
        border-radius: 3.6mm;
        border: 0.35mm solid rgba(255, 255, 255, 0.14);
        background: rgba(255, 255, 255, 0.08);
        text-align: center;
      }

      .city-stat strong {
        display: block;
        font-size: 18pt;
        line-height: 1;
      }

      .city-stat span {
        display: block;
        margin-top: 1mm;
        color: rgba(255, 255, 255, 0.74);
        font-size: 8pt;
      }

      .category-stack {
        margin-top: 3.8mm;
        display: flex;
        flex-direction: column;
        gap: 4mm;
        page-break-before: avoid;
        break-before: avoid-page;
      }

      .category-panel,
      .missing-city-card {
        break-inside: avoid-page;
        page-break-inside: avoid;
        border-radius: 5mm;
        border: 0.35mm solid rgba(24, 50, 77, 0.08);
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(246, 249, 253, 0.98));
        box-shadow: 0 6px 18px rgba(15, 23, 42, 0.05);
      }

      .category-panel {
        padding: 4mm;
      }

      .category-heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 4mm;
        page-break-after: avoid;
        break-after: avoid-page;
      }

      .category-title,
      .category-count {
        display: inline-flex;
        align-items: center;
        min-height: 9mm;
        border-radius: 999px;
        font-size: 8.4pt;
        font-weight: 800;
      }

      .category-title {
        padding: 0 4mm;
        background: linear-gradient(180deg, rgba(12, 31, 71, 0.08), rgba(12, 31, 71, 0.02));
        border: 0.35mm solid rgba(12, 31, 71, 0.1);
        color: var(--brand-deep);
      }

      .category-count {
        padding: 0 3.6mm;
        background: rgba(15, 23, 42, 0.05);
        border: 0.35mm solid rgba(15, 23, 42, 0.08);
        color: #475569;
      }

      .comparison-item-list {
        margin-top: 3mm;
        display: flex;
        flex-direction: column;
        gap: 3mm;
      }

      .comparison-item-card {
        break-inside: avoid-page;
        page-break-inside: avoid;
        border-radius: 4.2mm;
        border: 0.35mm solid rgba(15, 23, 42, 0.08);
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.98));
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.68), 0 3px 8px rgba(15, 23, 42, 0.04);
        padding: 3.4mm 3.4mm 3.2mm;
      }

      .comparison-item-header {
        margin-bottom: 2.4mm;
        page-break-after: avoid;
        break-after: avoid-page;
      }

      .comparison-item-header h4,
      .missing-item-card h4 {
        margin: 0;
        color: #12283f;
        font-size: 12.2pt;
        line-height: 1.24;
        font-weight: 800;
      }

      .comparison-lanes {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(54mm, 0.94fr);
        gap: 2.6mm;
        align-items: stretch;
      }

      .comparison-lane {
        min-height: 100%;
        padding: 3mm 3.2mm 2.6mm;
        border-radius: 3.8mm;
        border: 0.35mm solid rgba(15, 23, 42, 0.08);
      }

      .comparison-lane.other {
        background: linear-gradient(180deg, rgba(30, 64, 175, 0.08), rgba(30, 64, 175, 0.04));
        border-color: rgba(30, 64, 175, 0.12);
      }

      .comparison-lane.yangzhou {
        background: linear-gradient(180deg, rgba(5, 150, 105, 0.08), rgba(5, 150, 105, 0.04));
        border-color: rgba(5, 150, 105, 0.12);
      }

      .comparison-lane.diff {
        background: linear-gradient(180deg, rgba(202, 138, 4, 0.1), rgba(202, 138, 4, 0.04));
        border-color: rgba(202, 138, 4, 0.12);
      }

      .comparison-lane-label,
      .missing-item-meta {
        display: inline-flex;
        align-items: center;
        min-height: 7.4mm;
        padding: 0 3mm;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.86);
        border: 0.35mm solid rgba(15, 23, 42, 0.08);
        color: #16304f;
        font-size: 8pt;
        font-weight: 800;
      }

      .comparison-lane-body,
      .missing-item-body {
        margin-top: 2.2mm;
      }

      .comparison-lane-body p,
      .missing-item-body p,
      .summary-body p {
        margin: 0;
        color: #30465c;
        word-break: break-word;
      }

      .comparison-lane-body p + p,
      .missing-item-body p + p {
        margin-top: 1.6mm;
        padding-top: 1.6mm;
        border-top: 0.35mm dashed rgba(15, 23, 42, 0.12);
      }

      .comparison-lane.diff .comparison-lane-body p {
        color: #5f4a14;
      }

      strong {
        color: #11283f;
        font-weight: 800;
      }

      .missing-grid {
        margin-top: 3.8mm;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 4mm;
      }

      .missing-city-card {
        padding: 4mm;
      }

      .missing-city-title {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 4mm;
        margin-bottom: 2.6mm;
        color: #12283f;
        font-size: 11pt;
        font-weight: 800;
      }

      .missing-city-title strong {
        color: #475569;
        font-size: 8.6pt;
      }

      .missing-item-list {
        display: flex;
        flex-direction: column;
        gap: 2.6mm;
      }

      .missing-item-card {
        break-inside: avoid-page;
        page-break-inside: avoid;
        border-radius: 3.8mm;
        border: 0.35mm solid rgba(15, 23, 42, 0.08);
        background: rgba(255, 255, 255, 0.9);
        padding: 3mm 3.2mm;
      }

      .missing-item-card h4 {
        margin-top: 1.8mm;
      }

      .empty-state {
        padding: 8mm;
        border-radius: 5mm;
        border: 0.35mm dashed rgba(24, 50, 77, 0.18);
        background: rgba(244, 248, 252, 0.72);
        color: var(--ink-soft);
        text-align: center;
      }
    </style>
  </head>
  <body>
    <main class="report-document">
      <section class="report-cover">
        <div class="report-cover-inner">
          <div class="report-brand">政策对比报告 · ${escapeHtml(sourceLabel)}</div>
          <h1 class="report-title">${escapeHtml(title || '政策对比周报')}</h1>
          <p class="report-subtitle">以横向三栏结构呈现外地城市、扬州与差异观察，适合电脑阅读与横向打印。</p>
          <div class="report-meta">
            <div class="report-meta-card">
              <span class="report-meta-label">周报区间</span>
              <strong class="report-meta-value">${escapeHtml(dateRange)}</strong>
            </div>
            <div class="report-meta-card">
              <span class="report-meta-label">覆盖城市</span>
              <strong class="report-meta-value">${escapeHtml(cityCount)} 个</strong>
            </div>
            <div class="report-meta-card">
              <span class="report-meta-label">对比事项</span>
              <strong class="report-meta-value">${escapeHtml(totalMatched)} 项</strong>
            </div>
            <div class="report-meta-card">
              <span class="report-meta-label">政策类别</span>
              <strong class="report-meta-value">${escapeHtml(totalCategories)} 类</strong>
            </div>
          </div>
        </div>
      </section>

      <section class="summary-panel">
        <h2 class="summary-heading">总览说明</h2>
        <div class="summary-body">
          ${summaryHtml}
        </div>
      </section>

      ${safeReport.cities.length > 0 ? buildCitySections(safeReport.cities) : '<section class="empty-state">当前没有可用于导出的政策对比数据。</section>'}
      ${buildMissingSection(safeReport.missing)}
    </main>
  </body>
</html>`;
}

module.exports = {
  buildPolicyComparisonPdfHtml,
};
