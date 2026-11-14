// One assembly path for manual generation and its no-model preview.
const { getWeeklyReportModel } = require('./weeklyReportModelConfig.cjs');
const { applyWeeklyReportEditorialRules, appendWeeklyReportDateReminder } = require('./weeklyReportEditorial.cjs');
const { applyWeeklyNewsRules, buildNewsContent, buildPotentialCustomerNewsContent } = require('./weeklyReportNews.cjs');

function buildWeeklyReportRequest({ promptStore, keyword, startDate, endDate, selectedNews, userPrompt, promptId, summaryVersion, modelKey }) {
  const modelConfig = getWeeklyReportModel(modelKey);
  let selected;
  if (promptId) {
    // Retain the manual generator's existing fallback for unavailable templates.
    try { selected = promptStore.findKeywordPrompt(keyword, promptId); } catch { /* use defaults */ }
  }
  if (!selected?.systemPrompt || !selected?.userPrompt) selected = null;
  const template = selected || promptStore.getWeeklyPrompts();
  const systemPrompt = applyWeeklyNewsRules(applyWeeklyReportEditorialRules(template.systemPrompt), selectedNews, keyword);
  const filled = template.userPrompt
    .replace('{keyword}', keyword)
    .replace('{startDate}', startDate)
    .replace('{endDate}', endDate)
    .replace('{news}', buildNewsContent(selectedNews, summaryVersion, keyword, false))
    .replace('{qianzai_news}', buildPotentialCustomerNewsContent(selectedNews, summaryVersion, keyword))
    .replace('{usertopic}', userPrompt || '无特别要求');
  const finalUserPrompt = appendWeeklyReportDateReminder(filled, { startDate, endDate });
  const totalContent = systemPrompt + finalUserPrompt;
  const chinese = (totalContent.match(/[\u4e00-\u9fff]/g) || []).length;
  const english = (totalContent.match(/[a-zA-Z]/g) || []).length;
  return {
    modelConfig,
    messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: finalUserPrompt }],
    debug: {
      systemPrompt, userPrompt: finalUserPrompt, newsCount: selectedNews.length,
      model: modelConfig.label, modelKey: modelConfig.key, modelId: modelConfig.model,
      promptId: selected?.id || '', promptName: selected?.name || '默认提示词',
      thinkingEnabled: modelConfig.thinking?.type === 'enabled',
      totalChars: totalContent.length,
      estimatedTokens: Math.ceil(chinese * 0.6 + english * 0.3 + (totalContent.length - chinese - english) * 0.5),
    },
  };
}

module.exports = { buildWeeklyReportRequest };
