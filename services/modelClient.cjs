const { getWeeklyReportModel, buildDeepSeekChatPayload } = require('./weeklyReportModelConfig.cjs');

function redactError(value) {
  let text = String(value || '模型调用失败');
  for (const [name, secret] of Object.entries(process.env)) {
    if (/(KEY|TOKEN|PASSWORD|SECRET|PASS)$/.test(name) && secret && secret.length >= 8) {
      text = text.split(secret).join('[REDACTED]');
    }
  }
  return text.replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]').slice(0, 1000);
}

function readCompletion(data) {
  if (data?.error) throw new Error(redactError(data.error.message || data.error));
  const choice = data?.choices?.[0];
  if (choice?.finish_reason === 'length') {
    throw new Error('模型输出达到 token 上限，结果已截断；请减少输入内容后重试');
  }
  if (choice?.finish_reason && choice.finish_reason !== 'stop') {
    throw new Error(`模型未正常完成输出（${choice.finish_reason}）`);
  }
  const content = choice?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('模型未返回有效正文，可能只有思考内容；请重试');
  }
  return content;
}

async function checkResponse(response) {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`模型供应商 HTTP ${response.status}: ${redactError(text)}`);
  }
}

async function verifyModel(modelConfig, { fetchImpl, headers, signal }) {
  const url = new URL('models', modelConfig.endpoint);
  // chat/completions 的同级 API 根路径是 /v1/。
  url.pathname = new URL(modelConfig.endpoint).pathname.replace(/chat\/completions$/, 'models');
  const response = await fetchImpl(url.href, { headers, signal, redirect: 'error' });
  await checkResponse(response);
  const data = await response.json();
  if (!data.data?.some(model => model.id === modelConfig.model)) {
    throw new Error(`供应商未提供配置的模型 ${modelConfig.model}，请联系管理员检查配置`);
  }
}

// 超时覆盖模型列表、响应头及整个响应体；失败时不回退到其他供应商。
async function withModelResponse(messages, options, consume) {
  const {
    modelConfig = getWeeklyReportModel(), extra = {}, stream = false,
    timeoutMs = 180000, fetchImpl = fetch,
  } = options;
  const apiKey = process.env[modelConfig.apiKey];
  if (!apiKey) throw new Error(`环境变量 ${modelConfig.apiKey} 未配置`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` };
  try {
    if (modelConfig.provider === 'agent-router') {
      await verifyModel(modelConfig, { fetchImpl, headers, signal: controller.signal });
    }
    const response = await fetchImpl(modelConfig.endpoint, {
      method: 'POST', headers, signal: controller.signal, redirect: 'error',
      body: JSON.stringify(buildDeepSeekChatPayload(modelConfig, messages, stream, extra)),
    });
    await checkResponse(response);
    return await consume(response);
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`LLM API request timed out after ${timeoutMs}ms；模型响应超时，请减少输入后重试`);
    throw new Error(redactError(error.message));
  } finally {
    clearTimeout(timer);
  }
}

async function completeChat(messages, options = {}) {
  return withModelResponse(messages, options, async response => readCompletion(await response.json()));
}

async function streamChat(messages, onDelta, options = {}) {
  return withModelResponse(messages, { ...options, stream: true }, async response => {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';
    let finishReason;
    let done = false;
    function consumeLine(line) {
      if (!line.startsWith('data:')) return;
      const text = line.slice(5).trim();
      if (!text) return;
      if (text === '[DONE]') { done = true; return; }
      const data = JSON.parse(text);
      if (data.error) throw new Error(redactError(data.error.message || data.error));
      const choice = data.choices?.[0];
      if (choice?.finish_reason) finishReason = choice.finish_reason;
      if (choice?.delta?.reasoning_content) onDelta('reasoning', choice.delta.reasoning_content);
      if (choice?.delta?.content) {
        content += choice.delta.content;
        onDelta('content', choice.delta.content);
      }
    }
    try {
      while (!done) {
        const part = await reader.read();
        buffer += decoder.decode(part.value, { stream: !part.done });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) consumeLine(line);
        if (part.done) { if (buffer.trim()) consumeLine(buffer); break; }
      }
      if (!finishReason) throw new Error('模型流式响应中断，未收到完成标记；请重试');
      return readCompletion({ choices: [{ finish_reason: finishReason, message: { content } }] });
    } finally {
      await reader.cancel().catch(() => {});
    }
  });
}

module.exports = { completeChat, streamChat, readCompletion, redactError };
