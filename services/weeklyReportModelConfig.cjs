const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '../config/weekly-report-models.json');

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
  const key = modelKey || config.defaultModelKey;
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
    ...extra
  };

  if (modelConfig.thinking) {
    payload.thinking = modelConfig.thinking;
  } else {
    payload.temperature = 0.7;
  }

  if (modelConfig.reasoning_effort) {
    payload.reasoning_effort = modelConfig.reasoning_effort;
  }

  return payload;
}

module.exports = {
  buildDeepSeekChatPayload,
  getWeeklyReportModel,
  listWeeklyReportModels,
  loadWeeklyReportModelConfig
};
