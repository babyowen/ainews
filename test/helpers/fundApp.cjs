const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {randomUUID}=require('node:crypto');
const {createIsolatedApp}=require('./isolatedApp.cjs');const {rows:fixtures,fakeFundPool}=require('../fixtures/fundNews.cjs');
const {SECTIONS}=require('../../services/businessTopicReport.cjs');
async function fundApp(t,{user={role:'admin',keywords:[],routes:[]},completion=SECTIONS.map(s=>`## ${s}\n测试事实 [N1]`).join('\n')}={}) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fund-report-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const configDir=path.join(dir,'config');fs.cpSync(path.join(__dirname,'../../config'),configDir,{recursive:true,filter:p=>!p.split(path.sep).includes('runtime')});
 fs.mkdirSync(path.join(configDir,'runtime'),{recursive:true});const password=randomUUID();
 fs.writeFileSync(path.join(configDir,'runtime/users.json'),JSON.stringify([{username:'fixture',password,...user}]));
 const rows=structuredClone(fixtures),calls=[],exports=[];
 const pool=fakeFundPool(rows);
 const request=createIsolatedApp({configDir,dataDir:path.join(dir,'data'),pool,model:{async completeChat(messages,options){calls.push({messages,options});return completion;}},pdfRenderer:{buildRegionPolicyReportPdfFilename:()=> 'test.pdf',async renderRegionPolicyReportPdf(payload){exports.push(payload);return Buffer.from('%PDF-fixture');}}});
 const login=await request('POST','/api/auth/login',{username:'fixture',password});
 return {rows,calls,exports,configDir,pool,request:(method,url,body)=>request(method,url,body,login.body.token)};
}
module.exports={fundApp};
