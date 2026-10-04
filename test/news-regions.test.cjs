const test=require('node:test');
const assert=require('node:assert/strict');
const {normalizeRegionSelections,getMatchedRegionsForSelection,buildRegionTree}=require('../services/newsRegions.cjs');
const match=(region,name,level)=>getMatchedRegionsForSelection(region,normalizeRegionSelections([{name,level}])[0]);
test('已知地区别名统一，省级本身与省内合计分开',()=>{
 assert.deepEqual(match('江苏|南京|南京市','江苏','province'),['江苏省','南京']);
 assert.deepEqual(match('江苏|南京','江苏省','provincial'),['江苏省']);
 assert.deepEqual(match('南京|苏州','南京市','city'),['南京']);
 assert.deepEqual(match('北京|北京市','北京','municipality'),['北京市']);
 assert.deepEqual(match('新加坡|南京','南京','city'),['南京']);
 assert.deepEqual(match('全国|南京','全国','national'),['全国']);
 assert.deepEqual(getMatchedRegionsForSelection('未知市',{name:'未知',level:'city'}),[]);
 assert.throws(()=>normalizeRegionSelections([{name:'南京',level:'invalid'}]),/地区/);
});
test('地区树父级按 ID 并集计数，别名合并且缺失可见',()=>{
 const tree=buildRegionTree([{id:1,region:'江苏|南京|苏州'},{id:2,region:'南京市'},{id:3,region:null},{id:4,region:'全国'},{id:5,region:'北京|北京市'}]);
 const js=tree.provinces.find(x=>x.name==='江苏省');
 assert.equal(js.count,2);assert.equal(js.provincialCount,1);
 assert.equal(js.cities.find(x=>x.name==='南京').count,2);
 assert.equal(tree.unknownCount,1);assert.equal(tree.national.count,1);assert.equal(tree.municipalities[0].count,1);
});
test('吉林市的城市身份在归一化、地区树、匹配和再次解析中保持不变',()=>{
 const selections=normalizeRegionSelections([{name:'吉林市',level:'city'}]);
 assert.deepEqual(normalizeRegionSelections(selections),selections);
 assert.deepEqual(getMatchedRegionsForSelection('吉林市',selections[0]),['吉林市']);
 const province=buildRegionTree([{id:1,region:'吉林市'}]).provinces[0];
 assert.equal(province.name,'吉林省');assert.equal(province.provincialCount,0);assert.equal(province.cities[0].name,'吉林市');
 assert.deepEqual(match('吉林市','吉林','provincial'),[]);
});
test('旧地区树平均分按去重后的新闻计算，不按重复地区加权',()=>{
 const tree=buildRegionTree([{id:1,region:'江苏|南京|苏州',score:5},{id:2,region:'南京市',score:3}]);
 assert.equal(tree.provinces[0].avgScore,'4.00');assert.equal(tree.provinces[0].cities.find(x=>x.name==='南京').avgScore,'4.00');
});
