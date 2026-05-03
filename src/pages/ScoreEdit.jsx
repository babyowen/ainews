import React, { useState, useEffect, useCallback } from 'react';
import dayjs from 'dayjs';
import { fetchScoredNews } from '../api/scoredNews';
import { KEYWORDS } from '../config/keywords';
import PasswordProtection from '../components/PasswordProtection';
import './ScoreEdit.css';

const SCORE_OPTIONS = [5, 4, 3, 2, 1, 0];

const formatFetchDate = (value) => {
  if (!value) return '-';
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD') : '-';
};

const getScoreClass = (score) => {
  if (score === null || score === undefined || score === '') return 'score-badge score-unscored';
  const numScore = Number(score);
  if (Number.isNaN(numScore)) return 'score-badge score-unscored';
  switch (numScore) {
    case 5: return 'score-badge score-5';
    case 4: return 'score-badge score-4';
    case 3: return 'score-badge score-3';
    case 2: return 'score-badge score-2';
    case 1: return 'score-badge score-1';
    case 0: return 'score-badge score-0';
    default: return 'score-badge score-unscored';
  }
};

const ScoreEdit = () => {
  const keywords = KEYWORDS;

  const [filters, setFilters] = useState({
    keyword: '江苏省国资委',
    date: dayjs().subtract(1, 'day').format('YYYY-MM-DD'),
    scores: [5, 4, 3]
  });

  const [newsData, setNewsData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState({});
  const [error, setError] = useState('');
  const [tempScores, setTempScores] = useState({});

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleScoreCheckboxChange = (score) => {
    setFilters(prev => {
      const exists = prev.scores.includes(score);
      const nextScores = exists
        ? prev.scores.filter(s => s !== score)
        : [...prev.scores, score];
      return { ...prev, scores: nextScores };
    });
  };

  const fetchNewsData = useCallback(async () => {
    if (!filters.keyword || !filters.date) {
      setNewsData([]);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await fetchScoredNews({
        keyword: filters.keyword,
        date: filters.date,
        scores: filters.scores,
        page: 1,
        pageSize: 1000,
        sortBy: 'id',
        order: 'asc'
      });
      const newsRows = result.rows || result;
      setNewsData(Array.isArray(newsRows) ? newsRows : []);
    } catch (err) {
      console.error('获取新闻数据失败:', err);
      setError('获取数据失败，请检查网络或联系管理员。');
      setNewsData([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchNewsData();
  }, [fetchNewsData]);

  const handleScoreUpdate = async (newsId, newScore) => {
    if (newScore === undefined || newScore === null || newScore === '') {
      alert('请选择评分');
      return;
    }

    setUpdating(prev => ({ ...prev, [newsId]: true }));

    try {
      const response = await fetch('/api/update-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newsId, score: newScore })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '修改失败');
      }

      await response.json();

      setNewsData(prev =>
        prev.map(news =>
          news.id === newsId ? { ...news, score: newScore } : news
        )
      );

      setTempScores(prev => {
        const next = { ...prev };
        delete next[newsId];
        return next;
      });

      alert('评分修改成功！');
    } catch (err) {
      console.error('修改评分失败:', err);
      alert(`修改失败：${err.message}`);
    } finally {
      setUpdating(prev => ({ ...prev, [newsId]: false }));
    }
  };

  const renderScoreSelector = (news) => {
    const currentTempScore = tempScores[news.id];
    const displayScore = currentTempScore !== undefined ? currentTempScore : news.score;
    const disableSubmit =
      updating[news.id] ||
      currentTempScore === undefined ||
      String(currentTempScore) === String(news.score);

    return (
      <div className="score-selector">
        <span className="score-select-hint">改分</span>
        <select
          value={displayScore ?? ''}
          onChange={(e) => {
            const newScore = e.target.value;
            setTempScores(prev => ({ ...prev, [news.id]: newScore }));
          }}
          className="score-select"
          disabled={updating[news.id]}
        >
          <option value="">选择</option>
          {SCORE_OPTIONS.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => handleScoreUpdate(news.id, currentTempScore)}
          disabled={disableSubmit}
          className="modify-btn"
        >
          {updating[news.id] ? '保存中…' : '保存'}
        </button>
      </div>
    );
  };

  const filteredNewsData = filters.scores.length > 0
    ? newsData.filter(news => filters.scores.includes(Number(news.score)))
    : newsData;

  return (
    <PasswordProtection>
      <div className="score-edit-page kd-page">
        <header className="kd-page-header score-edit-header">
          <div>
            <p className="kd-page-kicker">SCORE EDIT</p>
            <h1 className="kd-page-title">修改评分</h1>
            <p className="kd-page-subtitle">按关键词与日期筛选已抓取新闻，校准 AI 评分结果。</p>
          </div>
          <div className="score-edit-stats">
            <span>{filters.keyword || '未选关键词'}</span>
            <span>{filters.date || '未选日期'}</span>
            <span>{filteredNewsData.length} 条记录</span>
          </div>
        </header>

        <section className="score-edit-control kd-panel" aria-label="评分筛选条件">
          <div className="score-filter-grid">
            <div className="filter-group filter-group-keyword">
              <label className="filter-item">
                <span>关键词</span>
                <select
                  value={filters.keyword}
                  onChange={(e) => handleFilterChange('keyword', e.target.value)}
                  className="keyword-select"
                >
                  <option value="">请选择关键词</option>
                  {keywords.map(keyword => (
                    <option key={keyword} value={keyword}>{keyword}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="filter-group filter-group-date">
              <label className="filter-item">
                <span>日期</span>
                <input
                  type="date"
                  value={filters.date}
                  onChange={(e) => handleFilterChange('date', e.target.value)}
                  className="date-input"
                  max={dayjs().format('YYYY-MM-DD')}
                />
              </label>
            </div>

            <div className="filter-group filter-group-scores">
              <div className="filter-item filter-item-scores">
                <span>分数筛选</span>
                <div className="score-chip-group" role="group" aria-label="按分数筛选">
                  {SCORE_OPTIONS.map(score => {
                    const active = filters.scores.includes(score);
                    return (
                      <button
                        key={score}
                        type="button"
                        className={`score-chip ${active ? 'active' : ''}`}
                        onClick={() => handleScoreCheckboxChange(score)}
                        aria-pressed={active}
                      >
                        {score}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="filter-group filter-group-action">
              <button
                type="button"
                onClick={fetchNewsData}
                disabled={loading}
                className="confirm-btn"
              >
                {loading ? '查询中…' : '查询'}
              </button>
            </div>
          </div>
        </section>

        <section className="score-edit-results">
          {loading ? (
            <div className="kd-state-card loading">
              <span className="spinner"></span>
              <span>加载中…</span>
            </div>
          ) : error ? (
            <div className="kd-state-card error-state">
              <p>{error}</p>
              <button type="button" onClick={fetchNewsData} className="retry-btn">
                重试
              </button>
            </div>
          ) : filteredNewsData.length === 0 ? (
            <div className="kd-state-card no-data">
              {filters.keyword && filters.date
                ? '暂无符合条件的新闻'
                : '请选择关键词和日期后查询'}
            </div>
          ) : (
            <div className="news-list">
              {filteredNewsData.map((news) => (
                <article key={news.id} className="news-item">
                  <header className="news-item-header">
                    <div className="news-item-headline">
                      <span className={getScoreClass(news.score)}>
                        {news.score !== null && news.score !== undefined && news.score !== ''
                          ? `${news.score}分`
                          : '未评分'}
                      </span>
                      <h3 className="news-title">
                        {news.link ? (
                          <a href={news.link} target="_blank" rel="noopener noreferrer">
                            {news.title}
                          </a>
                        ) : (
                          news.title
                        )}
                      </h3>
                    </div>
                    {renderScoreSelector(news)}
                  </header>

                  <div className="news-meta">
                    <span className="meta-tag">主关键词 · {news.keyword || '-'}</span>
                    <span className="meta-tag">搜索词 · {news.search_keyword || '-'}</span>
                    <span className="meta-tag">抓取于 {formatFetchDate(news.fetchdate)}</span>
                  </div>

                  <div className="news-content">
                    <div className="news-content-label">新闻正文</div>
                    <div className="news-content-body">
                      {(news.content || '暂无正文内容')
                        .split(/\r?\n/)
                        .filter(paragraph => paragraph.trim() !== '')
                        .map((paragraph, idx) => (
                          <p key={idx} className="news-paragraph">{paragraph}</p>
                        ))}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </PasswordProtection>
  );
};

export default ScoreEdit;
