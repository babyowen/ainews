import BusinessTypeTags from './BusinessTypeTags';
import {safeNewsUrl} from '../utils/policyBusinessFilters';

export default function ReportMaterialTable({rows,manualOverrides,onToggle}) {
  return <div className="pf-table-scroll pf-materials-scroll" role="region" aria-label="核对材料表格" tabIndex={0}>
    <table className="pf-news-table pf-materials-table">
      <thead><tr><th scope="col">纳入</th><th scope="col">新闻与来源</th><th scope="col">地区</th><th scope="col">业务类型</th><th scope="col">筛选结果</th></tr></thead>
      <tbody>{rows.map(row=>{
        const included=manualOverrides[String(row.id)]??row.includedInAnalysis;
        const reason=Object.hasOwn(manualOverrides,String(row.id))?(included?'人工纳入':'人工排除'):row.filterReason;
        return <tr key={row.id} className={included?'':'pf-material-excluded'}>
          <td><input aria-label={`纳入 N${row.id}`} type="checkbox" disabled={row.evidenceKind==='financial-reserve'} checked={included} onChange={e=>onToggle(row.id,e.target.checked)}/></td>
          <td className="pf-table-title"><h2><span className="pf-material-id">[N{row.id}]</span> {row.title}</h2><p className="pf-hint">{row.fetchdate} · {row.source||'来源未标明'}</p>
            <details><summary>查看材料与来源</summary>{row.short_summary&&<p>{row.short_summary}</p>}<div className="pf-article-content">{row.content||'暂无正文'}</div>{safeNewsUrl(row.link)&&<a href={row.link} target="_blank" rel="noopener noreferrer">查看原文</a>}</details>
          </td>
          <td>{row.region||'未识别地区'}</td>
          <td><BusinessTypeTags tags={row.businessTypes} status={row.businessTypeStatus}/></td>
          <td><span className={`pf-material-status ${included?'is-included':''}`}>{included?'纳入':'排除'}</span><p className="pf-hint">{reason}</p></td>
        </tr>;
      })}</tbody>
    </table>
  </div>;
}
