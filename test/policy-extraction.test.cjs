const assert = require('node:assert/strict');
const test = require('node:test');
const { extractPolicy, countPolicyDetails } = require('../services/policyExtraction.cjs');
const policy = { 政策领域: [{ 领域名称: '贷款', 政策类别: [{ 类别名称: '贷款额度', 政策明细: [{ 明细项: '额度', 内容: '80万元' }] }] }] };

test('extracts nonempty policy JSON with reasoning disabled and a sufficient output budget', async () => {
  const result = await extractPolicy('system', 'user', { call: async (_messages, options) => {
    assert.equal(options.extra.thinking.type, 'disabled');
    assert.equal(options.extra.max_tokens, 32768);
    assert.equal(options.extra.response_format.type, 'json_object');
    return JSON.stringify(policy);
  } });
  assert.equal(countPolicyDetails(result), 1);
});

test('upstream truncation and authentication errors are not retried as JSON repairs', async () => {
  let calls = 0;
  await assert.rejects(extractPolicy('s', 'u', { call: async () => { calls++; throw new Error('输出截断'); } }), /截断/);
  assert.equal(calls, 1);
});

test('malformed JSON gets one repair; permanently malformed output fails', async () => {
  let calls = 0;
  const result = await extractPolicy('s', 'u', { call: async () => ++calls === 1 ? '{broken' : JSON.stringify(policy) });
  assert.equal(countPolicyDetails(result), 1);
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(extractPolicy('s', 'u', { call: async () => { calls++; return '{}'; } }), /结构不完整/);
  assert.equal(calls, 2);
});

test('valid JSON with no policy details cannot proceed to comparison', async () => {
  await assert.rejects(extractPolicy('s', 'u', { call: async () => JSON.stringify({ 政策领域: [] }) }), /未提取到有效政策/);
});
