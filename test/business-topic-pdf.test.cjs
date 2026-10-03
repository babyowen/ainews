const test=require('node:test');const assert=require('node:assert/strict');
const {buildRegionPolicyReportPdfHtml}=require('../server/pdf/regionPolicyReportPdfTemplate.cjs');
test('PDF 展示生成专题、模型、ID 与可点击来源；转义并拒绝非 HTTP 链接',()=>{
 const html=buildRegionPolicyReportPdfHtml({title:'业务政策报告 · 贷款',businessTopic:'贷款 / 额度',modelName:'TestModel',reportContent:'## 测试\n贷款额度 [N42]',newsReferences:[{id:42,title:'<script>风险</script>',link:'https://example.org/a?x=1&y=2'},{id:43,title:'危险链接',link:'javascript:alert(1)'}]});
 assert.ok(html.includes('[N42]'));assert.ok(html.includes('贷款 / 额度'));assert.ok(html.includes('TestModel'));
 assert.ok(html.includes('href="https://example.org/a?x=1&amp;y=2"'));assert.ok(html.includes('&lt;script&gt;'));
 assert.ok(!html.includes('href="javascript:'));
});
