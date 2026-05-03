import { useState, useEffect } from 'react';
import './WordCountStats.css';
import { KEYWORDS, KEYWORD_COLORS } from '../config/keywords';

export default function WordCountStats() {
  const [statsData, setStatsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [days, setDays] = useState(30);

  useEffect(() => {
    fetchWordCountStats();
  }, [days]);

  const fetchWordCountStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/word-count-stats?days=${days}`);
      if (!response.ok) {
        throw new Error('获取数据失败');
      }
      const data = await response.json();
      setStatsData(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const groupDataByDate = () => {
    const grouped = {};
    statsData.forEach(item => {
      if (!grouped[item.fetchdate]) {
        grouped[item.fetchdate] = {};
      }
      grouped[item.fetchdate][item.keyword] = item;
    });
    return grouped;
  };

  const getWeeksData = () => {
    const groupedData = groupDataByDate();
    const dates = Object.keys(groupedData).sort((a, b) => new Date(b) - new Date(a));

    if (dates.length === 0) return [];

    const weeks = [];
    let currentWeek = [];

    dates.forEach(date => {
      const dateObj = new Date(date);
      const dayOfWeek = dateObj.getDay();

      if (currentWeek.length === 0) {
        currentWeek = new Array(7).fill(null);
        currentWeek[dayOfWeek] = { date, data: groupedData[date] };
      } else {
        const firstDate = new Date(currentWeek.find(d => d)?.date);
        const weekStart = new Date(firstDate);
        weekStart.setDate(firstDate.getDate() - firstDate.getDay());

        const currentWeekStart = new Date(dateObj);
        currentWeekStart.setDate(dateObj.getDate() - dayOfWeek);

        if (weekStart.getTime() === currentWeekStart.getTime()) {
          currentWeek[dayOfWeek] = { date, data: groupedData[date] };
        } else {
          weeks.push([...currentWeek]);
          currentWeek = new Array(7).fill(null);
          currentWeek[dayOfWeek] = { date, data: groupedData[date] };
        }
      }
    });

    if (currentWeek.some(d => d)) {
      weeks.push(currentWeek);
    }

    return weeks;
  };

  const calculateWeekStats = (week) => {
    const stats = {
      totalNews: 0,
      totalWords: 0,
      highScoreNews: 0,
      highScoreWords: 0,
      veryHighScoreNews: 0,
      veryHighScoreWords: 0,
      keywordStats: {}
    };

    KEYWORDS.forEach(keyword => {
      stats.keywordStats[keyword] = {
        newsCount: 0,
        totalWords: 0,
        highScoreCount: 0,
        highScoreWords: 0,
        veryHighScoreCount: 0,
        veryHighScoreWords: 0
      };
    });

    week.forEach(day => {
      if (day && day.data) {
        Object.values(day.data).forEach(item => {
          stats.totalNews += Number(item.newsCount) || 0;
          stats.totalWords += Number(item.totalWords) || 0;
          stats.highScoreNews += Number(item.highScoreCount) || 0;
          stats.highScoreWords += Number(item.highScoreWords) || 0;
          stats.veryHighScoreNews += Number(item.veryHighScoreCount) || 0;
          stats.veryHighScoreWords += Number(item.veryHighScoreWords) || 0;

          if (stats.keywordStats[item.keyword]) {
            stats.keywordStats[item.keyword].newsCount += Number(item.newsCount) || 0;
            stats.keywordStats[item.keyword].totalWords += Number(item.totalWords) || 0;
            stats.keywordStats[item.keyword].highScoreCount += Number(item.highScoreCount) || 0;
            stats.keywordStats[item.keyword].highScoreWords += Number(item.highScoreWords) || 0;
            stats.keywordStats[item.keyword].veryHighScoreCount += Number(item.veryHighScoreCount) || 0;
            stats.keywordStats[item.keyword].veryHighScoreWords += Number(item.veryHighScoreWords) || 0;
          }
        });
      }
    });

    return stats;
  };

  const formatNumber = (num) => {
    if (num === null || num === undefined || isNaN(num)) return '0';
    return Number(num).toLocaleString();
  };

  const formatWordCount = (num) => {
    if (num === null || num === undefined || isNaN(num)) return '0万字';
    return (Number(num) / 10000).toFixed(2) + '万字';
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  const sumDayKey = (day, key) =>
    KEYWORDS.reduce((sum, keyword) => {
      const data = day?.data?.[keyword];
      return sum + (data ? Number(data[key]) || 0 : 0);
    }, 0);

  const renderHeader = () => (
    <header className="kd-page-header word-count-header">
      <div className="word-count-header-text">
        <p className="kd-page-kicker">WORD COUNT</p>
        <h1 className="kd-page-title">字数统计</h1>
        <p className="kd-page-subtitle">按周历视图汇总各关键词每日新闻条数与字数。</p>
      </div>
      <div className="word-count-stats-meta">
        <label className="word-count-range">
          <span>显示天数</span>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={7}>最近 7 天</option>
            <option value={14}>最近 14 天</option>
            <option value={30}>最近 30 天</option>
            <option value={60}>最近 60 天</option>
            <option value={90}>最近 90 天</option>
          </select>
        </label>
        <span className="data-info">共 {statsData.length} 条记录</span>
      </div>
    </header>
  );

  if (loading) {
    return (
      <div className="word-count-stats kd-page">
        {renderHeader()}
        <div className="kd-state-card loading">
          <span className="spinner"></span>
          <span>加载中…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="word-count-stats kd-page">
        {renderHeader()}
        <div className="kd-state-card error-state">
          <p>错误：{error}</p>
          <button type="button" onClick={fetchWordCountStats} className="retry-btn">
            重试
          </button>
        </div>
      </div>
    );
  }

  const weeksData = getWeeksData();
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

  return (
    <div className="word-count-stats kd-page">
      {renderHeader()}

      <section className="word-count-legend kd-panel" aria-label="图例说明">
        <header className="word-count-legend-header">
          <h3>图例说明</h3>
        </header>
        <div className="legend-content">
          <div className="legend-section">
            <h4>关键词</h4>
            <div className="legend-items">
              {KEYWORDS.map(keyword => (
                <div key={keyword} className="legend-item">
                  <span
                    className="legend-color"
                    style={{ backgroundColor: KEYWORD_COLORS[keyword] }}
                  ></span>
                  <span>{keyword}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="legend-section">
            <h4>分数标签</h4>
            <div className="legend-items">
              <div className="legend-item">
                <span className="wcs-score-pill score-3">3+</span>
                <span>3 分及以上</span>
              </div>
              <div className="legend-item">
                <span className="wcs-score-pill score-4">4+</span>
                <span>4 分及以上</span>
              </div>
            </div>
          </div>
          <div className="legend-section">
            <h4>来源类型</h4>
            <div className="legend-items">
              <div className="legend-item">
                <span className="src-tag src-tag-custom">官</span>
                <span>官网抓取</span>
              </div>
              <div className="legend-item">
                <span className="src-tag src-tag-wechat">微</span>
                <span>微信公众号</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="calendar-container kd-panel">
        {weeksData.map((week, weekIndex) => {
          const weekStats = calculateWeekStats(week);

          return (
            <div key={weekIndex} className="week-container">
              <div className="week-header">
                {weekDays.map(day => (
                  <div key={day} className="day-header">{day}</div>
                ))}
                <div className="week-summary-header">周合计</div>
              </div>

              <div className="week-row">
                {week.map((day, dayIndex) => (
                  <div key={dayIndex} className="day-cell">
                    {day ? (
                      <>
                        <div className="date">{formatDate(day.date)}</div>
                        <div className="day-stats">
                          {KEYWORDS.map(keyword => {
                            const keywordData = day.data[keyword];
                            if (!keywordData) return null;

                            const sourceKeys = Array.from(new Set([
                              ...Object.keys(keywordData.customGrabDetails || {}),
                              ...Object.keys(keywordData.wechatDetails || {})
                            ])).filter(sk => {
                              const c = Number((keywordData.customGrabDetails || {})[sk]) || 0;
                              const w = Number((keywordData.wechatDetails || {})[sk]) || 0;
                              return c > 0 || w > 0;
                            });

                            return (
                              <div key={keyword} className="keyword-stats">
                                <div
                                  className="keyword-label"
                                  style={{ color: KEYWORD_COLORS[keyword] }}
                                >
                                  {keyword}
                                </div>
                                <div className="stats-line">
                                  {formatNumber(keywordData.newsCount)}条 · {formatWordCount(keywordData.totalWords)}
                                </div>
                                <div className="stats-line stats-line-score">
                                  <span className="wcs-score-pill score-3">3+</span>
                                  {formatNumber(keywordData.highScoreCount)}条 · {formatWordCount(keywordData.highScoreWords)}
                                </div>
                                <div className="stats-line stats-line-score">
                                  <span className="wcs-score-pill score-4">4+</span>
                                  {formatNumber(keywordData.veryHighScoreCount)}条 · {formatWordCount(keywordData.veryHighScoreWords)}
                                </div>
                                {keyword === '江苏省国资委' && sourceKeys.length > 0 && (
                                  <div className="source-details">
                                    {sourceKeys.map(sk => {
                                      const customCount = Number((keywordData.customGrabDetails || {})[sk]) || 0;
                                      const wechatCount = Number((keywordData.wechatDetails || {})[sk]) || 0;
                                      return (
                                        <div key={sk} className="source-line">
                                          <span className="source-name">{sk || '未知'}</span>
                                          {customCount > 0 && (
                                            <span className="src-tag src-tag-custom">官 {formatNumber(customCount)}</span>
                                          )}
                                          {wechatCount > 0 && (
                                            <span className="src-tag src-tag-wechat">微 {formatNumber(wechatCount)}</span>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        <div className="day-total">
                          <div className="day-total-title">日合计</div>
                          <div className="day-total-stats">
                            <div className="total-line">
                              <span className="total-key">总条数</span>
                              <span className="total-val">{formatNumber(sumDayKey(day, 'newsCount'))}</span>
                            </div>
                            <div className="total-line">
                              <span className="total-key">总字数</span>
                              <span className="total-val">{formatWordCount(sumDayKey(day, 'totalWords'))}</span>
                            </div>
                            <div className="total-line total-line-score">
                              <span className="wcs-score-pill score-3">3+</span>
                              {formatNumber(sumDayKey(day, 'highScoreCount'))}条 · {formatWordCount(sumDayKey(day, 'highScoreWords'))}
                            </div>
                            <div className="total-line total-line-score">
                              <span className="wcs-score-pill score-4">4+</span>
                              {formatNumber(sumDayKey(day, 'veryHighScoreCount'))}条 · {formatWordCount(sumDayKey(day, 'veryHighScoreWords'))}
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="empty-day"></div>
                    )}
                  </div>
                ))}

                <div className="week-summary">
                  <div className="summary-title">本周合计</div>
                  <div className="summary-stats">
                    <div className="summary-line">
                      <span className="summary-key">总条数</span>
                      <span className="summary-val">{formatNumber(weekStats.totalNews)}</span>
                    </div>
                    <div className="summary-line">
                      <span className="summary-key">总字数</span>
                      <span className="summary-val">{formatWordCount(weekStats.totalWords)}</span>
                    </div>
                    <div className="summary-line summary-line-score">
                      <span className="wcs-score-pill score-3">3+</span>
                      {formatNumber(weekStats.highScoreNews)}条 · {formatWordCount(weekStats.highScoreWords)}
                    </div>
                    <div className="summary-line summary-line-score">
                      <span className="wcs-score-pill score-4">4+</span>
                      {formatNumber(weekStats.veryHighScoreNews)}条 · {formatWordCount(weekStats.veryHighScoreWords)}
                    </div>

                    <div className="keyword-summary">
                      {KEYWORDS.map(keyword => {
                        const stats = weekStats.keywordStats[keyword];
                        if (stats.newsCount === 0) return null;

                        return (
                          <div key={keyword} className="keyword-summary-card">
                            <div className="keyword-header">
                              <span
                                style={{ color: KEYWORD_COLORS[keyword] }}
                                className="keyword-name"
                              >
                                {keyword}
                              </span>
                            </div>
                            <div className="keyword-stats-grid">
                              <div className="stats-row total-stats">
                                <span className="stats-value">
                                  {formatNumber(stats.newsCount)}条 · {formatWordCount(stats.totalWords)}
                                </span>
                              </div>
                              <div className="stats-row high-score-stats">
                                <span className="wcs-score-pill score-3">3+</span>
                                <span className="stats-value">
                                  {formatNumber(stats.highScoreCount)}条 · {formatWordCount(stats.highScoreWords)}
                                </span>
                              </div>
                              <div className="stats-row high-score-stats">
                                <span className="wcs-score-pill score-4">4+</span>
                                <span className="stats-value">
                                  {formatNumber(stats.veryHighScoreCount)}条 · {formatWordCount(stats.veryHighScoreWords)}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
