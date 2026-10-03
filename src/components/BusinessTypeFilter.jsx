import {useState} from 'react';
import {toggleBusinessSelection} from '../utils/policyBusinessFilters';
export default function BusinessTypeFilter({value=[],options=[],onChange,disabled=false,single=false}) {
  const [search,setSearch]=useState('');
  const selected=tag=>value.some(x=>x.level1===tag.level1 && x.level2===tag.level2);
  const toggle=tag=>onChange(single ? (selected(tag)?[]:[tag]) : toggleBusinessSelection(value,tag));
  const parents=['缴存','提取','贷款','其它'].map(level1=>{
    const found=options.find(x=>x.level1===level1)||{level1,count:0,children:[]};
    const children=[...found.children];
    for(const item of value) if(item.level1===level1 && item.level2 && !children.some(x=>x.level2===item.level2)) children.push({level2:item.level2,count:0});
    return {...found,children};
  });
  return <fieldset className="pf-filter" disabled={disabled}>
    <legend>业务类型{single?'（选择一项）':''}</legend>
    <input type="search" aria-label="搜索二级业务" placeholder="搜索二级业务" value={search} onChange={e=>setSearch(e.target.value)}/>
    {parents.map(parent=><div className="pf-business-group" key={parent.level1}>
      <label><input type="checkbox" checked={selected({level1:parent.level1})} onChange={()=>toggle({level1:parent.level1})}/><strong>{parent.level1}</strong><span className="pf-count">{parent.count}</span></label>
      <div className="pf-filter-children">{parent.children.filter(child=>child.level2.includes(search)).map(child=><label key={child.level2}>
        <input type="checkbox" checked={selected({level1:parent.level1,level2:child.level2})} onChange={()=>toggle({level1:parent.level1,level2:child.level2})}/><span>{child.level2}</span><span className="pf-count">{child.count}</span>
      </label>)}</div>
    </div>)}
    {!!value.length && <button type="button" onClick={()=>onChange([])}>全部业务</button>}
  </fieldset>;
}
