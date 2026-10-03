import {useEffect,useMemo,useState} from 'react';
import {Link,useNavigate,useSearchParams} from 'react-router-dom';
import {useAuth} from '../auth/AuthContext';
import {canAccessRoute} from '../config/navigation';
import {fetchPolicyBusinessNews} from '../api/policyBusiness';
import {parsePolicyBusinessSearch,serializePolicyBusinessSearch,updatePolicySearch,safeNewsUrl} from '../utils/policyBusinessFilters';
import BusinessTypeFilter from './BusinessTypeFilter';
import BusinessTypeTags from './BusinessTypeTags';
import PolicyRegionFilter from './PolicyRegionFilter';
import './ProvidentFund.css';
const titles={daily:'公积金每日新闻',region:'地区新闻浏览',business:'业务类型浏览'};
export default function ProvidentFundNewsView({mode}) {
  const {user,apiFetch}=useAuth();
  const [params,setParams]=useSearchParams();
  const search=params.toString();
  const filters=useMemo(()=>parsePolicyBusinessSearch(search,mode),[search,mode]);
  const queryKey=mode+serializePolicyBusinessSearch(filters);
  const navigate=useNavigate();
  const [result,setResult]=useState(null);
  const [error,setError]=useState('');
  const [retry,setRetry]=useState(0);
  const loading=result?.key!==queryKey;
  useEffect(()=>{
    const controller=new AbortController();let active=true;
    setError('');
    fetchPolicyBusinessNews(filters,{mode,page:filters.page},{fetcher:apiFetch,signal:controller.signal}).then(data=>{if(active)setResult({key:queryKey,data});}).catch(e=>{if(active&&e.name!=='AbortError')setError(e.message);});
    return ()=>{active=false;controller.abort();};
  },[filters,mode,queryKey,apiFetch,retry]);
  const update=changes=>setParams(updatePolicySearch(search,changes,mode));
  const data=result?.data;
  const jump=(path,changes)=>navigate(`${path}?${serializePolicyBusinessSearch({...filters,...changes,page:1})}`);
  const reportPath=mode==='business'?'/provident-fund/business-report':'/policy/region-report';
  const reportInvalid=mode==='business'&&filters.businessTypes.length!==1;
  const businessFilter=<BusinessTypeFilter value={filters.businessTypes} options={data?.businessFacets} onChange={businessTypes=>update({businessTypes,tagState:'all'})}/>;
  const regionFilter=<PolicyRegionFilter value={filters.regions} tree={data?.regionTree} onChange={regions=>update({regions})}/>;
  return <div className="pf-page">
    <header className="pf-header"><div><p className="pf-eyebrow">公积金专区 / 全国资讯</p><h1>{titles[mode]}</h1><p className="pf-muted">{mode==='daily'?'按日查看住房公积金资讯，点击标签继续浏览。':'按地区和业务筛选新闻；同类条件取并集，不同维度取交集。'}</p></div>
      {mode!=='daily'&&canAccessRoute(user,reportPath)&&(reportInvalid?<span className="pf-hint">选择一项业务后进入政策 AI 报告</span>:<Link className="pf-primary" to={`${reportPath}?${serializePolicyBusinessSearch({...filters,page:1})}`}>{mode==='business'?'业务政策 AI 报告':'地区 AI 报告'} →</Link>)}
    </header>
    <div className="pf-toolbar">
      <label>{mode==='daily'?'新闻日期':'开始日期'}<input type="date" value={filters.startDate} onChange={e=>update(mode==='daily'?{startDate:e.target.value,endDate:e.target.value}:{startDate:e.target.value})}/></label>
      {mode!=='daily'&&<label>结束日期<input type="date" value={filters.endDate} onChange={e=>update({endDate:e.target.value})}/></label>}
      <label>标注状态<select value={filters.tagState} onChange={e=>update({tagState:e.target.value,businessTypes:[]})}><option value="all">全部新闻</option><option value="without-valid-tags">暂无有效业务标签</option></select></label>
      <button onClick={()=>update({regions:[],businessTypes:[],tagState:'all'})}>清空筛选</button>
    </div>
    <div className={`pf-workspace ${mode==='daily'?'pf-daily':''}`}>
      {mode!=='daily'&&<aside className="pf-filters">{mode==='business'?businessFilter:regionFilter}<details><summary>{mode==='business'?'按地区进一步筛选':'按业务进一步筛选'}</summary>{mode==='business'?regionFilter:businessFilter}</details></aside>}
      <main className="pf-results" aria-busy={loading&&!error}>
        <div className="pf-results-heading"><strong>{loading?'正在读取…':`${data?.total||0} 条新闻`}</strong><span>评分 ≥ 3 · 按日期倒序</span></div>
        {!!filters.regions.length&&<p className="pf-hint">地区：{filters.regions.map(x=>x.label||x.name).join('、')}</p>}
        {!!filters.businessTypes.length&&<p className="pf-hint">业务：{filters.businessTypes.map(x=>[x.level1,x.level2].filter(Boolean).join(' · ')).join('、')}</p>}
        {error?<div role="alert" className="pf-error">{error}<button onClick={()=>setRetry(x=>x+1)}>重试</button></div>:loading?<p role="status">正在读取新闻…</p>:<>
          {data?.coverage?.warnings?.map(w=><p className="pf-error" key={w}>{w}</p>)}
          {!data?.rows.length&&<div className="pf-empty"><h2>当前条件下暂无新闻</h2><p>可调整日期、地区或业务类型。</p></div>}
          {data?.rows.map(row=><article className="pf-news-row" key={row.id}>
            <div className="pf-news-meta"><time>{row.fetchdate?.slice(0,10)}</time><span>{row.source||'来源未标明'}</span><span>{row.score} 分</span></div>
            <h2>{safeNewsUrl(row.link)?<a href={row.link} target="_blank" rel="noopener noreferrer">{row.title}</a>:row.title}</h2>
            <div className="pf-region-line">地区：{row.regions?.length ? row.regions.map(region=>canAccessRoute(user,'/policy/regions')?<button className="pf-text-button" key={region.name} onClick={()=>jump('/policy/regions',{regions:[{name:region.name,level:region.level}]})}>{region.name} · </button>:<span key={region.name}>{region.name} </span>):'未识别地区'}</div>
            <BusinessTypeTags tags={row.businessTypes} status={row.businessTypeStatus} onSelect={canAccessRoute(user,'/provident-fund/business')?tag=>jump('/provident-fund/business',{businessTypes:[tag],tagState:'all'}):undefined}/>
            {row.short_summary&&<p>{row.short_summary}</p>}
            {row.content&&<details><summary>查看正文</summary><div className="pf-article-content">{row.content}</div></details>}
          </article>)}
          {data?.totalPages>1&&<nav className="pf-pagination" aria-label="新闻分页"><button disabled={filters.page<=1} onClick={()=>update({page:filters.page-1})}>上一页</button><span>第 {filters.page} / {data.totalPages} 页</span><button disabled={filters.page>=data.totalPages} onClick={()=>update({page:filters.page+1})}>下一页</button></nav>}
        </>}
      </main>
    </div>
  </div>;
}
