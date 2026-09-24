const assert = require('node:assert/strict');
const test = require('node:test');
const { completeChat, streamChat, readCompletion } = require('../services/modelClient.cjs');
const { getWeeklyReportModel } = require('../services/weeklyReportModelConfig.cjs');
const modelConfig = { ...getWeeklyReportModel(), apiKey: 'MODEL_CLIENT_TEST_KEY' };
process.env.MODEL_CLIENT_TEST_KEY = 'test-key-not-a-real-secret';
const messages = [{ role: 'user', content: 'test' }];
const ok = content => ({ choices: [{ finish_reason: 'stop', message: { content } }] });
const jsonResponse = data => new Response(JSON.stringify(data));
const models = () => jsonResponse({ data: [{ id: modelConfig.model }] });

test('checks live model availability before posting and uses only the configured gateway key/model', async () => {
  const calls = [];
  const text = await completeChat(messages, { modelConfig, fetchImpl: async (url, options) => {
    calls.push(url);
    assert.equal(options.headers.Authorization, 'Bearer test-key-not-a-real-secret');
    assert.equal(options.redirect, 'error');
    if (url.endsWith('/models')) return models();
    assert.equal(JSON.parse(options.body).model, 'DeepSeek-V4.1-Flash');
    return jsonResponse(ok('完整正文'));
  } });
  assert.equal(text, '完整正文');
  assert.deepEqual(calls, ['http://api.agent-router.cn/v1/models', 'http://api.agent-router.cn/v1/chat/completions']);
});

test('unavailable model does not send business data or fall back to another supplier', async () => {
  let calls = 0;
  await assert.rejects(completeChat(messages, { modelConfig, fetchImpl: async () => {
    calls++; return jsonResponse({ data: [{ id: 'different' }] });
  } }), /供应商未提供/);
  assert.equal(calls, 1);
});

test('truncated, empty, filtered and error responses cannot become a successful report', () => {
  for (const data of [
    { choices: [{ finish_reason: 'length', message: { content: '', reasoning_content: 'thoughts' } }] },
    { choices: [{ finish_reason: 'length', message: { content: 'partial text' } }] },
    ok(' '), { choices: [{ finish_reason: 'content_filter', message: { content: 'partial' } }] },
    { error: { message: 'upstream error' } },
  ]) assert.throws(() => readCompletion(data));
});

test('gateway errors are visible but credentials are redacted', async () => {
  await assert.rejects(completeChat(messages, { modelConfig, fetchImpl: async () => new Response(
    'error test-key-not-a-real-secret', { status: 401 }
  ) }), error => /401/.test(error.message) && /REDACTED/.test(error.message) && !error.message.includes('test-key-not-a-real-secret'));
});

function sseResponse(lines, byteSize = 3) {
  const bytes = new TextEncoder().encode(lines.join('\n\n'));
  return new Response(new ReadableStream({ start(controller) {
    for (let i = 0; i < bytes.length; i += byteSize) controller.enqueue(bytes.slice(i, i + byteSize));
    controller.close();
  } }));
}
function streamingFetch(lines) {
  return async url => url.endsWith('/models') ? models() : sseResponse(lines);
}

test('stream parser preserves Chinese and SSE events split across arbitrary network chunks', async () => {
  const deltas = [];
  const result = await streamChat(messages, (type, text) => deltas.push([type, text]), {
    modelConfig, fetchImpl: streamingFetch([
      'data: {"choices":[{"delta":{"reasoning_content":"分析","content":"完整"}}]}',
      'data: {"choices":[{"delta":{"content":"正文"},"finish_reason":"stop"}]}',
      'data: [DONE]',
    ]),
  });
  assert.equal(result, '完整正文');
  assert.deepEqual(deltas, [['reasoning', '分析'], ['content', '完整'], ['content', '正文']]);
});

test('truncated or interrupted streams reject even if they produced partial content', async () => {
  for (const ending of ['length', null]) {
    await assert.rejects(streamChat(messages, () => {}, { modelConfig, fetchImpl: streamingFetch([
      `data: ${JSON.stringify({ choices: [{ delta: { content: 'partial' }, finish_reason: ending }] })}`,
      'data: [DONE]',
    ]) }), /截断|中断/);
  }
});

test('timeout remains active while reading the response body', async () => {
  await assert.rejects(completeChat(messages, { modelConfig, timeoutMs: 15, fetchImpl: async (url, options) => {
    if (url.endsWith('/models')) return models();
    return { ok: true, json: () => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('body aborted')));
    }) };
  } }), /timed out/);
});
