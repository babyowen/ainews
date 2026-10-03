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
