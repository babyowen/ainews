import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {useAuth} from '../auth/AuthContext';
import {fetchPolicyJson,fetchPolicyBusinessFacets} from '../api/policyBusiness';
import {parsePolicyBusinessSearch,serializePolicyBusinessSearch,updatePolicySearch,safeNewsUrl} from '../utils/policyBusinessFilters';
import BusinessTypeFilter from './BusinessTypeFilter';
import BusinessTypeTags from './BusinessTypeTags';
import PolicyRegionFilter from './PolicyRegionFilter';
import './ProvidentFund.css';
export default function ProvidentFundReportView({reportKind}) {
  const business=reportKind==='business';
  const prefix=business?'/api/provident-fund/business-report':'/api/policy/region-report';
  const {user,apiFetch}=useAuth();
  const [params,setParams]=useSearchParams();
  const search=params.toString();
  const filters=useMemo(()=>({...parsePolicyBusinessSearch(search),page:1}),[search]);
  const filtersKey=reportKind+serializePolicyBusinessSearch(filters);
  const [facets,setFacets]=useState(null),[prompts,setPrompts]=useState([]);
  const [promptId,setPromptId]=useState(business?'business-topic-comparison-v1':filters.regions.length===1?'single-region-default':'multi-region-default');
  const [userPrompt,setUserPrompt]=useState('');
  const [previewState,setPreview]=useState(null),[overridesState,setOverrides]=useState(null),[reportState,setReport]=useState(null);
  const preview=previewState?.key===filtersKey?previewState.data:null;
  const manualOverrides=overridesState?.key===filtersKey?overridesState.values:{};
  const prompt=prompts.find(x=>x.id===promptId);
  const formKey=JSON.stringify([filtersKey,promptId,prompt,userPrompt,manualOverrides]);
  const report=reportState?.key===formKey?reportState.data:null;
  const [error,setError]=useState(''),[busy,setBusy]=useState(''),[editor,setEditor]=useState(null);
  const current=useRef(formKey);current.current=formKey;
  const operation=useRef(null);
  const update=changes=>setParams(updatePolicySearch(search,changes));
  useEffect(()=>{
    operation.current?.abort();setBusy('');setError('');
    return ()=>operation.current?.abort();
  },[formKey]);
  const loadPrompts=useCallback(async()=>{
    const library=await fetchPolicyJson('/api/policy/region-report/prompts',{fetcher:apiFetch});setPrompts(library);
  },[apiFetch]);
  useEffect(()=>{let active=true;fetchPolicyJson('/api/policy/region-report/prompts',{fetcher:apiFetch}).then(data=>{if(active)setPrompts(data);}).catch(e=>{if(active)setError(e.message);});return ()=>{active=false;};},[apiFetch]);
  useEffect(()=>{
    const controller=new AbortController();let active=true;
    fetchPolicyBusinessFacets(filters,{fetcher:apiFetch,signal:controller.signal}).then(data=>{if(active)setFacets(data);}).catch(e=>{if(active&&e.name!=='AbortError')setError(e.message);});
    return ()=>{active=false;controller.abort();};
  },[filters,apiFetch]);
  async function run(kind) {
    operation.current?.abort();const controller=new AbortController();operation.current=controller;
    const key=formKey;setBusy(kind);setError('');
    try {
      if(kind==='preview') {
        const data=await fetchPolicyJson(`${prefix}/news?${serializePolicyBusinessSearch(filters)}`,{fetcher:apiFetch,signal:controller.signal});
        if(current.current===key){setPreview({key:filtersKey,data});setOverrides({key:filtersKey,values:{}});setReport(null);}
      } else if(kind==='generate') {
        const data=await fetchPolicyJson(`${prefix}/generate`,{fetcher:apiFetch,signal:controller.signal,method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...filters,previewHash:preview.previewHash,promptId,userPrompt,manualOverrides})});
        if(current.current===key)setReport({key,data});
      } else {
        const response=await apiFetch(`${prefix}/export-pdf`,{signal:controller.signal,method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({snapshot:report.snapshot,reportContent:report.reportContent,exportSignature:report.exportSignature})});
        if(!response.ok){const data=await response.json();throw new Error(data.error||'导出失败');}
        const blob=await response.blob();if(current.current!==key)return;
        const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`${business?'公积金业务政策报告':'地区政策报告'}_${report.snapshot.filters.startDate}.pdf`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      }
    } catch(e){if(e.name!=='AbortError'&&current.current===key)setError(e.message);}
    finally {if(operation.current===controller)setBusy('');}
  }
  async function savePrompt(action) {
    setBusy('prompt');setError('');
    try {
      if(action==='save') await fetchPolicyJson('/api/config/region-policy-report-prompts',{fetcher:apiFetch,method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...editor,promptId:editor.id})});
      if(action==='delete') await fetchPolicyJson(`/api/config/region-policy-report-prompts/${encodeURIComponent(editor.id)}`,{fetcher:apiFetch,method:'DELETE'});
      if(action==='reset') await fetchPolicyJson('/api/config/reset-default',{fetcher:apiFetch,method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({file:'region-policy-report-prompts.json',promptId:editor.id})});
      await loadPrompts();setEditor(null);setReport(null);
    }catch(e){setError(e.message);}finally{setBusy('');}
  }
  const included=preview?.rows.filter(row=>manualOverrides[String(row.id)]??row.includedInAnalysis)||[];
  const coverage=filters.regions.map(s=>({...s,count:included.filter(row=>row.matchedSelections.some(x=>x.name===s.name&&x.level===s.level)).length}));
  const canPreview=filters.regions.length>0&&filters.regions.length<=10&&(!business||(filters.regions.length>=2&&filters.businessTypes.length===1));
  const canGenerate=preview&&included.length>0&&(!business||coverage.filter(x=>x.count>0).length>=2)&&prompt;
  return <div className="pf-page">
    <header className="pf-header"><div><p className="pf-eyebrow">公积金专区 / {business?'业务类型浏览':'地区浏览'}</p><h1>{business?'业务政策 AI 报告':'地区 AI 报告'}</h1><p className="pf-muted">{business?'选择一个业务和 2–10 个地区，先核对材料，再生成政策比较。':'选择 1–10 个地区，分析单地区变化或比较地区差异。'}</p></div></header>
    <div className="pf-toolbar"><label>开始日期<input type="date" value={filters.startDate} onChange={e=>update({startDate:e.target.value})}/></label><label>结束日期<input type="date" value={filters.endDate} onChange={e=>update({endDate:e.target.value})}/></label>
      <label>报告模板<select aria-label="报告模板" value={promptId} onChange={e=>setPromptId(e.target.value)}>{!prompt&&<option value={promptId}>所选模板不可用，请重新选择</option>}{prompts.filter(x=>business||x.id!=='business-topic-comparison-v1').map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
      {user?.role==='admin'&&<button onClick={()=>setEditor(prompt?{...prompt}:{name:'',description:'',systemPrompt:'',userPromptSingle:'',userPromptMulti:'',isDefault:false})}>管理 Prompt</button>}
    </div>
    <div className="pf-workspace"><aside className="pf-filters">
      {business&&<BusinessTypeFilter single value={filters.businessTypes} options={facets?.businessFacets} onChange={businessTypes=>update({businessTypes,tagState:'all'})}/>}
      <PolicyRegionFilter value={filters.regions} tree={facets?.regionTree} onChange={regions=>update({regions})}/>
      {!business&&<details><summary>限定业务范围（可选）</summary><BusinessTypeFilter value={filters.businessTypes} options={facets?.businessFacets} onChange={businessTypes=>update({businessTypes,tagState:'all'})}/></details>}
    </aside><main className="pf-report-main">
      <section className="pf-results"><div className="pf-results-heading"><strong>01 · 核对材料</strong><button className="pf-primary" disabled={!canPreview||!!busy} onClick={()=>run('preview')}>{busy==='preview'?'读取中…':'预览新闻'}</button></div>
        {!canPreview&&<p className="pf-hint">{business?'请选一项业务和 2–10 个地区。':'请选择 1–10 个地区。'}</p>}
        {!preview?<p className="pf-empty">{previewState?'筛选已变更，请重新预览。':'预览后可逐条决定是否纳入分析。'}</p>:<>
          <p>候选 {preview.rows.length} 条 · 纳入 {included.length} 条 · 排除 {preview.rows.length-included.length} 条</p>
          <div className="pf-tags">{coverage.map(s=><span className="pf-tag" key={`${s.level}:${s.name}`}>{s.label||s.name}：{s.count} 条{s.count?'':' · 本次样本未覆盖'}</span>)}</div>
          <p className="pf-hint">多地区新闻可命中多个地区，新闻总量按 ID 去重。材料归属仍以正文为准。</p>
          <div className="pf-preview-list">{preview.rows.map(row=><article className="pf-preview-row" key={row.id}>
            <label><input aria-label={`纳入 N${row.id}`} type="checkbox" disabled={row.evidenceKind==='financial-reserve'} checked={manualOverrides[String(row.id)]??row.includedInAnalysis} onChange={e=>setOverrides({key:filtersKey,values:{...manualOverrides,[row.id]:e.target.checked}})}/><strong>[N{row.id}] {row.title}</strong></label>
            <p className="pf-hint">{row.fetchdate} · {row.region} · {Object.hasOwn(manualOverrides,String(row.id))?(manualOverrides[String(row.id)]?'人工纳入':'人工排除'):row.filterReason}</p>
            <BusinessTypeTags tags={row.businessTypes} status={row.businessTypeStatus}/>
            <details><summary>查看材料与来源</summary><p>{row.short_summary}</p><div className="pf-article-content">{row.content}</div>{safeNewsUrl(row.link)&&<a href={row.link} target="_blank" rel="noopener noreferrer">查看原文</a>}</details>
          </article>)}</div>
        </>}
      </section>
      <section className="pf-results"><div className="pf-results-heading"><strong>02 · 生成分析报告</strong><button className="pf-primary" disabled={!canGenerate||!!busy} onClick={()=>run('generate')}>{busy==='generate'?'正在生成…':'生成报告'}</button></div>
        <label className="pf-report-notes">补充分析要求<textarea rows={3} value={userPrompt} onChange={e=>setUserPrompt(e.target.value)} placeholder="例如：重点比较贷款额度、适用人群和生效时间"/></label>
        {business&&preview&&coverage.filter(x=>x.count>0).length<2&&<p className="pf-hint">至少两个地区有纳入材料后才能生成比较。</p>}
        {error&&<div role="alert" className="pf-error">{error}</div>}
        {report?<>
          <div className="pf-report-actions"><span className="pf-hint">{report.snapshot.promptVersionName} · {report.snapshot.modelName}</span><button disabled={!!busy} onClick={()=>run('export')}>{busy==='export'?'导出中…':'导出 PDF'}</button></div>
          <div className="pf-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{report.reportContent.replace(/\[N(\d+)\](?!\()/g,'[N$1](#fund-source-$1)')}</ReactMarkdown></div>
          <h2>参考来源</h2><ol className="pf-references">{report.snapshot.newsReferences.map(row=><li key={row.id} id={`fund-source-${row.id}`}><strong>[N{row.id}] </strong>{safeNewsUrl(row.link)?<a href={row.link} target="_blank" rel="noopener noreferrer">{row.title}</a>:row.title}<p className="pf-hint">{row.date} · {row.region} · {row.source}</p></li>)}</ol>
          <details><summary>查看实际发送的 Prompt</summary><pre className="pf-prompt-debug">{report.debug.systemPrompt+'\n\n'+report.debug.userPrompt}</pre></details>
        </>:<p className="pf-hint">{reportState?'条件或模板已变更，原报告已失效。':'报告生成后可查看引用来源并导出 PDF。'}</p>}
      </section>
    </main></div>
    {editor&&<section className="pf-prompt-editor" aria-label="Prompt 编辑"><h2>Prompt 运行时配置</h2><p className="pf-hint">保存只更新运行时配置。业务报告始终保留业务范围、引用和材料归属要求。</p>
      <label>已有版本<select aria-label="编辑的 Prompt 版本" value={editor.id||''} onChange={e=>setEditor({...prompts.find(x=>x.id===e.target.value)})}><option value="" disabled>新版本</option>{prompts.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      {['name','description','systemPrompt','userPromptSingle','userPromptMulti'].map(field=><label key={field}>{({name:'名称',description:'说明',systemPrompt:'System Prompt',userPromptSingle:'单地区模板',userPromptMulti:'多地区模板'})[field]}<textarea rows={field.includes('Prompt')?6:2} value={editor[field]||''} onChange={e=>setEditor({...editor,[field]:e.target.value})}/></label>)}
      <p className="pf-hint">模板变量：{'{startDate} {endDate} {regions} {businessTopic} {usertopic} {rawNewsCount} {filteredNewsCount} {excludedNewsCount} {regionBlocks}'}</p>
      <label><input type="checkbox" checked={!!editor.isDefault} onChange={e=>setEditor({...editor,isDefault:e.target.checked})}/>设为全局默认模板</label>
      <div className="pf-report-actions"><button disabled={!!busy} onClick={()=>savePrompt('save')}>保存版本</button><button disabled={!!busy} onClick={()=>setEditor({...editor,id:undefined,name:editor.name+'（副本）',isDefault:false})}>另存新版本</button>{editor.id&&<><button disabled={!!busy} onClick={()=>savePrompt('reset')}>恢复此版本默认</button><button disabled={!!busy} onClick={()=>savePrompt('delete')}>删除此版本</button></>}<button onClick={()=>setEditor(null)}>关闭</button></div>
    </section>}
  </div>;
}
