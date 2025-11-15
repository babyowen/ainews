import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import './TestGemini.css';

const TestGemini = () => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [generatedReport, setGeneratedReport] = useState('');
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingReasoning, setStreamingReasoning] = useState('');
  const [streamingStatus, setStreamingStatus] = useState('');
  const [showReport, setShowReport] = useState(false);
  const [debugInfo, setDebugInfo] = useState(null);

  // 获取默认日期范围（最近7天）
  const getDefaultDateRange = () => {
    const today = new Date();
    const lastWeek = new Date(today);
    lastWeek.setDate(today.getDate() - 7);
    
    return {
      startDate: lastWeek.toISOString().split('T')[0],
      endDate: today.toISOString().split('T')[0]
    };
  };

  // 初始化默认日期
  React.useEffect(() => {
    const { startDate: defaultStart, endDate: defaultEnd } = getDefaultDateRange();
    setStartDate(defaultStart);
    setEndDate(defaultEnd);
  }, []);

  // 执行Google搜索
  const handleGoogleSearch = async () => {
    if (!startDate || !endDate) {
      alert('请选择日期范围');
      return;
    }

    setIsSearching(true);
    setSearchResults([]);
    setDebugInfo(null);

    try {
      console.log('发起Google搜索请求:', {
        query: '江苏省国资委',
        startDate,
        endDate,
        maxResults: 20
      });

      const response = await fetch('/api/google-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: '江苏省国资委',
          startDate,
          endDate,
          maxResults: 5  // 减少请求数量，专注最新结果
        })
      });

      console.log('搜索响应状态:', response.status, response.statusText);

      if (!response.ok) {
        // 尝试获取错误详情
        let errorDetails;
        try {
          errorDetails = await response.json();
          console.error('搜索错误详情:', errorDetails);
        } catch (parseError) {
          console.error('无法解析错误响应:', parseError);
          errorDetails = { error: '服务器响应格式错误' };
        }
        
        throw new Error(`搜索失败: ${response.status} ${response.statusText}\n详情: ${errorDetails.details || errorDetails.error || '未知错误'}`);
      }

      const data = await response.json();
      console.log('搜索成功响应:', data);
      
      setSearchResults(data.results || []);
      
      // 如果有调试信息，保存它
      if (data.debug) {
        setDebugInfo({
          type: 'search',
          data: data.debug,
          searchInfo: data.searchInfo
        });
      }
      
      // 显示搜索结果统计
      const resultCount = data.results ? data.results.length : 0;
      const totalResults = data.searchInfo?.totalResults || '0';
      console.log(`搜索完成: 返回${resultCount}个结果，总共约${totalResults}个结果`);
      
    } catch (error) {
      console.error('Google搜索失败:', error);
      
      // 显示更详细的错误信息
      const errorMessage = error.message || '未知错误';
      alert(`搜索失败:\n${errorMessage}\n\n请检查:\n1. Google API密钥是否正确\n2. 搜索引擎ID是否正确\n3. API是否已启用\n4. 查看控制台获取更多调试信息`);
    } finally {
      setIsSearching(false);
    }
  };

  // 生成周报
  const handleGenerateReport = async () => {
    if (searchResults.length === 0) {
      alert('请先进行搜索获取数据');
      return;
    }

    setIsGenerating(true);
    setShowReport(true);
    setGeneratedReport('');
    setStreamingContent('');
    setStreamingReasoning('');
    setStreamingStatus('🚀 准备开始生成周报...');
    setDebugInfo(null);

    try {
      const response = await fetch('/api/generate-gemini-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          keyword: '江苏省国资委',
          startDate,
          endDate,
          searchResults,
          stream: true
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            if (dataStr.trim() === '[DONE]') {
              setIsGenerating(false);
              return;
            }

            try {
              const data = JSON.parse(dataStr);
              
              if (data.type === 'debug') {
                setDebugInfo(data.data);
              } else if (data.type === 'status') {
                setStreamingStatus(data.message);
              } else if (data.type === 'reasoning') {
                setStreamingReasoning(prev => prev + (data.content || ''));
              } else if (data.type === 'content') {
                setStreamingContent(prev => prev + (data.content || ''));
              } else if (data.type === 'complete') {
                setGeneratedReport(data.content || streamingContent);
                setIsGenerating(false);
              } else if (data.type === 'error') {
                throw new Error(data.message);
              }
            } catch (parseError) {
              console.warn('解析SSE数据失败:', parseError, '原始数据:', dataStr);
            }
          }
        }
      }
    } catch (error) {
      console.error('生成报告失败:', error);
      alert(`生成失败: ${error.message}`);
      setIsGenerating(false);
    }
  };

  return (
    <div className="test-gemini-container">
      <div className="test-gemini-header">
        <h1>🧪 Test Gemini - 江苏省国资委周报生成测试</h1>
        <p>此页面用于测试Gemini API和Google搜索功能的集成效果</p>
      </div>

      {/* 参数配置区域 */}
      <div className="config-section">
        <h3>📅 时间范围设置</h3>
        <div className="date-inputs">
          <div className="date-group">
            <label>开始日期:</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="date-group">
            <label>结束日期:</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* 搜索区域 */}
      <div className="search-section">
        <h3>🔍 Google搜索测试</h3>
        <div className="search-controls">
          <button 
            onClick={handleGoogleSearch}
            disabled={isSearching}
            className="search-btn"
          >
            {isSearching ? '🔄 搜索中...' : '🚀 执行Google搜索'}
          </button>
          <span className="search-info">
            关键词: 江苏省国资委 | 时间范围: {startDate} 至 {endDate} | 按日期排序（最新优先）
          </span>
        </div>

        {/* 搜索调试信息 */}
        {debugInfo && debugInfo.type === 'search' && (
          <div className="search-debug-info">
            <details>
              <summary>🔧 搜索调试信息</summary>
              <div className="debug-content">
                <h5>API调用信息:</h5>
                <p><strong>请求URL:</strong> {debugInfo.data.requestUrl}</p>
                <p><strong>响应状态:</strong> {debugInfo.data.responseStatus}</p>
                <p><strong>找到结果:</strong> {debugInfo.data.itemsFound}</p>
                <p><strong>总可用结果:</strong> {debugInfo.data.totalAvailable}</p>
                
                {debugInfo.searchInfo && (
                  <>
                    <h5>搜索信息:</h5>
                    <p><strong>搜索用时:</strong> {debugInfo.searchInfo.searchTime} 秒</p>
                    <p><strong>实际查询:</strong> {debugInfo.searchInfo.query}</p>
                  </>
                )}
              </div>
            </details>
          </div>
        )}

        {/* 搜索结果 */}
        {searchResults.length > 0 && (
          <div className="search-results">
            <h4>📊 搜索结果 ({searchResults.length} 条)</h4>
            <div className="results-list">
              {searchResults.map((result, index) => (
                <div key={index} className="result-item">
                  <h5>{result.title}</h5>
                  <p className="result-snippet">{result.snippet}</p>
                  <a href={result.link} target="_blank" rel="noopener noreferrer">
                    {result.link}
                  </a>
                  <div className="result-meta">
                    <span className="result-source">来源: {result.displayLink}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 周报生成区域 */}
      <div className="generate-section">
        <h3>🤖 Gemini周报生成测试</h3>
        <div className="generate-controls">
          <button 
            onClick={handleGenerateReport}
            disabled={isGenerating || searchResults.length === 0}
            className="generate-btn"
          >
            {isGenerating ? '⚡ 生成中...' : '🎯 生成江苏省国资委周报'}
          </button>
          {searchResults.length === 0 && (
            <span className="generate-tip">请先进行搜索获取数据</span>
          )}
        </div>

        {/* 生成状态显示 */}
        {isGenerating && (
          <div className="generation-status">
            <div className="status-indicator">
              <span className="spinner">🔄</span>
              <span className="status-text">{streamingStatus}</span>
            </div>

            {/* 调试信息 */}
            {debugInfo && (
              <div className="debug-info">
                <details>
                  <summary>🔧 调试信息</summary>
                  <div className="debug-content">
                    <p><strong>模型:</strong> {debugInfo.model}</p>
                    <p><strong>总字符数:</strong> {debugInfo.totalChars?.toLocaleString()}</p>
                    <p><strong>预估Token:</strong> {debugInfo.estimatedTokens?.toLocaleString()}</p>
                    <p><strong>搜索结果数:</strong> {debugInfo.searchResultsCount}</p>
                  </div>
                </details>
              </div>
            )}

            {/* AI思考过程 */}
            {streamingReasoning && (
              <div className="ai-reasoning">
                <details open>
                  <summary>🧠 AI思考过程</summary>
                  <div className="reasoning-content">
                    <pre>{streamingReasoning}</pre>
                  </div>
                </details>
              </div>
            )}

            {/* 生成内容 */}
            {streamingContent && (
              <div className="streaming-content">
                <h4>📝 实时生成内容:</h4>
                <div className="content-preview">
                  <ReactMarkdown>{streamingContent}</ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 最终生成的周报 */}
        {showReport && generatedReport && !isGenerating && (
          <div className="final-report">
            <h4>📋 生成的周报:</h4>
            <div className="report-content">
              <ReactMarkdown
                components={{
                  h1: ({children}) => <h1 style={{color: '#2c3e50', borderBottom: '2px solid #3498db', paddingBottom: '10px'}}>{children}</h1>,
                  h2: ({children}) => <h2 style={{color: '#34495e', borderLeft: '4px solid #3498db', paddingLeft: '15px', marginTop: '25px'}}>{children}</h2>,
                  h3: ({children}) => <h3 style={{color: '#2c3e50', marginTop: '20px'}}>{children}</h3>,
                  p: ({children}) => <p style={{lineHeight: '1.6', marginBottom: '15px'}}>{children}</p>,
                  ul: ({children}) => <ul style={{paddingLeft: '20px', marginBottom: '15px'}}>{children}</ul>,
                  ol: ({children}) => <ol style={{paddingLeft: '20px', marginBottom: '15px'}}>{children}</ol>,
                  li: ({children}) => <li style={{marginBottom: '5px', lineHeight: '1.5'}}>{children}</li>,
                  blockquote: ({children}) => <blockquote style={{borderLeft: '4px solid #bdc3c7', paddingLeft: '15px', margin: '15px 0', fontStyle: 'italic', color: '#7f8c8d'}}>{children}</blockquote>,
                  code: ({inline, children}) => 
                    inline 
                      ? <code style={{backgroundColor: '#f8f9fa', padding: '2px 5px', borderRadius: '3px', fontFamily: 'monospace'}}>{children}</code>
                      : <pre style={{backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '5px', overflow: 'auto', fontFamily: 'monospace'}}><code>{children}</code></pre>,
                  table: ({children}) => <table style={{width: '100%', borderCollapse: 'collapse', margin: '15px 0'}}>{children}</table>,
                  th: ({children}) => <th style={{border: '1px solid #ddd', padding: '12px', backgroundColor: '#f8f9fa', textAlign: 'left'}}>{children}</th>,
                  td: ({children}) => <td style={{border: '1px solid #ddd', padding: '12px'}}>{children}</td>
                }}
              >
                {generatedReport}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TestGemini; 