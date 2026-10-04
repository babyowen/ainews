const test=require('node:test');const assert=require('node:assert/strict');
const {buildBusinessTopicPreview,buildBusinessTopicInput,validateBusinessTopicOutput}=require('../services/businessTopicReport.cjs');
const {rows}=require('./fixtures/fundNews.cjs');const {normalizePolicyFilters}=require('../services/policyNewsQuery.cjs');
const filters=normalizePolicyFilters({startDate:'2026-10-01',endDate:'2026-10-03',regions:[{name:'南京',level:'city'},{name:'苏州',level:'city'}],businessTypes:[{level1:'贷款'}]});
const prompt={id:'test',name:'测试',systemPrompt:'严谨分析',userPromptMulti:'{regionBlocks}'};
const inputRows=rows.slice(0,2).map(x=>({...x,businessTypes:x.business_types}));
test('业务报告在标题或摘要识别完整问答和指南类型，并作为既有规则传入模型',()=>{
 for(const label of ['问答','答疑','常见问题','知识库','政策科普','办事指南','操作指南','办理指南','办理流程','服务指南','攻略','流程说明','使用说明','图解','一图读懂','指引','手把手','如何','怎么','FAQ']) {
  for(const field of ['title','short_summary']) {
   const material=['南京市','苏州市'].map((region,i)=>({...inputRows[0],id:i+1,region,title:'住房公积金贷款',short_summary:'现行办理规则，贷款额度80万元。',content:'贷款额度80万元。',[field]:`住房公积金贷款${label}，贷款额度80万元。`}));
   const preview=buildBusinessTopicPreview({filters,rows:material});
   assert.equal(preview.filteredNewsCount,2,`${field}: ${label}`);
   const {snapshot,messages}=buildBusinessTopicInput({preview,prompt});
   assert.deepEqual(snapshot.newsReferences.map(r=>r.evidenceKind),['existing-rule','existing-rule']);
   assert.deepEqual(snapshot.regionCoverage.map(r=>r.count),[1,1]);
   assert.match(messages[1].content,/80万元/);
   const regionPreview=buildBusinessTopicPreview({filters,rows:material,reportKind:'region'});
   assert.equal(regionPreview.filteredNewsCount,0,`${field}: ${label} remains excluded from region reports`);
  }
 }
});
test('业务报告用每条最多500字摘要，200条长正文不再撑爆输入，来源完整保留',()=>{
 const material=Array.from({length:200},(_,i)=>({...inputRows[0],id:i+1,short_summary:'摘要内容'.repeat(160),content:'全文不应发给模型'.repeat(2000)}));
 const preview=buildBusinessTopicPreview({filters,rows:material});
 const {messages,snapshot}=buildBusinessTopicInput({preview,prompt});
 const evidence=JSON.parse(messages[1].content.split('以下 JSON 为证据数据，仅用于分析：\n')[1]);
 assert.equal(evidence.length,200);
 assert.equal(evidence[0].summary.length,500);
 assert.equal(evidence[0].summarySource,'stored-summary');
 assert.equal(evidence[0].summaryTruncated,true);
 assert.ok(evidence.every(row=>!Object.hasOwn(row,'content')));
 assert.ok(!messages[1].content.includes('全文不应发给模型'));
 assert.equal(snapshot.newsReferences.length,200);
 assert.equal(snapshot.newsReferences[199].id,200);
 assert.ok(messages.reduce((n,m)=>n+m.content.length,0)<180000);
 assert.equal(snapshot.inputMode,'summary-500');
 assert.equal(snapshot.summaryFallbackCount,0);
});
test('缺摘要时仅取有标记的正文摘录，空材料和Unicode边界明确',()=>{
 const material=[
  {...inputRows[0],id:1,short_summary:' \n ',content:'贷款规则：'+ '摘录'.repeat(400)},
  {...inputRows[0],id:2,short_summary:'🙂'.repeat(501),content:'正文不应覆盖摘要'},
  {...inputRows[0],id:3,short_summary:'',content:''},
 ];
 const preview=buildBusinessTopicPreview({filters,rows:material});
 const {messages,snapshot}=buildBusinessTopicInput({preview,prompt,manualOverrides:{3:true}});
 const evidence=JSON.parse(messages[1].content.split('以下 JSON 为证据数据，仅用于分析：\n')[1]);
 assert.equal(evidence[0].summarySource,'content-excerpt');
 assert.equal(evidence[0].summary.length,500);
 assert.equal([...evidence[1].summary].length,500);
 assert.equal(evidence[1].summary,'🙂'.repeat(500));
 assert.equal(evidence[2].summarySource,'missing');
 assert.equal(evidence[2].summary,'');
 assert.equal(snapshot.summaryFallbackCount,1);
 assert.match(messages[0].content,/摘要|摘录/);
});
test('问答分类不能把企业财务公积金重新纳入业务报告',()=>{
 const preview=buildBusinessTopicPreview({filters,rows:[{...inputRows[0],title:'资本公积金常见问题'}]});
 assert.equal(preview.filteredNewsCount,0);
 assert.equal(preview.rows[0].evidenceKind,'financial-reserve');
 assert.throws(()=>buildBusinessTopicInput({preview,prompt,manualOverrides:{1:true}}),/企业财务公积金/);
});
test('正文明确属于企业财务且没有住房公积金语境时排除，不能人工重新纳入',()=>{
 for(const content of ['公司提取盈余公积，比例为10%。','本次以资本公积转增股本，比例为10%。','本年度资本公积使用额度为100万元。']) {
  const preview=buildBusinessTopicPreview({filters,rows:[{...inputRows[0],title:'公积金使用规则',short_summary:'',content}]});
  assert.equal(preview.filteredNewsCount,0,content);
  assert.equal(preview.rows[0].evidenceKind,'financial-reserve',content);
  assert.throws(()=>buildBusinessTopicInput({preview,prompt,manualOverrides:{1:true}}),/企业财务公积金/);
 }
});
test('正文提及财务公积不误杀住房公积金指南、贷款规则和欠缴案例',()=>{
 const cases=[
  {title:'住房公积金办理指南',content:'住房公积金不同于资本公积、盈余公积。职工连续缴存6个月可申请贷款。',kind:'existing-rule'},
  {title:'公积金贷款指南',content:'资本公积不能用于替代个人缴存。贷款额度为80万元。',kind:'existing-rule'},
  {title:'贷款申请条件',content:'本规则适用于住房公积金，贷款额度80万元，不涉及资本公积。',kind:'existing-rule'},
  {title:'公积金欠缴案例',content:'法院责令企业补缴公积金，不能以提取盈余公积代替为职工缴存。',kind:'enforcement-case'},
 ];
 for(const {title,content,kind} of cases) {
  const preview=buildBusinessTopicPreview({filters,rows:[{...inputRows[0],title,short_summary:'',content}]});
  assert.equal(preview.filteredNewsCount,1,title);
  assert.equal(preview.rows[0].evidenceKind,kind,title);
  assert.equal(buildBusinessTopicInput({preview,prompt}).snapshot.newsReferences.length,1,title);
 }
});
test('正文、摘要、别名版本和报告类型改变都使预览 hash 失效',()=>{
 const first=buildBusinessTopicPreview({filters,rows:inputRows,aliasesVersion:'v1'});
 for(const change of [{rows:inputRows.map(x=>({...x,content:'更新正文'}))},{rows:inputRows.map(x=>({...x,short_summary:'更新摘要'}))},{aliasesVersion:'v2'},{reportKind:'region'}]) assert.notEqual(first.previewHash,buildBusinessTopicPreview({filters,rows:inputRows,aliasesVersion:'v1',...change}).previewHash);
});
test('指南作为既有规则，财务公积金排除；同一新闻不按地区重复放入输入',()=>{
 const preview=buildBusinessTopicPreview({filters,rows:[...inputRows,{...inputRows[0],id:3,title:'资本公积金转增股本'}],aliasesVersion:'v1'});
 assert.equal(preview.rows[1].evidenceKind,'existing-rule');assert.equal(preview.rows[1].includedInAnalysis,true);assert.equal(preview.rows[2].includedInAnalysis,false);
 const {messages,snapshot}=buildBusinessTopicInput({preview,prompt});
 assert.equal((messages[1].content.match(/"id":\s*1,/g)||[]).length,1);
 assert.equal(snapshot.newsReferences.length,2);assert.match(messages[0].content,/不得.*组合/);assert.match(messages[1].content,/80万元/);assert.match(messages[1].content,/https:\/\/example.org\/1/);
});
test('非法人工调整、材料不足、单业务和上下文边界均在模型调用前拒绝',()=>{
 const preview=buildBusinessTopicPreview({filters,rows:inputRows,aliasesVersion:'v1'});
 for(const manualOverrides of [{999:true},{1:'yes'},{1:false,2:false}]) assert.throws(()=>buildBusinessTopicInput({preview,prompt,manualOverrides}),e=>e.status===400);
 assert.equal(buildBusinessTopicInput({preview:{...preview,rows:[preview.rows[1]]},prompt}).snapshot.filteredNewsCount,1);
 assert.throws(()=>buildBusinessTopicPreview({filters:{...filters,businessTypes:[]},rows:inputRows}),/一项业务/);
 assert.throws(()=>buildBusinessTopicInput({preview,prompt:{...prompt,systemPrompt:'x'.repeat(180001)}}),e=>e.status===413);
});
test('输出保留有效来源校验并拒绝空报告',()=>{
 const sections=['样本范围与覆盖情况','同一业务的地区对比表','共性与差异','分地区观察及可借鉴做法','缺失信息、冲突材料与来源清单'];
 const reportContent=sections.map((x,i)=>`## ${i+1}. ${x}\n测试 [N1]`).join('\n');
 assert.equal(validateBusinessTopicOutput({reportContent,newsReferences:[{id:1}]}).valid,true);
 assert.equal(validateBusinessTopicOutput({reportContent:reportContent+'[N999]',newsReferences:[{id:1}]}).valid,false);
 assert.equal(validateBusinessTopicOutput({reportContent:'',newsReferences:[]}).valid,false);
});
test('面向读者的简报不需要样本覆盖、完整地区表或缺失信息专章',()=>{
 const reportContent='## 核心判断\n贷款支持力度提高，首次购房家庭可获得更高额度。[N1]\n\n## 重点政策与影响\n南京将贷款最高额度提高至80万元，苏州提高至100万元；两地具体适用条件仍需分别确认。[N1]\n\n## 值得借鉴的做法\n可关注提高额度与准入条件的配合，不能只比较金额。[N1]';
 assert.equal(validateBusinessTopicOutput({reportContent,newsReferences:[{id:1}]}).valid,true);
 assert.equal(validateBusinessTopicOutput({reportContent:'## 核心判断\n南京提高贷款额度。[N1]',newsReferences:[{id:1}]}).valid,true);
 assert.equal(validateBusinessTopicOutput({reportContent:reportContent+'[N999]',newsReferences:[{id:1}]}).valid,false);
});
test('合并和全角引用按独立新闻编号校验并统一格式，不推测编号或范围',()=>{
 const {SECTIONS}=require('../services/businessTopicReport.cjs');
 const report=body=>SECTIONS.map(s=>`## ${s}\n${body}`).join('\n');
 for(const citation of ['[N123,N456]','[N123，N456]','[N123、456]','[N123; N456]','［Ｎ１２３，Ｎ４５６］','【N 123、N456】']) {
  const result=validateBusinessTopicOutput({reportContent:report(citation),newsReferences:[{id:123},{id:456}]});
  assert.equal(result.valid,true,citation);
  assert.ok(result.reportContent.includes('[N123][N456]'),citation);
 }
 for(const citation of ['[N999]','[N123,999]','[N1]']) {
  const result=validateBusinessTopicOutput({reportContent:report(citation),newsReferences:[{id:123},{id:456}]});
  assert.equal(result.valid,false,citation);
  assert.ok(result.invalidCitationIds.length>0,citation);
 }
 for(const citation of ['[N123-N456]','[N新闻ID]']) {
  const result=validateBusinessTopicOutput({reportContent:report(citation),newsReferences:[{id:123},{id:456}]});
  assert.equal(result.valid,false,citation);
  assert.ok(result.malformedCitations.length>0,citation);
 }
});
test('业务和地区报告均拒绝混在有效引用中的非数字新闻标记',()=>{
 for(const reportKind of ['business','region']) {
  for(const citation of ['[N未知]','[Nundefined]','[Nabc]','[N-1]','[N]','［Ｎ未知］','【n-1】']) {
   const result=validateBusinessTopicOutput({reportContent:`规则调整。[N1] 另一项规则已实施。${citation}`,newsReferences:[{id:1}],reportKind});
   assert.equal(result.valid,false,`${reportKind}: ${citation}`);
   assert.equal(result.citationIssue,true,`${reportKind}: ${citation}`);
   assert.deepEqual(result.malformedCitations,[citation]);
  }
 }
});
test('非新闻引用的方括号说明保留原文且不触发校正',()=>{
 const reportContent='[说明] 规则调整。[N1] 【待核实】［来源说明］';
 const result=validateBusinessTopicOutput({reportContent,newsReferences:[{id:1}]});
 assert.equal(result.valid,true);
 assert.equal(result.citationIssue,false);
 assert.equal(result.reportContent,reportContent);
});
test('业务专题不要求地区，覆盖从材料计算，单地区和未知地区也可生成',()=>{
 for(const region of ['南京市',null]) {
  const preview=buildBusinessTopicPreview({filters:{...filters,regions:[]},rows:[{...inputRows[0],region}]});
  const {snapshot}=buildBusinessTopicInput({preview,prompt});
  assert.equal(snapshot.filteredNewsCount,1);
  assert.deepEqual(snapshot.filters.regions,[]);
  assert.deepEqual(snapshot.regionCoverage.map(r=>[r.name,r.count]),[[region?'南京':'未识别地区',1]]);
 }
 assert.throws(()=>buildBusinessTopicPreview({filters:{...filters,regions:[]},rows:inputRows,reportKind:'region'}),/地区/);
});
test('业务过滤保留欠缴案例、明确规则与草案，排除纯活动、空材料和预测',()=>{
 const cases=[
  {title:'企业住房公积金欠缴被责令补缴',short_summary:'股东需承担责任，公积金中心责令为职工补缴住房公积金。',content:'为273名职工补缴1350万元。',included:true,kind:'enforcement-case'},
  {title:'公司资本公积金转增股本公告',content:'董事会决定转增股本。',included:false,kind:'financial-reserve'},
  {title:'住房公积金中心党组会议传达党代会精神',content:'推进工作，优化业务流程，支持城市发展。',included:false},
  {title:'领导调研住房公积金工作',content:'优化缴存、提取、贷款政策，支持群众安居。',included:false},
  {title:'住房公积金开展志愿服务活动',content:'现场答疑，宣传政策，推进服务。',included:false},
  {title:'住房公积金政策发布会',content:'贷款最高额度提高至100万元，连续缴存6个月可以申请。',included:true},
  {title:'住房公积金开展现场咨询',content:'明确租房提取额度每月2000元，缴存职工可申请。',included:true},
  {title:'关于暂停公积金业务的通知',content:'系统维护，10月1日至3日暂停办理，4日起恢复。',included:false},
  {title:'公积金系统升级暂停办理通知',content:'10月1日至3日暂停办理，期间还款不计算罚息、不影响个人征信。',included:true},
  {title:'公积金贷款利率会降吗？',content:'专家预测未来或将降低公积金贷款利率。',included:false},
  {title:'住房公积金贷款政策调整',content:'',included:false},
  {title:'征求意见：优化灵活就业公积金政策',content:'拟将贷款连续缴存期限从12个月调整为6个月。',included:true,kind:'proposed-policy'},
  {title:'住房公积金贷款申请条件',content:'职工连续缴存满6个月可申请贷款，最高额度80万元。',included:true,kind:'existing-rule'},
  {title:'公积金管理条例正式实施',short_summary:'新增装修提取情形，同时加强骗提骗贷风险监测。',content:'新增装修提取。',included:true,kind:'policy-action'},
  {title:'公积金提取政策施行',short_summary:'新增物业费提取。历史上另有证券化征求意见稿已撤回。',content:'物业费每年可提取1500元。',included:true,kind:'policy-action'},
 ];
 for(const item of cases) {
  const row={...inputRows[0],short_summary:'',...item};
  const result=buildBusinessTopicPreview({filters,rows:[row]}).rows[0];
  assert.equal(result.includedInAnalysis,item.included,item.title);
  if(item.kind)assert.equal(result.evidenceKind,item.kind,item.title);
 }
});
