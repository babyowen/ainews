import React, { useState, useEffect } from 'react';
import PasswordProtection from '../components/PasswordProtection';
import './ReportConfig.css';

const CONFIG_SECTIONS = [
  { key: 'keyword', label: '关键词 Prompt' },
  { key: 'policy', label: '政策相关 Prompt' },
  { key: 'regionReport', label: '地区政策报告 Prompt' }
];

const EMPTY_KEYWORD_FORM = {
  keyword: '',
  promptId: '',
  name: '',
  description: '',
  systemPrompt: '',
  userPrompt: '',
  isDefault: false
};

const EMPTY_REGION_FORM = {
  promptId: '',
  name: '',
  description: '',
  systemPrompt: '',
  userPromptSingle: '',
  userPromptMulti: '',
  isDefault: false
};

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
  const [editForm, setEditForm] = useState({ ...EMPTY_KEYWORD_FORM });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState('');

  const [regionPromptVersions, setRegionPromptVersions] = useState([]);
  const [regionPromptLoading, setRegionPromptLoading] = useState(false);
  const [regionSaving, setRegionSaving] = useState(false);
  const [regionDeletingId, setRegionDeletingId] = useState('');
  const [regionEditForm, setRegionEditForm] = useState({ ...EMPTY_REGION_FORM });

  useEffect(() => {
    fetchConfigData();
    fetchKeywordConfig();
    fetchRegionPromptConfig();
  }, []);

  const fetchConfigData = async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await fetch('/api/config/prompts');
      if (!response.ok) throw new Error('获取配置失败');
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

  const fetchRegionPromptConfig = async () => {
    setRegionPromptLoading(true);
    try {
      const res = await fetch('/api/config/region-policy-report-prompts');
      if (res.ok) {
        const data = await res.json();
        setRegionPromptVersions(data.prompts || []);
      } else {
        setRegionPromptVersions([]);
      }
    } catch {
      setRegionPromptVersions([]);
    } finally {
      setRegionPromptLoading(false);
    }
  };

  useEffect(() => {
    const loadKeywordPrompts = async () => {
      if (!selectedKeyword) {
        setPromptVersions([]);
        setEditForm({ ...EMPTY_KEYWORD_FORM });
        return;
      }
      try {
        const r = await fetch(`/api/config/keyword-prompts/${encodeURIComponent(selectedKeyword)}`);
        if (r.ok) {
          const data = await r.json();
          setPromptVersions(data.prompts || []);
        } else {
          setPromptVersions([]);
        }
      } catch {
        setPromptVersions([]);
      }
      setEditForm({ ...EMPTY_KEYWORD_FORM, keyword: selectedKeyword });
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

  const handleSaveKeywordPrompt = async () => {
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
  };

  const handleDeleteKeywordPrompt = async (promptId) => {
    setDeletingId(promptId);
    try {
      const r = await fetch(
        `/api/config/keyword-prompts/${encodeURIComponent(selectedKeyword)}/${encodeURIComponent(promptId)}`,
        { method: 'DELETE' }
      );
      if (r.ok) {
        setPromptVersions(promptVersions.filter(x => x.id !== promptId));
        fetchKeywordConfig();
      }
    } finally {
      setDeletingId('');
    }
  };

  const handleSavePolicyPrompt = async (type, prompt) => {
    setSaving(true);
    try {
      await fetch('/api/config/policy-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, type })
      });
      alert(type === 'extraction' ? '周报抽取提示词已保存' : '政策对比提示词已保存');
    } catch (e) {
      alert('保存失败: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRegionPrompt = async () => {
    const body = {
      promptId: (regionEditForm.promptId || '').trim(),
      name: (regionEditForm.name || '').trim(),
      description: (regionEditForm.description || '').trim(),
      systemPrompt: regionEditForm.systemPrompt || '',
      userPromptSingle: regionEditForm.userPromptSingle || '',
      userPromptMulti: regionEditForm.userPromptMulti || '',
      isDefault: !!regionEditForm.isDefault
    };
    if (!body.name || !body.description || !body.systemPrompt || !body.userPromptSingle || !body.userPromptMulti) {
      alert('请完整填写版本名称、描述、System Prompt、单地区 User Prompt、多地区 User Prompt');
      return;
    }
    setRegionSaving(true);
    try {
      const r = await fetch('/api/config/region-policy-report-prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (r.ok) {
        const j = await r.json();
        const next = [...regionPromptVersions];
        const idx = next.findIndex(item => item.id === j.prompt.id);
        if (idx >= 0) next[idx] = j.prompt; else next.push(j.prompt);
        setRegionPromptVersions(next);
        setRegionEditForm({
          promptId: j.prompt.id,
          name: j.prompt.name,
          description: j.prompt.description || '',
          systemPrompt: j.prompt.systemPrompt || '',
          userPromptSingle: j.prompt.userPromptSingle || '',
          userPromptMulti: j.prompt.userPromptMulti || '',
          isDefault: !!j.prompt.isDefault
        });
        fetchRegionPromptConfig();
      }
    } finally {
      setRegionSaving(false);
    }
  };

  const handleDeleteRegionPrompt = async (promptId) => {
    setRegionDeletingId(promptId);
    try {
      const r = await fetch(
        `/api/config/region-policy-report-prompts/${encodeURIComponent(promptId)}`,
        { method: 'DELETE' }
      );
      if (r.ok) {
        setRegionPromptVersions(regionPromptVersions.filter(item => item.id !== promptId));
        if (regionEditForm.promptId === promptId) {
          setRegionEditForm({ ...EMPTY_REGION_FORM });
        }
      }
    } finally {
      setRegionDeletingId('');
    }
  };

  const renderHeader = () => (
    <header className="kd-page-header config-header">
      <div className="config-header-text">
        <p className="kd-page-kicker">REPORT CONFIG</p>
        <h1 className="kd-page-title">周报参数配置</h1>
        <p className="kd-page-subtitle">维护关键词、政策对比与地区报告所使用的 Prompt 模板。</p>
      </div>
      <div className="config-header-meta">
        <span className="data-info">{CONFIG_SECTIONS.length} 个配置组</span>
        <span className="data-info">JSON / Markdown 持久化</span>
      </div>
    </header>
  );

  if (loading) {
    return (
      <PasswordProtection title="管理员验证" description="请输入管理员密码以访问周报参数配置">
        <div className="config-container kd-page">
          {renderHeader()}
          <div className="kd-state-card loading">
            <span className="spinner"></span>
            <span>正在加载配置参数…</span>
          </div>
        </div>
      </PasswordProtection>
    );
  }

  if (error) {
    return (
      <PasswordProtection title="管理员验证" description="请输入管理员密码以访问周报参数配置">
        <div className="config-container kd-page">
          {renderHeader()}
          <div className="kd-state-card error-state">
            <p>配置加载失败，请稍后重试。</p>
            <button type="button" onClick={fetchConfigData} className="retry-btn">
              重新加载
            </button>
          </div>
        </div>
      </PasswordProtection>
    );
  }

  return (
    <PasswordProtection title="管理员验证" description="请输入管理员密码以访问周报参数配置">
      <div className="config-container kd-page">
        {renderHeader()}

        <nav className="config-tab-bar kd-panel" aria-label="配置分区">
          {CONFIG_SECTIONS.map(section => (
            <button
              key={section.key}
              type="button"
              className={`config-tab ${activeSection === section.key ? 'active' : ''}`}
              onClick={() => setActiveSection(section.key)}
            >
              {section.label}
            </button>
          ))}
        </nav>

        {activeSection === 'keyword' && (
          <section className="config-section">
            <header className="config-section-header">
              <div className="config-section-headline">
                <h2 className="config-section-title">关键词提示词</h2>
                <p className="config-section-desc">为每个关键词维护多个版本，周报生成页将自动读取“设为默认”的版本。</p>
              </div>
              <div className="config-section-meta">
                <span className="data-info">关键词：{selectedKeyword || '未选择'}</span>
                <span className="data-info">版本数：{promptVersions.length}</span>
              </div>
            </header>

            <div className="config-keyword-grid">
              <aside className="config-keyword-sidebar kd-panel">
                <div className="config-panel-header">
                  <h3 className="config-panel-title">关键词列表</h3>
                  <button
                    type="button"
                    className="config-btn-ghost"
                    onClick={fetchKeywordConfig}
                    disabled={keywordLoading}
                  >
                    {keywordLoading ? '刷新中…' : '刷新'}
                  </button>
                </div>
                <div className="config-keyword-list">
                  {keywordLoading && (
                    <div className="config-list-tip">加载中…</div>
                  )}
                  {!keywordLoading && keywordList.length === 0 && (
                    <div className="config-list-tip">暂无关键词配置</div>
                  )}
                  {keywordList.map(k => (
                    <button
                      key={k}
                      type="button"
                      className={`config-keyword-item ${selectedKeyword === k ? 'active' : ''}`}
                      onClick={() => setSelectedKeyword(k)}
                    >
                      {k}
                    </button>
                  ))}
                </div>
              </aside>

              <div className="config-keyword-detail">
                <article className="config-detail-panel kd-panel">
                  <div className="config-panel-header">
                    <h3 className="config-panel-title">已有版本</h3>
                    <button
                      type="button"
                      className="config-btn-secondary"
                      onClick={() => setEditForm({ ...EMPTY_KEYWORD_FORM, keyword: selectedKeyword })}
                      disabled={!selectedKeyword}
                    >
                      新建版本
                    </button>
                  </div>
                  <div className="config-version-list">
                    {promptVersions.length === 0 && (
                      <div className="config-empty-block">尚未配置任何版本</div>
                    )}
                    {promptVersions.map(p => (
                      <div
                        key={p.id}
                        className={`config-version-card ${p.isDefault ? 'is-default' : ''}`}
                      >
                        <div className="config-version-header">
                          <div className="config-version-headline">
                            <span className="config-version-name">{p.name}</span>
                            {p.isDefault && <span className="config-version-badge">默认</span>}
                          </div>
                          <div className="config-version-actions">
                            <button
                              type="button"
                              className="config-btn-link"
                              onClick={() => setEditForm({
                                keyword: selectedKeyword,
                                promptId: p.id,
                                name: p.name,
                                description: p.description || '',
                                systemPrompt: p.systemPrompt || '',
                                userPrompt: p.userPrompt || '',
                                isDefault: !!p.isDefault
                              })}
                            >
                              编辑
                            </button>
                            <button
                              type="button"
                              className="config-btn-link danger"
                              disabled={deletingId === p.id}
                              onClick={() => handleDeleteKeywordPrompt(p.id)}
                            >
                              {deletingId === p.id ? '删除中…' : '删除'}
                            </button>
                          </div>
                        </div>
                        {p.description && (
                          <p className="config-version-desc">{p.description}</p>
                        )}
                        <div className="config-version-meta">
                          <span>ID</span>
                          <code>{p.id}</code>
                        </div>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="config-detail-panel kd-panel">
                  <div className="config-panel-header">
                    <h3 className="config-panel-title">编辑版本</h3>
                    <span className="config-form-hint">
                      {editForm.promptId ? `编辑 ${editForm.promptId}` : '新建版本'}
                    </span>
                  </div>
                  <div className="config-form">
                    <div className="config-form-grid">
                      <label className="config-form-row">
                        <span className="config-form-label">关键词</span>
                        <input
                          value={editForm.keyword || selectedKeyword}
                          onChange={(e) => setEditForm({ ...editForm, keyword: e.target.value })}
                          placeholder="如：江苏省国资委"
                        />
                      </label>
                      <label className="config-form-row">
                        <span className="config-form-label">版本 ID（可选）</span>
                        <input
                          value={editForm.promptId}
                          onChange={(e) => setEditForm({ ...editForm, promptId: e.target.value })}
                          placeholder="如：default / v2025-11"
                        />
                      </label>
                      <label className="config-form-row">
                        <span className="config-form-label">版本名称</span>
                        <input
                          value={editForm.name}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          placeholder="如：通用模板 / 政务优化版"
                        />
                      </label>
                      <label className="config-form-row config-form-row-full">
                        <span className="config-form-label">描述</span>
                        <input
                          value={editForm.description}
                          onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                          placeholder="版本用途说明"
                        />
                      </label>
                    </div>

                    <label className="config-form-row config-form-row-full">
                      <span className="config-form-label">System Prompt</span>
                      <textarea
                        className="config-form-textarea"
                        value={editForm.systemPrompt}
                        onChange={(e) => setEditForm({ ...editForm, systemPrompt: e.target.value })}
                        rows={6}
                        placeholder="系统提示词内容"
                      />
                    </label>

                    <label className="config-form-row config-form-row-full">
                      <span className="config-form-label">User Prompt</span>
                      <textarea
                        className="config-form-textarea"
                        value={editForm.userPrompt}
                        onChange={(e) => setEditForm({ ...editForm, userPrompt: e.target.value })}
                        rows={8}
                        placeholder="用户提示词模板，支持 {keyword} {startDate} {endDate} {news} {usertopic}"
                      />
                    </label>

                    <label className="config-form-checkbox">
                      <input
                        type="checkbox"
                        checked={!!editForm.isDefault}
                        onChange={(e) => setEditForm({ ...editForm, isDefault: e.target.checked })}
                      />
                      <span>设为默认版本</span>
                    </label>

                    <div className="config-form-actions">
                      <button
                        type="button"
                        className="config-btn-primary"
                        disabled={saving}
                        onClick={handleSaveKeywordPrompt}
                      >
                        {saving ? '保存中…' : '保存配置'}
                      </button>
                      <button
                        type="button"
                        className="config-btn-secondary"
                        onClick={() => setEditForm({ ...EMPTY_KEYWORD_FORM, keyword: selectedKeyword })}
                      >
                        清空
                      </button>
                    </div>

                    <p className="config-form-tip">
                      保存后，周报生成页会按所选关键词的默认版本读取 Prompt。
                    </p>
                  </div>
                </article>
              </div>
            </div>
          </section>
        )}

        {activeSection === 'policy' && (
          <section className="config-section">
            <header className="config-section-header">
              <div className="config-section-headline">
                <h2 className="config-section-title">政策相关 Prompt</h2>
                <p className="config-section-desc">用于历史周报政策抽取与新旧政策对比的两段提示词。</p>
              </div>
            </header>

            <article className="config-detail-panel kd-panel">
              <div className="config-panel-header">
                <div>
                  <h3 className="config-panel-title">周报抽取提示词</h3>
                  <p className="config-panel-desc">Step 1 · 用于从选定的历史周报中抽取政策信息的 JSON 结构。</p>
                </div>
                <div className="config-section-meta">
                  <span className="data-info">
                    字数 {configData?.policyExtractionPrompt ? configData.policyExtractionPrompt.length : 0}
                  </span>
                  <span className="data-info">
                    Token ~{configData?.policyExtractionPrompt ? estimateTokens(configData.policyExtractionPrompt) : 0}
                  </span>
                </div>
              </div>
              <div className="config-form">
                <textarea
                  className="config-form-textarea config-form-textarea-mono"
                  value={configData?.policyExtractionPrompt || ''}
                  onChange={(e) => setConfigData({ ...configData, policyExtractionPrompt: e.target.value })}
                  rows={10}
                  placeholder="请输入周报抽取提示词…"
                />
                <div className="config-form-actions">
                  <button
                    type="button"
                    className="config-btn-primary"
                    disabled={saving}
                    onClick={() => handleSavePolicyPrompt('extraction', configData.policyExtractionPrompt)}
                  >
                    {saving ? '保存中…' : '保存配置'}
                  </button>
                </div>
              </div>
            </article>

            <article className="config-detail-panel kd-panel">
              <div className="config-panel-header">
                <div>
                  <h3 className="config-panel-title">政策对比提示词</h3>
                  <p className="config-panel-desc">Step 2 · 指导 AI 进行新旧政策对比分析。</p>
                </div>
                <div className="config-section-meta">
                  <span className="data-info">
                    字数 {configData?.policyComparisonPrompt ? configData.policyComparisonPrompt.length : 0}
                  </span>
                  <span className="data-info">
                    Token ~{configData?.policyComparisonPrompt ? estimateTokens(configData.policyComparisonPrompt) : 0}
                  </span>
                </div>
              </div>
              <div className="config-form">
                <textarea
                  className="config-form-textarea config-form-textarea-mono"
                  value={configData?.policyComparisonPrompt || ''}
                  onChange={(e) => setConfigData({ ...configData, policyComparisonPrompt: e.target.value })}
                  rows={15}
                  placeholder="请输入政策对比提示词…"
                />
                <div className="config-form-actions">
                  <button
                    type="button"
                    className="config-btn-primary"
                    disabled={saving}
                    onClick={() => handleSavePolicyPrompt('comparison', configData.policyComparisonPrompt)}
                  >
                    {saving ? '保存中…' : '保存配置'}
                  </button>
                </div>
              </div>
            </article>
          </section>
        )}

        {activeSection === 'regionReport' && (
          <section className="config-section">
            <header className="config-section-header">
              <div className="config-section-headline">
                <h2 className="config-section-title">地区政策报告 Prompt</h2>
                <p className="config-section-desc">维护单地区 / 多地区两套 User Prompt，地区政策报告页将按选区数量自动选用。</p>
              </div>
              <div className="config-section-meta">
                <span className="data-info">版本数：{regionPromptVersions.length}</span>
              </div>
            </header>

            <div className="config-keyword-grid">
              <aside className="config-keyword-sidebar kd-panel">
                <div className="config-panel-header">
                  <h3 className="config-panel-title">已有版本</h3>
                  <button
                    type="button"
                    className="config-btn-ghost"
                    onClick={fetchRegionPromptConfig}
                    disabled={regionPromptLoading}
                  >
                    {regionPromptLoading ? '刷新中…' : '刷新'}
                  </button>
                </div>
                <div className="config-keyword-list">
                  {regionPromptLoading && (
                    <div className="config-list-tip">加载中…</div>
                  )}
                  {!regionPromptLoading && regionPromptVersions.length === 0 && (
                    <div className="config-list-tip">暂无版本，请新增</div>
                  )}
                  {regionPromptVersions.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      className={`config-keyword-item ${regionEditForm.promptId === p.id ? 'active' : ''}`}
                      onClick={() => setRegionEditForm({
                        promptId: p.id,
                        name: p.name,
                        description: p.description || '',
                        systemPrompt: p.systemPrompt || '',
                        userPromptSingle: p.userPromptSingle || '',
                        userPromptMulti: p.userPromptMulti || '',
                        isDefault: !!p.isDefault
                      })}
                    >
                      <span className="config-keyword-item-name">{p.name}</span>
                      {p.isDefault && (
                        <span className="config-version-badge config-version-badge-tight">默认</span>
                      )}
                    </button>
                  ))}
                </div>
              </aside>

              <div className="config-keyword-detail">
                <article className="config-detail-panel kd-panel">
                  <div className="config-panel-header">
                    <h3 className="config-panel-title">版本概览</h3>
                    <button
                      type="button"
                      className="config-btn-secondary"
                      onClick={() => setRegionEditForm({ ...EMPTY_REGION_FORM })}
                    >
                      新建版本
                    </button>
                  </div>
                  <div className="config-version-list">
                    {regionPromptVersions.length === 0 && (
                      <div className="config-empty-block">尚未配置任何版本</div>
                    )}
                    {regionPromptVersions.map(p => (
                      <div
                        key={p.id}
                        className={`config-version-card ${p.isDefault ? 'is-default' : ''}`}
                      >
                        <div className="config-version-header">
                          <div className="config-version-headline">
                            <span className="config-version-name">{p.name}</span>
                            {p.isDefault && <span className="config-version-badge">默认</span>}
                          </div>
                          <div className="config-version-actions">
                            <button
                              type="button"
                              className="config-btn-link"
                              onClick={() => setRegionEditForm({
                                promptId: p.id,
                                name: p.name,
                                description: p.description || '',
                                systemPrompt: p.systemPrompt || '',
                                userPromptSingle: p.userPromptSingle || '',
                                userPromptMulti: p.userPromptMulti || '',
                                isDefault: !!p.isDefault
                              })}
                            >
                              编辑
                            </button>
                            <button
                              type="button"
                              className="config-btn-link danger"
                              disabled={regionDeletingId === p.id}
                              onClick={() => handleDeleteRegionPrompt(p.id)}
                            >
                              {regionDeletingId === p.id ? '删除中…' : '删除'}
                            </button>
                          </div>
                        </div>
                        {p.description && (
                          <p className="config-version-desc">{p.description}</p>
                        )}
                        <div className="config-version-meta">
                          <span>ID</span>
                          <code>{p.id}</code>
                        </div>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="config-detail-panel kd-panel">
                  <div className="config-panel-header">
                    <h3 className="config-panel-title">编辑版本</h3>
                    <span className="config-form-hint">
                      {regionEditForm.promptId ? `编辑 ${regionEditForm.promptId}` : '新建版本'}
                    </span>
                  </div>
                  <div className="config-form">
                    <div className="config-form-grid">
                      <label className="config-form-row">
                        <span className="config-form-label">版本 ID（可选）</span>
                        <input
                          value={regionEditForm.promptId}
                          onChange={(e) => setRegionEditForm({ ...regionEditForm, promptId: e.target.value })}
                          placeholder="如：single-region-default"
                        />
                      </label>
                      <label className="config-form-row">
                        <span className="config-form-label">版本名称</span>
                        <input
                          value={regionEditForm.name}
                          onChange={(e) => setRegionEditForm({ ...regionEditForm, name: e.target.value })}
                          placeholder="如：单地区时间线版"
                        />
                      </label>
                      <label className="config-form-row config-form-row-full">
                        <span className="config-form-label">描述</span>
                        <input
                          value={regionEditForm.description}
                          onChange={(e) => setRegionEditForm({ ...regionEditForm, description: e.target.value })}
                          placeholder="版本用途说明"
                        />
                      </label>
                    </div>

                    <label className="config-form-row config-form-row-full">
                      <span className="config-form-label">System Prompt</span>
                      <textarea
                        className="config-form-textarea"
                        value={regionEditForm.systemPrompt}
                        onChange={(e) => setRegionEditForm({ ...regionEditForm, systemPrompt: e.target.value })}
                        rows={6}
                        placeholder="系统提示词内容"
                      />
                    </label>

                    <label className="config-form-row config-form-row-full">
                      <span className="config-form-label">单地区 User Prompt</span>
                      <textarea
                        className="config-form-textarea"
                        value={regionEditForm.userPromptSingle}
                        onChange={(e) => setRegionEditForm({ ...regionEditForm, userPromptSingle: e.target.value })}
                        rows={8}
                        placeholder="支持 {analysisMode} {startDate} {endDate} {regions} {rawNewsCount} {filteredNewsCount} {excludedNewsCount} {usertopic} {regionBlocks}"
                      />
                    </label>

                    <label className="config-form-row config-form-row-full">
                      <span className="config-form-label">多地区 User Prompt</span>
                      <textarea
                        className="config-form-textarea"
                        value={regionEditForm.userPromptMulti}
                        onChange={(e) => setRegionEditForm({ ...regionEditForm, userPromptMulti: e.target.value })}
                        rows={8}
                        placeholder="支持 {analysisMode} {startDate} {endDate} {regions} {rawNewsCount} {filteredNewsCount} {excludedNewsCount} {usertopic} {regionBlocks}"
                      />
                    </label>

                    <label className="config-form-checkbox">
                      <input
                        type="checkbox"
                        checked={!!regionEditForm.isDefault}
                        onChange={(e) => setRegionEditForm({ ...regionEditForm, isDefault: e.target.checked })}
                      />
                      <span>设为默认版本</span>
                    </label>

                    <div className="config-form-actions">
                      <button
                        type="button"
                        className="config-btn-primary"
                        disabled={regionSaving}
                        onClick={handleSaveRegionPrompt}
                      >
                        {regionSaving ? '保存中…' : '保存配置'}
                      </button>
                      <button
                        type="button"
                        className="config-btn-secondary"
                        onClick={() => setRegionEditForm({ ...EMPTY_REGION_FORM })}
                      >
                        清空
                      </button>
                    </div>

                    <p className="config-form-tip">
                      保存后，地区政策报告页会按所选地区数量自动加载单地区或多地区模板。
                    </p>
                  </div>
                </article>
              </div>
            </div>
          </section>
        )}

        <footer className="config-footer kd-panel">
          <p className="config-footer-info">
            默认提示词存储于 <code>config/prompts.md</code>；关键词提示词存储于 <code>config/keyword-prompts.json</code>；地区政策报告提示词存储于 <code>config/region-policy-report-prompts.json</code>。
          </p>
          <button
            type="button"
            className="config-btn-secondary"
            onClick={() => {
              fetchConfigData();
              fetchKeywordConfig();
              fetchRegionPromptConfig();
            }}
          >
            刷新所有配置
          </button>
        </footer>
      </div>
    </PasswordProtection>
  );
};

export default ReportConfig;
