const states={pending:'待标注',unidentified:'未识别业务',invalid:'标签异常'};
export default function BusinessTypeTags({tags=[],status,selected=[],onSelect}) {
  const tagClass=tag=>`pf-tag ${selected.some(x=>x.level1===tag.level1&&(!x.level2||x.level2===tag.level2))?'pf-tag-selected':''}`;
  return <div className="pf-tags">{tags.map(tag=>onSelect ? <button type="button" className={tagClass(tag)} key={`${tag.level1}:${tag.level2}`} onClick={()=>onSelect(tag)}>{tag.level1} · {tag.level2}</button> : <span className={tagClass(tag)} key={`${tag.level1}:${tag.level2}`}>{tag.level1} · {tag.level2}</span>)}
    {!tags.length && <span className="pf-muted">{states[status]||'未标注'}</span>}
  </div>;
}
