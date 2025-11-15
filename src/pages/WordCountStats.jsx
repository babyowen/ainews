import { useState, useEffect } from 'react';
import './WordCountStats.css';
import { KEYWORDS, KEYWORD_COLORS } from '../config/keywords';

// 关键词与颜色集中配置

export default function WordCountStats() {
  const [statsData, setStatsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [days, setDays] = useState(30); // 默认显示最近30天

  useEffect(() => {
    fetchWordCountStats();
  }, [days]);

  const fetchWordCountStats = async () => {
    try {
      setLoading(true);
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

  // 按日期分组数据
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

  // 获取日期范围并按周分组
  const getWeeksData = () => {
    const groupedData = groupDataByDate();
    const dates = Object.keys(groupedData).sort((a, b) => new Date(b) - new Date(a));
    
    if (dates.length === 0) return [];

    const weeks = [];
    let currentWeek = [];
    
    dates.forEach(date => {
      const dateObj = new Date(date);
      const dayOfWeek = dateObj.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
      
      if (currentWeek.length === 0) {
        // 开始新的一周
        currentWeek = new Array(7).fill(null);
        currentWeek[dayOfWeek] = { date, data: groupedData[date] };
      } else {
        // 检查是否属于同一周
        const firstDate = new Date(currentWeek.find(d => d)?.date);
        const weekStart = new Date(firstDate);
        weekStart.setDate(firstDate.getDate() - firstDate.getDay());
        
        const currentWeekStart = new Date(dateObj);
        currentWeekStart.setDate(dateObj.getDate() - dayOfWeek);
        
        if (weekStart.getTime() === currentWeekStart.getTime()) {
          // 同一周
          currentWeek[dayOfWeek] = { date, data: groupedData[date] };
        } else {
          // 新的一周
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

  // 计算周统计
  const calculateWeekStats = (week) => {
    const stats = {
      totalNews: 0,
      totalWords: 0,
      highScoreNews: 0,
      highScoreWords: 0,
      keywordStats: {}
    };

    KEYWORDS.forEach(keyword => {
      stats.keywordStats[keyword] = {
        newsCount: 0,
        totalWords: 0,
        highScoreCount: 0,
        highScoreWords: 0
      };
    });

    week.forEach(day => {
      if (day && day.data) {
        Object.values(day.data).forEach(item => {
          stats.totalNews += Number(item.newsCount) || 0;
          stats.totalWords += Number(item.totalWords) || 0;
          stats.highScoreNews += Number(item.highScoreCount) || 0;
          stats.highScoreWords += Number(item.highScoreWords) || 0;
          
          if (stats.keywordStats[item.keyword]) {
            stats.keywordStats[item.keyword].newsCount += Number(item.newsCount) || 0;
            stats.keywordStats[item.keyword].totalWords += Number(item.totalWords) || 0;
            stats.keywordStats[item.keyword].highScoreCount += Number(item.highScoreCount) || 0;
            stats.keywordStats[item.keyword].highScoreWords += Number(item.highScoreWords) || 0;
          }
        });
      }
    });

    return stats;
  };

  const formatNumber = (num) => {
    if (num === null || num === undefined || isNaN(num)) {
      return '0';
    }
    return Number(num).toLocaleString();
  };

  const formatWordCount = (num) => {
    if (num === null || num === undefined || isNaN(num)) {
      return '0万字';
    }
    const wordCount = Number(num) / 10000;
    return wordCount.toFixed(2) + '万字';
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  if (loading) {
    return <div className="loading">加载中...</div>;
  }

  if (error) {
    return <div className="error">错误: {error}</div>;
  }

  const weeksData = getWeeksData();
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

  return (
    <div className="word-count-stats">
      <div className="page-header">
        <h1>📊 字数统计</h1>
        <p>按日历形式展示新闻条数和字数统计</p>
        
        <div className="date-range-selector">
          <label>显示天数：</label>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={7}>最近7天</option>
            <option value={14}>最近14天</option>
            <option value={30}>最近30天</option>
            <option value={60}>最近60天</option>
            <option value={90}>最近90天</option>
          </select>
          <span className="data-info">共 {statsData.length} 条记录</span>
        </div>
      </div>

      <div className="legend">
        <div className="legend-container">
          <h3>图例说明</h3>
          
          <div className="legend-content">
            <div className="legend-section">
              <h4>关键词颜色</h4>
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
              <h4>数据类型</h4>
              <div className="legend-items">
                <div className="legend-item">
                  <span className="legend-icon">📰</span>
                  <span>新闻条数</span>
                </div>
                <div className="legend-item">
                  <span className="legend-icon">📝</span>
                  <span>字数统计</span>
                </div>
                <div className="legend-item">
                  <span className="legend-icon" style={{ color: '#8e44ad' }}>⭐</span>
                  <span style={{ color: '#8e44ad' }}>3分以上新闻</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="calendar-container">
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
                            
                            return (
                              <div key={keyword} className="keyword-stats">
                                <div 
                                  className="keyword-label"
                                  style={{ color: KEYWORD_COLORS[keyword] }}
                                >
                                  {keyword}
                                </div>
                                <div className="stats-line">
                                  📰 {formatNumber(keywordData.newsCount)}条 
                                  📝 {formatWordCount(keywordData.totalWords)}
                                </div>
                                <div className="stats-line high-score">
                                  ⭐ {formatNumber(keywordData.highScoreCount)}条 
                                  📝 {formatWordCount(keywordData.highScoreWords)}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        
                        {/* 日合计 */}
                        <div className="day-total">
                          <div className="day-total-title">日合计</div>
                          <div className="day-total-stats">
                            <div className="total-line">
                              📊 总计: {formatNumber(KEYWORDS.reduce((sum, keyword) => {
                                const data = day.data[keyword];
                                return sum + (data ? (Number(data.newsCount) || 0) : 0);
                              }, 0))}条
                            </div>
                            <div className="total-line">
                              📈 总字数: {formatWordCount(KEYWORDS.reduce((sum, keyword) => {
                                const data = day.data[keyword];
                                return sum + (data ? (Number(data.totalWords) || 0) : 0);
                              }, 0))}
                            </div>
                            <div className="total-line high-score-total">
                              ⭐ 3分以上: {formatNumber(KEYWORDS.reduce((sum, keyword) => {
                                const data = day.data[keyword];
                                return sum + (data ? (Number(data.highScoreCount) || 0) : 0);
                              }, 0))}条
                            </div>
                            <div className="total-line high-score-total">
                              📈 高分字数: {formatWordCount(KEYWORDS.reduce((sum, keyword) => {
                                const data = day.data[keyword];
                                return sum + (data ? (Number(data.highScoreWords) || 0) : 0);
                              }, 0))}
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
                  <div className="summary-title">本周统计</div>
                  <div className="summary-stats">
                    <div className="summary-line">
                      📰 总计: {formatNumber(weekStats.totalNews)}条
                    </div>
                    <div className="summary-line">
                      📝 总字数: {formatWordCount(weekStats.totalWords)}
                    </div>
                    <div className="summary-line high-score">
                      ⭐ 3分以上: {formatNumber(weekStats.highScoreNews)}条
                    </div>
                    <div className="summary-line high-score">
                      📝 高分字数: {formatWordCount(weekStats.highScoreWords)}
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
                                <span className="stats-label">📊 总计:</span>
                                <span className="stats-value">
                                  {formatNumber(stats.newsCount)}条 / {formatWordCount(stats.totalWords)}
                                </span>
                              </div>
                              <div className="stats-row high-score-stats">
                                <span className="stats-label">⭐ 高分:</span>
                                <span className="stats-value">
                                  {formatNumber(stats.highScoreCount)}条 / {formatWordCount(stats.highScoreWords)}
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
      </div>
    </div>
  );
}