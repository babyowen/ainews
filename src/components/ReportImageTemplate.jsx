import React from 'react';
import ReactMarkdown from 'react-markdown';
import './ReportImageTemplate.css';

const ReportImageTemplate = ({ 
  reportContent, 
  keyword, 
  startDate, 
  endDate, 
  newsCount, 
  model 
}) => {
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  return (
    <div className="report-image-template">
      {/* 头部信息 */}
      <div className="image-header">
        <div className="header-bg"></div>
        <div className="header-content">
          <h1 className="image-title">🤖 AI新闻周报</h1>
          <div className="image-subtitle">人工智能驱动的新闻分析与洞察</div>
        </div>
      </div>

      {/* 报告信息 */}
      <div className="report-meta">
        <div className="meta-item">
          <span className="meta-label">🔑 关键词</span>
          <span className="meta-value">{keyword}</span>
        </div>
        <div className="meta-item">
          <span className="meta-label">📅 时间范围</span>
          <span className="meta-value">{formatDate(startDate)} ~ {formatDate(endDate)}</span>
        </div>
        <div className="meta-item">
          <span className="meta-label">📰 新闻数量</span>
          <span className="meta-value">{newsCount} 条</span>
        </div>
        <div className="meta-item">
          <span className="meta-label">🤖 AI模型</span>
          <span className="meta-value">{model || 'DeepSeek R1'}</span>
        </div>
      </div>

      {/* 主要内容 */}
      <div className="image-content">
        <ReactMarkdown 
          components={{
            h1: ({ children }) => <h1 className="content-h1" style={{fontSize: '96px', fontWeight: 700, color: '#1a1a1a', margin: '80px 0 48px 0', lineHeight: 1.3, borderBottom: '6px solid #667eea', paddingBottom: '32px'}}>{children}</h1>,
            h2: ({ children }) => <h2 className="content-h2" style={{fontSize: '64px', fontWeight: 600, color: '#2c3e50', margin: '72px 0 40px 0', lineHeight: 1.4, borderBottom: '4px solid #e9ecef', paddingBottom: '24px'}}>{children}</h2>,
            h3: ({ children }) => <h3 className="content-h3" style={{fontSize: '48px', fontWeight: 600, color: '#34495e', margin: '64px 0 32px 0', lineHeight: 1.4}}>{children}</h3>,
            p: ({ children }) => <p className="content-p" style={{fontSize: '36px', color: '#444', margin: '0 0 40px 0', lineHeight: 1.8, textAlign: 'justify'}}>{children}</p>,
            ul: ({ children }) => <ul className="content-ul" style={{margin: '40px 0', paddingLeft: '64px'}}>{children}</ul>,
            li: ({ children }) => <li className="content-li" style={{fontSize: '36px', color: '#444', margin: '24px 0', lineHeight: 1.7}}>{children}</li>,
            strong: ({ children }) => <strong className="content-strong" style={{color: '#1a1a1a', fontWeight: 700}}>{children}</strong>,
          }}
        >
          {reportContent}
        </ReactMarkdown>
      </div>

      {/* 底部水印 */}
      <div className="image-footer">
        <div className="footer-line"></div>
        <div className="footer-text">
          <span>由 KeyDigest AI 生成</span>
          <span className="generation-time">
            {new Date().toLocaleString('zh-CN')}
          </span>
        </div>
      </div>
    </div>
  );
};

export default ReportImageTemplate; 