const {createHash} = require('node:crypto');
const {LEVELS, decodeBusinessTypes, matchesBusinessTypes, countBusinessTypes} = require('./newsBusinessTypes.cjs');
const {normalizeRegionSelections, getMatchedRegionsForSelection, buildRegionTree} = require('./newsRegions.cjs');
const fail = (message, status = 400) => Object.assign(new Error(message), {status});
function dateYmd(value) { return value instanceof Date ? value.toISOString().slice(0,10) : String(value || '').slice(0,10); }
function shiftDate(value, days) { return new Date(Date.parse(`${value}T00:00:00Z`) + days * 86400000).toISOString().slice(0,10); }
function listParam(value) {
  if (value == null || value === '') return [];
  if (Array.isArray(value)) return value.flatMap(listParam);
  if (typeof value === 'object') return [value];
  try {const parsed=JSON.parse(value); return Array.isArray(parsed) ? parsed : [parsed];} catch {throw fail('业务筛选参数格式错误');}
}
function normalizePolicyFilters(input = {}) {
  const endDate = input.endDate || new Date(Date.now() + 8 * 3600000).toISOString().slice(0,10);
  const startDate = input.startDate || (/^\d{4}-\d{2}-\d{2}$/.test(endDate) && !Number.isNaN(Date.parse(endDate)) ? shiftDate(endDate,-29) : '');
  for (const date of [startDate,endDate]) if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || dateYmd(new Date(date)) !== date) throw fail('日期无效，请使用 YYYY-MM-DD');
  const days = (Date.parse(endDate)-Date.parse(startDate))/86400000 + 1;
  if (days < 1 || days > 366) throw fail('日期区间须为1至366天');
  const regions = normalizeRegionSelections(input.regions || input.selections || (input.region ? [{name:input.region,level:input.regionLevel || 'city'}] : []));
  if (regions.length > 100) throw fail('地区筛选不能超过100项');
  const selections = listParam(input.businessTypes);
  if (selections.length > 100) throw fail('业务筛选不能超过100项');
  const unique = new Map();
  for (const s of selections) {
    if (!s || !LEVELS.includes(s.level1) || s.level2 !== undefined && (typeof s.level2 !== 'string' || !s.level2.trim() || s.level2.length > 200)) throw fail('业务类型无效');
    const tag = s.level2 === undefined ? {level1:s.level1} : {level1:s.level1,level2:s.level2.trim()};
    unique.set(JSON.stringify(tag),tag);
  }
  const businessTypes = [...unique.values()].filter(s=>!s.level2 || !unique.has(JSON.stringify({level1:s.level1})));
  const tagState = input.tagState || 'all';
  if (!['all','without-valid-tags'].includes(tagState)) throw fail('标注状态无效');
  return {startDate,endDate,regions,businessTypes,tagState,minScore:3};
}
function createPolicyNewsQuery({pool}) {
  async function read(input, options = {}, report = false) {
    const filters = normalizePolicyFilters(input);
    const page = Number(options.page || 1), pageSize = Number(options.pageSize || 20);
    const sortBy = options.sortBy || 'fetchdate', order = String(options.order || 'desc').toLowerCase();
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) throw fail('页码或每页数量无效（每页1至100条）');
    if (!['fetchdate','score','title','source'].includes(sortBy) || !['asc','desc'].includes(order)) throw fail('排序条件无效');
    const connection = await pool.getConnection();
    try {
      await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      await connection.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
      let aliases = [], warnings = [];
      try {
        [aliases] = await connection.query('SELECT level1, retired_level2, canonical_level2 FROM news_business_type_aliases WHERE news_table = ? ORDER BY level1, retired_level2', ['scored_news']);
      } catch (error) {
        if (error.code !== 'ER_NO_SUCH_TABLE') throw error;
        warnings.push('业务别名表不存在，当前按原标签展示');
      }
      for (const selection of filters.businessTypes) if (selection.level2) {
        const decoded=decodeBusinessTypes([selection],aliases);
        if (decoded.status==='invalid') throw fail('所选业务别名配置异常，请联系管理员');
        selection.level2=decoded.tags[0].level2;
      }
      const [metadata] = await connection.query(`SELECT id, fetchdate, region, business_types, score, title, source
        FROM scored_news WHERE keyword = ? AND score >= ? AND fetchdate >= ? AND fetchdate < ?
        ORDER BY fetchdate DESC, id DESC LIMIT 10001`, ['公积金',3,filters.startDate,shiftDate(filters.endDate,1)]);
      if (metadata.length > 10000) throw fail('候选新闻超过10000条，请缩短日期区间',413);
      const unique = new Map();
      for (const row of metadata) {
        const decoded=decodeBusinessTypes(row.business_types,aliases);
        const matchedSelections=filters.regions.flatMap(selection=>{
          const matchedRegions=getMatchedRegionsForSelection(row.region,selection);
          return matchedRegions.length ? [{...selection,matchedRegions}] : [];
        });
        unique.set(String(row.id),{...row,fetchdate:dateYmd(row.fetchdate),businessTypes:decoded.tags,businessTypeStatus:decoded.status,matchedSelections});
      }
      const candidates=[...unique.values()];
      const regionMatches=row=>!filters.regions.length || row.matchedSelections.length > 0;
      const businessMatches=row=>matchesBusinessTypes(row.businessTypes,filters.businessTypes) && (filters.tagState==='all'||row.businessTypeStatus!=='tagged');
      const selected=candidates.filter(row=>regionMatches(row)&&businessMatches(row));
      selected.sort((a,b)=>{
        const delta=sortBy==='score' ? Number(a.score)-Number(b.score) : String(a[sortBy]||'').localeCompare(String(b[sortBy]||''),'zh-CN');
        const stable=delta || String(a.id).localeCompare(String(b.id),'en',{numeric:true});
        return order==='asc' ? stable : -stable;
      });
      if (report && selected.length>200) throw fail('报告候选超过200条，请缩小范围',413);
      const pageRows=report ? selected : selected.slice((page-1)*pageSize,page*pageSize);
      let details=[];
      if (pageRows.length && !options.facetsOnly) {
        [details]=await connection.query(`SELECT id, title, content, link, source, score, keyword, search_keyword, fetchdate, wordcount, sourceapi, short_summary, region, business_types FROM scored_news WHERE id IN (${pageRows.map(()=>'?').join(',')})`,pageRows.map(r=>r.id));
      }
      const byId=new Map(details.map(r=>[String(r.id),r]));
      const rows=options.facetsOnly ? [] : pageRows.map(r=>({...byId.get(String(r.id)),...r}));
      const aliasesVersion=createHash('sha256').update(JSON.stringify(aliases)).digest('hex');
      const regionRows=candidates.filter(regionMatches);
      const coverage={candidateCount:candidates.length,warnings,...Object.fromEntries(['pending','unidentified','invalid','tagged'].map(state=>[state,regionRows.filter(r=>r.businessTypeStatus===state).length]))};
      return {filters,rows,total:selected.length,page,pageSize,totalPages:Math.ceil(selected.length/pageSize),regionTree:buildRegionTree(candidates.filter(businessMatches)),businessFacets:countBusinessTypes(regionRows),coverage,aliasesVersion};
    } finally {
      try {await connection.rollback();} finally {connection.release();}
    }
  }
  return {query: (filters,options) => read(filters,options), reportCandidates: filters => read(filters,{},true)};
}
module.exports={normalizePolicyFilters,createPolicyNewsQuery,dateYmd};
