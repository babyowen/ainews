const test=require('node:test');const assert=require('node:assert/strict');const {fundApp}=require('./helpers/fundApp.cjs');
const filters={startDate:'2026-10-01',endDate:'2026-10-03',regions:[{name:'南京',level:'city'},{name:'苏州',level:'city'}],businessTypes:[{level1:'贷款'}]};
const prefix='/api/provident-fund/business-report';
const search=input=>new URLSearchParams(Object.entries(input).map(([k,v])=>[k,typeof v==='string'?v:JSON.stringify(v)])).toString();
const preview=(app,input=filters,base=prefix)=>app.request('GET',`${base}/news?${search(input)}`);
test('仅有常见问题和答疑材料时，业务报告仍可预览并生成',async t=>{
 const app=await fundApp(t);
 app.rows.splice(0,app.rows.length,...['南京市','苏州市'].map((region,i)=>({...app.rows[0],id:i+1,region,title:`住房公积金贷款${i===0?'常见问题':'答疑'}`,short_summary:'现行贷款办理规则',content:'贷款额度80万元。'})));
 const p=await preview(app);
 assert.equal(p.status,200);
 assert.equal(p.body.filteredNewsCount,2);
 const response=await app.request('POST',prefix+'/generate',{...filters,previewHash:p.body.previewHash});
 assert.equal(response.status,200,JSON.stringify(response.body));
 assert.deepEqual(response.body.snapshot.newsReferences.map(r=>[r.id,r.evidenceKind]).sort((a,b)=>a[0]-b[0]),[[1,'existing-rule'],[2,'existing-rule']]);
});
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
 for(const extra of [{manualOverrides:{999:true}},{promptId:'does-not-exist'},{manualOverrides:{1:false,2:false}},{manualOverrides:{1:'yes'}},{promptId:'single-region-default'}]) assert.equal((await app.request('POST',prefix+'/generate',{...filters,previewHash:next.body.previewHash,...extra})).status,400);
 const {createPromptStore}=require('../services/promptStore.cjs');
 createPromptStore({configDir:app.configDir}).deleteRegionPrompt('business-topic-brief-v3');
 assert.equal((await app.request('POST',prefix+'/generate',{...filters,previewHash:next.body.previewHash})).status,400);
 assert.equal(app.calls.length,0);
});
test('仅选择业务可生成；旧地区参数不限制新闻；自动采用业务模板且支持单地区材料',async t=>{
 const {SECTIONS}=require('../services/businessTopicReport.cjs');
 const app=await fundApp(t,{completion:SECTIONS.map(s=>`## ${s}\n规则 [N2]`).join('\n')});
 const input={...filters,regions:[{name:'北京',level:'municipality'}]};
 const p=await preview(app,input);
 assert.equal(p.status,200,JSON.stringify(p.body));
 assert.equal(p.body.rawNewsCount,2);
 assert.deepEqual(p.body.filters.regions,[]);
 assert.equal((await preview(app,{...filters,regions:[]})).body.previewHash,p.body.previewHash);
 const response=await app.request('POST',prefix+'/generate',{...input,previewHash:p.body.previewHash,manualOverrides:{1:false},userPrompt:'重点看额度'});
 assert.equal(response.status,200,JSON.stringify(response.body));
 assert.equal(response.body.snapshot.promptId,'business-topic-brief-v3');
 assert.deepEqual(response.body.snapshot.newsReferences.map(r=>r.id),[2]);
 assert.deepEqual(response.body.snapshot.regionCoverage.filter(r=>r.count).map(r=>r.name),['南京']);
 assert.match(response.body.debug.userPrompt,/重点看额度/);
 assert.match(response.body.debug.systemPrompt,/单地区/);
 const exported=await app.request('POST',prefix+'/export-pdf',response.body);
 assert.equal(exported.status,200);
 assert.deepEqual(app.exports[0].regions,['南京']);
});
test('部署新增默认业务模板后自动可用，旧地区自定义仍保留',async t=>{
 const fs=require('node:fs'),path=require('node:path');
 const app=await fundApp(t);
 const file=path.join(app.configDir,'region-policy-report-prompts.json');
 const released=JSON.parse(fs.readFileSync(file,'utf8'));
 const old={...released,prompts:released.prompts.filter(p=>!p.id.startsWith('business-topic-'))};
 fs.writeFileSync(file,JSON.stringify(old));
 const {createPromptStore}=require('../services/promptStore.cjs');
 const store=createPromptStore({configDir:app.configDir});
 const region=store.findRegionPrompt('single-region-default');
 store.saveRegionPrompt({...region,promptId:region.id,systemPrompt:'保留生产自定义地区提示词'});
 assert.equal(store.findRegionPrompt('business-topic-brief-v3'),null);
 fs.writeFileSync(file,JSON.stringify(released));
 assert.equal(store.findRegionPrompt('single-region-default').systemPrompt,'保留生产自定义地区提示词');
 const input={...filters,regions:[]};
 const p=await preview(app,input);
 const response=await app.request('POST',prefix+'/generate',{...input,previewHash:p.body.previewHash});
 assert.equal(response.status,200,JSON.stringify(response.body));
 assert.equal(response.body.snapshot.promptId,'business-topic-brief-v3');
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
test('合并引用统一为可点击的真实ID，并在PDF签名前完成规范化',async t=>{
 const {SECTIONS}=require('../services/businessTopicReport.cjs');
 const completion=SECTIONS.map(s=>`## ${s}\n对比 [N1,N2]`).join('\n');
 const app=await fundApp(t,{completion});const p=await preview(app);
 const response=await app.request('POST',prefix+'/generate',{...filters,previewHash:p.body.previewHash});
 assert.equal(response.status,200,JSON.stringify(response.body));
 assert.ok(response.body.reportContent.includes('[N1][N2]'));
 assert.equal(app.calls.length,1);
 assert.equal((await app.request('POST',prefix+'/export-pdf',response.body)).status,200);
 assert.equal(app.exports[0].reportContent,response.body.reportContent);
});
test('不存在的引用只纠正一次，对照原材料重新验证；仍错误则返回具体编号',async t=>{
 const {SECTIONS}=require('../services/businessTopicReport.cjs');
 const report=id=>SECTIONS.map(s=>`## ${s}\n事实 [N${id}]`).join('\n');
 for(const repairedId of [1,999]) {
  const calls=[];
  const app=await fundApp(t,{model:{async completeChat(messages){calls.push(messages);return report(calls.length===1?999:repairedId);}}});
  const p=await preview(app);
  const response=await app.request('POST',prefix+'/generate',{...filters,previewHash:p.body.previewHash});
  assert.equal(calls.length,2);
  assert.ok(calls[1][1].content.includes('80万元'));
  assert.match(calls[1].at(-1).content,/N1/);
  assert.match(calls[1].at(-1).content,/N999/);
  if(repairedId===1) {assert.equal(response.status,200);assert.ok(response.body.reportContent.includes('[N1]'));}
  else {assert.equal(response.status,502);assert.deepEqual(response.body.invalidCitationIds,['999']);assert.equal(response.body.exportSignature,undefined);}
 }
});
test('地区报告缺少模型密钥时显示配置原因，而不是输入过长',async t=>{
 const {completeChat}=require('../services/modelClient.cjs');
 const app=await fundApp(t,{model:{completeChat:(messages,{modelConfig})=>completeChat(messages,{modelConfig:{...modelConfig,apiKey:'KEYDIGEST_TEST_ABSENT_KEY'},fetchImpl:()=>{throw new Error('unexpected network request');}})}});
 const base='/api/policy/region-report';
 const p=await preview(app,filters,base);assert.equal(p.status,200);
 const result=await app.request('POST',base+'/generate',{...filters,previewHash:p.body.previewHash});
 assert.equal(result.status,503);assert.equal(result.body.code,'MODEL_API_KEY_MISSING');
 assert.match(result.body.error,/设置 KEYDIGEST_TEST_ABSENT_KEY/);assert.doesNotMatch(result.body.error,/输入过长|缩小范围/);
});
test('引用校正也不能引用人工排除的材料',async t=>{
 const {SECTIONS}=require('../services/businessTopicReport.cjs');
 let calls=0;
 const app=await fundApp(t,{model:{async completeChat(){calls++;return SECTIONS.map(s=>`## ${s}\n事实 [N${calls===1?999:2}]`).join('\n');}}});
 const p=await preview(app);
 const response=await app.request('POST',prefix+'/generate',{...filters,previewHash:p.body.previewHash,manualOverrides:{2:false}});
 assert.equal(response.status,502);
 assert.equal(calls,2);
 assert.deepEqual(response.body.invalidCitationIds,['2']);
 assert.equal(response.body.citationRepairAttempted,true);
 assert.equal(response.body.exportSignature,undefined);
});
