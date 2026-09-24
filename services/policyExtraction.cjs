const { completeChat } = require('./modelClient.cjs');

function countPolicyDetails(policy) {
  if (!Array.isArray(policy?.政策领域)) return 0;
  return policy.政策领域.reduce((total, domain) => total + (
    Array.isArray(domain?.政策类别) ? domain.政策类别.reduce((sum, category) => (
      sum + (Array.isArray(category?.政策明细) ? category.政策明细.length : 0)
    ), 0) : 0
  ), 0);
}

function parsePolicy(text) {
  const policy = JSON.parse(text);
  if (!Array.isArray(policy?.政策领域) || policy.政策领域.some(domain => (
    !Array.isArray(domain?.政策类别) || domain.政策类别.some(category => (
      !Array.isArray(category?.政策明细) || category.政策明细.some(item => (
        !item || typeof item.内容 !== 'string' || !item.内容.trim()
      ))
    ))
  ))) throw new SyntaxError('模型返回的政策结构不完整');
  return policy;
}

async function extractPolicy(systemPrompt, userPrompt, options = {}) {
  const { call = completeChat, ...requestOptions } = options;
  const extra = { thinking: { type: 'disabled' }, max_tokens: 32768, response_format: { type: 'json_object' } };
  const raw = await call([
    { role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt },
  ], { ...requestOptions, extra });
  let result;
  try {
    result = parsePolicy(raw);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    // 仅格式错误重试一次；鉴权、截断、空正文等调用错误直接交给用户。
    const repaired = await call([
      { role: 'system', content: '你是JSON格式修复器。保留原有政策信息，只输出合法JSON，结构为政策领域[] -> 政策类别[] -> 政策明细[]，明细必须包含内容字符串。禁止补造政策。' },
      { role: 'user', content: `修复以下JSON，不要改变政策事实：\n${raw}` },
    ], { ...requestOptions, extra });
    result = parsePolicy(repaired);
  }
  if (!countPolicyDetails(result)) throw new Error('未提取到有效政策，请检查所选周报内容后重试');
  return result;
}

module.exports = { extractPolicy, countPolicyDetails, parsePolicy };
