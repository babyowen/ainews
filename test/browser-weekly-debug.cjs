// Built UI against a local-only model boundary: no production SQL or provider calls.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const express=require('express'),{chromium}=require('playwright');
const {buildWeeklyReportRequest}=require('../services/weeklyReportRequest.cjs');
const {listWeeklyReportModels}=require('../services/weeklyReportModelConfig.cjs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'output/government-weekly-quality-20261114');
const templates=[{id:'a',name:'模板A',description:'浏览器测试',isDefault:true,systemPrompt:'SYSTEM_A',userPrompt:'A\n{news}\n{usertopic}'},{id:'b',name:'模板B',description:'浏览器测试',systemPrompt:'SYSTEM_B',userPrompt:'B\n{news}\n{usertopic}'}];
const row={id:1,keyword:'江苏机关事务',sourceapi:'极致了api',title:'测试维修',content:'我局完成维修。完整正文。',short_summary:'我局完成维修。',score:4,fetchdate:'2026-11-12',link:'https://mp.weixin.qq.com/s?__biz=MzIwMTU0MzE1Nw%3D%3D&mid=123&idx=1'};
const promptStore={findKeywordPrompt:(_k,id)=>templates.find(t=>t.id===id),getWeeklyPrompts:()=>templates[0]};
(async()=>{
 fs.mkdirSync(output,{recursive:true});let onStart,release;
 const requests=[],debugs=[],errors=[];
 const app=express();app.use(express.json());
 app.get('/api/auth/me',(_q,r)=>r.json({user:{username:'ui-test',role:'admin',keywords:['江苏机关事务']}}));
 app.get('/api/keyword-prompts',(_q,r)=>r.json(templates));app.get('/api/weekly-report/models',(_q,r)=>r.json(listWeeklyReportModels()));
 app.get('/api/weekly-news',(_q,r)=>r.json([row]));
 app.post('/api/generate-report',async(q,r)=>{
  requests.push(q.body);const request=buildWeeklyReportRequest({...q.body,promptStore});debugs.push(request.debug);
  await new Promise(resolve=>{release=resolve;onStart();});
  r.setHeader('Content-Type','text/event-stream');r.write(`data: ${JSON.stringify({type:'debug',data:request.debug})}\n\n`);
  if(requests.length===1)r.write(`data: ${JSON.stringify({type:'error',message:'模拟可重试失败'})}\n\n`);
  else r.write(`data: ${JSON.stringify({type:'done',report:'## 完整测试周报\n测试成功'})}\n\n`);
  r.end();
 });
 app.use('/api',(_q,r)=>r.status(404).json({error:'Unexpected test API'}));
 app.use(express.static(path.join(root,'dist')));app.get('*',(_q,r)=>r.sendFile(path.join(root,'dist/index.html')));
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});let browser;
 try{
  browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1360,height:1000},timezoneId:'Asia/Shanghai'});
  page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>sessionStorage.setItem('keydigest_auth_token','local-only-test'));
  await page.goto(`http://127.0.0.1:${server.address().port}/report`);
  await page.locator('.news-item').waitFor();await page.getByRole('button',{name:'全选',exact:true}).click();
  async function checkRequest(button,index){
   const started=new Promise(resolve=>{onStart=resolve;});await button.click();await started;
   assert.equal(await page.locator('.model-message-panel').count(),0,'No approximate local prompt before server debug');release();
   await page.locator('.model-message-panel').waitFor();
   assert.deepEqual(await page.locator('.model-message-pre').allTextContents(),[debugs[index].systemPrompt,debugs[index].userPrompt]);
   assert.ok((await page.locator('.model-message-info').innerText()).includes(debugs[index].promptName));
  }
  await checkRequest(page.getByRole('button',{name:'生成周报',exact:true}),0);
  await page.locator('.retry-btn').waitFor();
  await page.getByRole('button',{name:'模板B 浏览器测试'}).click();await page.locator('.summary-toggle-item').click();assert.equal(await page.locator('.summary-toggle-item input').isChecked(),false);
  await checkRequest(page.locator('.retry-btn'),1);
  assert.equal(requests[1].promptId,'a');assert.equal(requests[1].summaryVersion,'short');assert.deepEqual(requests[1],requests[0]);
  await page.getByText('✅ 周报生成完成！',{exact:true}).waitFor();
  await checkRequest(page.getByRole('button',{name:'生成周报',exact:true}),2);
  assert.equal(requests[2].promptId,'b');assert.equal(requests[2].summaryVersion,'full');assert.match(debugs[2].userPrompt,/完整正文/);
  await page.locator('.model-message-panel').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'debug-parity.png')});assert.deepEqual(errors,[]);
  const result={serverDebugMatchesDisplayed:true,localApproximationRemoved:true,retryUsesFrozenRequest:true,newGenerationUsesCurrentForm:true,browserErrors:errors,modelCalls:0,productionWrites:0};
  fs.writeFileSync(path.join(output,'browser-validation.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{release?.();if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
