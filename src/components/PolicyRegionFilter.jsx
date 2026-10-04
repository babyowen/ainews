import {useEffect,useState} from 'react';

function ProvinceGroup({name,selected,children}) {
  const [expanded,setExpanded]=useState(selected);
  useEffect(()=>{if(selected)setExpanded(true);},[selected]);
  return <details className="pf-region-group" open={expanded} onToggle={event=>setExpanded(event.currentTarget.open)}>
    <summary>{name}</summary>
    <div className="pf-filter-children">{children}</div>
  </details>;
}

export default function PolicyRegionFilter({value=[],tree,onChange,disabled=false}) {
  const equal=(a,b)=>a.name===b.name&&a.level===b.level;
  const all=[{name:'全国',level:'national',count:tree?.national?.count||0},...(tree?.municipalities||[]),...(tree?.provinces||[]),{name:'未识别地区',level:'missing',count:tree?.unknownCount||0}];
  const known=all.flatMap(x=>[x,...(x.cities||[]),...(x.level==='province'?[{name:x.name,level:'provincial'}]:[])]);
  for (const selected of value) if(!known.some(x=>equal(x,selected))) all.push({...selected,count:0});
  const choice=(item,label)=> <label key={`${item.level}:${item.name}`}>
    <input type="checkbox" checked={value.some(x=>equal(x,item))} onChange={()=>onChange(value.some(x=>equal(x,item))?value.filter(x=>!equal(x,item)):[...value,{name:item.name,level:item.level}])}/>
    <span>{label||item.name}</span><span className="pf-count">{item.count || 0}</span>
  </label>;
  return <fieldset className="pf-filter" disabled={disabled}><legend>地区</legend>
    <p className="pf-hint">不勾选为全部地区；“全国”仅指全国性新闻。</p>
    {all.map(item=><div key={`${item.level}:${item.name}`}>
      {item.level==='province' ? <ProvinceGroup name={item.name} selected={value.some(x=>x.name===item.name || item.cities?.some(c=>c.name===x.name))}>
          {choice(item,'全省')}
          {choice({...item,level:'provincial',count:item.provincialCount},'省本级')}
          {item.cities?.map(city=>choice(city))}
      </ProvinceGroup> : choice(item)}
    </div>)}
    {!!value.length && <button type="button" onClick={()=>onChange([])}>全部地区</button>}
  </fieldset>;
}
