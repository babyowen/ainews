const assert = require('node:assert/strict');
const test = require('node:test');
const { applyWeeklyReportEditorialRules: apply, appendWeeklyReportDateReminder } = require('../services/weeklyReportEditorial.cjs');
const library = require('../config/keyword-prompts.json');

test('all weekly template versions receive date/quote rules without changing the stored template', () => {
  for (const [keyword, entry] of Object.entries(library.keywords)) {
    for (const prompt of entry.prompts) {
      const saved = prompt.systemPrompt;
      const effective = apply(saved);
      assert.ok(effective.includes(saved.trimEnd()), `${keyword}/${prompt.id} keeps its original theme/structure`);
      assert.match(effective, /不能因为缺少日期而删除普通新闻或观点/);
      assert.match(effective, /明确发生在报告期外、没有本期新增动作的事项，必须剔除/);
      assert.match(effective, /明确在报告期外发表.*从观点摘录删除/);
      assert.match(effective, /日期、主体、数字存在实质冲突.*仍须保留必要的不确定性/);
      assert.equal(prompt.systemPrompt, saved);
      assert.equal(apply(effective), effective);
    }
  }
});

test('final reminder binds both date boundaries after the news and distinguishes unknown from known-old events', () => {
  const prompt = appendWeeklyReportDateReminder('原始新闻内容', { startDate: '2026-10-25', endDate: '2026-10-31' });
  assert.ok(prompt.startsWith('原始新闻内容\n\n'));
  assert.match(prompt, /本次报告期严格为 2026-10-25 至 2026-10-31/);
  assert.match(prompt, /早于 2026-10-25 或晚于 2026-10-31/);
  assert.match(prompt, /“日期未知”，不同于上条“已知期外”/);
  assert.match(prompt, /期前旧政策仅写了原日期仍不算合格本期新闻/);
  assert.match(prompt, /不要因为文章混有旧背景.*独立服务事项、业务做法或观点一起删除/);
  assert.match(prompt, /同一事项的重复报道.*合并后就不能把它重新当作日期未知/);
});

test('live coverage-first instructions are reconciled before adding shared rules', () => {
  const saved = `地域、业务分类和充分覆盖保持原样。
4. 日期只有“近日”或未载明，但含可核实的具体动作，以“参考动态（事件日期未载明）：”开头。
5. 综述只概括日期可确认的本期新事，写未能确认本期新增事项。
7. 核查旧闻回流及参考标注。
用1—2句话概括有日期依据的本期主要动作；参考动态不支撑“本周新增”主线。
旧引语不作为当周新观点；日期未明的标明时间不确定性。
日期未明的具体参考做法按前述规则后排标注时间不确定性。`;
  const effective = apply(saved);
  assert.ok(effective.startsWith('地域、业务分类和充分覆盖保持原样。'));
  assert.doesNotMatch(effective, /以“参考动态（事件日期未载明）：”开头|日期未明的标明时间不确定性|后排标注时间不确定性/);
  assert.match(effective, /同类有明确期内日期的事项之后排列/);
  assert.match(effective, /没有明确发表\/采访日期且无期外证据的，正常写/);
  assert.equal(apply(effective), effective);
});
