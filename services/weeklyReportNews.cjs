// Frozen publisher identity, not an inference about the location of an event.
const registry = require('../config/government-wechat-sources.json');
const accounts = new Map(registry.accounts.map(account => [account.biz, account]));
const SOURCE_RULE = `# 官微来源地域使用规则
来源上下文只说明已核验的发布账号、账号辖区和层级。账号辖区不等于事件发生地，账号层级也不等于政策或事件层级。
正文明确讲述发布机构本级事务时，可结合来源上下文补足“我省、本省、我市、本市、我局、本局、市局”等指代；正文明确地点优先。转载、跨地区交流或外地案例按正文地点和主体表述，不得套用发布账号辖区。
指代含糊或证据不足时不猜测地域，不得因专题名含“江苏”而把外地新闻认作江苏新闻。来源上下文仅作理解资料，不必逐条复述账号信息，保持原有周报格式。`;

function sourceContext(news, keyword) {
  if (!news || keyword !== registry.keyword || news.sourceapi !== '极致了api'
      || [news.keyword, news.main_keyword].some(value => value != null && value !== '' && value !== registry.keyword)
      || typeof news.link !== 'string') return null;
  let url;
  try { url = new URL(news.link); } catch { return null; }
  if (!['https:', 'http:'].includes(url.protocol) || url.host !== 'mp.weixin.qq.com'
      || url.username || url.password || url.pathname !== '/s') return null;
  // Match the collector's identity parsing: base64 '+' is literal, not a space.
  const params = new URLSearchParams(url.search.replaceAll('+', '%2B'));
  const values = ['__biz', 'mid', 'idx'].map(key => params.getAll(key));
  if (values.some(value => value.length !== 1)) return null;
  const [biz, mid, idx] = values.map(value => value[0]);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(biz) || !/^[1-9][0-9]*$/.test(mid) || !/^[1-9][0-9]*$/.test(idx)) return null;
  const account = accounts.get(biz);
  if (!account || ('wechat_ghid' in news && news.wechat_ghid !== account.ghid)
      || ('wechat_article_id' in news && news.wechat_article_id !== [biz,mid,idx].join('/'))) return null;
  return { 发布账号: account.name, 账号辖区: account.jurisdiction, 账号层级: account.level };
}

function sourceLine(news, keyword) {
  const context = sourceContext(news, keyword);
  return context ? `来源上下文：${JSON.stringify(context)}\n` : '';
}

function applySourceContextRules(systemPrompt, newsList, keyword) {
  // Do not rewrite persisted/default prompts; keep all prior request text intact.
  return newsList.some(news => sourceContext(news, keyword))
    ? `${systemPrompt}\n\n${SOURCE_RULE}` : systemPrompt;
}

function newsText(news, summaryVersion) {
  return summaryVersion === 'short'
    ? (news.short_summary || news.content || '内容不详')
    : (news.content || news.short_summary || '内容不详');
}

function buildNewsContent(newsList, summaryVersion, keyword, useTitleFallback = true) {
  return newsList.map((news, index) => sourceLine(news, keyword)
    + `新闻${index + 1}标题:${useTitleFallback ? (news.title || '标题不详') : news.title}\n新闻${index + 1}内容:${newsText(news, summaryVersion)}`).join('\n\n');
}

function buildPotentialCustomerNewsContent(newsList, summaryVersion, keyword) {
  return newsList.map(news => sourceLine(news, keyword)
    + `这是我的潜在客户<${news.search_keyword || '未知客户'}>，以下是我搜索到的新闻<${newsText(news, summaryVersion)}>`).join('\n\n');
}

module.exports = { sourceContext, applySourceContextRules, buildNewsContent, buildPotentialCustomerNewsContent };
