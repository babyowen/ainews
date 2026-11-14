const test = require('node:test');
const assert = require('node:assert/strict');
const { sourceContext, applyWeeklyNewsRules, buildNewsContent, buildPotentialCustomerNewsContent } = require('../services/weeklyReportNews.cjs');
const topic='江苏机关事务';
const row={keyword:topic,sourceapi:'极致了api',source:'鹭岛后勤',
  link:'https://mp.weixin.qq.com/s?__biz=MzIwMTU0MzE1Nw%3D%3D&mid=123&idx=1',
  title:'我局跨地区交流',content:'我局赴杭州市交流，学习浙江经验。',short_summary:'我局赴杭州市交流。'};

test('independent publisher context preserves short text and explicit out-of-region destination',()=>{
  const before=structuredClone(row);
  assert.deepEqual(sourceContext(row,topic),{发布账号:'鹭岛后勤',账号辖区:'福建省厦门市',账号层级:'市级'});
  for(const version of ['short','full']) {
    const value=buildNewsContent([row],version,topic);
    assert.equal(value,'来源上下文：{"发布账号":"鹭岛后勤","账号辖区":"福建省厦门市","账号层级":"市级"}\n新闻1标题:我局跨地区交流\n新闻1内容:'+(version==='short'?row.short_summary:row.content));
  }
  assert.deepEqual(row,before);
});

test('publisher identity comes from verified link, never display nickname or supplied geography',()=>{
  const value=sourceContext({...row,source:'国管局',region:'江苏',source_context:{账号辖区:'北京'}},topic);
  assert.equal(value.发布账号,'鹭岛后勤');assert.equal(value.账号辖区,'福建省厦门市');
});

test('unknown, disabled, malformed and conflicting identities do not enrich a report',async t=>{
  const cases=[
    ['other topic',row,'公积金'],['conflicting keyword',{...row,keyword:'公积金'},topic],
    ['conflicting main keyword',{...row,main_keyword:'养老'},topic],
    ['other provider',{...row,sourceapi:'serp_bing'},topic],['missing provider',{...row,sourceapi:undefined},topic],
    ['nickname only',{...row,link:''},topic],['short URL',{...row,link:'https://mp.weixin.qq.com/s/opaque'},topic],
    ['wrong host',{...row,link:row.link.replace('mp.weixin.qq.com','mp.weixin.qq.com.example.org')},topic],
    ['credentials',{...row,link:row.link.replace('https://','https://user@')},topic],
    ['repeated biz',{...row,link:row.link+'&__biz=MzIwMTU0MzE1Nw%3D%3D'},topic],
    ['repeated mid',{...row,link:row.link+'&mid=124'},topic],
    ['bad index',{...row,link:row.link.replace('idx=1','idx=0')},topic],
    ['disabled Ningbo',{...row,link:row.link.replace('MzIwMTU0MzE1Nw%3D%3D','MzUyNjY1NTc5NA%3D%3D')},topic],
    ['unknown account',{...row,link:row.link.replace('MzIwMTU0MzE1Nw%3D%3D','Tm90VmVyaWZpZWQ%3D')},topic],
    ['wrong ghid',{...row,wechat_ghid:'gh_wrong'},topic],
    ['wrong article identity',{...row,wechat_article_id:'wrong'},topic],
  ];
  for(const [name,article,keyword] of cases)await t.test(name,()=>{
    assert.equal(sourceContext(article,keyword),null);
    const prompt=applyWeeklyNewsRules('固定提示词\n末尾空格  ',[article],keyword);
    assert.ok(prompt.startsWith('固定提示词\n末尾空格  '));
    assert.doesNotMatch(prompt,/官微来源地域使用规则/);
    if(keyword!==topic) assert.equal(prompt,'固定提示词\n末尾空格  ');
    assert.doesNotMatch(buildNewsContent([article],'short',keyword),/来源上下文/);
  });
});

test('source rule appends to the exact original prompt and leaves non-government requests untouched',()=>{
  const original='我的固定系统提示词\n## 自定义格式\n保留末尾空格  ';
  const result=applyWeeklyNewsRules(original,[row],topic);
  assert.ok(result.startsWith(original+'\n\n'));
  assert.match(result,/账号辖区不等于事件发生地/);
  assert.match(result,/正文明确的主体与地点关系优先/);
  assert.match(result,/不得因专题名含“江苏”/);
  assert.equal(applyWeeklyNewsRules(original,[],topic),original);
  assert.equal(applyWeeklyNewsRules(original,[row],'养老'),original);
});

test('mixed-source input labels only verified articles and preserves source ordering',()=>{
  const value=buildNewsContent([row,{...row,sourceapi:'serp_bing',title:'第二篇'}],'short',topic);
  assert.equal(value.match(/来源上下文/g).length,1);
  assert.ok(value.indexOf('福建省厦门市')<value.indexOf('新闻1标题:'));
  assert.ok(value.indexOf('新闻1内容:')<value.indexOf('新闻2标题:第二篇'));
});

test('potential-customer templates also carry geography without changing selected material',()=>{
  const value=buildPotentialCustomerNewsContent([{...row,search_keyword:'机关单位'}],'full',topic);
  assert.match(value,/来源上下文[^\n]*福建省厦门市/);
  assert.ok(value.endsWith('这是我的潜在客户<机关单位>，以下是我搜索到的新闻<我局赴杭州市交流，学习浙江经验。>'));
  assert.equal(buildPotentialCustomerNewsContent([row],'short','养老'),'这是我的潜在客户<未知客户>，以下是我搜索到的新闻<我局赴杭州市交流。>');
});

test('central publisher and municipality level are distinguished without inferring event geography',()=>{
  const central={...row,link:row.link.replace('MzIwMTU0MzE1Nw%3D%3D','MzA3MDc2NzA4Nw%3D%3D')};
  assert.deepEqual(sourceContext(central,topic),{发布账号:'国管局',账号辖区:'中央机关',账号层级:'国家级'});
  const tianjin={...row,link:row.link.replace('MzIwMTU0MzE1Nw%3D%3D','Mzg2MjU5ODk0NA%3D%3D')};
  assert.deepEqual(sourceContext(tianjin,topic),{发布账号:'天津机关事务',账号辖区:'天津市',账号层级:'省级（直辖市）'});
});


test('government layout applies to website-only material without granting publisher inference',()=>{
  const original='原有格式和日期规则  ';
  const website={...row,sourceapi:'serp_bing',link:'https://example.org/news'};
  const result=applyWeeklyNewsRules(original,[website],topic);
  assert.ok(result.startsWith(original+'\n\n'));
  assert.match(result,/# 机关事务周报分组与地区呈现/);
  assert.match(result,/同一业务分类只出现一次/);
  assert.match(result,/子列表/);
  assert.doesNotMatch(result,/# 官微来源地域使用规则/);
  assert.equal(applyWeeklyNewsRules(original,[website],'公积金'),original);
  assert.equal(applyWeeklyNewsRules(original,[],topic),original);
});

test('source guidance resolves actor separately from destination, quotations and legal agency names',()=>{
  const result=applyWeeklyNewsRules('原提示词',[row],topic);
  assert.match(result,/我局.*本局.*我省.*我市/);
  assert.match(result,/引语/);
  assert.match(result,/访问地/);
  assert.match(result,/不得.*法定全称/);
  assert.match(result,/不保留没有明确先行主体的/);
  assert.match(result,/仅合并分类标题/);
});
