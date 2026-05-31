import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Save, RefreshCw, Clock3 } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import {
  buildAutoReportDownloadUrl,
  fetchAutoReportConfig,
  fetchAutoReportHistory,
  saveAutoReportConfig,
} from '../api/autoReport';
import './AutoReportConfig.css';

const EMPTY_CONFIG = {
  enabled: false,
  defaults: {
    modelKey: 'deepseek-v4-flash',
    promptId: '',
    minScore: 3,
    summaryVersion: 'short',
  },
  keywords: {},
};

function formatDate(value) {
  if (!value) return '-';
  return String(value).slice(0, 10);
}

function formatDateTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-CN');
}

function statusText(status) {
  return {
    success: '成功',
    error: '失败',
    skipped: '跳过',
    pending: '等待',
  }[status] || status || '-';
}

function summaryVersionText(value) {
  return value === 'full' ? '全文' : '短摘要';
}

function formatNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num.toLocaleString('zh-CN') : '-';
}

export default function AutoReportConfigPage() {
  const { user, authHeaders } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [config, setConfig] = useState(EMPTY_CONFIG);
  const [models, setModels] = useState([]);
  const [promptConfig, setPromptConfig] = useState({});
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('info');
  const [keywordFilter, setKeywordFilter] = useState('');
  const [expandedLogId, setExpandedLogId] = useState(null);

  const headers = useMemo(() => authHeaders(), [authHeaders]);
  const visibleKeywords = useMemo(() => (
    user?.keywords || []
  ), [user?.keywords]);

  const configurableKeywords = useMemo(() => {
    const set = new Set(user?.keywords || []);
    return Array.from(set).filter(Boolean);
  }, [user?.keywords]);

  const enabledKeywordCount = useMemo(() => (
    configurableKeywords.filter(keyword => config.keywords?.[keyword]?.enabled).length
  ), [config.keywords, configurableKeywords]);

  const autoRunEnabled = enabledKeywordCount > 0;

  const sortedHistory = useMemo(() => {
    return [...history].sort((a, b) => {
      const aTime = new Date(a.run_at || a.created_at || 0).getTime();
      const bTime = new Date(b.run_at || b.created_at || 0).getTime();
      if (bTime !== aTime) return bTime - aTime;
      return Number(b.id || 0) - Number(a.id || 0);
    });
  }, [history]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const data = await fetchAutoReportHistory({ page: 1, limit: 50, keyword: keywordFilter }, headers);
      setHistory(data.data || []);
    } catch (error) {
      setMessageType('error');
      setMessage(error.message);
    } finally {
      setHistoryLoading(false);
    }
  }, [headers, keywordFilter]);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const [modelRes, promptRes] = await Promise.all([
          fetch('/api/weekly-report/models', { headers }).then(async (res) => {
            if (!res.ok) throw new Error(`加载模型失败: HTTP ${res.status}`);
            return res.json();
          }),
          fetch('/api/config/keyword-prompts', { headers }).then(async (res) => {
            if (!res.ok) throw new Error(`加载 Prompt 失败: HTTP ${res.status}`);
            return res.json();
          }),
        ]);
        if (!active) return;
        setModels(Array.isArray(modelRes) ? modelRes : []);
        setPromptConfig(promptRes?.keywords || {});

        if (isAdmin) {
          const configRes = await fetchAutoReportConfig(headers);
          if (!active) return;
          setConfig(configRes || EMPTY_CONFIG);
        }
      } catch (error) {
        if (active) {
          setMessageType('error');
          setMessage(error.message);
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [headers, isAdmin]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const updateKeyword = (keyword, key, value) => {
    setConfig(current => ({
      ...current,
      keywords: {
        ...current.keywords,
        [keyword]: {
          modelKey: current.defaults.modelKey,
          promptId: '',
          minScore: current.defaults.minScore,
          summaryVersion: current.defaults.summaryVersion,
          ...(current.keywords?.[keyword] || {}),
          [key]: value,
        },
      },
    }));
  };

  const toggleKeywordEnabled = (keyword) => {
    setConfig(current => {
      const currentItem = current.keywords?.[keyword] || {};
      return {
        ...current,
        keywords: {
          ...current.keywords,
          [keyword]: {
            modelKey: currentItem.modelKey || current.defaults.modelKey,
            promptId: currentItem.promptId || '',
            minScore: currentItem.minScore === '' || currentItem.minScore === undefined ? current.defaults.minScore : currentItem.minScore,
            summaryVersion: currentItem.summaryVersion || current.defaults.summaryVersion,
            enabled: !currentItem.enabled,
          },
        },
      };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      const allowed = new Set(configurableKeywords);
      const prunedKeywords = Object.fromEntries(
        Object.entries(config.keywords || {}).filter(([keyword]) => allowed.has(keyword))
      );
      const hasEnabledKeyword = Object.values(prunedKeywords).some(item => item?.enabled);
      const result = await saveAutoReportConfig({
        ...config,
        enabled: hasEnabledKeyword,
        keywords: prunedKeywords,
      }, headers);
      setConfig(result.config);
      setMessageType('success');
      setMessage('自动周报配置已保存');
    } catch (error) {
      setMessageType('error');
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = async (record) => {
    setMessage('');
    try {
      const response = await fetch(buildAutoReportDownloadUrl(record.id), {
        headers,
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      const blob = await response.blob();
      const filename = record.pdf_filename || `自动周报_${record.keyword}_${formatDate(record.week_end)}.pdf`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setMessageType('error');
      setMessage(error.message);
    }
  };

  return (
    <div className="auto-report-config kd-page">
      <div className="kd-page-header">
        <div>
          <h1 className="kd-page-title">自动周报</h1>
          <p className="kd-page-subtitle">
            每周日上午 5:00 自动生成上周日到本周六的新闻周报，并保存带联系方式 PDF。
          </p>
        </div>
        <div className="arc-header-actions">
          {isAdmin && (
            <div className={`arc-status-card ${autoRunEnabled ? 'enabled' : 'disabled'}`}>
              <span>{autoRunEnabled ? '自动运行已启用' : '自动运行未启用'}</span>
              <strong><Clock3 size={15} /> 每周日 05:00</strong>
              <small>{autoRunEnabled ? `已启用 ${enabledKeywordCount} 个关键词` : '启用关键词后生效'}</small>
            </div>
          )}
        </div>
      </div>

      {message && <div className={`arc-message ${messageType === 'error' ? 'error' : 'success'}`}>{message}</div>}

      {isAdmin && (
        <section className="kd-panel arc-admin-panel">
          <div className="kd-panel-header">
            <div>
              <h2>自动运行设置</h2>
              <p>先打开关键词的自动运行开关，再设置模型、Prompt、最低分和摘要版本。</p>
            </div>
          </div>

          <div className="arc-keyword-table-wrap">
            <table className="arc-table arc-config-table">
              <thead>
                <tr>
                  <th>自动运行</th>
                  <th>关键词</th>
                  <th>模型</th>
                  <th>Prompt</th>
                  <th>最低分</th>
                  <th>内容</th>
                </tr>
              </thead>
              <tbody>
                {configurableKeywords.map(keyword => {
                  const item = config.keywords?.[keyword] || {};
                  const enabled = !!item.enabled;
                  const prompts = promptConfig?.[keyword]?.prompts || [];
                  return (
                    <tr key={keyword} className={enabled ? 'arc-row-enabled' : 'arc-row-disabled'}>
                      <td>
                        <label className={`arc-enable-switch ${enabled ? 'enabled' : 'disabled'}`}>
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={() => toggleKeywordEnabled(keyword)}
                            aria-label={`${enabled ? '停用' : '启用'}${keyword}自动周报`}
                          />
                          <span aria-hidden="true" />
                          <em>{enabled ? '已启用' : '未启用'}</em>
                        </label>
                      </td>
                      <td>
                        <span className={`arc-keyword-name ${enabled ? 'enabled' : 'disabled'}`}>{keyword}</span>
                      </td>
                      <td>
                        <select value={item.modelKey || config.defaults.modelKey} onChange={event => updateKeyword(keyword, 'modelKey', event.target.value)}>
                          {models.map(model => <option key={model.key} value={model.key}>{model.label || model.model}</option>)}
                        </select>
                      </td>
                      <td>
                        <select value={item.promptId || ''} onChange={event => updateKeyword(keyword, 'promptId', event.target.value)}>
                          <option value="">默认 Prompt</option>
                          {prompts.map(prompt => <option key={prompt.id} value={prompt.id}>{prompt.name || prompt.id}</option>)}
                        </select>
                      </td>
                      <td>
                        <input type="number" min="0" max="5" step="0.1" value={item.minScore ?? config.defaults.minScore} onChange={event => updateKeyword(keyword, 'minScore', Number(event.target.value))} />
                      </td>
                      <td>
                        <select value={item.summaryVersion || config.defaults.summaryVersion} onChange={event => updateKeyword(keyword, 'summaryVersion', event.target.value)}>
                          <option value="short">短摘要</option>
                          <option value="full">全文</option>
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="arc-actions">
            <button type="button" className="arc-primary-btn" onClick={handleSave} disabled={saving || loading}>
              <Save size={16} />
              {saving ? '保存中' : '保存配置'}
            </button>
            <span className="arc-status">启用至少一个关键词并保存后，系统会在每周日 05:00 自动运行。</span>
          </div>
        </section>
      )}

      <section className="kd-panel">
        <div className="kd-panel-header arc-history-header">
          <div>
            <h2>下载日志</h2>
            <p>只显示当前用户有关键词权限的自动周报，可检查运行参数和 PDF。</p>
          </div>
          <div className="arc-history-controls">
            <select value={keywordFilter} onChange={event => setKeywordFilter(event.target.value)}>
              <option value="">全部关键词</option>
              {visibleKeywords.map(keyword => <option key={keyword} value={keyword}>{keyword}</option>)}
            </select>
            <button type="button" className="arc-icon-btn" onClick={loadHistory} disabled={historyLoading}>
              <RefreshCw size={16} />
              刷新日志
            </button>
          </div>
        </div>

        <div className="arc-keyword-table-wrap">
          <table className="arc-table">
            <thead>
              <tr>
                <th>关键词</th>
                <th>周期</th>
                <th>状态</th>
                <th>参数</th>
                <th>新闻数</th>
                <th>字数</th>
                <th>模型</th>
                <th>PDF</th>
                <th>运行时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {sortedHistory.length === 0 && (
                <tr>
                  <td colSpan="10" className="arc-empty">{historyLoading ? '加载中...' : '暂无自动周报记录'}</td>
                </tr>
              )}
              {sortedHistory.map(record => (
                <React.Fragment key={record.id}>
                  <tr>
                    <td>{record.keyword}</td>
                    <td>{formatDate(record.week_start)} - {formatDate(record.week_end)}</td>
                    <td>{statusText(record.status)}</td>
                    <td>
                      <button
                        type="button"
                        className="arc-link-btn"
                        onClick={() => setExpandedLogId(expandedLogId === record.id ? null : record.id)}
                      >
                        {Number(record.min_score) ? `${record.min_score}分以上` : '查看参数'}
                      </button>
                    </td>
                    <td>{record.news_count || 0}</td>
                    <td>{formatNumber(record.source_word_count)}</td>
                    <td>{record.model_used || '-'}</td>
                    <td>{statusText(record.pdf_status)}</td>
                    <td>{formatDateTime(record.run_at)}</td>
                    <td>
                      <button
                        type="button"
                        className="arc-download-btn"
                        disabled={record.pdf_status !== 'success'}
                        onClick={() => handleDownload(record)}
                      >
                        <Download size={15} />
                        下载
                      </button>
                    </td>
                  </tr>
                  {expandedLogId === record.id && (
                    <tr className="arc-log-detail-row">
                      <td colSpan="10">
                        <div className="arc-log-detail">
                          <span><strong>触发方式</strong>{record.trigger_type || '-'}</span>
                          <span><strong>模型 Key</strong>{record.model_key || '-'}</span>
                          <span><strong>Prompt</strong>{record.prompt_name || record.prompt_id || '默认 Prompt'}</span>
                          <span><strong>最低分</strong>{record.min_score ?? '-'}</span>
                          <span><strong>摘要版本</strong>{summaryVersionText(record.summary_version)}</span>
                          <span><strong>入选新闻</strong>{formatNumber(record.news_count)} 条</span>
                          <span><strong>素材字数</strong>{formatNumber(record.source_word_count)} 字</span>
                          <span><strong>Prompt字符</strong>{formatNumber(record.prompt_char_count)}</span>
                          <span><strong>耗时</strong>{formatNumber(record.duration_ms)} ms</span>
                          <span><strong>PDF文件</strong>{record.pdf_filename || '-'}</span>
                          {(record.error_message || record.pdf_error_message) && (
                            <span className="arc-log-error"><strong>错误</strong>{record.error_message || record.pdf_error_message}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
