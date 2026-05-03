import { useState, useEffect } from 'react';
import { Database, ListFilter, Newspaper } from 'lucide-react';
import FilterBar, { ScoreFilter } from '../components/FilterBar';
import NewsTable from '../components/NewsTable';
import { fetchScoredNews } from '../api/scoredNews';
import { Loading, Error, Empty } from '../components/Status';
import dayjs from 'dayjs';
import './SummaryNews.css';

export default function SummaryNewsPage() {
  const [filters, setFilters] = useState({
    keyword: '',
    date: dayjs().subtract(1, 'day').format('YYYY-MM-DD'),
    rounds: [],
    scores: [3, 4, 5]
  });
  const [news, setNews] = useState([]);
  const [newsTotal, setNewsTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [newsPage, setNewsPage] = useState(1);
  const [newsPageSize, setNewsPageSize] = useState(50);
  const [newsSortBy, setNewsSortBy] = useState('score');
  const [newsSortOrder, setNewsSortOrder] = useState('desc');

  const hasUnscored = filters.scores && filters.scores.includes('unscored');
  const numericScores = filters.scores ? filters.scores.filter(s => typeof s === 'number') : [];
  const minScore = numericScores.length ? Math.min(...numericScores) : undefined;
  const maxScore = numericScores.length ? Math.max(...numericScores) : undefined;

  useEffect(() => {
    setLoading(true);
    setError(false);

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
    }).then((newsData) => {
      const newsRows = newsData.rows || newsData;
      const filteredNewsRows = Array.isArray(newsRows)
        ? newsRows.filter(item => item.content && item.content.trim() !== '')
        : [];

      setNews(filteredNewsRows);
      setNewsTotal(newsData.total || filteredNewsRows.length);
      setLoading(false);
    }).catch(() => {
      setError(true);
      setLoading(false);
    });
  }, [filters.keyword, filters.date, minScore, maxScore, hasUnscored, newsPage, newsPageSize, newsSortBy, newsSortOrder]);

  const totalNewsPages = Math.ceil(newsTotal / newsPageSize);

  return (
    <div className="summary-page kd-page">
      <header className="kd-page-header">
        <div>
          <p className="kd-page-kicker">DAILY NEWS</p>
          <h1 className="kd-page-title">每日新闻</h1>
          <p className="kd-page-subtitle">按关键词、日期和 AI 评分查看抓取新闻列表。</p>
        </div>
        <div className="summary-header-metrics" aria-label="页面概览">
          <span><Newspaper size={16} /> 当前列表 {news.length} 条</span>
          <span><Database size={16} /> 总计 {newsTotal} 条</span>
        </div>
      </header>

      <section className="summary-filter-panel kd-panel">
        <FilterBar filters={filters} onChange={(next) => { setFilters(next); setNewsPage(1); }} />
      </section>

      <section className="summary-news-panel kd-panel">
        <div className="kd-panel-header summary-news-toolbar">
          <div>
            <h2 className="kd-panel-title"><ListFilter size={18} /> 新闻列表</h2>
          </div>
          <div className="summary-toolbar-controls">
            <ScoreFilter
              scores={filters.scores}
              onChange={scores => {
                setFilters(f => ({ ...f, scores }));
                setNewsPage(1);
              }}
            />
            <label className="summary-page-size">
              每页
              <select value={newsPageSize} onChange={e => { setNewsPageSize(Number(e.target.value)); setNewsPage(1); }}>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              条
            </label>
          </div>
        </div>

        {loading ? <Loading /> : error ? <Error /> : news.length ? (
          <NewsTable
            data={news}
            pagination={{ page: newsPage, pageSize: newsPageSize, total: newsTotal, totalPages: totalNewsPages }}
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
              setNewsPage(1);
            }}
            sortBy={newsSortBy}
            order={newsSortOrder}
          />
        ) : <Empty text="当前筛选条件下没有新闻" />}
      </section>
    </div>
  );
}
