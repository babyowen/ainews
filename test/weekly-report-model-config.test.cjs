const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..');

test('weekly report model config is separate and contains DeepSeek V4 models only as model metadata', () => {
  const configPath = path.join(rootDir, 'config/weekly-report-models.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  assert.equal(config.defaultModelKey, 'deepseek-v4-pro');
  assert.equal(config.models['deepseek-v4-flash'].model, 'deepseek-v4-flash');
  assert.equal(config.models['deepseek-v4-pro'].model, 'deepseek-v4-pro');
  assert.equal(config.models['deepseek-v4-flash'].endpoint, 'https://api.deepseek.com/chat/completions');
  assert.equal(config.models['deepseek-v4-pro'].endpoint, 'https://api.deepseek.com/chat/completions');

  for (const modelConfig of Object.values(config.models)) {
    assert.equal(modelConfig.apiKey, 'DEEPSEEK_API_KEY');
    assert.equal(modelConfig.contextWindow, 1000000);
    assert.equal(Object.hasOwn(modelConfig, 'systemPrompt'), false);
    assert.equal(Object.hasOwn(modelConfig, 'userPrompt'), false);
    assert.equal(Object.hasOwn(modelConfig, 'prompts'), false);
  }
});

test('weekly report model resolver defaults to DeepSeek V4 Pro and rejects unknown keys', () => {
  const { getWeeklyReportModel, listWeeklyReportModels } = require('../services/weeklyReportModelConfig.cjs');

  const defaultModel = getWeeklyReportModel();
  assert.equal(defaultModel.key, 'deepseek-v4-pro');
  assert.equal(defaultModel.model, 'deepseek-v4-pro');

  const publicModels = listWeeklyReportModels();
  assert.deepEqual(publicModels.map((model) => model.key), ['deepseek-v4-flash', 'deepseek-v4-pro']);
  assert.equal(publicModels.some((model) => Object.hasOwn(model, 'apiKey')), false);

  assert.throws(() => getWeeklyReportModel('unknown-model'), /Unknown weekly report model/);
});

test('DeepSeek payload builder supports policy JSON extraction options', () => {
  const { buildDeepSeekChatPayload, getWeeklyReportModel } = require('../services/weeklyReportModelConfig.cjs');
  const model = getWeeklyReportModel('deepseek-v4-pro');

  const payload = buildDeepSeekChatPayload(model, [{ role: 'user', content: 'extract json' }], false, {
    max_tokens: 4096,
    response_format: { type: 'json_object' }
  });

  assert.equal(payload.model, 'deepseek-v4-pro');
  assert.deepEqual(payload.response_format, { type: 'json_object' });
  assert.equal(payload.max_tokens, 4096);
});
