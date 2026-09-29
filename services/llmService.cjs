const { createPromptStore } = require('./promptStore.cjs');
const { getWeeklyReportModel, listWeeklyReportModels, loadWeeklyReportModelConfig } = require('./weeklyReportModelConfig.cjs');
const { completeChat } = require('./modelClient.cjs');

class LLMService {
  constructor() { this.config = this.loadConfig(); }
  loadConfig() {
    const shared = loadWeeklyReportModelConfig();
    const config = { ...shared, activeModel: shared.defaultModelKey };
    this.loadPromptsFromMarkdown(config);
    return config;
  }
  reloadConfig() { this.config = this.loadConfig(); return this.config; }
  getActiveModelConfig() { return getWeeklyReportModel(); }
  getAvailableModels() {
    return listWeeklyReportModels().map(model => ({ ...model, isActive: model.isDefault }));
  }
  switchModel(modelKey) {
    if (modelKey !== getWeeklyReportModel().key) throw new Error('全站已统一使用 DeepSeek V4.1 Flash，不支持用户切换模型');
    return this.getActiveModelConfig();
  }
  getCustomPrompts() { return this.config.customPrompts || []; }
  async generateReport(keyword, startDate, endDate, selectedNews, userPrompt = '') {
    const prompts = this.buildPrompt(keyword, startDate, endDate, selectedNews, userPrompt);
    return completeChat([
      { role: 'system', content: prompts.systemPrompt },
      { role: 'user', content: prompts.userPrompt },
    ]);
  }
  // 读取生效 Prompt，管理页面的 runtime 修改无需重启即可被新实例读取。
  loadPromptsFromMarkdown(config) {
    const weekly = createPromptStore().getWeeklyPrompts();
    if (!weekly.systemPrompt || !weekly.userPrompt) {
      throw new Error('Prompt configuration is required but not found');
    }
    config.prompts = { systemPrompt: weekly.systemPrompt, userPrompt: weekly.userPrompt };
  }

  // 构建完整的Prompt
  buildPrompt(keyword, startDate, endDate, selectedNews, userPrompt = '') {
    const prompts = this.config.prompts;

    // 构建新闻内容
    let newsContent = '';
    selectedNews.forEach((news, index) => {
      newsContent += `新闻${index + 1}标题: ${news.title}\n`;
      newsContent += `新闻${index + 1}内容: ${news.content || '无正文内容'}\n\n`;
    });

    // 构建user prompt，替换模板变量
    const userPromptText = prompts.userPrompt
      .replace('{keyword}', keyword)
      .replace('{startDate}', startDate)
      .replace('{endDate}', endDate)
      .replace('{news}', newsContent)
      .replace('{usertopic}', userPrompt || '请进行常规分析');

    return {
      systemPrompt: prompts.systemPrompt,
      userPrompt: userPromptText
    };
  }


}
module.exports = LLMService;
