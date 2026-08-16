// 本文件为 CommonJS，扩展名必须是 .cjs：package.json 声明 "type": "module"，
// 原先的 .js 在生产 Node 20 下被 require 会抛 ERR_REQUIRE_ESM（issue #22 顺带修复）。

const { createConfigStore } = require('./configStore.cjs');
const { createPromptStore } = require('./promptStore.cjs');

class LLMService {
  constructor() {
    this.config = this.loadConfig();
  }

  // 加载配置文件（默认层 + 运行时层合并后的生效配置）
  loadConfig() {
    try {
      const configStore = createConfigStore();
      const config = configStore.readEffectiveJson('llm-config.json');

      // 尝试从markdown文件加载提示词
      this.loadPromptsFromMarkdown(config);

      return config;
    } catch (error) {
      console.error('Failed to load LLM config:', error);
      throw new Error('LLM configuration file not found or invalid');
    }
  }

  // 从markdown文件加载提示词（仅内存使用，绝不写回配置文件）
  loadPromptsFromMarkdown(config) {
    try {
      const weekly = createPromptStore().getWeeklyPrompts();
      if (!weekly.systemPrompt || !weekly.userPrompt) {
        throw new Error('Failed to parse prompts from markdown file');
      }
      config.prompts = {
        systemPrompt: weekly.systemPrompt,
        userPrompt: weekly.userPrompt,
      };
    } catch (error) {
      console.error('Failed to load prompts from markdown file:', error.message);
      throw new Error('Prompt configuration is required but not found');
    }
  }

  // 重新加载配置（支持热更新）
  reloadConfig() {
    this.config = this.loadConfig();
    console.log('Configuration reloaded successfully');
    return this.config;
  }

  // 获取当前活跃模型配置
  getActiveModelConfig() {
    const activeModel = this.config.activeModel;
    if (!this.config.models[activeModel]) {
      throw new Error(`Active model '${activeModel}' not found in configuration`);
    }
    return {
      key: activeModel,
      ...this.config.models[activeModel]
    };
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

  // 调用Google Gemini
  async callGemini(prompts, modelConfig) {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    
    const apiKey = process.env[modelConfig.apiKey];
    if (!apiKey) {
      throw new Error(`API key ${modelConfig.apiKey} not found in environment variables`);
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
      model: modelConfig.model,
      systemInstruction: prompts.systemPrompt
    });
    
    const result = await model.generateContent(prompts.userPrompt);
    const response = await result.response;
    return response.text();
  }

  // 调用OpenAI兼容API（适用于DeepSeek、OpenAI等）
  async callOpenAICompatible(prompts, modelConfig) {
    const axios = require('axios');
    
    const apiKey = process.env[modelConfig.apiKey];
    if (!apiKey) {
      throw new Error(`API key ${modelConfig.apiKey} not found in environment variables`);
    }

    const response = await axios.post(modelConfig.endpoint, {
      model: modelConfig.model,
      messages: [
        {
          role: "system",
          content: prompts.systemPrompt
        },
        {
          role: "user",
          content: prompts.userPrompt
        }
      ],
      temperature: this.config.settings.temperature
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: this.config.settings.timeout
    });

    return response.data.choices[0].message.content;
  }

  // 调用Claude
  async callClaude(prompts, modelConfig) {
    const axios = require('axios');
    
    const apiKey = process.env[modelConfig.apiKey];
    if (!apiKey) {
      throw new Error(`API key ${modelConfig.apiKey} not found in environment variables`);
    }

    const response = await axios.post(modelConfig.endpoint, {
      model: modelConfig.model,
      temperature: this.config.settings.temperature,
      system: prompts.systemPrompt,
      messages: [
        {
          role: "user",
          content: prompts.userPrompt
        }
      ]
    }, {
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
      },
      timeout: this.config.settings.timeout
    });

    return response.data.content[0].text;
  }

  // 统一的生成接口
  async generateReport(keyword, startDate, endDate, selectedNews, userPrompt = '') {
    const modelConfig = this.getActiveModelConfig();
    const prompts = this.buildPrompt(keyword, startDate, endDate, selectedNews, userPrompt);
    
    console.log(`Using model: ${modelConfig.key} (${modelConfig.description})`);
    console.log('System Prompt:', prompts.systemPrompt.substring(0, 100) + '...');
    console.log('User Prompt:', prompts.userPrompt.substring(0, 200) + '...');
    
    let retryCount = 0;
    const maxRetries = this.config.settings.retryAttempts;

    while (retryCount < maxRetries) {
      try {
        let result;
        
        switch (modelConfig.provider) {
          case 'google':
            result = await this.callGemini(prompts, modelConfig);
            break;
          case 'deepseek':
          case 'openai':
            result = await this.callOpenAICompatible(prompts, modelConfig);
            break;
          case 'anthropic':
            result = await this.callClaude(prompts, modelConfig);
            break;
          default:
            throw new Error(`Unsupported provider: ${modelConfig.provider}`);
        }
        
        return result;
      } catch (error) {
        retryCount++;
        console.error(`Attempt ${retryCount} failed:`, error.message);
        
        if (retryCount >= maxRetries) {
          // 如果重试失败，尝试使用fallback模型
          if (modelConfig.key !== this.config.settings.fallbackModel) {
            console.log(`Switching to fallback model: ${this.config.settings.fallbackModel}`);
            const fallbackConfig = this.config.models[this.config.settings.fallbackModel];
            if (fallbackConfig && fallbackConfig.provider === 'google') {
              return await this.callGemini(prompts, fallbackConfig);
            }
          }
          throw new Error(`All retry attempts failed. Last error: ${error.message}`);
        }
        
        // 等待后重试
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
      }
    }
  }

  // 获取所有可用模型
  getAvailableModels() {
    return Object.keys(this.config.models).map(key => ({
      key,
      ...this.config.models[key],
      isActive: key === this.config.activeModel
    }));
  }

  // 切换活跃模型：仅将 activeModel 写入运行时层 config/runtime/llm-config.json，
  // 不再把内存中的 prompts 对象整体回写（修复 llm-config.json 被污染的问题）
  switchModel(modelKey) {
    if (!this.config.models[modelKey]) {
      throw new Error(`Model '${modelKey}' not found in configuration`);
    }

    this.config.activeModel = modelKey;

    const configStore = createConfigStore();
    const effective = configStore.readEffectiveJson('llm-config.json') || {};
    effective.activeModel = modelKey;
    configStore.commitJson('llm-config.json', effective);

    return this.getActiveModelConfig();
  }

}

module.exports = LLMService; 