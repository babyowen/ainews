import React, { useState, useEffect, useCallback } from 'react';
import dayjs from 'dayjs';
import { fetchScoredNews } from '../api/scoredNews';
import { KEYWORDS } from '../config/keywords';
import PasswordProtection from '../components/PasswordProtection';
import './ScoreEdit.css';

const ScoreEdit = () => {
  // 固定的关键词列表（集中配置）
  const keywords = KEYWORDS;
  const scoreOptions = [5, 4, 3, 2, 1, 0];

  // 筛选条件状态
  const [filters, setFilters] = useState({
    keyword: '江苏省国资委', // 默认关键词
    date: dayjs().subtract(1, 'day').format('YYYY-MM-DD'),
    scores: [5, 4, 3] // 默认勾选分数
  });

  // UI状态
  const [newsData, setNewsData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState({});
  const [error, setError] = useState('');
  const [tempScores, setTempScores] = useState({});

  // 处理筛选条件变化
  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleScoreCheckboxChange = (score) => {
    const currentScores = filters.scores;
    const newScores = currentScores.includes(score)
      ? currentScores.filter(s => s !== score)
      : [...currentScores, score];
    handleFilterChange('scores', newScores);
  };

  // 获取新闻数据
  const fetchNewsData = useCallback(async () => {
    if (!filters.keyword || !filters.date) {
      setNewsData([]);
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      // 调试输出fetchScoredNews请求参数
      console.log('fetchScoredNews 请求参数:', {
        keyword: filters.keyword,
        date: filters.date,
        scores: filters.scores,
        page: 1,
        pageSize: 1000,
        sortBy: 'id',
        order: 'asc'
      });
      
      const result = await fetchScoredNews({
        keyword: filters.keyword,
        date: filters.date,
        scores: filters.scores, // 传递分数数组
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

  // 当筛选条件改变时获取数据
  useEffect(() => {
    fetchNewsData();
  }, [fetchNewsData]);

  // 修改评分
  const handleScoreUpdate = async (newsId, newScore) => {
    if (!newScore || newScore === '') {
      alert('请选择评分');
      return;
    }
    
    setUpdating(prev => ({ ...prev, [newsId]: true }));
    
    try {
      console.log('更新评分:', { newsId, newScore });
      
      const response = await fetch('/api/update-score', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          newsId: newsId,
          score: newScore
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '修改失败');
      }
      
      const result = await response.json();
      console.log('更新结果:', result);
      
      // 更新本地数据
      setNewsData(prev => 
        prev.map(news => 
          news.id === newsId ? { ...news, score: newScore } : news
        )
      );
      
      // 清除临时评分
      setTempScores(prev => {
        const newTemp = { ...prev };
        delete newTemp[newsId];
        return newTemp;
      });
      
      // 显示成功消息
      alert('评分修改成功！');
      
    } catch (error) {
      console.error('修改评分失败:', error);
      alert(`修改失败：${error.message}`);
    } finally {
      setUpdating(prev => ({ ...prev, [newsId]: false }));
    }
  };

  // 获取评分显示样式 - 6档颜色设定
  const getScoreStyle = (score) => {
    if (!score && score !== 0) return 'score-badge unscored';
    const numScore = parseInt(score);
    switch (numScore) {
      case 5: return 'score-badge score-5';
      case 4: return 'score-badge score-4';
      case 3: return 'score-badge score-3';
      case 2: return 'score-badge score-2';
      case 1: return 'score-badge score-1';
      case 0: return 'score-badge score-0';
      default: return 'score-badge unscored';
    }
  };

  // 渲染评分选择器
  const renderScoreSelector = (news) => {
    const currentTempScore = tempScores[news.id];
    const displayScore = currentTempScore !== undefined ? currentTempScore : news.score;
    
    return (
      <div className="score-selector">
        <span className="score-select-hint">如想改分请选择:</span>
        <select 
          value={displayScore || ''} 
          onChange={(e) => {
            const newScore = e.target.value;
            setTempScores(prev => ({ ...prev, [news.id]: newScore }));
          }}
          className="score-select"
          disabled={updating[news.id]}
        >
          <option value="">选择评分</option>
          <option value="5">5</option>
          <option value="4">4</option>
          <option value="3">3</option>
          <option value="2">2</option>
          <option value="1">1</option>
          <option value="0">0</option>
        </select>
        <button 
          onClick={() => handleScoreUpdate(news.id, currentTempScore)}
          disabled={updating[news.id] || currentTempScore === undefined || currentTempScore === news.score}
          className="modify-btn"
        >
          {updating[news.id] ? '修改中...' : '修改'}
        </button>
      </div>
    );
  };

  // 渲染前进行分数过滤
  const filteredNewsData = filters.scores.length > 0
    ? newsData.filter(news => filters.scores.includes(Number(news.score)))
    : newsData;

  return (
    <PasswordProtection>
      <div className="score-edit-page">
        <div className="page-header">
          <h1>✏️ 修改评分</h1>
          <p>选择关键词和日期，修改新闻的AI评分</p>
        </div>

        <div className="filters-container">
          <div className="main-filters">
            <div className="filter-group">
              <label>关键词:</label>
              <select 
                value={filters.keyword} 
                onChange={(e) => handleFilterChange('keyword', e.target.value)}
                className="filter-select"
              >
                <option value="">请选择关键词</option>
                {keywords.map(keyword => (
                  <option key={keyword} value={keyword}>{keyword}</option>
                ))}
              </select>
            </div>
            <div className="filter-group">
              <label>日期:</label>
              <div className="date-input-wrapper">
                <input
                  type="date"
                  value={filters.date}
                  onChange={(e) => handleFilterChange('date', e.target.value)}
                  className="filter-input date-input"
                  max={dayjs().format('YYYY-MM-DD')}
                />
                <span className="calendar-icon" role="img" aria-label="calendar">📅</span>
              </div>
            </div>
          </div>

          <div className="score-filters">
            <label className="score-filter-label">按分数筛选:</label>
            <div className="checkbox-group">
              {scoreOptions.map(score => (
                <div key={score} className="checkbox-wrapper">
                  <input
                    type="checkbox"
                    id={`score-${score}`}
                    checked={filters.scores.includes(score)}
                    onChange={() => handleScoreCheckboxChange(score)}
                  />
                  <label htmlFor={`score-${score}`}>{score}分</label>
                </div>
              ))}
            </div>
          </div>

          <button onClick={fetchNewsData} disabled={loading} className="confirm-btn">
            {loading ? '查询中...' : '确定'}
          </button>
          <span className="news-count-inline">
            <span role="img" aria-label="news">📄</span>
            共找到 {filteredNewsData.length} 条新闻
          </span>
        </div>

        <div className="news-container">
          {loading ? (
            <div className="loading">
              <span className="spinner"></span>
              <span>加载中...</span>
            </div>
          ) : error ? (
            <div className="error-message">
              <p>{error}</p>
              <button onClick={fetchNewsData} className="retry-btn">
                重试
              </button>
            </div>
          ) : filteredNewsData.length === 0 ? (
            <div className="no-data">
              {filters.keyword && filters.date 
                ? '暂无数据，请选择其他条件' 
                : '请选择关键词和日期'}
            </div>
          ) : (
            <>
              {filteredNewsData.map((news) => (
                <div key={news.id} className="news-item">
                  <div className="news-header">
                    <div className="score-and-title">
                      <span className={getScoreStyle(news.score)}>
                        {news.score !== null && news.score !== undefined ? `${news.score}分` : '未评分'}
                      </span>
                      <h3 className="news-title">
                        <span className="news-title-icon" role="img" aria-label="news">📰</span>
                        <a href={news.link} target="_blank" rel="noopener noreferrer">
                          {news.title}
                        </a>
                      </h3>
                    </div>
                    <div className="action-area">
                      {renderScoreSelector(news)}
                    </div>
                  </div>

                  <div className="news-body">
                    <div className="fetch-date-line">
                      抓取日期: {news.fetchdate ? dayjs(news.fetchdate).format('YYYY-MM-DD') : '-'} | 主关键词: {news.keyword || '-'} | 搜索关键词: {news.search_keyword || '-'}
                    </div>
                    <div className="content-label">新闻正文:</div>
                    <div className="news-content-text">
                      {(news.content || '暂无正文内容')
                        .split(/\r?\n/)
                        .filter(paragraph => paragraph.trim() !== '')
                        .map((paragraph, idx) => (
                          <p key={idx} className="news-paragraph">{paragraph}</p>
                        ))}
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </PasswordProtection>
  );
};

export default ScoreEdit;