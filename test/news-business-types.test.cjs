const test = require('node:test');
const assert = require('node:assert/strict');
const {decodeBusinessTypes, matchesBusinessTypes, countBusinessTypes} = require('../services/newsBusinessTypes.cjs');
test('标签状态、结构错误和去重', () => {
  assert.equal(decodeBusinessTypes(null).status, 'pending');
  assert.equal(decodeBusinessTypes('[]').status, 'unidentified');
  for (const value of ['{', '{}', [{level1:'未知',level2:'项目'}], [{level1:'贷款'}], [{level1:'贷款',level2:4}]]) assert.equal(decodeBusinessTypes(value).status, 'invalid');
  const tag={level1:'贷款',level2:'额度'};
  assert.deepEqual(decodeBusinessTypes(JSON.stringify([tag,tag])).tags,[tag]);
});
test('别名身份包含一级，链可归并，循环不会挂起或误归类', () => {
  const aliases=[{level1:'贷款',retired_level2:'A',canonical_level2:'B'},{level1:'贷款',retired_level2:'B',canonical_level2:'C'}];
  assert.deepEqual(decodeBusinessTypes([{level1:'贷款',level2:'A'},{level1:'提取',level2:'A'}], aliases).tags,[{level1:'贷款',level2:'C'},{level1:'提取',level2:'A'}]);
  assert.equal(decodeBusinessTypes([{level1:'贷款',level2:'A'}],[...aliases,{level1:'贷款',retired_level2:'C',canonical_level2:'A'}]).status,'invalid');
});
test('一级按新闻 ID 并集计数；同维度 OR；二级精确匹配', () => {
  const tags=[{level1:'贷款',level2:'额度'},{level1:'贷款',level2:'利率'}];
  assert.ok(matchesBusinessTypes(tags,[{level1:'提取'},{level1:'贷款',level2:'额度'}]));
  assert.equal(matchesBusinessTypes(tags,[{level1:'提取',level2:'额度'}]),false);
  const parent=countBusinessTypes([{id:1,businessTypes:tags},{id:1,businessTypes:tags},{id:2,businessTypes:tags.slice(0,1)}]).find(x=>x.level1==='贷款');
  assert.equal(parent.count,2);
  assert.deepEqual(parent.children.map(x=>x.count).sort(),[1,2]);
});
