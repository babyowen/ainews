import React from 'react';
import './PromptModal.css';

const PromptModal = ({ isOpen, onClose, debugInfo }) => {
  if (!isOpen || !debugInfo) return null;

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const copyToClipboard = (text, type) => {
    navigator.clipboard.writeText(text).then(() => {
      alert(`${type} 已复制到剪贴板`);
    }).catch(err => {
      console.error('复制失败:', err);
    });
  };

  return (
    <div className="prompt-modal-overlay" onClick={handleOverlayClick}>
      <div className="prompt-modal">
        <div className="prompt-modal-header">
          <h2>🤖 LLM 提示词详情</h2>
          <button className="prompt-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        
        <div className="prompt-modal-content">
          {/* 模型信息 */}
          <div className="prompt-section">
            <div className="prompt-section-header">
              <h3>📊 模型信息</h3>
            </div>
            <div className="model-info">
              <div className="model-info-item">
                <span className="label">模型:</span>
                <span className="value">{debugInfo.model}</span>
              </div>
              <div className="model-info-item">
                <span className="label">总字符数:</span>
                <span className="value">{debugInfo.totalChars?.toLocaleString()} 字符</span>
              </div>
              <div className="model-info-item">
                <span className="label">预估Token:</span>
                <span className="value">{debugInfo.estimatedTokens?.toLocaleString()} tokens</span>
              </div>
              {debugInfo.newsCount && (
                <div className="model-info-item">
                  <span className="label">新闻数量:</span>
                  <span className="value">{debugInfo.newsCount} 条</span>
                </div>
              )}
            </div>
          </div>

          {/* System Prompt */}
          <div className="prompt-section">
            <div className="prompt-section-header">
              <h3>⚙️ System Prompt</h3>
              <button 
                className="copy-btn"
                onClick={() => copyToClipboard(debugInfo.systemPrompt, 'System Prompt')}
              >
                📋 复制
              </button>
            </div>
            <div className="prompt-content">
              <pre>{debugInfo.systemPrompt}</pre>
            </div>
          </div>

          {/* User Prompt */}
          <div className="prompt-section">
            <div className="prompt-section-header">
              <h3>👤 User Prompt</h3>
              <button 
                className="copy-btn"
                onClick={() => copyToClipboard(debugInfo.userPrompt, 'User Prompt')}
              >
                📋 复制
              </button>
            </div>
            <div className="prompt-content">
              <pre>{debugInfo.userPrompt}</pre>
            </div>
          </div>
        </div>
        
        <div className="prompt-modal-footer">
          <button className="close-btn" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};

export default PromptModal; 