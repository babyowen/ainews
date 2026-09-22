const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '../config/weekly-report-models.json');
const LEGACY_MODEL_KEYS = new Set(['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-r1', 'kimi-k2', 'openai-gpt4', 'claude-3-opus']);

function loadWeeklyReportModelConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
  const config = JSON.parse(raw);
  if (!config.defaultModelKey || !config.models || typeof config.models !== 'object') {
    throw new Error('Invalid weekly report model configuration');
  }
  return config;
}

function getWeeklyReportModel(modelKey) {
  const config = loadWeeklyReportModelConfig();
  // 已保存的自动任务和旧浏览器请求仍可能带旧 key，统一解析到当前模型。
  const key = !modelKey || LEGACY_MODEL_KEYS.has(modelKey) ? config.defaultModelKey : modelKey;
  const model = config.models[key];
  if (!model) {
    throw new Error(`Unknown weekly report model: ${key}`);
  }
  return { key, ...model };
}

function listWeeklyReportModels() {
  const config = loadWeeklyReportModelConfig();
  return Object.entries(config.models).map(([key, model]) => ({
    key,
    label: model.label,
    provider: model.provider,
    model: model.model,
    contextWindow: model.contextWindow,
    maxOutputTokens: model.maxOutputTokens,
    description: model.description,
    isDefault: key === config.defaultModelKey
  }));
}

function buildDeepSeekChatPayload(modelConfig, messages, stream = false, extra = {}) {
  const payload = {
    model: modelConfig.model,
    messages,
    stream,
    max_tokens: modelConfig.requestMaxTokens || 32768
  };

  if (modelConfig.thinking) {
    payload.thinking = modelConfig.thinking;
  } else {
    payload.temperature = 0.7;
  }

  if (modelConfig.reasoning_effort) {
    payload.reasoning_effort = modelConfig.reasoning_effort;
  }

  return { ...payload, ...extra, model: modelConfig.model, messages, stream };
}

module.exports = {
  buildDeepSeekChatPayload,
  getWeeklyReportModel,
  listWeeklyReportModels,
  loadWeeklyReportModelConfig
};
