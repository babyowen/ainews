const fs = require('fs');
const path = require('path');
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
  // 从markdown文件加载提示词
  loadPromptsFromMarkdown(config) {
    try {
      const promptsPath = path.join(__dirname, '../config/prompts.md');
      if (fs.existsSync(promptsPath)) {
        const promptsContent = fs.readFileSync(promptsPath, 'utf8');

        // 初始化prompts对象（如果不存在）
        if (!config.prompts) {
          config.prompts = {};
        }

        // 解析System Prompt
        const systemPromptMatch = promptsContent.match(/## System Prompt\s*```\s*([\s\S]*?)\s*```/);
        if (systemPromptMatch) {
          config.prompts.systemPrompt = systemPromptMatch[1].trim();
          console.log('System prompt loaded from markdown file');
        }

        // 解析User Prompt
        const userPromptMatch = promptsContent.match(/## User Prompt\s*```\s*([\s\S]*?)\s*```/);
        if (userPromptMatch) {
          config.prompts.userPrompt = userPromptMatch[1].trim();
          console.log('User prompt loaded from markdown file');
        }

        // 检查是否成功加载了提示词
        if (!config.prompts.systemPrompt || !config.prompts.userPrompt) {
          throw new Error('Failed to parse prompts from markdown file');
        }
      } else {
        throw new Error('Prompts markdown file not found');
      }
    } catch (error) {
      console.error('Failed to load prompts from markdown file:', error.message);
      throw new Error('Prompt configuration is required but not found');
    }
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
