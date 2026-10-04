const test=require('node:test');const assert=require('node:assert/strict');
const {createPolicyNewsQuery,normalizePolicyFilters}=require('../services/policyNewsQuery.cjs');
const {rows,fakeFundPool}=require('./fixtures/fundNews.cjs');
const dates={startDate:'2026-10-01',endDate:'2026-10-03'};
test('严格校验日期、上限、业务和地区格式',async()=>{
 for(const extra of [{startDate:'2026-02-30'},{endDate:'2025-01-01'},{startDate:'2024-01-01'},{businessTypes:[{level1:'错误'}]},{regions:[{name:'南京',level:'bad'}]},{tagState:'bad'}]) assert.throws(()=>normalizePolicyFilters({...dates,...extra}),e=>e.status===400);
 const api=createPolicyNewsQuery({pool:fakeFundPool()});
 await assert.rejects(api.query(dates,{pageSize:101}),e=>e.status===400);
});
test('筛选后去重分页，facet 忽略自身维度，正文仅按页读取',async()=>{
 const pool=fakeFundPool();const api=createPolicyNewsQuery({pool});
 const filters={...dates,regions:[{name:'江苏省',level:'province'}],businessTypes:[{level1:'贷款'}]};
 const result=await api.query(filters,{pageSize:1});
 assert.equal(result.total,2);assert.equal(result.rows.length,1);assert.equal(result.totalPages,2);
 assert.equal(result.businessFacets.find(x=>x.level1==='提取').count,1);
 assert.equal(result.regionTree.provinces[0].count,2);
 const details=pool.calls.find(c=>c.sql.includes('WHERE id IN'));
 assert.equal(details.args.length,1);assert.ok(result.rows[0].content);
 assert.deepEqual(pool.calls.find(c=>c.sql.includes('LIMIT 10001')).args,['公积金',3,'2026-10-01','2026-10-04']);
 assert.deepEqual(pool.calls.slice(-2).map(c=>c.sql),['ROLLBACK','RELEASE']);
});
test('候选超限不截断，别名仅缺表可降级，其他 SQL 错误失败并释放连接',async()=>{
 const large=Array.from({length:10001},(_,id)=>({...rows[0],id}));
 await assert.rejects(createPolicyNewsQuery({pool:fakeFundPool(large)}).query(dates),e=>e.status===413);
 const missing=fakeFundPool(rows,{aliasError:Object.assign(new Error('missing'),{code:'ER_NO_SUCH_TABLE'})});
 assert.ok((await createPolicyNewsQuery({pool:missing}).query(dates)).coverage.warnings.length);
 const denied=fakeFundPool(rows,{aliasError:Object.assign(new Error('denied'),{code:'ER_ACCESS_DENIED_ERROR'})});
 await assert.rejects(createPolicyNewsQuery({pool:denied}).query(dates),/denied/);
 assert.equal(denied.calls.at(-1).sql,'RELEASE');
});
test('报告最多200条；地区集合与材料来源保留，标签别名改变版本',async()=>{
 const filters={...dates,regions:[{name:'南京',level:'city'},{name:'苏州',level:'city'}],businessTypes:[{level1:'贷款'}]};
 const result=await createPolicyNewsQuery({pool:fakeFundPool()}).reportCandidates(filters);
 assert.equal(result.rows.length,2);assert.equal(result.rows.find(x=>x.id===1).matchedSelections.length,2);
 assert.equal(result.rows.filter(x=>x.id===1).length,1);
 const large=Array.from({length:201},(_,id)=>({...rows[0],id}));
 await assert.rejects(createPolicyNewsQuery({pool:fakeFundPool(large)}).reportCandidates(filters),e=>e.status===413);
});
test('MySQL DATE 的本地午夜不因转 UTC 而变成前一天',()=>{
 const {execFileSync}=require('node:child_process');
 const code="const {dateYmd}=require('./services/policyNewsQuery.cjs'); process.stdout.write(dateYmd(new Date(2026,9,2)));";
 for(const TZ of ['Asia/Shanghai','UTC','America/Los_Angeles']) assert.equal(execFileSync(process.execPath,['-e',code],{cwd:require('node:path').resolve(__dirname,'..'),env:{...process.env,TZ},encoding:'utf8'}),'2026-10-02');
});
