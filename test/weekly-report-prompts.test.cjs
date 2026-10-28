const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const config = require('../config/keyword-prompts.json');
const auto = require('../config/auto-report-config.json');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');

// Production heading guidance plus the approved 2026-10-28 reporting-period
// revision for 养老/公积金. 烟草服务银行 remains unchanged. Removing the heading
// clarification protects the rest of each approved prompt and selected ID.
const baseline = [
  ['养老', 'prompt-1760599514629', 'a12a417c04f831a77bbe4183906baee3ffb60fb9fb2bade538033eab3887875c', '684cab8992941df0b07626cfe338001da986de77b2283d1131fe70af0b2d01d2'],
  ['公积金', 'prompt-1760599287921', 'db57f73892167fdc1b4c61d06ed69362f15952c8674c412cbcfb05fdef40b308', '69a5c1f743e5b36321a171c210550601b7e0566d567606614ae40a8ab5059320'],
  ['烟草服务银行', 'v1', '36c87e25303f24230e4f9d45c195f82d556c6d21a1c4c81aaec0c4be579efd49', '10f87e3a50de9ea2ccb2e91c89b8af9a54df02835311503f8a64e417a93aa9aa'],
];

for (const [keyword, id, systemHash, userHash] of baseline) {
  test(`${keyword}: preserve heading format, approved editorial content and prompt selection`, () => {
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
