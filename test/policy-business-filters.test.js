import test from 'node:test';import assert from 'node:assert/strict';
import {parsePolicyBusinessSearch,serializePolicyBusinessSearch,toggleBusinessSelection,updatePolicySearch} from '../src/utils/policyBusinessFilters.js';
test('URL 保留多地区和业务二级身份，更新条件清除页码',()=>{
 const input={startDate:'2026-09-03',endDate:'2026-10-03',regions:[{name:'南京',level:'city'},{name:'苏州',level:'city'}],businessTypes:[{level1:'贷款',level2:'额度'}],tagState:'all'};
 assert.deepEqual(parsePolicyBusinessSearch(serializePolicyBusinessSearch(input)).businessTypes,input.businessTypes);
 assert.deepEqual(parsePolicyBusinessSearch(serializePolicyBusinessSearch(input)).regions,input.regions);
 assert.equal(new URLSearchParams(updatePolicySearch(serializePolicyBusinessSearch({...input,page:3}),{tagState:'without-valid-tags'})).get('page'),null);
});
test('选择父级删除冗余子项，点击同一项取消选择',()=>{
 const child={level1:'贷款',level2:'额度'};
 assert.deepEqual(toggleBusinessSelection([child],{level1:'贷款'}),[{level1:'贷款'}]);
 assert.deepEqual(toggleBusinessSelection([child],child),[]);
 assert.deepEqual(toggleBusinessSelection([{level1:'贷款'}],child),[child]);
});
