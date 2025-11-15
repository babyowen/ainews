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
    <div style={{ background: '#f8f9fa', minHeight: '100vh', padding: '0 0 32px 0' }}>
      {/* 筛选区块 */}
      <section style={{
        margin: '32px auto 32px auto',
        maxWidth: 1200,
        background: '#fff',
        border: '2px solid #1890ff',
        borderRadius: 12,
        boxShadow: '0 4px 16px #e6f7ff',
        padding: '32px 32px 16px 32px',
        position: 'relative',
      }}>
        <div style={{fontSize: 22, fontWeight: 700, color: '#1890ff', marginBottom: 24, letterSpacing: 2}}>筛选条件</div>
        <div style={{display: 'flex', alignItems: 'center', marginBottom: 20, gap: 16, flexWrap: 'wrap'}}>
          <label style={{fontWeight: 500, fontSize: 18}}>时间范围：</label>
          <input
            type="date"
            value={pendingFilters.dateRange[0]}
            onChange={e => setPendingFilters(f => ({ ...f, dateRange: [e.target.value, f.dateRange[1]] }))}
            style={{marginRight: 8, padding: '4px 8px', borderRadius: 4, border: '1px solid #ccc'}}
          />
          <span style={{fontWeight: 500, fontSize: 16}}>至</span>
          <input
            type="date"
            value={pendingFilters.dateRange[1]}
            onChange={e => setPendingFilters(f => ({ ...f, dateRange: [f.dateRange[0], e.target.value] }))}
            style={{marginLeft: 8, padding: '4px 8px', borderRadius: 4, border: '1px solid #ccc'}}
          />
        </div>
        <div style={{display: 'flex', alignItems: 'center', marginBottom: 20, gap: 16, flexWrap: 'wrap'}}>
          <span style={{fontWeight: 500, fontSize: 18}}>关键词筛选：</span>
          <div style={{display: 'flex', flexWrap: 'wrap', gap: 12}}>
            {allKeywords.map(kw => (
              <label key={kw} style={{display: 'flex', alignItems: 'center', background: pendingFilters.keywords.includes(kw) ? '#e6f7ff' : '#fff', border: pendingFilters.keywords.includes(kw) ? '1.5px solid #1890ff' : '1px solid #ccc', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontWeight: pendingFilters.keywords.includes(kw) ? 600 : 400}}>
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
                  style={{marginRight: 4}}
                /> {kw}
              </label>
            ))}
          </div>
        </div>
        <div style={{display: 'flex', alignItems: 'center', marginBottom: 20, gap: 16, flexWrap: 'wrap'}}>
          <span style={{fontWeight: 500, fontSize: 18}}>分数筛选：</span>
          <div style={{display: 'flex', flexWrap: 'wrap', gap: 12}}>
            {allScores.map(score => (
              <label key={score} style={{display: 'flex', alignItems: 'center', background: pendingFilters.scores.includes(score) ? '#e6f7ff' : '#fff', border: pendingFilters.scores.includes(score) ? '1.5px solid #1890ff' : '1px solid #ccc', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontWeight: pendingFilters.scores.includes(score) ? 600 : 400}}>
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
                  style={{marginRight: 4}}
                /> {score}分
              </label>
            ))}
          </div>
        </div>
        <div style={{textAlign: 'left', marginTop: 8}}>
          <button
            onClick={handleApplyFilters}
            style={{padding: '8px 32px', background: '#1890ff', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 18, cursor: 'pointer', boxShadow: '0 2px 4px #e6f7ff'}}
          >确定</button>
        </div>
      </section>

      {/* 来源分析区块 */}
      <section style={{maxWidth: 1200, margin: '0 auto 32px auto', background: '#fff', borderRadius: 12, boxShadow: '0 2px 8px #f0f1f2', padding: '32px 32px 24px 32px', border: '1.5px solid #e6f7ff'}}>
        <div style={{fontSize: 24, fontWeight: 700, color: '#222', marginBottom: 24, letterSpacing: 2, borderLeft: '6px solid #1890ff', paddingLeft: 12}}>来源分析</div>
        {/* 图表区 */}
        <section>
          {loading ? <Loading /> : error ? <Error /> : stats.length ? (
            <SourceChart data={stats} websites={websites} onBarClick={handleBarClick} />
          ) : <Empty />}
          {filters.domain && <div style={{margin:'8px 0',color:'#3d4673'}}>已筛选网站：{filters.domain} <button onClick={clearDomain}>清除</button></div>}
        </section>
        {/* 表格区 */}
        <section style={{marginTop: 24}}>
          {loading ? <Loading /> : error ? <Error /> : stats.length ? (
            <SourceTable data={stats} onSort={handleSort} sortBy={filters.sortBy} order={filters.order} page={filters.page} pageSize={filters.pageSize} total={total} onPageChange={handlePageChange} />
          ) : <Empty />}
        </section>
      </section>

      {/* api得分分布区块 */}
      <section style={{maxWidth: 1200, margin: '0 auto', background: '#fff', borderRadius: 12, boxShadow: '0 2px 8px #f0f1f2', padding: '32px 32px 24px 32px', border: '1.5px solid #e6f7ff'}}>
        <div style={{fontSize: 24, fontWeight: 700, color: '#222', marginBottom: 24, letterSpacing: 2, borderLeft: '6px solid #1890ff', paddingLeft: 12}}>API得分分布</div>
        {scoreDistLoading ? <Loading /> : scoreDistError ? <Error /> : (
          filteredScoreDistData.length ? (
            <ScoreDistributionChart data={filteredScoreDistData} />
          ) : <Empty />
        )}
        <div style={{ marginTop: 16, color: '#888', fontSize: 14 }}>
          统计口径：所有统计均以 fetchdate 字段为准，仅区分日期
        </div>
      </section>
    </div>
  );
} 