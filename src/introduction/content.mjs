// Static editorial content shared by the website and PDF renderer. No user HTML.
export const introductionParts = {
  general: { label: '网站总体介绍', shortLabel: '网站介绍', count: 3 },
  fund: { label: '公积金专区介绍', shortLabel: '公积金专区', count: 6 },
  all: { label: '完整介绍（合并）', shortLabel: '网站与公积金专区介绍', count: 9 },
};

const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tag = text => `<span class="intro-tag">${escape(text)}</span>`;
const note = text => `<p class="intro-note">${escape(text)}</p>`;
const points = items => `<div class="intro-points">${items.map(([title, text], i) => `<div><span class="intro-point-index">0${i + 1}</span><h3>${title}</h3><p>${text}</p></div>`).join('')}</div>`;
const flow = (items, className = '') => `<ol class="intro-flow ${className}">${items.map(([title, text], i) => `<li><span class="intro-step">0${i + 1}</span><strong>${title}</strong><span>${text}</span></li>`).join('')}</ol>`;
const documentCard = (title, subtitle, rows, className = '') => `<div class="intro-document ${className}"><div class="intro-document-top"><span>KeyDigest / ${subtitle}</span><span class="intro-dot"></span></div><h3>${title}</h3>${rows.map(([heading, text]) => `<div class="intro-document-row"><strong>${heading}</strong><p>${text}</p></div>`).join('')}<div class="intro-document-bottom"><span>信息有来源 · 阅读有重点</span><span>↗</span></div></div>`;

const productView = (image, caption, items, footnote = '') => `<div class="intro-product-layout"><figure class="intro-product-shot"><div class="intro-shot-bar"><span></span><span></span><span></span><b>KEYDIGEST · 工作界面</b></div><img src="/introduction-assets/${image}.jpg" alt="${escape(caption)}" decoding="async"/><figcaption>${escape(caption)}<span>界面实拍 · 2026.10.04</span></figcaption></figure><aside class="intro-product-notes">${items.map(([title, text], i) => `<div><span>0${i + 1}</span><h3>${title}</h3><p>${text}</p></div>`).join('')}${footnote ? note(footnote) : ''}</aside></div>`;

const pages = [
  {
    id: 'general-overview', part: 'general', label: '总体介绍', theme: 'cover', eyebrow: 'KEYDIGEST / 行业信息工作台',
    title: '持续关注行业。<br><em>每周，掌握重点。</em>',
    lead: '让 AI 持续搜索、逐条整理。<br>把分散的行业资讯，变成有来源、可查阅的每周参考。',
    body: `<div class="intro-cover-art">${documentCard('这一周，值得关注什么？', '行业周报', [['动态综述', '从当周材料中，梳理行业变化的主线。'], ['重点资讯', '按主题归纳重要事项，保留具体新闻依据。'], ['原始来源', '从报告回到材料，继续查看原文。']], 'intro-hero-document')}<div class="intro-floating intro-floating-left"><span>逐条评估</span><strong>相关性 × 重要性</strong><small>按预设规则，安排阅读优先级</small></div><div class="intro-floating intro-floating-right"><span class="intro-dot"></span>每周自动汇总</div></div><div class="intro-cover-strip"><span>持续搜索</span><span>逐条评分</span><span>自动周报</span><span>来源可溯</span></div>`,
  },
  {
    id: 'general-workflow', part: 'general', label: '工作流程', eyebrow: '01 / AI 工作流程',
    title: '一份周报背后，<br><em>每条信息都经过整理。</em>',
    lead: '把 AI 能力放进持续运行的任务流程。从采集端到网站工作台，逐步完成搜索、筛选、摘要与汇总。',
    body: flow([['搜索采集', '围绕关注主题查找资讯'], ['聚合整理', '逐条保存新闻与来源'], ['规则评分', '评估相关性与重要性'], ['提炼摘要', '抓住有价值的事实'], ['自动周报', '按周组织重点内容']]) + `<div class="intro-trace-line"><span>贯穿全程</span><strong>新闻材料与原始链接，保留为核对依据。</strong></div>` + points([['逐条处理', '先看每条材料，再形成整体综述。'], ['固定规则', '主题不同，评分与总结的侧重点也可以不同。'], ['持续积累', '当周读重点，之后仍可回查历史材料。']]),
  },
  {
    id: 'general-difference', part: 'general', theme: 'product-page', label: '为什么使用', eyebrow: '02 / 从 AI 能力到日常工作',
    title: "让每条信息，<em>都有关注的理由。</em>",
    lead: "豆包等通用 AI 同样擅长搜索与总结。KeyDigest 把这些能力组织成持续任务：固定主题、逐条评分、保留来源、每周汇总。",
    body: productView("news", "每日新闻：摘要、地区、业务类型、来源与评分并列展示", [["按规则逐条评估", "先看主题相关性，再看政策层级、影响范围与内容价值。5 分重大，4 分重要，3 分一般相关，0–2 分非重点。"], ["从综述回到依据", "周报 → 具体新闻 → 原始来源。读到值得关注的判断，可以继续核对原文。"], ["把一次问答变成积累", "无需每周重复组织信息任务；同一主题持续留存，形成可回查的行业资料。"]], "评分用于安排阅读优先级；不同主题可配置专门规则，不代表事实真实性评级。"),
  },
  {
    id: 'fund-overview', part: 'fund', label: '公积金专区', theme: 'fund-cover', eyebrow: 'KEYDIGEST / <span>公积金专区</span>',
    title: '看各地变化。<br><em>找业务参考。</em>',
    lead: '将公积金资讯按地区与业务整理。从每周动态，到专题分析，再到扬州现行政策对比，让资料更贴近实际工作。',
    body: `<div class="intro-feature-grid">${[['01','自动周报','每周把握行业动态'],['02','地区浏览','沿省市查找相关资料'],['03','业务类型分析','围绕缴存、提取、贷款研究'],['04','扬州政策对比','对照现行政策梳理差异']].map(([n,t,d])=>`<div><span>${n}</span><h3>${t}</h3><p>${d}</p></div>`).join('')}</div><div class="intro-foundation"><span>共同基础</span><strong>地区打标 · 业务打标 · 来源核对 · 报告导出</strong></div>`,
  },
  {
    id: 'fund-workflow', part: 'fund', label: '资料如何整理', eyebrow: '01 / 从资讯到参考',
    title: '一条资讯，<br><em>多种业务视角。</em>',
    lead: '为公积金新闻保留来源、提炼摘要，并标注地区和业务类型。资料由此可以按工作问题重新组织。',
    body: flow([['搜索聚合', '收集公积金相关资讯'], ['逐条整理', '评分、摘要与原始来源'], ['地区与业务打标', '把资料放进业务语境']]) + `<div class="intro-branch-label">同一批资料，服务不同用途</div><div class="intro-branches">${[['自动周报','掌握本周重点'],['地区浏览与分析','关注某地变化'],['业务专题分析','研究同类业务'],['扬州政策对比','梳理政策差异']].map(([t,d])=>`<div><strong>${t}</strong><span>${d}</span></div>`).join('')}</div><div class="intro-trace-line"><span>成果</span><strong>阅读分析 → 核对材料 → 导出 PDF</strong></div>` + note('地区与业务标签辅助检索；政策适用范围、具体条件仍需核对原文。'),
  },
  {
    id: 'fund-weekly', part: 'fund', theme: 'product-page', label: '自动周报', eyebrow: '02 / 自动周报',
    title: "每周一份简报，<em>对行业心中有数。</em>",
    lead: "按配置周期自动整理公积金资讯。先读综述建立总体认识，再沿重点事项回到新闻材料，连续观察行业变化。",
    body: productView("weekly", "历史周报：按关键词查找、核对周期与新闻数量、下载 PDF", [["自动汇总，定期阅读", "固定关注行业与周期，将分散新闻组织为当周综述和重点事项。"], ["历史留存，随时回查", "按公积金主题筛选历史记录，查看日期范围、纳入数量和生成状态。"], ["下载分享，带着依据讨论", "下载对应周报 PDF，用于内部交流；重要政策结合新闻材料继续查阅原文。"]], "截图为已有历史记录；新闻数量随周期和筛选条件变化。"),
  },
  {
    id: 'fund-regions', part: 'fund', theme: 'product-page', label: '区域浏览', eyebrow: '03 / 区域浏览',
    title: "关心哪个地方，<em>就从哪里看起。</em>",
    lead: "地区标签把全国资讯组织成省市视图。结合时间范围查找资料，进一步选择地区生成 AI 梳理或比较报告。",
    body: productView("regions", "地区浏览：选择江苏全省，查看地区新闻与业务标签", [["全省、省本级、城市", "全省包含省级与下属城市；省本级只看省级资讯，也可单独关注一个城市。"], ["地区与业务一起看", "在具体新闻上同时查看地区和业务标签，迅速识别与当前工作有关的材料。"], ["选定地区，再做 AI 分析", "从地区筛选进入报告流程，先核对纳入材料，再梳理一地变化或比较多地做法。"]], "地区标签辅助检索；政策适用范围与条件仍需核对原文。"),
  },
  {
    id: 'fund-business', part: 'fund', theme: 'product-page', label: '业务类型分析', eyebrow: '04 / 业务类型分析',
    title: "围绕一个业务，<em>看各地怎么做。</em>",
    lead: "缴存、提取、贷款等业务标签，让同类材料聚在一起。浏览可结合地区筛选，专题报告围绕所选业务汇集各地资讯。",
    body: productView("business", "贷款专题：预览候选材料，逐条核对后纳入分析", [["按业务聚焦问题", "选择一级业务或细分标签，并限定时间范围，围绕具体工作问题收集参考。"], ["先核对，再生成", "预览候选、纳入与排除数量；逐条检查标题、日期、地区和来源，调整材料范围。"], ["从材料形成专题简报", "AI 归纳重点政策、可能影响与可借鉴做法；通过引用回到原文核对具体条件。"]], "截图展示材料预览阶段，非已生成的分析结论。"),
  },
  {
    id: 'fund-yangzhou', part: 'fund', theme: 'product-page', label: '扬州政策对比', eyebrow: '05 / 扬州公积金政策对比',
    title: "把各地新做法，<em>放到本地政策旁边。</em>",
    lead: "从历史周报或当周新闻提取政策要点，对照已维护的扬州现行政策库，梳理差异，为业务研究提供参考。",
    body: productView("yangzhou", "扬州政策对比：选择已有周报，按步骤推进政策核对与分析", [["明确外地材料范围", "选择一份已有周报，或使用当周公积金高分新闻，确定本次研究的材料。"], ["核对要点与本地规则", "提取政策后先核对，再按同类业务对照扬州现行政策库，关注条件与做法差异。"], ["形成有依据的业务讨论", "围绕政策差异、参考方向和材料依据阅读报告，判断哪些做法值得进一步研究。"]], "截图为材料选择阶段。对比依赖政策库更新与材料完整性，政策适用以正式文件为准。"),
  },
];

export function getIntroductionPages(part) {
  if (!Object.hasOwn(introductionParts, part)) throw new Error('无效的介绍导出范围');
  return pages.filter(page => part === 'all' || page.part === part);
}

export function renderIntroductionPages(part) {
  const selected = getIntroductionPages(part);
  return selected.map((page, index) => `<section class="intro-sheet ${page.theme || ''}" id="${page.id}" aria-labelledby="${page.id}-title"><div class="intro-sheet-content"><p class="intro-eyebrow">${page.eyebrow}</p><h2 id="${page.id}-title">${page.title}</h2><p class="intro-lead">${page.lead}</p><div class="intro-body">${page.body}</div></div><footer class="intro-sheet-footer"><span>KeyDigest <i>/</i> ${introductionParts[page.part].shortLabel}</span><span>${String(index + 1).padStart(2, '0')} <i>/</i> ${String(selected.length).padStart(2, '0')}</span></footer></section>`).join('');
}
