const fs = require('fs');
const path = require('path');

class LLMService {
  constructor() {
    this.config = this.loadConfig();
  }

  // 加载配置文件
  loadConfig() {
    try {
      const configPath = path.join(__dirname, '../config/llm-config.json');
      const configContent = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(configContent);
      
      // 尝试从markdown文件加载提示词
      this.loadPromptsFromMarkdown(config);
      
      return config;
    } catch (error) {
      console.error('Failed to load LLM config:', error);
      throw new Error('LLM configuration file not found or invalid');
    }
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

  // 切换活跃模型
  switchModel(modelKey) {
    if (!this.config.models[modelKey]) {
      throw new Error(`Model '${modelKey}' not found in configuration`);
    }
    
    this.config.activeModel = modelKey;
    
    // 更新配置文件
    const configPath = path.join(__dirname, '../config/llm-config.json');
    fs.writeFileSync(configPath, JSON.stringify(this.config, null, 2));
    
    return this.getActiveModelConfig();
  }


}

module.exports = LLMService; 