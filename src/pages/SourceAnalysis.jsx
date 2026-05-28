import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../auth/AuthContext';
import { fetchSourceQualityAnalysis } from '../api/sourceQualityAnalysis';
import { fetchNewsWebsites } from '../api/newsWebsites';
import ReactECharts from 'echarts-for-react';
import { Loading, Error, Empty } from '../components/Status';
import './SourceAnalysis.css';

const SCORE_COLORS = ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#27ae60', '#1a7a4c'];

export default function SourceAnalysisPage() {
  const { allowedKeywords } = useAuth();
  const [data, setData] = useState(null);
  const [websites, setWebsites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedKeyword, setSelectedKeyword] = useState('all');
  const [sortBy, setSortBy] = useState('total');
  const [sortOrder, setSortOrder] = useState('desc');

  useEffect(() => {
    fetchNewsWebsites().then(setWebsites);
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(false);
    fetchSourceQualityAnalysis()
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, []);

  const websiteMap = useMemo(() => {
    const m = {};
    for (const w of websites) m[w.website] = w.name;
    return m;
  }, [websites]);

  // Filter by allowed keywords
  const filtered = useMemo(() => {
    if (!data?.rows) return [];
    let rows = data.rows;
    if (allowedKeywords?.length) {
      rows = rows.filter(r => allowedKeywords.includes(r.keyword));
    }
    if (selectedKeyword !== 'all') {
      rows = rows.filter(r => r.keyword === selectedKeyword);
    }
    return rows;
  }, [data, allowedKeywords, selectedKeyword]);

  const keywords = useMemo(() => {
    if (!data?.rows) return [];
    let rows = data.rows;
    if (allowedKeywords?.length) rows = rows.filter(r => allowedKeywords.includes(r.keyword));
    return [...new Set(rows.map(r => r.keyword))];
  }, [data, allowedKeywords]);

  // Aggregate by source across selected keyword(s)
  const sourceAgg = useMemo(() => {
    const map = {};
    for (const r of filtered) {
      if (!map[r.source]) {
        map[r.source] = { source: r.source, total: 0, scoreSum: 0, highCount: 0, lowCount: 0, keywordCount: 0, scoreDist: {} };
      }
      const s = map[r.source];
      const t = Number(r.total);
      s.total += t;
      s.scoreSum += Number(r.avg_score) * t;
      s.highCount += Number(r.high_count);
      s.lowCount += Number(r.low_count);
      s.keywordCount += 1;
      for (const [score, cnt] of Object.entries(r.score_dist || {})) {
        s.scoreDist[score] = (s.scoreDist[score] || 0) + Number(cnt);
      }
    }
    return Object.values(map).map(s => ({
      ...s,
      avg_score: s.total > 0 ? Math.round((s.scoreSum / s.total) * 100) / 100 : 0,
      high_ratio: s.total > 0 ? Math.round((s.highCount / s.total) * 1000) / 10 : 0,
    }));
  }, [filtered]);

  const sortedSourceAgg = useMemo(() => {
    const arr = [...sourceAgg];
    const dir = sortOrder === 'desc' ? -1 : 1;
    if (sortBy === 'avg_score') arr.sort((a, b) => (a.avg_score - b.avg_score) * dir);
    else if (sortBy === 'high_ratio') arr.sort((a, b) => (a.high_ratio - b.high_ratio) * dir);
    else arr.sort((a, b) => (a.total - b.total) * dir);
    return arr;
  }, [sourceAgg, sortBy, sortOrder]);

  // --- Chart 1: Source bar chart (top 20 by count, colored by avg_score) ---
  const sourceBarOption = useMemo(() => {
    const top = sortedSourceAgg.slice(0, 20);
    const names = top.map(s => websiteMap[s.source] || s.source);
    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: params => {
          const s = top[params[0].dataIndex];
          return `<b>${websiteMap[s.source] || s.source}</b><br/>
            总数: ${s.total}<br/>
            平均分: ${s.avg_score}<br/>
            高分(≥4)占比: ${s.high_ratio}%<br/>
            来源关键词数: ${s.keywordCount}`;
        }
      },
      grid: { left: 120, right: 30, top: 20, bottom: 40 },
      xAxis: { type: 'value', name: '新闻数' },
      yAxis: { type: 'category', data: names.reverse(), axisLabel: { fontSize: 11 } },
      series: [{
        type: 'bar',
        data: top.map(s => s.total).reverse(),
        itemStyle: {
          color: (params) => {
            const s = top[top.length - 1 - params.dataIndex];
            if (!s) return '#999';
            if (s.avg_score >= 3.5) return '#27ae60';
            if (s.avg_score >= 2.5) return '#f39c12';
            return '#e74c3c';
          },
          borderRadius: [0, 4, 4, 0]
        },
        barMaxWidth: 24,
      }],
    };
  }, [sortedSourceAgg, websiteMap]);

  // --- Chart 2: Keyword-Source heatmap (top 15 sources) ---
  const heatmapOption = useMemo(() => {
    const topSources = [...sourceAgg].sort((a, b) => b.total - a.total).slice(0, 15).map(s => s.source);
    const displayNames = topSources.map(s => websiteMap[s] || s);
    const kws = keywords;
    const heatData = [];
    for (let ki = 0; ki < kws.length; ki++) {
      for (let si = 0; si < topSources.length; si++) {
        const row = filtered.find(r => r.keyword === kws[ki] && r.source === topSources[si]);
        heatData.push([si, ki, row ? row.total : 0]);
      }
    }
    const maxVal = Math.max(...heatData.map(d => d[2]), 1);
    return {
      tooltip: {
        formatter: p => {
          const src = topSources[p.data[0]];
          const kw = kws[p.data[1]];
          const val = p.data[2];
          const row = filtered.find(r => r.keyword === kw && r.source === src);
          return `<b>${websiteMap[src] || src}</b> × <b>${kw}</b><br/>新闻数: ${val}${row ? `<br/>平均分: ${row.avg_score}` : ''}`;
        }
      },
      grid: { left: 120, right: 60, top: 10, bottom: 60 },
      xAxis: { type: 'category', data: displayNames, axisLabel: { rotate: 35, fontSize: 10 } },
      yAxis: { type: 'category', data: kws, axisLabel: { fontSize: 11 } },
      visualMap: {
        min: 0, max: maxVal,
        calculable: true,
        orient: 'vertical',
        right: 0, top: 'center',
        inRange: { color: ['#f0f9f4', '#7bc47f', '#27ae60', '#1a6b3c'] },
        textStyle: { fontSize: 10 }
      },
      series: [{
        type: 'heatmap',
        data: heatData,
        label: {
          show: true,
          formatter: p => p.data[2] > 0 ? p.data[2] : '',
          fontSize: 10
        },
      }],
    };
  }, [filtered, keywords, sourceAgg, websiteMap]);

  // --- Chart 3: Treemap - keyword source distribution ---
  const treemapOption = useMemo(() => {
    const kws = selectedKeyword === 'all' ? keywords : [selectedKeyword];
    const children = kws.map(kw => {
      const sources = filtered.filter(r => r.keyword === kw);
      const totalForKw = sources.reduce((sum, r) => sum + r.total, 0);
      return {
        name: kw,
        value: totalForKw,
        children: sources.slice(0, 10).map(s => ({
          name: websiteMap[s.source] || s.source,
          value: s.total,
          avgScore: s.avg_score,
        }))
      };
    });
    return {
      tooltip: {
        formatter: info => {
          const v = info.value;
          const treePath = info.treePathInfo.map(p => p.name).slice(1);
          return treePath.join(' / ') + `<br/>新闻数: ${v}`;
        }
      },
      series: [{
        type: 'treemap',
        width: '100%', height: '100%',
        roam: false,
        nodeClick: false,
        breadcrumb: { show: false },
        label: { show: true, fontSize: 11, formatter: '{b}' },
        upperLabel: { show: true, height: 24, fontSize: 13, fontWeight: 'bold' },
        itemStyle: { borderColor: '#fff', borderWidth: 2, gapWidth: 2 },
        levels: [
          { itemStyle: { borderColor: '#fff', borderWidth: 3, gapWidth: 4 } },
          { colorSaturation: [0.3, 0.7], itemStyle: { borderColorSaturation: 0.5, gapWidth: 1 } }
        ],
        data: children
      }]
    };
  }, [filtered, keywords, selectedKeyword, websiteMap]);

  // --- Chart 4: Score distribution stacked bar per source (top 10) ---
  const scoreDistOption = useMemo(() => {
    const top = sortedSourceAgg.slice(0, 10);
    const sources = top.map(s => websiteMap[s.source] || s.source).reverse();
    const scores = [0, 1, 2, 3, 4, 5];
    const series = scores.map(score => ({
      name: `${score}分`,
      type: 'bar',
      stack: 'total',
      barMaxWidth: 24,
      itemStyle: { color: SCORE_COLORS[score] },
      data: top.map(s => s.scoreDist[score] || 0).reverse(),
    }));
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { data: scores.map(s => `${s}分`), bottom: 0, textStyle: { fontSize: 10 } },
      grid: { left: 120, right: 20, top: 20, bottom: 40 },
      xAxis: { type: 'value', name: '新闻数' },
      yAxis: { type: 'category', data: sources, axisLabel: { fontSize: 11 } },
      series,
    };
  }, [sortedSourceAgg, websiteMap]);

  // --- Chart 5: Radar chart for top sources quality profile ---
  const radarOption = useMemo(() => {
    const top = sortedSourceAgg.slice(0, 8);
    if (top.length === 0) return null;
    const indicators = top.map(s => ({
      name: websiteMap[s.source] || s.source,
      max: Math.max(...top.map(t => t.total), 1) * 1.2
    }));
    return {
      tooltip: {},
      legend: { data: ['新闻总数'], bottom: 0, textStyle: { fontSize: 10 } },
      radar: { indicator: indicators, shape: 'polygon', radius: '65%', name: { textStyle: { fontSize: 10 } } },
      series: [{
        type: 'radar',
        data: [{ value: top.map(s => s.total), name: '新闻总数', areaStyle: { opacity: 0.15 } }]
      }]
    };
  }, [sortedSourceAgg, websiteMap]);

  const toggleSort = (col) => {
    if (sortBy === col) setSortOrder(o => o === 'desc' ? 'asc' : 'desc');
    else { setSortBy(col); setSortOrder('desc'); }
  };

  const sortIcon = (col) => sortBy === col ? (sortOrder === 'desc' ? ' ↓' : ' ↑') : '';

  if (loading) return <div className="source-analysis-page"><Loading /></div>;
  if (error) return <div className="source-analysis-page"><Error /></div>;

  return (
    <div className="source-analysis-page">
      <header className="kd-page-header">
        <div>
          <p className="kd-page-kicker">SOURCE QUALITY ANALYSIS</p>
          <h1 className="kd-page-title">来源分析</h1>
          <p className="kd-page-subtitle">分析关键词的新闻来源分布与评分质量。{data?.cached ? '(缓存数据)' : ''}</p>
        </div>
      </header>

      {/* Keyword selector */}
      <section className="source-filter-panel kd-panel">
        <h2 className="kd-panel-title">关键词选择</h2>
        <div className="filter-row">
          <div className="keyword-tabs">
            <button
              className={`kw-tab ${selectedKeyword === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedKeyword('all')}
            >全部</button>
            {keywords.map(kw => (
              <button
                key={kw}
                className={`kw-tab ${selectedKeyword === kw ? 'active' : ''}`}
                onClick={() => setSelectedKeyword(kw)}
              >{kw}</button>
            ))}
          </div>
        </div>
      </section>

      {/* Summary cards */}
      <section className="summary-cards">
        <div className="summary-card">
          <div className="summary-value">{filtered.reduce((s, r) => s + Number(r.total), 0).toLocaleString()}</div>
          <div className="summary-label">新闻总数</div>
        </div>
        <div className="summary-card">
          <div className="summary-value">{sourceAgg.length}</div>
          <div className="summary-label">来源网站数</div>
        </div>
        <div className="summary-card">
          <div className="summary-value">
            {filtered.length > 0
              ? (filtered.reduce((s, r) => s + Number(r.avg_score) * Number(r.total), 0) / filtered.reduce((s, r) => s + Number(r.total), 0)).toFixed(2)
              : '-'}
          </div>
          <div className="summary-label">整体平均分</div>
        </div>
        <div className="summary-card">
          <div className="summary-value">
            {filtered.length > 0
              ? (filtered.reduce((s, r) => s + Number(r.high_count), 0) / filtered.reduce((s, r) => s + Number(r.total), 0) * 100).toFixed(1)
              : '-'}%
          </div>
          <div className="summary-label">高分(≥4)占比</div>
        </div>
      </section>

      {/* Chart: Source bar chart */}
      <section className="chart-section kd-panel">
        <h2 className="kd-panel-title">来源新闻数量 Top 20</h2>
        {sortedSourceAgg.length ? (
          <ReactECharts option={sourceBarOption} style={{ height: 480 }} />
        ) : <Empty />}
        <div className="section-footer">颜色说明：绿色 = 平均分 ≥ 3.5，橙色 = 2.5~3.5，红色 = &lt; 2.5</div>
      </section>

      {/* Chart: Keyword-Source heatmap */}
      {keywords.length > 0 && (
        <section className="chart-section kd-panel">
          <h2 className="kd-panel-title">关键词 × 来源 热力图</h2>
          <ReactECharts option={heatmapOption} style={{ height: Math.max(200, keywords.length * 40 + 60) }} />
        </section>
      )}

      {/* Chart: Treemap */}
      <section className="chart-section kd-panel">
        <h2 className="kd-panel-title">来源结构分布</h2>
        <ReactECharts option={treemapOption} style={{ height: 380 }} />
      </section>

      {/* Chart: Score distribution stacked bar */}
      <section className="chart-section kd-panel">
        <h2 className="kd-panel-title">来源评分分布 Top 10</h2>
        {sortedSourceAgg.length ? (
          <ReactECharts option={scoreDistOption} style={{ height: 400 }} />
        ) : <Empty />}
      </section>

      {/* Chart: Radar */}
      {radarOption && (
        <section className="chart-section kd-panel">
          <h2 className="kd-panel-title">来源规模雷达图</h2>
          <ReactECharts option={radarOption} style={{ height: 350 }} />
        </section>
      )}

      {/* Detail table */}
      <section className="table-section kd-panel">
        <h2 className="kd-panel-title">来源详情</h2>
        <div className="detail-table-wrap">
          <table className="detail-table">
            <thead>
              <tr>
                <th>来源网站</th>
                <th className="sortable" onClick={() => toggleSort('total')}>新闻数{sortIcon('total')}</th>
                <th className="sortable" onClick={() => toggleSort('avg_score')}>平均分{sortIcon('avg_score')}</th>
                <th>高分(≥4)数</th>
                <th className="sortable" onClick={() => toggleSort('high_ratio')}>高分占比{sortIcon('high_ratio')}</th>
                <th>低分(≤1)数</th>
                <th>覆盖关键词数</th>
                <th>评分分布</th>
              </tr>
            </thead>
            <tbody>
              {sortedSourceAgg.slice(0, 50).map(row => (
                <tr key={row.source}>
                  <td className="src-name">{websiteMap[row.source] || row.source}</td>
                  <td className="num-cell">{row.total.toLocaleString()}</td>
                  <td className={`num-cell score-${Math.round(row.avg_score)}`}>{row.avg_score}</td>
                  <td className="num-cell">{row.highCount.toLocaleString()}</td>
                  <td className="num-cell">{row.high_ratio}%</td>
                  <td className="num-cell">{row.lowCount.toLocaleString()}</td>
                  <td className="num-cell">{row.keywordCount}</td>
                  <td className="mini-bar-cell">
                    <MiniBar dist={row.scoreDist} total={row.total} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sortedSourceAgg.length > 50 && (
          <div className="section-footer">仅展示前 50 条，共 {sortedSourceAgg.length} 个来源</div>
        )}
      </section>
    </div>
  );
}

function MiniBar({ dist, total }) {
  if (!dist || total === 0) return null;
  const scores = [0, 1, 2, 3, 4, 5];
  return (
    <div className="mini-bar">
      {scores.map(s => {
        const pct = ((dist[s] || 0) / total) * 100;
        return pct > 0 ? (
          <div key={s} className="mini-bar-seg" style={{ width: `${pct}%`, background: SCORE_COLORS[s] }} title={`${s}分: ${dist[s] || 0}`} />
        ) : null;
      })}
    </div>
  );
}
