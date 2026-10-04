// Synthetic fixtures: no production records or credentials.
const loan=[{level1:'贷款',level2:'额度'},{level1:'贷款',level2:'利率'}];
const rows=[
 {id:1,region:'江苏|南京|苏州',score:5,business_types:loan,title:'南京苏州提高贷款额度',short_summary:'南京80万元；苏州100万元',content:'南京发布通知，提高贷款额度至80万元。苏州提高至100万元。',link:'https://example.org/1'},
 {id:2,region:'南京市',score:4,business_types:loan.slice(0,1),title:'南京贷款办理指南',content:'现行贷款规则：额度80万元。',link:'https://example.org/2'},
 {id:3,region:'江苏',score:2,business_types:loan,title:'低分新闻'},
 {id:4,region:'全国',score:3,business_types:[],title:'全国新闻'},
 {id:5,region:null,score:3,business_types:null,title:'待标注'},
 {id:6,region:'苏州',score:5,business_types:[{level1:'提取',level2:'租房'}],title:'苏州租房提取调整',content:'苏州提高租房提取额度。'},
].map(row=>({keyword:'公积金',source:'测试来源',fetchdate:'2026-10-02',...row}));
function fakeFundPool(data=rows,{aliasError,aliases=[]}={}) {
 const calls=[];
 const connection={
  async query(sql,args=[]) {
   calls.push({sql,args});
   if (/^SET TRANSACTION|^START TRANSACTION/.test(sql)) return [[]];
   if (sql.includes('news_business_type_aliases')) {if(aliasError)throw aliasError;return [aliases];}
   if (sql.includes('WHERE id IN')) return [data.filter(r=>args.map(String).includes(String(r.id)))];
   if (sql.includes('FROM scored_news')) {
    if (!sql.includes('score >= ?')) throw new Error('Missing score floor');
    return [data.filter(r=>r.keyword===args[0]&&r.score>=args[1]&&r.fetchdate>=args[2]&&r.fetchdate<args[3]).slice(0,10001).map(({content,...r})=>r)];
   }
   throw new Error(`Unexpected SQL: ${sql}`);
  },
  async rollback(){calls.push({sql:'ROLLBACK'});},
  release(){calls.push({sql:'RELEASE'});},
 };
 return {calls,async getConnection(){return connection;}};
}
module.exports={rows,fakeFundPool};
