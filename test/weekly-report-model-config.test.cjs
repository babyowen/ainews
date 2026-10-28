const assert = require('node:assert/strict');
const test = require('node:test');
const { getWeeklyReportModel, getAutomaticReportModel, listWeeklyReportModels, buildDeepSeekChatPayload } = require('../services/weeklyReportModelConfig.cjs');

test('all public model choices resolve to the verified supplier ID without exposing credentials', () => {
  const list = listWeeklyReportModels();
  assert.equal(list.length, 2);
  assert.equal(list[0].model, 'DeepSeek-V4.1-Flash');
  assert.equal(list[0].provider, 'agent-router');
  assert.equal(list[0].isDefault, true);
  assert.equal(Object.hasOwn(list[0], 'apiKey'), false);
  assert.equal(Object.hasOwn(list[0], 'endpoint'), false);
  assert.equal(getWeeklyReportModel().apiKey, 'AGENT_ROUTER_API_KEY');
  assert.equal(list.filter(model => model.isAutoReportDefault).length, 1);
  assert.equal(list.find(model => model.isAutoReportDefault).model, 'deepseek-v4-pro-0813');
  for (const model of list) {
    assert.equal(Object.hasOwn(model, 'apiKey'), false);
    assert.equal(Object.hasOwn(model, 'endpoint'), false);
  }
});

test('automatic reports use reasoning Pro while manual and policy defaults stay on Flash', () => {
  const automatic = getAutomaticReportModel();
  assert.equal(automatic.key, 'deepseek-v4-pro-0813');
  assert.equal(getWeeklyReportModel(automatic.key).model, 'deepseek-v4-pro-0813');
  const payload = buildDeepSeekChatPayload(automatic, [{ role: 'user', content: '生成周报' }]);
  assert.equal(payload.model, 'deepseek-v4-pro-0813');
  assert.deepEqual(payload.thinking, { type: 'enabled' });
  assert.equal(payload.max_tokens, 65536);
  assert.equal(Object.hasOwn(payload, 'temperature'), false);
  assert.equal(getWeeklyReportModel().model, 'DeepSeek-V4.1-Flash');
});

test('saved legacy task keys resolve to the unified model; unknown keys fail explicitly', () => {
  for (const key of ['deepseek-v4-pro', 'deepseek-v4-flash', 'kimi-k2', undefined]) {
    assert.equal(getWeeklyReportModel(key).key, 'deepseek-v4.1-flash');
    assert.equal(getWeeklyReportModel(key).endpoint, 'http://api.agent-router.cn/v1/chat/completions');
  }
  assert.throws(() => getWeeklyReportModel('unknown-model'), /Unknown weekly report model/);
});

test('JSON requests disable reasoning, reserve output budget, and cannot override the fixed model', () => {
  const payload = buildDeepSeekChatPayload(getWeeklyReportModel(), [{ role: 'user', content: 'extract json' }], false, {
    response_format: { type: 'json_object' }, model: 'unexpected-model',
  });
  assert.equal(payload.model, 'DeepSeek-V4.1-Flash');
  assert.equal(payload.thinking.type, 'disabled');
  assert.equal(payload.max_tokens, 32768);
  assert.equal(payload.reasoning_effort, undefined);
  assert.deepEqual(payload.response_format, { type: 'json_object' });
});

test('legacy LLM management service loads under CommonJS and exposes only the unified model', () => {
  const LLMService = require('../services/llmService.cjs');
  const service = new LLMService();
  assert.equal(service.getAvailableModels().filter(model => model.isActive).length, 1);
  assert.equal(service.getActiveModelConfig().model, 'DeepSeek-V4.1-Flash');
  assert.throws(() => service.switchModel('kimi-k2'), /不支持用户切换模型/);
  assert.equal(service.reloadConfig().activeModel, 'deepseek-v4.1-flash');
});
