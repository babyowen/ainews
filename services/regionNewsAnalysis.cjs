const REGION_POLICY_NOISE_PATTERNS = [
  /问答/,
  /答疑/,
  /知识问答/,
  /热点问答/,
  /常见问题/,
  /知识库/,
  /政策科普/,
  /办事指南/,
  /操作指南/,
  /办理指南/,
  /办理流程/,
  /服务指南/,
  /攻略/,
  /流程说明/,
  /使用说明/,
  /图解/,
  /一图读懂/,
  /指引/,
  /手把手/,
  /如何/,
  /怎么/,
  /FAQ/i,
];

const REGION_POLICY_FINANCIAL_RESERVE_PATTERNS = [
  /资本公积/,
  /转增股本/,
  /弥补亏损/,
  /盈余公积/,
  /债权人/,
  /证券代码/,
  /公司公告/,
  /董事会/,
  /股东/,
  /上市公司/,
];

const REGION_POLICY_OLD_POLICY_PATTERNS = [
  /政策回顾/,
  /历史政策/,
  /旧政策/,
  /政策沿革/,
  /盘点/,
  /梳理/,
  /汇总/,
  /合集/,
  /历年来/,
  /此前政策/,
  /既有政策/,
];

const REGION_POLICY_INTERPRETATION_PATTERNS = [
  /政策解读/,
  /权威解读/,
  /专家解读/,
  /媒体解读/,
  /条文解读/,
];

const REGION_POLICY_ACTION_PATTERNS = [
  /发布/,
  /印发/,
  /通知/,
  /通告/,
  /出台/,
  /实施/,
  /执行/,
  /调整/,
  /优化/,
  /提高/,
  /降低/,
  /上调/,
  /下调/,
  /放宽/,
  /收紧/,
  /修订/,
  /明确/,
  /细化/,
  /延长/,
  /缩短/,
  /取消/,
  /支持/,
  /推进/,
  /推出/,
  /新增/,
  /恢复/,
  /阶段性/,
  /暂行/,
  /办法/,
  /措施/,
  /新政/,
];

function getRegionPolicySourceText(news = {}) {
  return [news.title, news.short_summary, news.content].filter(Boolean).join('\n');
}

function isPolicyGuidanceNews(news = {}) {
  const titleAndSummary = `${news.title || ''}\n${news.short_summary || ''}`;
  return REGION_POLICY_NOISE_PATTERNS.some((pattern) => pattern.test(titleAndSummary));
}

function analyzeRegionPolicyNews(news = {}) {
  const title = String(news.title || '').trim();
  const sourceText = getRegionPolicySourceText(news);
  const compactText = sourceText.replace(/\s+/g, ' ').trim();
  const hasAction = REGION_POLICY_ACTION_PATTERNS.some((pattern) => pattern.test(compactText));
  const titleAndSummary = `${title}\n${String(news.short_summary || '')}`;

  if (REGION_POLICY_FINANCIAL_RESERVE_PATTERNS.some((pattern) => pattern.test(titleAndSummary))) {
    return { includedInAnalysis: false, filterReason: '企业财务公积金/公告类内容' };
  }

  if (isPolicyGuidanceNews(news)) {
    return { includedInAnalysis: false, filterReason: '政策问答/指南类内容' };
  }

  if (REGION_POLICY_INTERPRETATION_PATTERNS.some((pattern) => pattern.test(titleAndSummary)) && !hasAction) {
    return { includedInAnalysis: false, filterReason: '政策解读但无明确新政动作' };
  }

  if (REGION_POLICY_OLD_POLICY_PATTERNS.some((pattern) => pattern.test(titleAndSummary)) && !hasAction) {
    return { includedInAnalysis: false, filterReason: '历史政策回顾或汇总' };
  }

  if (!hasAction) {
    return { includedInAnalysis: false, filterReason: '缺少明确政策动作信号' };
  }

  return { includedInAnalysis: true, filterReason: '纳入分析' };
}


module.exports = {analyzeRegionPolicyNews, isPolicyGuidanceNews};
