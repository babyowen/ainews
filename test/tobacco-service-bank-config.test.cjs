const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..');
const keyword = '烟草服务银行';

test('tobacco service bank keyword is available to admin and frontend keyword config', async () => {
  const { KEYWORDS, KEYWORD_COLORS } = await import('../src/config/keywords.js');
  const users = JSON.parse(fs.readFileSync(path.join(rootDir, 'config/users.json'), 'utf8'));
  const admin = users.find((user) => user.username === 'admin');

  assert.equal(KEYWORDS.includes(keyword), true);
  assert.equal(typeof KEYWORD_COLORS[keyword], 'string');
  assert.equal(admin.keywords.includes(keyword), true);
});

test('tobacco service bank has default prompt with two-section report guidance', () => {
  const config = JSON.parse(fs.readFileSync(path.join(rootDir, 'config/keyword-prompts.json'), 'utf8'));
  const prompt = config.keywords?.[keyword]?.prompts?.find((item) => item.id === 'default');

  assert.ok(prompt);
  assert.equal(prompt.isDefault, true);
  assert.match(prompt.systemPrompt, /search_keyword/);
  assert.match(prompt.systemPrompt, /只输出两部分/);
  assert.match(prompt.systemPrompt, /不要输出第三部分/);
  assert.match(prompt.systemPrompt, /【江苏】/);
});

test('tobacco service bank auto report is enabled with score threshold four', () => {
  const config = JSON.parse(fs.readFileSync(path.join(rootDir, 'config/auto-report-config.json'), 'utf8'));
  const item = config.keywords?.[keyword];

  assert.equal(config.enabled, true);
  assert.equal(item.enabled, true);
  assert.equal(item.promptId, 'default');
  assert.equal(item.minScore, 4);
  assert.equal(item.summaryVersion, 'short');
});
