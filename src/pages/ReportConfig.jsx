import React, { useState, useEffect, useRef } from 'react';
import PasswordProtection from '../components/PasswordProtection';
import { useAuth } from '../auth/AuthContext';
import './ReportConfig.css';

const CONFIG_SECTIONS = [
  { key: 'keyword', label: '关键词 Prompt' },
  { key: 'policy', label: '政策相关 Prompt' },
  { key: 'regionReport', label: '地区政策报告 Prompt' },
  { key: 'runtime', label: '运行时配置' }
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

const responseError = async (response, fallback) => {
  const data = await response.json().catch(() => ({}));
  return new Error(data.error || data.details || `${fallback}（HTTP ${response.status}）`);
};

const ReportConfig = () => {
  const { authHeaders } = useAuth();
  const importFileRef = useRef(null);
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

  const [runtimeStatus, setRuntimeStatus] = useState(null);
  const [runtimeLoading, setRuntimeLoading] = useState(false);
  const [runtimeMessage, setRuntimeMessage] = useState('');
  const [importingBundle, setImportingBundle] = useState(false);
  const [resettingFile, setResettingFile] = useState('');
  const [resettingEntry, setResettingEntry] = useState('');
  const [versionsTick, setVersionsTick] = useState(0);

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
  }, [selectedKeyword, versionsTick]);

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
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(body)
      });
      if (r.status === 401 || r.status === 403) {
        alert('保存失败：需要 admin 登录状态（请先以 admin 账号登录后再修改配置）');
        return;
      }
      if (!r.ok) throw await responseError(r, '保存关键词 Prompt 失败');
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
      // 保存返回值不含 source 字段，重拉当前关键词列表避免「已自定义」徽标丢失/状态过期
      setVersionsTick((t) => t + 1);
    } catch (e) {
      alert('保存失败: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteKeywordPrompt = async (promptId) => {
    setDeletingId(promptId);
    try {
      const r = await fetch(
        `/api/config/keyword-prompts/${encodeURIComponent(selectedKeyword)}/${encodeURIComponent(promptId)}`,
        { method: 'DELETE', headers: { ...authHeaders() } }
      );
      if (r.status === 401 || r.status === 403) {
        alert('删除失败：需要 admin 登录状态');
        return;
      }
      if (!r.ok) throw await responseError(r, '删除关键词 Prompt 失败');
      setPromptVersions(promptVersions.filter(x => x.id !== promptId));
      fetchKeywordConfig();
    } catch (e) {
      alert('删除失败: ' + e.message);
    } finally {
      setDeletingId('');
    }
  };

  const handleSavePolicyPrompt = async (type, prompt) => {
    setSaving(true);
    try {
      const r = await fetch('/api/config/policy-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ prompt, type })
      });
      if (r.status === 401 || r.status === 403) {
        alert('保存失败：需要 admin 登录状态');
        return;
      }
      if (!r.ok) throw await responseError(r, '保存政策 Prompt 失败');
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
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(body)
      });
      if (r.status === 401 || r.status === 403) {
        alert('保存失败：需要 admin 登录状态');
        return;
      }
      if (!r.ok) throw await responseError(r, '保存地区政策报告 Prompt 失败');
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
    } catch (e) {
      alert('保存失败: ' + e.message);
    } finally {
      setRegionSaving(false);
    }
  };

  const handleDeleteRegionPrompt = async (promptId) => {
    setRegionDeletingId(promptId);
    try {
      const r = await fetch(
        `/api/config/region-policy-report-prompts/${encodeURIComponent(promptId)}`,
        { method: 'DELETE', headers: { ...authHeaders() } }
      );
      if (r.status === 401 || r.status === 403) {
        alert('删除失败：需要 admin 登录状态');
        return;
      }
      if (!r.ok) throw await responseError(r, '删除地区政策报告 Prompt 失败');
      setRegionPromptVersions(regionPromptVersions.filter(item => item.id !== promptId));
      if (regionEditForm.promptId === promptId) {
        setRegionEditForm({ ...EMPTY_REGION_FORM });
      }
    } catch (e) {
      alert('删除失败: ' + e.message);
    } finally {
      setRegionDeletingId('');
    }
  };

  // ===== 运行时配置（默认层 + 运行时层）=====

  const fetchRuntimeStatus = async () => {
    setRuntimeLoading(true);
    setRuntimeMessage('');
    try {
      const r = await fetch('/api/config/runtime-status', { headers: { ...authHeaders() } });
      if (r.ok) {
        setRuntimeStatus(await r.json());
      } else {
        setRuntimeMessage('获取运行时配置状态失败（需要 admin 登录状态）');
      }
    } catch {
      setRuntimeMessage('获取运行时配置状态失败');
    } finally {
      setRuntimeLoading(false);
    }
  };

  useEffect(() => {
    if (activeSection === 'runtime' && !runtimeStatus && !runtimeLoading) {
      fetchRuntimeStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection]);

  const handleExportBundle = async () => {
    setRuntimeMessage('');
    try {
      const r = await fetch('/api/config/prompt-export', { headers: { ...authHeaders() } });
      if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? '需要 admin 登录状态' : `HTTP ${r.status}`);
      const bundle = await r.json();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `prompt-runtime-bundle-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setRuntimeMessage('导出失败: ' + e.message);
    }
  };

  const handleImportBundle = async (file) => {
    if (!file) return;
    setImportingBundle(true);
    setRuntimeMessage('');
    try {
      const bundle = JSON.parse(await file.text());
      const previewResponse = await fetch('/api/config/prompt-import?dryRun=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(bundle)
      });
      const preview = await previewResponse.json().catch(() => ({}));
      if (!previewResponse.ok) throw new Error(preview.error || preview.details || `HTTP ${previewResponse.status}`);
      const previewFiles = preview.files || [];
      if (!previewFiles.length) {
        setRuntimeMessage('导入包中没有可导入的 Prompt 覆盖');
        return;
      }
      if (!window.confirm(`将导入以下 Prompt 运行时覆盖：\n${previewFiles.join('\n')}\n\n是否继续？`)) return;

      const r = await fetch('/api/config/prompt-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(bundle)
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || data.details || `HTTP ${r.status}`);
      setRuntimeMessage(`导入成功：${(data.imported || []).join('、') || '没有需要导入的文件'}`);
      fetchRuntimeStatus();
      fetchKeywordConfig();
      fetchRegionPromptConfig();
      fetchConfigData();
      setVersionsTick((t) => t + 1);
    } catch (e) {
      setRuntimeMessage('导入失败: ' + e.message);
    } finally {
      setImportingBundle(false);
      if (importFileRef.current) importFileRef.current.value = '';
    }
  };

  const handleResetDefault = async (file) => {
    if (!window.confirm(`确定要恢复「${file}」的出厂默认吗？该文件在运行时层的自定义内容将被删除。`)) return;
    setResettingFile(file);
    setRuntimeMessage('');
    try {
      const r = await fetch('/api/config/reset-default', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ file })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || data.details || `HTTP ${r.status}`);
      setRuntimeMessage(`已恢复默认：${(data.reset || []).join('、') || '该文件本就没有运行时覆盖'}`);
      fetchRuntimeStatus();
      fetchKeywordConfig();
      fetchRegionPromptConfig();
      fetchConfigData();
      setVersionsTick((t) => t + 1);
    } catch (e) {
      setRuntimeMessage('恢复默认失败: ' + e.message);
    } finally {
      setResettingFile('');
    }
  };

  // 条目级恢复默认：只清除该条目的运行时层覆盖，不影响其他生产定制
  const handleResetEntry = async (file, keyword, promptId) => {
    if (!window.confirm(`恢复该条目的出厂默认？「${keyword || promptId} / ${promptId}」的运行时层自定义将被清除，其他条目不受影响。`)) return;
    const entryKey = `${keyword || ''}::${promptId}`;
    setResettingEntry(entryKey);
    try {
      const r = await fetch('/api/config/reset-default', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ file, keyword, promptId })
      });
      const data = await r.json().catch(() => ({}));
      if (r.status === 401 || r.status === 403) {
        alert('恢复默认失败：需要 admin 登录状态');
        return;
      }
      if (!r.ok) throw new Error(data.error || data.details || `HTTP ${r.status}`);
      if (file === 'keyword-prompts.json') {
        setVersionsTick((t) => t + 1);
        fetchKeywordConfig();
      } else {
        fetchRegionPromptConfig();
      }
      fetchConfigData();
    } catch (e) {
      alert('恢复默认失败: ' + e.message);
    } finally {
      setResettingEntry('');
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
                            {p.source === 'runtime' && <span className="config-version-badge config-version-badge-runtime">已自定义</span>}
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
                            {p.source === 'runtime' && (
                              <button
                                type="button"
                                className="config-btn-link"
                                disabled={resettingEntry === `${selectedKeyword}::${p.id}`}
                                onClick={() => handleResetEntry('keyword-prompts.json', selectedKeyword, p.id)}
                              >
                                {resettingEntry === `${selectedKeyword}::${p.id}` ? '恢复中…' : '恢复默认'}
                              </button>
                            )}
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
                      {p.source === 'runtime' && (
                        <span className="config-version-badge config-version-badge-tight config-version-badge-runtime">自定义</span>
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
                            {p.source === 'runtime' && <span className="config-version-badge config-version-badge-runtime">已自定义</span>}
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
                            {p.source === 'runtime' && (
                              <button
                                type="button"
                                className="config-btn-link"
                                disabled={resettingEntry === `::${p.id}`}
                                onClick={() => handleResetEntry('region-policy-report-prompts.json', null, p.id)}
                              >
                                {resettingEntry === `::${p.id}` ? '恢复中…' : '恢复默认'}
                              </button>
                            )}
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

        {activeSection === 'runtime' && (
          <section className="config-section">
            <header className="config-section-header">
              <div className="config-section-headline">
                <h2 className="config-section-title">运行时配置</h2>
                <p className="config-section-desc">
                  在本页保存的修改只写入 <code>config/runtime/</code> 运行时层，代码部署不会覆盖；
                  Prompt 和模型/自动周报覆盖可恢复出厂默认；用户账号由“用户管理”页维护，不在此处重置。
                </p>
              </div>
              <div className="config-section-meta">
                <button type="button" className="config-btn-ghost" onClick={fetchRuntimeStatus} disabled={runtimeLoading}>
                  {runtimeLoading ? '刷新中…' : '刷新状态'}
                </button>
              </div>
            </header>

            <div className="config-detail-panel kd-panel">
              <div className="config-panel-header">
                <h3 className="config-panel-title">配置文件覆盖状态</h3>
                <div className="config-panel-header-actions" style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="config-btn-secondary" onClick={handleExportBundle}>
                    导出 Prompt 包
                  </button>
                  <button
                    type="button"
                    className="config-btn-secondary"
                    disabled={importingBundle}
                    onClick={() => importFileRef.current && importFileRef.current.click()}
                  >
                    {importingBundle ? '导入中…' : '导入 Prompt 包'}
                  </button>
                  <input
                    ref={importFileRef}
                    type="file"
                    accept="application/json"
                    style={{ display: 'none' }}
                    onChange={(e) => handleImportBundle(e.target.files && e.target.files[0])}
                  />
                </div>
              </div>

              {runtimeMessage && <p className="config-form-tip">{runtimeMessage}</p>}

              <div className="config-version-list">
                {(!runtimeStatus || !(runtimeStatus.files || []).length) && !runtimeLoading && (
                  <div className="config-empty-block">暂无状态数据</div>
                )}
                {(runtimeStatus ? runtimeStatus.files : []).map(f => (
                  <div key={f.name} className={`config-version-card ${f.overridden ? 'is-default' : ''}`}>
                    <div className="config-version-header">
                      <div className="config-version-headline">
                        <span className="config-version-name">{f.label || f.name}</span>
                        {f.overridden ? (
                          <span className="config-version-badge config-version-badge-runtime">运行时已自定义</span>
                        ) : (
                          <span className="config-version-badge">默认</span>
                        )}
                      </div>
                      <div className="config-version-actions">
                        {f.name === 'users.json' ? (
                          <span className="config-version-badge">用户管理页维护</span>
                        ) : (
                          <button
                            type="button"
                            className="config-btn-link danger"
                            disabled={!f.overridden || resettingFile === f.name}
                            onClick={() => handleResetDefault(f.name)}
                          >
                            {resettingFile === f.name ? '恢复中…' : '恢复默认'}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="config-version-meta">
                      <span><code>{f.name}</code></span>
                      {f.type === 'json' && f.promptCount !== undefined && (
                        <span>Prompt 条目 {f.promptCount} 条{f.runtimeOverrideCount ? `（自定义 ${f.runtimeOverrideCount}）` : ''}{f.deletedCount ? `（墓碑 ${f.deletedCount}）` : ''}</span>
                      )}
                      {f.overridden && f.runtimeLastModified && (
                        <span>最近修改 {new Date(f.runtimeLastModified).toLocaleString('zh-CN')}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        <footer className="config-footer kd-panel">
          <p className="config-footer-info">
            出厂默认存于 <code>config/</code>（随代码部署）；生产端自定义存于 <code>config/runtime/</code>（部署永不覆盖）。
            导出「Prompt 包」只包含 Prompt 覆盖，不包含用户密码、自动周报或模型配置。
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
