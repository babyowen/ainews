import {useEffect,useRef,useState} from 'react';
import {ChevronDown,X} from 'lucide-react';
import PolicyRegionFilter from './PolicyRegionFilter';
import BusinessTypeFilter from './BusinessTypeFilter';

const regionLabel=region=>region.level==='province'?`${region.name} · 全省`:region.level==='provincial'?`${region.name} · 省本级`:region.name;

export default function FundDailyFilters({filters,data,onChange}) {
  const [open,setOpen]=useState(null);
  const root=useRef(null);
  const triggerRefs=useRef({});
  useEffect(()=>{
    const close=event=>{if(!root.current?.contains(event.target))setOpen(null);};
    const escape=event=>{if(event.key==='Escape'){setOpen(null);triggerRefs.current[open]?.focus();}};
    document.addEventListener('pointerdown',close);
    document.addEventListener('keydown',escape);
    return ()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',escape);};
  },[open]);
  const popup=(kind,label,count,content)=> <div className={`pf-filter-dropdown pf-filter-dropdown-${kind}`}>
    <button type="button" ref={node=>{triggerRefs.current[kind]=node;}} className={`pf-filter-trigger ${count?'pf-filter-active':''}`} aria-expanded={open===kind} aria-controls={`fund-${kind}-panel`} onClick={()=>setOpen(open===kind?null:kind)}>
      <span>{label}</span>{!!count&&<span className="pf-filter-badge">{count}</span>}<ChevronDown size={14}/>
    </button>
    {open===kind&&<section id={`fund-${kind}-panel`} className="pf-filter-popover" aria-label={`${label}筛选`}>
      <div className="pf-popover-heading"><strong>{label}</strong><button type="button" aria-label={`关闭${label}筛选`} onClick={()=>{setOpen(null);triggerRefs.current[kind]?.focus();}}><X size={16}/></button></div>
      {content}
    </section>}
  </div>;
  return <div ref={root} className="pf-daily-filter-bar">
    <div className="pf-toolbar pf-daily-toolbar">
      <div className="pf-date-range">
        <label>开始日期<input type="date" value={filters.startDate} max={filters.endDate} onChange={e=>onChange({startDate:e.target.value})}/></label>
        <span className="pf-date-separator">—</span>
        <label>结束日期<input type="date" value={filters.endDate} min={filters.startDate} onChange={e=>onChange({endDate:e.target.value})}/></label>
      </div>
      {popup('regions','地区',filters.regions.length,<PolicyRegionFilter value={filters.regions} tree={data?.regionTree} onChange={regions=>onChange({regions})}/>)}
      {popup('business','业务类型',filters.businessTypes.length+(filters.tagState==='all'?0:1),<BusinessTypeFilter collapsible value={filters.businessTypes} options={data?.businessFacets} onChange={businessTypes=>onChange({businessTypes,tagState:'all'})} tagState={filters.tagState} onTagStateChange={tagState=>onChange({tagState,businessTypes:[]})} untaggedCount={(data?.coverage?.pending||0)+(data?.coverage?.unidentified||0)+(data?.coverage?.invalid||0)}/>)}
      <button type="button" className="pf-clear-filters" onClick={()=>onChange({regions:[],businessTypes:[],tagState:'all'})}>清空筛选</button>
    </div>
    {(filters.regions.length>0||filters.businessTypes.length>0||filters.tagState!=='all')&&<div className="pf-selected-filters" aria-label="已选筛选条件">
      <span className="pf-hint">已选</span>
      {filters.regions.map((region,index)=><button type="button" className="pf-filter-chip" key={`${region.level}:${region.name}`} aria-label={`移除地区 ${regionLabel(region)}`} onClick={()=>onChange({regions:filters.regions.filter((_,i)=>i!==index)})}>{regionLabel(region)}<X size={12}/></button>)}
      {filters.businessTypes.map((tag,index)=><button type="button" className="pf-filter-chip" key={`${tag.level1}:${tag.level2}`} aria-label={`移除业务 ${[tag.level1,tag.level2].filter(Boolean).join(' · ')}`} onClick={()=>onChange({businessTypes:filters.businessTypes.filter((_,i)=>i!==index)})}>{[tag.level1,tag.level2].filter(Boolean).join(' · ')}<X size={12}/></button>)}
      {filters.tagState!=='all'&&<button type="button" className="pf-filter-chip" aria-label="移除暂无有效标签筛选" onClick={()=>onChange({tagState:'all'})}>暂无有效标签<X size={12}/></button>}
    </div>}
  </div>;
}
