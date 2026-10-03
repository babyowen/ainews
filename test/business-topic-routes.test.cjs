const test=require('node:test');const assert=require('node:assert/strict');const {fundApp}=require('./helpers/fundApp.cjs');
const filters={startDate:'2026-10-01',endDate:'2026-10-03',regions:[{name:'南京',level:'city'},{name:'苏州',level:'city'}],businessTypes:[{level1:'贷款'}]};
const prefix='/api/provident-fund/business-report';
const search=input=>new URLSearchParams(Object.entries(input).map(([k,v])=>[k,typeof v==='string'?v:JSON.stringify(v)])).toString();
const preview=(app,input=filters,base=prefix)=>app.request('GET',`${base}/news?${search(input)}`);
test('真实路由：预览、人工排除、生成和 PDF 使用同一份材料；类型由路径固定',async t=>{
 const app=await fundApp(t);const p=await preview(app);assert.equal(p.status,200);
 const response=await app.request('POST',prefix+'/generate',{...filters,previewHash:p.body.previewHash,manualOverrides:{2:false},reportKind:'region'});
 assert.equal(response.status,200,JSON.stringify(response.body));assert.equal(response.body.snapshot.reportKind,'business');assert.equal(app.calls.length,1);
 assert.deepEqual(response.body.snapshot.newsReferences.map(r=>r.id),[1]);
 assert.ok(app.calls[0].messages[1].content.includes('80万元'));assert.ok(!app.calls[0].messages[1].content.includes('南京贷款办理指南'));
 app.rows[0].short_summary='上游已改变';
 const exported=await app.request('POST',prefix+'/export-pdf',response.body);assert.equal(exported.status,200);assert.deepEqual(app.exports[0].newsReferences.map(r=>r.id),[1]);
 assert.equal((await app.request('POST','/api/policy/region-report/export-pdf',response.body)).status,400);
 assert.equal((await app.request('POST',prefix+'/export-pdf',{...response.body,reportContent:'伪造'})).status,400);
});
test('预览后材料更新409，非法 ID 和已删除 Prompt 不调用模型',async t=>{
 const app=await fundApp(t);const p=await preview(app);
 app.rows[0].content+='更新';
 assert.equal((await app.request('POST',prefix+'/generate',{...filters,previewHash:p.body.previewHash})).status,409);
 const next=await preview(app);
 for(const extra of [{manualOverrides:{999:true}},{promptId:'does-not-exist'},{manualOverrides:{1:false}},{manualOverrides:{1:'yes'}}]) assert.equal((await app.request('POST',prefix+'/generate',{...filters,previewHash:next.body.previewHash,...extra})).status,400);
 const {createPromptStore}=require('../services/promptStore.cjs');
 createPromptStore({configDir:app.configDir}).deleteRegionPrompt('business-topic-comparison-v1');
 assert.equal((await app.request('POST',prefix+'/generate',{...filters,previewHash:next.body.previewHash})).status,400);
 assert.equal(app.calls.length,0);
});
test('地区与业务报告权限互相独立，地区单区域可生成',async t=>{
 for(const [path,base,denied] of [['/policy/region-report','/api/policy/region-report',prefix],['/provident-fund/business-report',prefix,'/api/policy/region-report']]) {
  const app=await fundApp(t,{user:{role:'restricted',keywords:['公积金'],routes:[path]}});
  assert.equal((await preview(app,filters,denied)).status,403);
  assert.equal((await app.request('POST',denied+'/generate',{})).status,403);
  const input=base===prefix?filters:{...filters,regions:[filters.regions[0]],businessTypes:[]};
  const p=await preview(app,input,base);assert.equal(p.status,200);
  assert.equal((await app.request('POST',base+'/generate',{...input,previewHash:p.body.previewHash})).status,200);
 }
});
test('非法模型来源和空输出不得作为成功报告返回',async t=>{
 for(const completion of ['', '## 错误报告 [N999]']) {
  const app=await fundApp(t,{completion});const p=await preview(app);
  assert.equal((await app.request('POST',prefix+'/generate',{...filters,previewHash:p.body.previewHash})).status,502);
 }
});
