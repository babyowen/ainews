import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStructuredPolicyComparisonReport, getPolicyComparisonReportStats } from '../src/pages/PolicyComparison/policyComparisonReport.js';

const card = (title, close = false) => `[[CARD|title=${title}]]
[[BLOCK|local]]
- 外地政策原文
${close ? '[[/BLOCK]]' : ''}
[[BLOCK|yangzhou]]
- 扬州政策原文
${close ? '[[/BLOCK]]' : ''}
[[BLOCK|diff]]
- 差异正文
${close ? '[[/BLOCK]]' : ''}
[[/CARD]]`;
const report = (count, close) => Array.from({ length: count }, (_, i) => `[[CITY|城市${i}]]
[[SUMMARY]]
- 概览${i}
[[/SUMMARY]]
[[CATEGORY|缴存]]
${card(`条目${i}`, close)}
${close ? '[[/CATEGORY]]' : ''}
[[/CITY]]`).join('\n');

test('optional category and block closers preserve all 74 items without leaking markers', () => {
  const implicit = buildStructuredPolicyComparisonReport(report(74, false));
  const explicit = buildStructuredPolicyComparisonReport(report(74, true));
  assert.deepEqual(explicit, implicit);
  assert.equal(getPolicyComparisonReportStats(explicit).totalMatched, 74);
  assert.deepEqual(explicit.intro, []);
  assert(!JSON.stringify(explicit).includes('[['));
});

test('category closer flushes a pending card and resets category, preserving prose', () => {
  const text = `开头说明\n[[CITY|广州]]\n[[CATEGORY|缴存]]\n${card('项目一').replace('[[/CARD]]', '')}\n[[/CATEGORY]]\n${card('项目二')}\n[[/CITY]]`;
  const result = buildStructuredPolicyComparisonReport(text);
  assert.deepEqual(result.intro, ['开头说明']);
  assert.deepEqual(result.cities[0].categories.map(c => c.title), ['缴存', '未分类']);
  assert.equal(getPolicyComparisonReportStats(result).totalMatched, 2);
});

test('missing-policy section remains intact with explicit block closer', () => {
  const result = buildStructuredPolicyComparisonReport('[[MISSING]]\n[[CARD|city=广州|category=其他|title=条目]]\n[[BLOCK|local]]\n- 完整原文\n[[/BLOCK]]\n[[/CARD]]\n[[/MISSING]]');
  assert.equal(result.missing.length, 1);
  assert.deepEqual(result.missing[0].localEntries, ['完整原文']);
  assert.deepEqual(result.intro, []);
});
