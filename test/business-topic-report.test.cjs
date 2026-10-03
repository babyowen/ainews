const test=require('node:test');const assert=require('node:assert/strict');
const {buildBusinessTopicPreview,buildBusinessTopicInput,validateBusinessTopicOutput}=require('../services/businessTopicReport.cjs');
const {rows}=require('./fixtures/fundNews.cjs');const {normalizePolicyFilters}=require('../services/policyNewsQuery.cjs');
const filters=normalizePolicyFilters({startDate:'2026-10-01',endDate:'2026-10-03',regions:[{name:'南京',level:'city'},{name:'苏州',level:'city'}],businessTypes:[{level1:'贷款'}]});
const prompt={id:'test',name:'测试',systemPrompt:'严谨分析',userPromptMulti:'{regionBlocks}'};
const inputRows=rows.slice(0,2).map(x=>({...x,businessTypes:x.business_types}));
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
 assert.throws(()=>buildBusinessTopicInput({preview:{...preview,rows:[preview.rows[1]]},prompt}),/至少两个/);
 assert.throws(()=>buildBusinessTopicPreview({filters:{...filters,businessTypes:[]},rows:inputRows}),/一项业务/);
 assert.throws(()=>buildBusinessTopicInput({preview,prompt:{...prompt,systemPrompt:'x'.repeat(180001)}}),e=>e.status===413);
});
test('输出必须包含章节和存在的来源 ID',()=>{
 const sections=['样本范围与覆盖情况','同一业务的地区对比表','共性与差异','分地区观察及可借鉴做法','缺失信息、冲突材料与来源清单'];
 const reportContent=sections.map((x,i)=>`## ${i+1}. ${x}\n测试 [N1]`).join('\n');
 assert.equal(validateBusinessTopicOutput({reportContent,newsReferences:[{id:1}]}).valid,true);
 assert.equal(validateBusinessTopicOutput({reportContent:reportContent+'[N999]',newsReferences:[{id:1}]}).valid,false);
 assert.equal(validateBusinessTopicOutput({reportContent:'',newsReferences:[]}).valid,false);
});
