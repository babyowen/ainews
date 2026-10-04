import {safeNewsUrl} from '../utils/policyBusinessFilters';
import BusinessTypeTags from './BusinessTypeTags';

export default function FundDailyTable({rows,selectedBusiness,onRegionSelect,onBusinessSelect}) {
  return <div className="pf-table-scroll" role="region" aria-label="公积金新闻表格" tabIndex={0}>
    <table className="pf-news-table">
      <caption className="pf-visually-hidden">公积金新闻，按采集日期倒序</caption>
      <thead><tr><th scope="col">日期</th><th scope="col">标题与摘要</th><th scope="col">地区</th><th scope="col">业务类型</th><th scope="col">来源</th><th scope="col">评分</th></tr></thead>
      <tbody>{rows.map(row=><tr key={row.id}>
        <td className="pf-table-date"><time>{row.fetchdate?.slice(0,10)}</time></td>
        <td className="pf-table-title">
          <h2>{safeNewsUrl(row.link)?<a href={row.link} target="_blank" rel="noopener noreferrer">{row.title}</a>:row.title}</h2>
          {row.short_summary&&<p>{row.short_summary}</p>}
          {row.content&&<details><summary>查看正文</summary><div className="pf-article-content">{row.content}</div></details>}
        </td>
        <td><div className="pf-table-regions">{row.regions?.length?row.regions.map(region=>onRegionSelect?<button type="button" key={`${region.level}:${region.name}`} className="pf-region-tag" onClick={()=>onRegionSelect(region)}>{region.name}</button>:<span key={`${region.level}:${region.name}`} className="pf-region-tag">{region.name}</span>):<span className="pf-muted">未识别地区</span>}</div></td>
        <td><BusinessTypeTags tags={row.businessTypes} status={row.businessTypeStatus} selected={selectedBusiness} onSelect={onBusinessSelect}/></td>
        <td className="pf-table-source">{row.source||'来源未标明'}</td>
        <td><span className={`pf-table-score pf-table-score-${row.score}`}>{row.score}</span></td>
      </tr>)}</tbody>
    </table>
  </div>;
}
