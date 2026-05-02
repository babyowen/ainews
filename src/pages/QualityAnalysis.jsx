import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { fetchQualityAnalysisData } from '../api/qualityAnalysis';
import { Loading, Error, Empty } from '../components/Status';
import dayjs from 'dayjs';
import './QualityAnalysis.css';
import { KEYWORDS } from '../config/keywords';

const QualityAnalysis = () => {
  const [keyword, setKeyword] = useState('江苏省国资委');
  const [date, setDate] = useState(dayjs().subtract(1, 'day').format('YYYY-MM-DD'));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [analysisData, setAnalysisData] = useState(null);

  // 关键词选项（集中配置）
  const keywordOptions = KEYWORDS;

  // 获取分析数据
  const fetchData = async () => {
    if (!keyword || !date) return;
    
    setLoading(true);
    setError(false);
    
    try {
      const data = await fetchQualityAnalysisData({ keyword, date });
      setAnalysisData(data);
    } catch (err) {
      console.error('获取质量分析数据失败:', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [keyword, date]);

  // 渲染总结内容块
  const renderSummaryBlock = (title, content, icon, color, description) => (
    <div className={`quality-summary-block ${color}`}>
      <div className="quality-block-header">
        <div className="quality-block-icon">{icon}</div>
        <div className="quality-block-title-group">
          <h3 className="quality-block-title">{title}</h3>
          {description && <p className="quality-block-description">{description}</p>}
        </div>
      </div>
      <div className="quality-block-content">
        {content ? (
          <ReactMarkdown
            components={{
              h1: ({node, ...props}) => <h2 style={{fontSize:18,margin:'12px 0 8px 0',color:'var(--kd-ink)',fontWeight:700}} {...props} />,
              h2: ({node, ...props}) => <h3 style={{fontSize:16,margin:'10px 0 6px 0',color:'var(--kd-ink-muted)',fontWeight:600}} {...props} />,
              h3: ({node, ...props}) => <h4 style={{fontSize:15,margin:'8px 0 4px 0',color:'var(--kd-ink-soft)',fontWeight:500}} {...props} />,
              ul: ({node, ...props}) => <ul style={{margin:'6px 0 6px 18px',padding:0}} {...props} />,
              li: ({node, ...props}) => <li style={{margin:'3px 0'}} {...props} />,
              strong: ({node, ...props}) => <strong style={{color:'var(--kd-ink)'}} {...props} />,
              p: ({node, ...props}) => <p style={{margin:'6px 0',lineHeight:1.6}} {...props} />,
            }}
          >
            {content}
          </ReactMarkdown>
        ) : (
          <div className="no-content">
            <span>暂无数据</span>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="quality-analysis-page">
      <header className="kd-page-header">
        <div>
          <p className="kd-page-kicker">QUALITY ANALYSIS</p>
          <h1 className="kd-page-title">质量分析</h1>
          <p className="kd-page-subtitle">对比分析各轮次总结内容和 LLM 修改建议的有效性。</p>
        </div>
      </header>

      {/* 筛选控件 */}
      <section className="quality-filter-panel kd-panel">
        <div className="quality-filter-row">
          <div className="quality-filter-group">
            <label>关键词</label>
            <select
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            >
              {keywordOptions.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>

          <div className="quality-filter-group">
            <label>日期</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <button
            className="quality-refresh-btn kd-btn-primary"
            onClick={fetchData}
            disabled={loading}
          >
            {loading ? '分析中...' : '重新分析'}
          </button>
        </div>
      </section>

      {/* 分析结果区域 */}
      <div className="quality-results">
        {loading ? (
          <Loading />
        ) : error ? (
          <Error />
        ) : analysisData ? (
          <div className="quality-summary-blocks">
            {renderSummaryBlock(
              "第一轮总结",
              analysisData.round1Summary,
              "1️⃣",
              "round-1",
              "初始AI总结，基于原始新闻数据生成"
            )}

            {renderSummaryBlock(
              "LLM修改建议",
              analysisData.modifyAdvice,
              "💡",
              "modify-advice",
              "基于第一轮总结内容，LLM给出的优化建议"
            )}

            {renderSummaryBlock(
              "第二轮总结",
              analysisData.round2Summary,
              "2️⃣",
              "round-2",
              "根据修改建议优化后的总结内容"
            )}

            {renderSummaryBlock(
              "昨天总结",
              analysisData.yesterdaySummary,
              "📰",
              "yesterday",
              "前一天的总结内容，作为对比参考"
            )}

            {renderSummaryBlock(
              "第三轮总结",
              analysisData.round3Summary,
              "3️⃣",
              "round-3",
              "进一步优化后的最终总结内容"
            )}
          </div>
        ) : (
          <Empty />
        )}
      </div>
    </div>
  );
};

export default QualityAnalysis;