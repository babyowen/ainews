const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const config = require('../config/keyword-prompts.json');
const auto = require('../config/auto-report-config.json');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');

// Read-only production audit on 2026-10-14: no runtime prompt overrides.
// Removing only the approved formatting clarification must recover each exact
// production prompt, protecting business guidance and the selected Prompt IDs.
const baseline = [
  ['养老', 'prompt-1760599514629', '54bf0b11cfab278acea2fd02d04a7ecdb73c262193c3cbc4f4b02b0a63650653', '7965ea2699fb617a8076b489b3e2fb4b459c7346a0b9e4891164e639c3d75940'],
  ['公积金', 'prompt-1760599287921', '84a55a923680620742826843573d4e52d1452c54acc8d904b868b03fdfe68162', '85610ec1974a3f79127be296afc386a5f87d65b5b429746c6d1856908a60bc30'],
  ['烟草服务银行', 'v1', '36c87e25303f24230e4f9d45c195f82d556c6d21a1c4c81aaec0c4be579efd49', '10f87e3a50de9ea2ccb2e91c89b8af9a54df02835311503f8a64e417a93aa9aa'],
];

for (const [keyword, id, systemHash, userHash] of baseline) {
  test(`${keyword}: clarify heading format while preserving production business content and selection`, () => {
    const prompt = config.keywords[keyword].prompts.find(item => item.id === id);
    assert.equal(auto.keywords[keyword].promptId, id);
    assert.equal(prompt.isDefault, true);
    assert.match(prompt.systemPrompt, /首行必须原样输出 `## 一、当周新闻综述`/);
    assert.match(prompt.systemPrompt, /分类标题写为 `### 分类名称`/);
    const restored = prompt.systemPrompt
      .replace(/^- \*\*章节格式必须保留 Markdown 标记：\*\*[^\n]*\n/m, '')
      .replace('- **首行必须原样输出 `## 一、当周新闻综述`。**', '- **直接从"一、当周新闻综述"开始输出。**')
      .replace('- 首行必须原样输出 `## 一、当周新闻综述`，不要写开场白或自我介绍。', '- 直接从「一、当周新闻综述」开始输出，不要写开场白或自我介绍。');
    assert.equal(sha(restored), systemHash);
    assert.equal(sha(prompt.userPrompt), userHash);
  });
}
