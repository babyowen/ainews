import { useState, useEffect } from 'react';
import FilterBar, { ScoreFilter } from '../components/FilterBar';
import SummaryCard from '../components/SummaryCard';
import NewsTable from '../components/NewsTable';
import { fetchSummaryNews } from '../api/summaryNews';
import { fetchScoredNews } from '../api/scoredNews';
import { Loading, Error, Empty } from '../components/Status';
import dayjs from 'dayjs';

export default function SummaryNewsPage() {
  const [filters, setFilters] = useState({ keyword: '', date: dayjs().subtract(1, 'day').format('YYYY-MM-DD'), rounds: [], scores: [3, 4, 5] });
  const [summaries, setSummaries] = useState([]);
  const [news, setNews] = useState([]);
  const [newsTotal, setNewsTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [availableRounds, setAvailableRounds] = useState([]);
  const [newsPage, setNewsPage] = useState(1);
  const [newsPageSize, setNewsPageSize] = useState(50);
  const [newsSortBy, setNewsSortBy] = useState('score');
  const [newsSortOrder, setNewsSortOrder] = useState('desc');

  // 计算分数筛选的最小最大值
  const hasUnscored = filters.scores && filters.scores.includes('unscored');
  const numericScores = filters.scores ? filters.scores.filter(s => typeof s === 'number') : [];
  const minScore = numericScores.length ? Math.min(...numericScores) : undefined;
  const maxScore = numericScores.length ? Math.max(...numericScores) : undefined;
  
  // 如果有任何筛选条件（数字分数或未评分），就需要传递给后端
  const hasScoreFilter = numericScores.length > 0 || hasUnscored;

  useEffect(() => {
    setLoading(true);
    setError(false);
    
    // 特别调试江苏省国资委关键词
    if (filters.keyword === '江苏省国资委') {
      console.log('=== 江苏省国资委关键词调试 ===');
      console.log('关键词编码:', encodeURIComponent(filters.keyword));
      console.log('请求参数:', {
        keyword: filters.keyword,
        date: filters.date,
        minScore,
        maxScore,
        includeUnscored: hasUnscored,
        page: newsPage,
        pageSize: newsPageSize,
        sortBy: newsSortBy,
        order: newsSortOrder
      });
    }
    
    Promise.all([
      fetchSummaryNews({ keyword: filters.keyword, date: filters.date }),
      fetchScoredNews({
        keyword: filters.keyword,
        date: filters.date,
        minScore,
        maxScore,
        includeUnscored: hasUnscored,
        page: newsPage,
        pageSize: newsPageSize,
        sortBy: newsSortBy,
        order: newsSortOrder
      })
    ]).then(([summaryData, newsData]) => {
      // 计算所有可用轮次
      const rounds = Array.from(new Set(summaryData.map(item => Number(item.round)).filter(Boolean)));
      rounds.sort((a, b) => a - b);
      setAvailableRounds(rounds);
      // 自动勾选最大轮次
      if (rounds.length > 0 && (!filters.rounds || filters.rounds.length === 0)) {
        setFilters(f => ({ ...f, rounds: [Math.max(...rounds)] }));
      }
      setSummaries(summaryData);
      
      // 过滤掉content为空的新闻记录
      const newsRows = newsData.rows || newsData;
      const filteredNewsRows = Array.isArray(newsRows) ? 
        newsRows.filter(news => news.content && news.content.trim() !== '') : 
        newsRows;
      
      setNews(filteredNewsRows);
      
      // 重新计算总数（基于过滤后的数据）
      const originalTotal = newsData.total || (newsData.rows ? newsData.rows.length : (Array.isArray(newsData) ? newsData.length : 0));
      const filteredTotal = Array.isArray(newsRows) ? filteredNewsRows.length : originalTotal;
      setNewsTotal(filteredTotal);
      
      setLoading(false);
    }).catch(() => {
      setError(true);
      setLoading(false);
    });
  }, [filters.keyword, filters.date, minScore, maxScore, hasUnscored, newsPage, newsPageSize, newsSortBy, newsSortOrder]);

  // 轮次筛选逻辑
  let filteredSummaries = summaries;
  if (filters.rounds && filters.rounds.length > 0) {
    filteredSummaries = summaries.filter(item => filters.rounds.includes(Number(item.round)));
  } else if (availableRounds.length > 0) {
    const maxRound = Math.max(...availableRounds);
    filteredSummaries = summaries.filter(item => Number(item.round) === maxRound);
  }

  // 分数筛选逻辑
  let filteredNews = news;
  // 排序逻辑
  // 已由后端处理，无需前端再排序
  // 分页逻辑
  const totalNews = newsTotal;
  const totalNewsPages = Math.ceil(totalNews / newsPageSize);
  const pagedNews = news;

  return (
    <div style={{
      fontFamily: 'Inter, Roboto, Helvetica, Arial, sans-serif',
      background: '#f6f8fa',
      minHeight: '100vh',
      paddingBottom: 40,
      width: '100%',
      margin: 0,
      boxSizing: 'border-box',
    }}>
      <header style={{
        textAlign: 'center',
        marginBottom: 32,
        paddingTop: 40,
        paddingBottom: 32,
        background: 'radial-gradient(1200px 800px at 8% 0%, #f1f7ff 0%, #fafdff 55%), radial-gradient(1200px 800px at 92% 0%, #e8f2ff 0%, #fafdff 55%)',
        borderRadius: '0 0 24px 24px',
        boxShadow: '0 6px 28px 0 rgba(60,80,120,0.08)',
        width: '100%',
        position: 'relative',
        margin: 0,
        maxWidth: '100%',
        paddingLeft: 0,
        paddingRight: 0,
        overflow: 'hidden'
      }}>
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'repeating-linear-gradient(90deg, rgba(61,139,253,0.06) 0px, rgba(61,139,253,0.06) 1px, transparent 1px, transparent 14px), repeating-linear-gradient(0deg, rgba(95,108,255,0.05) 0px, rgba(95,108,255,0.05) 1px, transparent 1px, transparent 14px)',
          opacity: 0.35
        }}></div>
        <div style={{
          position: 'absolute',
          top: -60,
          left: -60,
          width: 240,
          height: 240,
          background: 'radial-gradient(circle at 30% 30%, rgba(26,115,232,0.28), rgba(26,115,232,0) 65%)',
          filter: 'blur(40px)',
          animation: 'float1 7s ease-in-out infinite alternate'
        }}></div>
        <div style={{
          position: 'absolute',
          top: -40,
          right: -60,
          width: 300,
          height: 300,
          background: 'radial-gradient(circle at 70% 30%, rgba(95,108,255,0.26), rgba(95,108,255,0) 65%)',
          filter: 'blur(46px)',
          animation: 'float2 8s ease-in-out infinite alternate'
        }}></div>
        <style>{`
          @keyframes float1 { from { transform: translateY(0px); } to { transform: translateY(12px); } }
          @keyframes float2 { from { transform: translateY(0px); } to { transform: translateY(-10px); } }
        `}</style>
        <div style={{fontSize: 18, color: '#3d4673', letterSpacing: 2, fontWeight: 600, marginBottom: 2, opacity:0.7, display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <defs>
              <linearGradient id="aiGradH" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#1a73e8"/>
                <stop offset="100%" stopColor="#5f6cff"/>
              </linearGradient>
            </defs>
            <circle cx="12" cy="12" r="9" fill="url(#aiGradH)" opacity="0.15"/>
            <path d="M6 12h12M12 6v12" stroke="url(#aiGradH)" strokeWidth="1.6" strokeLinecap="round"/>
            <circle cx="6" cy="12" r="1.6" fill="#1a73e8"/>
            <circle cx="12" cy="6" r="1.6" fill="#5f6cff"/>
            <circle cx="12" cy="18" r="1.6" fill="#5f6cff"/>
            <circle cx="18" cy="12" r="1.6" fill="#1a73e8"/>
          </svg>
          Ai News
        </div>
        <h1 style={{
          fontSize: 40,
          fontWeight: 900,
          background: 'linear-gradient(90deg, #1a73e8 0%, #5f6cff 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          margin: 0,
          letterSpacing: 0.5,
          lineHeight: 1.2,
        }}>每日新闻</h1>
        <div style={{
          height: 4,
          background: 'linear-gradient(90deg, #3d8bfd66 0%, #5f6cffcc 100%)',
          margin: '18px auto 0 auto',
          maxWidth: 360,
          borderRadius: 4,
          boxShadow: '0 0 12px 2px #3d8bfd44',
          opacity: 0.85
        }}></div>
      </header>
      <FilterBar filters={filters} onChange={setFilters} availableRounds={availableRounds} />
      
      <section style={{
        width: '100%', 
        padding: '0 32px',
        maxWidth: '1400px',
        margin: '0 auto 24px auto',
        position: 'relative'
      }}>
        <div style={{
          background: 'linear-gradient(135deg, rgba(61, 139, 253, 0.05) 0%, rgba(95, 108, 255, 0.08) 100%)',
          borderRadius: '20px',
          border: '1px solid rgba(61, 139, 253, 0.15)',
          padding: '24px',
          boxShadow: '0 8px 32px rgba(61, 139, 253, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
          backdropFilter: 'blur(10px)',
          position: 'relative',
          overflow: 'hidden'
        }}>
          {/* 科技感装饰元素 */}
          <div style={{
            position: 'absolute',
            top: '-2px',
            left: '-2px',
            right: '-2px',
            bottom: '-2px',
            background: 'linear-gradient(45deg, #3d8bfd, #5f6cff, #3d8bfd)',
            borderRadius: '20px',
            zIndex: -1,
            opacity: 0.6,
            animation: 'borderGlow 3s ease-in-out infinite alternate'
          }}></div>
          <style>{`
            @keyframes borderGlow {
              0% { opacity: 0.4; }
              100% { opacity: 0.8; }
            }
          `}</style>
          
          <div style={{display:'flex',alignItems:'center',gap:24,marginBottom:20,flexWrap:'wrap'}}>
            <h3 style={{
              fontWeight: 800, 
              color: '#1a202c', 
              fontSize: 24, 
              margin: 0,
              background: 'linear-gradient(135deg, #2d3748 0%, #4a5568 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              textShadow: '0 2px 4px rgba(0,0,0,0.1)',
              letterSpacing: '0.5px'
            }}>📊 新闻列表</h3>
          <ScoreFilter
            scores={filters.scores}
            onChange={scores => {
              setFilters(f => ({ ...f, scores }));
              setNewsPage(1);
            }}
          />
          <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:8}}>
            <span style={{color:'#666',fontSize:15}}>每页显示</span>
            <select value={newsPageSize} onChange={e => { setNewsPageSize(Number(e.target.value)); setNewsPage(1); }} style={{padding:'2px 8px',borderRadius:4,border:'1px solid #e5e7eb',fontSize:15}}>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span style={{color:'#666',fontSize:15}}>条</span>
          </div>
        </div>
        
        {loading ? <Loading /> : error ? <Error /> : news.length ? (
          <>
            {console.log('分页参数:', { page: newsPage, pageSize: newsPageSize, total: totalNews, totalPages: totalNewsPages, newsLength: news.length })}
            <NewsTable
              data={pagedNews}
              pagination={{ page: newsPage, pageSize: newsPageSize, total: totalNews, totalPages: totalNewsPages }}
              onPageChange={setNewsPage}
              onSort={col => {
                if (col === 'score' || col === 'source' || col === 'sourceapi') {
                  if (newsSortBy === col) {
                    setNewsSortOrder(order => order === 'desc' ? 'asc' : 'desc');
                  } else {
                    setNewsSortBy(col);
                    setNewsSortOrder('desc');
                  }
                }
                setNewsPage(1); // 排序时回到第一页
              }}
              sortBy={newsSortBy}
              order={newsSortOrder}
            />
          </>
        ) : <Empty />}
        </div>
      </section>

      <section style={{marginBottom: 24, width: '100%', padding: 0}}>
        {loading ? <Loading /> : error ? <Error /> : filteredSummaries.length ? (
          filteredSummaries.map(item => (
            <SummaryCard key={item.id} data={item} />
          ))
        ) : <Empty />}
      </section>
    </div>
  );
}
