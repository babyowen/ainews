const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {randomUUID}=require('node:crypto');
const {createIsolatedApp}=require('./helpers/isolatedApp.cjs');const {fakeFundPool}=require('./fixtures/fundNews.cjs');
async function fixture(t,user={role:'admin',keywords:[],routes:[]}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fund-routes-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const configDir=path.join(dir,'config');fs.mkdirSync(path.join(configDir,'runtime'),{recursive:true});
 const password=randomUUID();fs.writeFileSync(path.join(configDir,'runtime/users.json'),JSON.stringify([{username:'custom',password,...user}]));
 const request=createIsolatedApp({configDir,dataDir:path.join(dir,'data'),pool:fakeFundPool()});
 const login=await request('POST','/api/auth/login',{username:'custom',password});return {request,token:login.body.token};
}
const query='startDate=2026-10-01&endDate=2026-10-03&regions=province%3A%3A江苏省&businessTypes='+encodeURIComponent(JSON.stringify([{level1:'贷款'}]));
test('地区与业务新闻返回相同 ID；省级低分新闻排除；每日固定关键词和单日',async t=>{
 const {request,token}=await fixture(t);
 const region=await request('GET','/api/policy/region-news?'+query,null,token);
 const business=await request('GET','/api/provident-fund/business-news?'+query,null,token);
 assert.equal(region.status,200);assert.equal(business.status,200);assert.deepEqual(region.body.rows.map(x=>x.id),business.body.rows.map(x=>x.id));assert.equal(region.body.total,2);
 const daily=await request('GET','/api/provident-fund/news?date=2026-10-02&keyword=养老',null,token);assert.equal(daily.status,200);assert.equal(daily.body.total,5);
 assert.ok(daily.body.rows.every(x=>x.keyword==='公积金'));
});
test('接口执行叶子权限；未登录401、无关键词403、不隐式授予业务或报告',async t=>{
 const {request,token}=await fixture(t,{role:'restricted',keywords:['公积金'],routes:['/policy/regions']});
 assert.equal((await request('GET','/api/policy/region-news?'+query)).status,401);
 assert.equal((await request('GET','/api/policy/region-news?'+query,null,token)).status,200);
 assert.equal((await request('GET','/api/provident-fund/business-news?'+query,null,token)).status,403);
 assert.equal((await request('GET','/api/provident-fund/news?date=2026-10-02',null,token)).status,403);
 const missing=await fixture(t,{role:'restricted',keywords:['养老'],routes:['/policy/regions']});
 assert.equal((await missing.request('GET','/api/policy/region-news?'+query,null,missing.token)).status,403);
});
