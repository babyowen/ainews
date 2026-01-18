import React, { useState, useEffect } from 'react';
import PasswordProtection from '../components/PasswordProtection';
import './ReportConfig.css';

const ReportConfig = () => {
  const [configData, setConfigData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeSection, setActiveSection] = useState('keyword');
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

  const estimateTokens = (text) => {
    if (!text) return 0;
    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const englishChars = (text.match(/[a-zA-Z]/g) || []).length;
    const otherChars = text.length - chineseChars - englishChars;
    return Math.ceil(chineseChars * 0.6 + englishChars * 0.3 + otherChars * 0.5);
  };

  const configSections = [
    { key: 'keyword', label: '关键词 Prompt', icon: '🏷️' },
    { key: 'policy', label: '政策对比 Prompt', icon: '⚖️' }
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
    <PasswordProtection title="🔐 管理员验证" description="请输入管理员密码以访问周报参数配置">
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
            <p className="subtitle">系统提示词配置</p>
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
        {activeSection === 'keyword' && (
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
        )}

        {/* Policy Comparison Prompt */}
        {activeSection === 'policy' && (
          <div className="config-section">
            <div className="section-header">
              <h2>⚖️ 政策对比 Prompt</h2>
              <div className="section-stats">
                <span className="stat-chip">
                  字数: {configData?.policyPrompt ? configData.policyPrompt.length : 0}
                </span>
                <span className="stat-chip">
                  Token: ~{configData?.policyPrompt ? estimateTokens(configData.policyPrompt) : 0}
                </span>
              </div>
            </div>
            <div className="prompt-card">
              <div className="prompt-header">
                <span className="prompt-type">政策对比指令模板</span>
                <span className="prompt-usage">用于指导AI如何进行新旧政策对比分析</span>
              </div>
              <div className="prompt-content">
                <textarea
                  className="policy-prompt-editor"
                  value={configData?.policyPrompt || ''}
                  onChange={(e) => setConfigData({ ...configData, policyPrompt: e.target.value })}
                  rows={15}
                  placeholder="请输入政策对比提示词..."
                />
              </div>
              <div className="prompt-actions" style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                 <button 
                  className="refresh-btn"
                  disabled={saving}
                  onClick={async () => {
                    setSaving(true);
                    try {
                      await fetch('/api/config/policy-prompt', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ prompt: configData.policyPrompt })
                      });
                      alert('政策对比提示词已保存');
                    } catch (e) {
                      alert('保存失败: ' + e.message);
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  {saving ? '保存中...' : '保存配置'}
                </button>
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
    </PasswordProtection>
  );
};

export default ReportConfig;
