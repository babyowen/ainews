import { useState, useEffect } from 'react';
import SourceChart from '../components/SourceChart';
import SourceTable from '../components/SourceTable';
import { fetchNewsSourceStats } from '../api/newsSourceStats';
import { fetchNewsWebsites } from '../api/newsWebsites';
import { fetchLowScoreDistribution } from '../api/scoreKeywordDistribution';
import { fetchKeywords } from '../api/keywords';
import { Loading, Error, Empty } from '../components/Status';
import ScoreDistributionChart from '../components/ScoreDistributionChart';
import dayjs from 'dayjs';
import './SourceAnalysis.css';

export default function SourceAnalysisPage() {
  // 关键词和分数选项（初始为空，后续由数据自动填充）
  const [allKeywords, setAllKeywords] = useState([]);
  const [allScores, setAllScores] = useState([0,1,2,3,4,5]);

  // 默认筛选条件
  const defaultDateRange = [dayjs().subtract(7, 'day').format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')];
  const [filters, setFilters] = useState({
    dateRange: defaultDateRange,
    keywords: [], // 初始为空，后续自动全选
    scores: [],   // 初始为空，后续自动全选
    domain: '',
    page: 1,
    pageSize: 10,
    sortBy: 'count',
    order: 'desc',
  });
  // 临时筛选条件（用于表单）
  const [pendingFilters, setPendingFilters] = useState(filters);

  // 来源分析数据
  const [stats, setStats] = useState([]);
  const [websites, setWebsites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [total, setTotal] = useState(0);

  // API得分分布数据
  const [scoreDistData, setScoreDistData] = useState([]);
  const [scoreDistLoading, setScoreDistLoading] = useState(false);
  const [scoreDistError, setScoreDistError] = useState(false);

  // 获取关键词选项
  useEffect(() => {
    fetchKeywords().then(data => {
      setAllKeywords(data);
      // 如果 filters.keywords 为空，自动全选
      if (filters.keywords.length === 0 && data.length > 0) {
        setFilters(f => ({ ...f, keywords: data }));
        setPendingFilters(p => ({ ...p, keywords: data }));
      }
    });
  }, []);

  // 获取网站信息
  useEffect(() => {
    fetchNewsWebsites().then(setWebsites);
  }, []);

  // 统一数据请求（仅 filters 变化时才请求）
  useEffect(() => {
    // 来源分析
    setLoading(true);
    setError(false);
    fetchNewsSourceStats({
      keyword: filters.keywords.length === 1 ? filters.keywords[0] : '',
      startDate: filters.dateRange[0],
      endDate: filters.dateRange[1],
      domain: filters.domain,
      page: filters.page,
      pageSize: filters.pageSize,
      sortBy: filters.sortBy,
      order: filters.order
    }).then(data => {
      setStats(data.rows || data);
      setTotal(data.total || (Array.isArray(data) ? data.length : 0));
      setLoading(false);
    }).catch(() => {
      setError(true);
      setLoading(false);
    });
    // API得分分布
    setScoreDistLoading(true);
    setScoreDistError(false);
    fetchLowScoreDistribution({
      startDate: filters.dateRange[0],
      endDate: filters.dateRange[1]
    }).then(data => {
      setScoreDistData(data);
      setScoreDistLoading(false);
      // 自动提取所有分数和关键词选项
      const scores = Array.from(new Set(data.map(item => item.score))).sort((a, b) => a - b);
      setAllScores(scores);
      // 如果 filters.scores 为空，自动全选
      if (filters.scores.length === 0 && scores.length > 0) {
        setFilters(f => ({ ...f, scores }));
        setPendingFilters(p => ({ ...p, scores }));
      }
      // 如果 filters.keywords 为空（首次加载），也自动全选
      const keywords = Array.from(new Set(data.map(item => item.keyword || '无')));
      if (filters.keywords.length === 0 && keywords.length > 0) {
        setAllKeywords(keywords);
        setFilters(f => ({ ...f, keywords }));
        setPendingFilters(p => ({ ...p, keywords }));
      }
    }).catch(() => {
      setScoreDistError(true);
      setScoreDistLoading(false);
    });
  }, [filters]);

  // 统一本地过滤（API得分分布区块）
  const filteredScoreDistData = scoreDistData.filter(item =>
    (filters.keywords.length ? filters.keywords.includes(item.keyword || '无') : true) &&
    (filters.scores.length ? filters.scores.includes(item.score) : true)
  );

  // 点击"确定"按钮时应用筛选条件
  const handleApplyFilters = () => {
    setFilters({
      ...filters,
      ...pendingFilters,
      page: 1 // 切换筛选时重置到第一页
    });
  };

  // 处理表格/图表的排序、分页、网站筛选
  const handleSort = (sortBy) => {
    setFilters(f => ({ ...f, sortBy, order: f.order === 'asc' ? 'desc' : 'asc', page: 1 }));
  };
  const handlePageChange = (page) => {
    setFilters(f => ({ ...f, page }));
  };
  const handleBarClick = (domain) => {
    setFilters(f => ({ ...f, domain, page: 1 }));
  };
  const clearDomain = () => setFilters(f => ({ ...f, domain: '', page: 1 }));

  return (
    <div className="source-analysis-page">
      <header className="kd-page-header">
        <div>
          <p className="kd-page-kicker">SOURCE ANALYSIS</p>
          <h1 className="kd-page-title">来源分析</h1>
          <p className="kd-page-subtitle">查看新闻来源分布和 API 得分分布统计。</p>
        </div>
      </header>

      {/* 筛选区块 */}
      <section className="source-filter-panel kd-panel">
        <h2 className="kd-panel-title">筛选条件</h2>
        <div className="filter-row">
          <label>时间范围</label>
          <input
            type="date"
            value={pendingFilters.dateRange[0]}
            onChange={e => setPendingFilters(f => ({ ...f, dateRange: [e.target.value, f.dateRange[1]] }))}
          />
          <span>至</span>
          <input
            type="date"
            value={pendingFilters.dateRange[1]}
            onChange={e => setPendingFilters(f => ({ ...f, dateRange: [f.dateRange[0], e.target.value] }))}
          />
        </div>
        <div className="filter-row">
          <label>关键词筛选</label>
          <div className="keyword-checkboxes">
            {allKeywords.map(kw => (
              <label key={kw} className={pendingFilters.keywords.includes(kw) ? 'active' : ''}>
                <input
                  type="checkbox"
                  checked={pendingFilters.keywords.includes(kw)}
                  onChange={e => {
                    if (e.target.checked) {
                      setPendingFilters(f => ({ ...f, keywords: [...f.keywords, kw] }));
                    } else {
                      setPendingFilters(f => ({ ...f, keywords: f.keywords.filter(k => k !== kw) }));
                    }
                  }}
                /> {kw}
              </label>
            ))}
          </div>
        </div>
        <div className="filter-row">
          <label>分数筛选</label>
          <div className="score-checkboxes">
            {allScores.map(score => (
              <label key={score} className={pendingFilters.scores.includes(score) ? 'active' : ''}>
                <input
                  type="checkbox"
                  checked={pendingFilters.scores.includes(score)}
                  onChange={e => {
                    if (e.target.checked) {
                      setPendingFilters(f => ({ ...f, scores: [...f.scores, score] }));
                    } else {
                      setPendingFilters(f => ({ ...f, scores: f.scores.filter(s => s !== score) }));
                    }
                  }}
                /> {score}分
              </label>
            ))}
          </div>
        </div>
        <div className="filter-actions">
          <button className="kd-btn-primary" onClick={handleApplyFilters}>确定</button>
        </div>
      </section>

      {/* 来源分析区块 */}
      <section className="chart-section kd-panel">
        <h2 className="kd-panel-title">来源分析</h2>
        {loading ? <Loading /> : error ? <Error /> : stats.length ? (
          <SourceChart data={stats} websites={websites} onBarClick={handleBarClick} />
        ) : <Empty />}
        {filters.domain && (
          <div className="domain-filter-tag">
            已筛选网站：{filters.domain}
            <button onClick={clearDomain}>×</button>
          </div>
        )}
        <section style={{marginTop: 24}}>
          {loading ? <Loading /> : error ? <Error /> : stats.length ? (
            <SourceTable data={stats} onSort={handleSort} sortBy={filters.sortBy} order={filters.order} page={filters.page} pageSize={filters.pageSize} total={total} onPageChange={handlePageChange} />
          ) : <Empty />}
        </section>
      </section>

      {/* api得分分布区块 */}
      <section className="table-section kd-panel">
        <h2 className="kd-panel-title">API得分分布</h2>
        {scoreDistLoading ? <Loading /> : scoreDistError ? <Error /> : (
          filteredScoreDistData.length ? (
            <ScoreDistributionChart data={filteredScoreDistData} />
          ) : <Empty />
        )}
        <div className="section-footer">
          统计口径：所有统计均以 fetchdate 字段为准，仅区分日期
        </div>
      </section>
    </div>
  );
} 