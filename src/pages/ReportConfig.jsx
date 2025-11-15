import React, { useState, useEffect } from 'react';
import PasswordProtection from '../components/PasswordProtection';
import './ReportConfig.css';

const ReportConfig = () => {
  const [configData, setConfigData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeSection, setActiveSection] = useState('system');
  const [keywordConfig, setKeywordConfig] = useState({ keywords: {}, metadata: null });
  const [keywordLoading, setKeywordLoading] = useState(false);
  const [selectedKeyword, setSelectedKeyword] = useState('');
  const [keywordList, setKeywordList] = useState([]);
  const [promptVersions, setPromptVersions] = useState([]);
  const [editForm, setEditForm] = useState({
    keyword: '',
    promptId: '',
    name: '',
    description: '',
    systemPrompt: '',
    userPrompt: '',
    isDefault: false
  });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState('');

  useEffect(() => {
    fetchConfigData();
    fetchKeywordConfig();
  }, []);

  const fetchConfigData = async () => {
    setLoading(true);
    setError(false);
    
    try {
      // 获取提示词配置
      const response = await fetch('/api/config/prompts');
      if (!response.ok) {
        throw new Error('获取配置失败');
      }
      
      const data = await response.json();
      setConfigData(data);
    } catch (err) {
      console.error('获取配置失败:', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const fetchKeywordConfig = async () => {
    setKeywordLoading(true);
    try {
      const res = await fetch('/api/config/keyword-prompts');
      if (res.ok) {
        const data = await res.json();
        setKeywordConfig(data || { keywords: {}, metadata: null });
        const keys = Object.keys((data || {}).keywords || {});
        setKeywordList(keys);
        if (keys.length > 0 && !selectedKeyword) {
          setSelectedKeyword(keys[0]);
        }
      } else {
        setKeywordConfig({ keywords: {}, metadata: null });
        setKeywordList([]);
      }
    } catch (e) {
      setKeywordConfig({ keywords: {}, metadata: null });
      setKeywordList([]);
    } finally {
      setKeywordLoading(false);
    }
  };

  useEffect(() => {
    const loadKeywordPrompts = async () => {
      if (!selectedKeyword) {
        setPromptVersions([]);
        setEditForm({ keyword: '', promptId: '', name: '', description: '', systemPrompt: '', userPrompt: '', isDefault: false });
        return;
      }
      try {
        const r = await fetch(`/api/config/keyword-prompts/${encodeURIComponent(selectedKeyword)}`);
        if (r.ok) {
          const data = await r.json();
          setPromptVersions(data.prompts || []);
          setEditForm({ keyword: selectedKeyword, promptId: '', name: '', description: '', systemPrompt: '', userPrompt: '', isDefault: false });
        } else {
          setPromptVersions([]);
          setEditForm({ keyword: selectedKeyword, promptId: '', name: '', description: '', systemPrompt: '', userPrompt: '', isDefault: false });
        }
      } catch {
        setPromptVersions([]);
        setEditForm({ keyword: selectedKeyword, promptId: '', name: '', description: '', systemPrompt: '', userPrompt: '', isDefault: false });
      }
    };
    loadKeywordPrompts();
  }, [selectedKeyword]);

  const formatPromptText = (text) => {
    if (!text) return '暂无配置';
    return text.trim();
  };

  const estimateTokens = (text) => {
    if (!text) return 0;
    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const englishChars = (text.match(/[a-zA-Z]/g) || []).length;
    const otherChars = text.length - chineseChars - englishChars;
    return Math.ceil(chineseChars * 0.6 + englishChars * 0.3 + otherChars * 0.5);
  };

  const configSections = [
    { key: 'system', label: 'System Prompt', icon: '🤖' },
    { key: 'user', label: 'User Prompt', icon: '👤' },
    { key: 'modifySystem', label: 'Modify System', icon: '🔧' },
    { key: 'modifyUser', label: 'Modify User', icon: '✏️' },
    { key: 'keyword', label: '关键词 Prompt', icon: '🏷️' },
    { key: 'llm', label: 'LLM 配置', icon: '⚡' }
  ];

  if (loading) {
    return (
      <div className="config-container">
        <div className="loading-animation">
          <div className="tech-spinner"></div>
          <h3>正在加载配置参数...</h3>
          <p>系统正在读取提示词和模型配置</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="config-container">
        <div className="error-state">
          <div className="error-icon">⚠️</div>
          <h3>配置加载失败</h3>
          <p>无法获取系统配置信息，请稍后重试</p>
          <button onClick={fetchConfigData} className="retry-btn">
            🔄 重新加载
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="config-container">
      {/* 页面头部 */}
      <div className="config-header">
        <div className="header-bg"></div>
        <div className="header-content">
          <div className="title-section">
            <div className="main-title">
              <span className="title-icon">⚙️</span>
              <h1>周报参数配置</h1>
              <div className="title-glow"></div>
            </div>
            <p className="subtitle">系统提示词配置 & LLM 模型参数</p>
          </div>
          
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon">🎯</div>
              <div className="stat-info">
                <span className="stat-label">当前模型</span>
                <span className="stat-value">DeepSeek R1</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">📝</div>
              <div className="stat-info">
                <span className="stat-label">提示词总数</span>
                <span className="stat-value">{4 + promptVersions.length} 个</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">🔧</div>
              <div className="stat-info">
                <span className="stat-label">配置状态</span>
                <span className="stat-value">正常</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 导航标签 */}
      <div className="config-navigation">
        <div className="nav-container">
          {configSections.map(section => (
            <button
              key={section.key}
              className={`nav-tab ${activeSection === section.key ? 'active' : ''}`}
              onClick={() => setActiveSection(section.key)}
            >
              <span className="tab-icon">{section.icon}</span>
              <span className="tab-label">{section.label}</span>
              {activeSection === section.key && <div className="tab-indicator"></div>}
            </button>
          ))}
        </div>
      </div>

      {/* 配置内容区域 */}
      <div className="config-content">
        {/* System Prompt */}
        {activeSection === 'system' && (
          <div className="config-section">
            <div className="section-header">
              <h2>🤖 System Prompt</h2>
              <div className="section-stats">
                <span className="stat-chip">
                  字数: {configData?.systemPrompt ? configData.systemPrompt.length : 0}
                </span>
                <span className="stat-chip">
                  Token: ~{configData?.systemPrompt ? estimateTokens(configData.systemPrompt) : 0}
                </span>
              </div>
            </div>
            <div className="prompt-card">
              <div className="prompt-header">
                <span className="prompt-type">系统角色定义</span>
                <span className="prompt-usage">用于定义AI助手的角色和行为规范</span>
              </div>
              <div className="prompt-content">
                <pre>{formatPromptText(configData?.systemPrompt)}</pre>
              </div>
            </div>
          </div>
        )}

        {/* User Prompt */}
        {activeSection === 'user' && (
          <div className="config-section">
            <div className="section-header">
              <h2>👤 User Prompt</h2>
              <div className="section-stats">
                <span className="stat-chip">
                  字数: {configData?.userPrompt ? configData.userPrompt.length : 0}
                </span>
                <span className="stat-chip">
                  Token: ~{configData?.userPrompt ? estimateTokens(configData.userPrompt) : 0}
                </span>
              </div>
            </div>
            <div className="prompt-card">
              <div className="prompt-header">
                <span className="prompt-type">用户指令模板</span>
                <span className="prompt-usage">包含变量：{'{keyword}'}, {'{startDate}'}, {'{endDate}'}, {'{news}'}, {'{usertopic}'}</span>
              </div>
              <div className="prompt-content">
                <pre>{formatPromptText(configData?.userPrompt)}</pre>
              </div>
            </div>
          </div>
        )}

        {/* Modify System Prompt */}
        {activeSection === 'modifySystem' && (
          <div className="config-section">
            <div className="section-header">
              <h2>🔧 Modify System Prompt</h2>
              <div className="section-stats">
                <span className="stat-chip">
                  字数: {configData?.modifySystemPrompt ? configData.modifySystemPrompt.length : 0}
                </span>
                <span className="stat-chip">
                  Token: ~{configData?.modifySystemPrompt ? estimateTokens(configData.modifySystemPrompt) : 0}
                </span>
              </div>
            </div>
            <div className="prompt-card">
              <div className="prompt-header">
                <span className="prompt-type">修改指令系统提示</span>
                <span className="prompt-usage">用于定义二轮修改时AI的角色和修改原则</span>
              </div>
              <div className="prompt-content">
                <pre>{formatPromptText(configData?.modifySystemPrompt)}</pre>
              </div>
            </div>
          </div>
        )}

        {/* Modify User Prompt */}
        {activeSection === 'modifyUser' && (
          <div className="config-section">
            <div className="section-header">
              <h2>✏️ Modify User Prompt</h2>
              <div className="section-stats">
                <span className="stat-chip">
                  字数: {configData?.modifyUserPrompt ? configData.modifyUserPrompt.length : 0}
                </span>
                <span className="stat-chip">
                  Token: ~{configData?.modifyUserPrompt ? estimateTokens(configData.modifyUserPrompt) : 0}
                </span>
              </div>
            </div>
            <div className="prompt-card">
              <div className="prompt-header">
                <span className="prompt-type">修改指令用户模板</span>
                <span className="prompt-usage">包含变量：{'{originalReport}'}, {'{modifyRequest}'}, {'{keyword}'}, {'{startDate}'}, {'{endDate}'}</span>
              </div>
              <div className="prompt-content">
                <pre>{formatPromptText(configData?.modifyUserPrompt)}</pre>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'keyword' && (
          <PasswordProtection title="🔐 管理员验证" description="请输入管理员密码访问关键词 Prompt 配置">
          <div className="config-section">
            <div className="section-header">
              <h2>🏷️ 关键词提示词配置</h2>
              <div className="section-stats">
                <span className="stat-chip">关键词: {selectedKeyword || '未选择'}</span>
                <span className="stat-chip">版本数: {promptVersions.length}</span>
              </div>
            </div>

            <div className="keyword-manager">
                <div className="keyword-sidebar">
                  <div className="keyword-toolbar">
                    <button className="refresh-btn" onClick={fetchKeywordConfig} disabled={keywordLoading}>
                      <span className="btn-icon">🔄</span>刷新关键词
                    </button>
                    <button
                      className="retry-btn"
                      onClick={() => setEditForm({ keyword: selectedKeyword, promptId: '', name: '', description: '', systemPrompt: '', userPrompt: '', isDefault: false })}
                      disabled={!selectedKeyword}
                    >新增版本</button>
                  </div>
                <div className="keyword-list">
                  {keywordLoading && <div className="loading-tip">加载中...</div>}
                  {keywordList.length === 0 && !keywordLoading && (
                    <div className="empty-tip">暂无关键词配置</div>
                  )}
                  {keywordList.map(k => (
                    <button
                      key={k}
                      className={`keyword-item ${selectedKeyword === k ? 'active' : ''}`}
                      onClick={() => setSelectedKeyword(k)}
                    >
                      {k}
                    </button>
                  ))}
                </div>
              </div>

              <div className="keyword-content">
                <div className="prompt-version-list">
                  {(promptVersions.length > 0 ? promptVersions : []).map(p => (
                    <div key={p.id} className={`prompt-version-card ${p.isDefault ? 'default' : ''}`}>
                      <div className="prompt-version-header">
                        <div className="left">
                          <span className="version-title">{p.name}</span>
                          {p.isDefault && <span className="default-badge">默认</span>}
                        </div>
                        <div className="right">
                          <button
                            className="mini-btn"
                            onClick={() => {
                              setEditForm({
                                keyword: selectedKeyword,
                                promptId: p.id,
                                name: p.name,
                                description: p.description || '',
                                systemPrompt: p.systemPrompt || '',
                                userPrompt: p.userPrompt || '',
                                isDefault: !!p.isDefault
                              });
                            }}
                          >编辑</button>
                          <button
                            className="mini-btn danger"
                            onClick={async () => {
                              setDeletingId(p.id);
                              try {
                                const r = await fetch(`/api/config/keyword-prompts/${encodeURIComponent(selectedKeyword)}/${encodeURIComponent(p.id)}`, { method: 'DELETE' });
                                if (r.ok) {
                                  const next = promptVersions.filter(x => x.id !== p.id);
                                  setPromptVersions(next);
                                  fetchKeywordConfig();
                                }
                              } finally {
                                setDeletingId('');
                              }
                            }}
                            disabled={deletingId === p.id}
                          >{deletingId === p.id ? '删除中...' : '删除'}</button>
                        </div>
                      </div>
                      <div className="prompt-version-desc">{p.description || ''}</div>
                    </div>
                  ))}
                </div>

                <div className="edit-form">
                  <div className="form-row">
                    <label>关键词</label>
                    <input
                      value={editForm.keyword || selectedKeyword}
                      onChange={(e) => setEditForm({ ...editForm, keyword: e.target.value })}
                      placeholder="如：江苏省国资委"
                    />
                  </div>
                  <div className="form-row">
                    <label>版本ID（选填）</label>
                    <input
                      value={editForm.promptId}
                      onChange={(e) => setEditForm({ ...editForm, promptId: e.target.value })}
                      placeholder="如：default / v2025-11"
                    />
                  </div>
                  <div className="form-row">
                    <label>版本名称</label>
                    <input
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      placeholder="如：通用模板 / 政务优化版"
                    />
                  </div>
                  <div className="form-row">
                    <label>描述</label>
                    <input
                      value={editForm.description}
                      onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                      placeholder="版本用途说明"
                    />
                  </div>
                  <div className="form-row">
                    <label>System Prompt</label>
                    <textarea
                      value={editForm.systemPrompt}
                      onChange={(e) => setEditForm({ ...editForm, systemPrompt: e.target.value })}
                      rows={6}
                      placeholder="系统提示词内容"
                    />
                  </div>
                  <div className="form-row">
                    <label>User Prompt</label>
                    <textarea
                      value={editForm.userPrompt}
                      onChange={(e) => setEditForm({ ...editForm, userPrompt: e.target.value })}
                      rows={8}
                      placeholder="用户提示词模板，支持 {keyword} {startDate} {endDate} {news} {usertopic}"
                    />
                  </div>
                  <div className="form-row inline">
                    <label>设为默认</label>
                    <input
                      type="checkbox"
                      checked={!!editForm.isDefault}
                      onChange={(e) => setEditForm({ ...editForm, isDefault: e.target.checked })}
                    />
                  </div>
                  <div className="form-actions">
                    <button
                      className="refresh-btn"
                      disabled={saving}
                      onClick={async () => {
                        const body = {
                          keyword: (editForm.keyword || selectedKeyword || '').trim(),
                          promptId: (editForm.promptId || '').trim(),
                          name: (editForm.name || '').trim(),
                          description: (editForm.description || '').trim(),
                          systemPrompt: editForm.systemPrompt || '',
                          userPrompt: editForm.userPrompt || '',
                          isDefault: !!editForm.isDefault
                        };
                        if (!body.keyword || !body.name || !body.description || !body.systemPrompt || !body.userPrompt) {
                          alert('请完整填写关键词、版本名称、描述、System Prompt、User Prompt');
                          return;
                        }
                        setSaving(true);
                        try {
                          const r = await fetch('/api/config/keyword-prompts', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(body)
                          });
                          if (r.ok) {
                            const j = await r.json();
                            const next = [...promptVersions];
                            const idx = next.findIndex(x => x.id === j.prompt.id);
                            if (idx >= 0) next[idx] = j.prompt; else next.push(j.prompt);
                            setPromptVersions(next);
                            if (!keywordList.includes(body.keyword)) {
                              setKeywordList([...keywordList, body.keyword]);
                            }
                            setSelectedKeyword(body.keyword);
                            fetchKeywordConfig();
                          }
                        } finally {
                          setSaving(false);
                        }
                      }}
                    >{saving ? '保存中...' : '保存配置'}</button>
                    <button
                      className="retry-btn"
                      onClick={() => setEditForm({ keyword: selectedKeyword, promptId: '', name: '', description: '', systemPrompt: '', userPrompt: '', isDefault: false })}
                    >清空</button>
                  </div>
                  <div className="form-tip">保存后，“周报生成”页面会自动读取对应关键词的不同版本提示词用于生成</div>
                </div>
              </div>
            </div>
          </div>
          </PasswordProtection>
        )}

        {/* LLM Configuration */}
        {activeSection === 'llm' && (
          <div className="config-section">
            <div className="section-header">
              <h2>⚡ LLM 模型配置</h2>
              <div className="section-stats">
                <span className="stat-chip status-active">运行中</span>
                <span className="stat-chip">DeepSeek R1</span>
              </div>
            </div>
            
            <div className="llm-grid">
              <div className="llm-card primary">
                <div className="llm-header">
                  <div className="llm-icon">🚀</div>
                  <div className="llm-info">
                    <h3>DeepSeek R1</h3>
                    <span className="llm-status active">当前使用</span>
                  </div>
                </div>
                <div className="llm-params">
                  <div className="param-row">
                    <span className="param-label">模型类型</span>
                    <span className="param-value">deepseek-reasoner</span>
                  </div>
                  <div className="param-row">
                    <span className="param-label">Temperature</span>
                    <span className="param-value">0.7</span>
                  </div>
                  <div className="param-row">
                    <span className="param-label">输出限制</span>
                    <span className="param-value">无限制</span>
                  </div>
                  <div className="param-row">
                    <span className="param-label">API 端点</span>
                    <span className="param-value">api.deepseek.com</span>
                  </div>
                </div>
              </div>

              <div className="llm-card">
                <div className="llm-header">
                  <div className="llm-icon">🔥</div>
                  <div className="llm-info">
                    <h3>Token 估算</h3>
                    <span className="llm-status">DeepSeek官方标准</span>
                  </div>
                </div>
                <div className="llm-params">
                  <div className="param-row">
                    <span className="param-label">中文字符</span>
                    <span className="param-value">× 0.6 Token</span>
                  </div>
                  <div className="param-row">
                    <span className="param-label">英文字符</span>
                    <span className="param-value">× 0.3 Token</span>
                  </div>
                  <div className="param-row">
                    <span className="param-label">其他字符</span>
                    <span className="param-value">× 0.5 Token</span>
                  </div>
                </div>
              </div>

              <div className="llm-card">
                <div className="llm-header">
                  <div className="llm-icon">📊</div>
                  <div className="llm-info">
                    <h3>使用统计</h3>
                    <span className="llm-status">实时数据</span>
                  </div>
                </div>
                <div className="llm-params">
                  <div className="param-row">
                    <span className="param-label">配置文件</span>
                    <span className="param-value">prompts.md</span>
                  </div>
                  <div className="param-row">
                    <span className="param-label">更新时间</span>
                    <span className="param-value">实时读取</span>
                  </div>
                  <div className="param-row">
                    <span className="param-label">响应模式</span>
                    <span className="param-value">流式返回</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 底部操作区 */}
      <div className="config-footer">
        <div className="footer-info">
          <span className="info-icon">💡</span>
          <span>默认提示词存储在 <code>config/prompts.md</code>；关键词提示词存储在 <code>config/keyword-prompts.json</code></span>
        </div>
        <button 
          onClick={fetchConfigData}
          className="refresh-btn"
        >
          <span className="btn-icon">🔄</span>
          刷新配置
        </button>
      </div>
    </div>
  );
};

export default ReportConfig;
