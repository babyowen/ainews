import React, { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CopyPlus,
  FileDown,
  FileSearch,
  Globe,
  Landmark,
  Loader2,
  MapPinned,
  RefreshCcw,
  Sparkles,
  Building2,
  Building,
} from 'lucide-react';
import './RegionPolicyReport.css';

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const getDefaultDateRange = () => {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return {
    startDate: formatDate(start),
    endDate: formatDate(end),
  };
};

const buildSelectionKey = (item) => `${item.level}::${item.name}`;

const getSelectionLabel = (item) => (item.level === 'provincial' ? `${item.name}（省级）` : item.name);

const serializeSelection = (item) => buildSelectionKey(item);

const RegionPolicyReport = () => {
  const [regionTree, setRegionTree] = useState({ national: null, provinces: {}, municipalities: {} });
  const [expandedProvinces, setExpandedProvinces] = useState(new Set(['江苏省']));
  const [selectedRegions, setSelectedRegions] = useState([]);
  const [dateRange, setDateRange] = useState(getDefaultDateRange());
  const [promptOptions, setPromptOptions] = useState([]);
  const [selectedPromptId, setSelectedPromptId] = useState('');
  const [promptTouched, setPromptTouched] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [manualOverrides, setManualOverrides] = useState({});
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [reportSnapshot, setReportSnapshot] = useState(null);
  const [generateError, setGenerateError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [promptEditorSaving, setPromptEditorSaving] = useState(false);
  const [promptEditorDeleting, setPromptEditorDeleting] = useState(false);
  const [promptEditorError, setPromptEditorError] = useState('');
  const [promptEditorForm, setPromptEditorForm] = useState({
    promptId: '',
    name: '',
    description: '',
    systemPrompt: '',
    userPromptSingle: '',
    userPromptMulti: '',
    isDefault: false,
  });

  const { startDate, endDate } = dateRange;

  const fetchRegionTree = async () => {
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      const res = await fetch(`/api/policy/regions?${params.toString()}`);
      if (!res.ok) throw new Error('获取地区列表失败');
      const data = await res.json();
      setRegionTree(data);
    } catch (error) {
      setPreviewError(error.message);
    }
  };

  const fetchPromptOptions = async () => {
    try {
      const res = await fetch('/api/policy/region-report/prompts');
      if (!res.ok) throw new Error('获取 Prompt 版本失败');
      const data = await res.json();
      setPromptOptions(Array.isArray(data) ? data : []);
    } catch (error) {
      setPreviewError(error.message);
    }
  };

  const openPromptEditor = (prompt = null) => {
    const nextPrompt = prompt || selectedPrompt;
    setPromptEditorError('');
    setPromptEditorForm({
      promptId: nextPrompt?.id || '',
      name: nextPrompt?.name || '',
      description: nextPrompt?.description || '',
      systemPrompt: nextPrompt?.systemPrompt || '',
      userPromptSingle: nextPrompt?.userPromptSingle || '',
      userPromptMulti: nextPrompt?.userPromptMulti || '',
      isDefault: !!nextPrompt?.isDefault,
    });
    setShowPromptEditor(true);
  };

  const resetPromptEditorForm = () => {
    setPromptEditorError('');
    setPromptEditorForm({
      promptId: '',
      name: '',
      description: '',
      systemPrompt: '',
      userPromptSingle: '',
      userPromptMulti: '',
      isDefault: false,
    });
  };

  const duplicatePromptEditorForm = () => {
    setPromptEditorError('');
    setPromptEditorForm((prev) => ({
      ...prev,
      promptId: '',
      name: prev.name ? `${prev.name}（副本）` : '',
      isDefault: false,
    }));
  };

  useEffect(() => {
    fetchRegionTree();
    fetchPromptOptions();
  }, []);

  useEffect(() => {
    fetchRegionTree();
  }, [startDate, endDate]);

  useEffect(() => {
    if (promptOptions.length === 0) return;
    if (selectedPromptId && promptTouched) return;

    const recommendedId = selectedRegions.length <= 1 ? 'single-region-default' : 'multi-region-default';
    const recommendedPrompt = promptOptions.find((item) => item.id === recommendedId)
      || promptOptions.find((item) => item.isDefault)
      || promptOptions[0];

    if (recommendedPrompt) {
      setSelectedPromptId(recommendedPrompt.id);
    }
  }, [selectedRegions.length, promptOptions, selectedPromptId, promptTouched]);

  useEffect(() => {
    setPreviewData(null);
    setManualOverrides({});
    setReportData(null);
    setReportSnapshot(null);
    setPreviewError('');
    setGenerateError('');
  }, [startDate, endDate, selectedRegions]);

  const toggleProvince = (provinceName) => {
    setExpandedProvinces((prev) => {
      const next = new Set(prev);
      if (next.has(provinceName)) {
        next.delete(provinceName);
      } else {
        next.add(provinceName);
      }
      return next;
    });
  };

  const toggleSelection = (item) => {
    const normalized = {
      ...item,
      label: item.label || getSelectionLabel(item),
    };

    setSelectedRegions((prev) => {
      const key = buildSelectionKey(normalized);
      const exists = prev.some((entry) => buildSelectionKey(entry) === key);
      if (exists) {
        return prev.filter((entry) => buildSelectionKey(entry) !== key);
      }
      return [...prev, normalized];
    });
    setPromptTouched(false);
  };

  const clearSelections = () => {
    setSelectedRegions([]);
    setPromptTouched(false);
    setPreviewData(null);
    setReportData(null);
    setGenerateError('');
    setPreviewError('');
  };

  const isSelected = (item) => selectedRegions.some((entry) => buildSelectionKey(entry) === buildSelectionKey(item));

  const canPreview = startDate && endDate && selectedRegions.length > 0;

  const handlePreview = async () => {
    if (!canPreview) {
      setPreviewError('请选择日期区间和至少一个地区');
      return;
    }

    if (new Date(startDate) > new Date(endDate)) {
      setPreviewError('开始日期不能晚于结束日期');
      return;
    }

    setPreviewLoading(true);
    setPreviewError('');
    setGenerateError('');
    setReportData(null);
    setManualOverrides({});
    try {
      const params = new URLSearchParams({
        startDate,
        endDate,
      });
      selectedRegions.forEach((item) => params.append('regions', serializeSelection(item)));
      const res = await fetch(`/api/policy/region-report/news?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '获取预览数据失败');
      setPreviewData(data);
    } catch (error) {
      setPreviewError(error.message);
      setPreviewData(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!previewData) {
      setGenerateError('请先加载新闻预览');
      return;
    }
    if (!selectedPromptId) {
      setGenerateError('请选择 Prompt 版本');
      return;
    }
    if (effectiveFilteredNewsCount === 0) {
      setGenerateError('当前筛选范围无可分析政策新闻');
      return;
    }

    setGenerating(true);
    setGenerateError('');
    try {
      const res = await fetch('/api/policy/region-report/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate,
          endDate,
          regions: selectedRegions,
          promptId: selectedPromptId,
          manualOverrides,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.details || '生成报告失败');
      setReportData(data);
      setReportSnapshot({
        overrideSignature: manualOverridesSignature,
        newsReferences: effectivePreviewRows
          .filter((row) => row.includedInAnalysis)
          .map((row) => ({
            id: row.id,
            title: row.title,
            source: row.source,
            date: formatDate(row.fetchdate),
            region: row.region,
          })),
      });
    } catch (error) {
      setGenerateError(error.message);
      setReportData(null);
      setReportSnapshot(null);
    } finally {
      setGenerating(false);
    }
  };

  const handleOverrideToggle = (row, checked) => {
    setManualOverrides((prev) => {
      if (checked === row.includedInAnalysis) {
        const next = { ...prev };
        delete next[String(row.id)];
        return next;
      }
      return {
        ...prev,
        [String(row.id)]: checked,
      };
    });
  };

  const handleExportPdf = async () => {
    if (!canExportPdf) return;

    setExporting(true);
    try {
      const response = await fetch('/api/policy/region-report/export-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: selectedRegions.length === 1
            ? `${selectedRegions[0].label}地区政策报告`
            : '地区政策对比报告',
          startDate,
          endDate,
          regions: selectedRegions.map((item) => item.label),
          promptVersionName: reportData.meta?.promptVersion,
          modelName: reportData.meta?.modelName,
          rawNewsCount: reportData.meta?.rawNewsCount,
          filteredNewsCount: reportData.meta?.filteredNewsCount,
          excludedNewsCount: reportData.meta?.excludedNewsCount,
          reportContent: reportData.reportContent,
          newsReferences: reportSnapshot?.newsReferences || [],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || '导出 PDF 失败');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${selectedRegions.length === 1 ? selectedRegions[0].label : '地区政策报告'}_${startDate}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      setGenerateError(error.message);
    } finally {
      setExporting(false);
    }
  };

  const renderRegionTree = () => {
    const { national, provinces, municipalities = {} } = regionTree;

    return (
      <div className="rr-region-tree">
        {national && national.count > 0 && (
          <button
            type="button"
            className={`rr-region-item ${isSelected({ name: '全国', level: 'national' }) ? 'selected' : ''}`}
            onClick={() => toggleSelection({ name: '全国', level: 'national' })}
          >
            <Globe size={16} />
            <span className="rr-region-name">全国</span>
            <span className="rr-region-count">{national.count}条</span>
          </button>
        )}

        {Object.entries(municipalities)
          .sort((a, b) => b[1].count - a[1].count)
          .map(([name, data]) => {
            const item = { name, level: 'municipality' };
            return (
              <button
                key={name}
                type="button"
                className={`rr-region-item ${isSelected(item) ? 'selected' : ''}`}
                onClick={() => toggleSelection(item)}
              >
                <Landmark size={16} />
                <span className="rr-region-name">{name}</span>
                <span className="rr-region-count">{data.count}条</span>
              </button>
            );
          })}

        {Object.entries(provinces)
          .sort((a, b) => b[1].count - a[1].count)
          .map(([name, data]) => {
            const provinceItem = { name, level: 'province' };
            const hasChildren = Array.isArray(data.children) && data.children.length > 0;
            const isExpanded = expandedProvinces.has(name);

            return (
              <div key={name} className="rr-province-group">
                <div className="rr-province-row">
                  <button
                    type="button"
                    className="rr-expand-btn"
                    onClick={() => hasChildren && toggleProvince(name)}
                  >
                    {hasChildren ? (isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : <Building2 size={14} />}
                  </button>
                  <button
                    type="button"
                    className={`rr-region-item rr-region-item-province ${isSelected(provinceItem) ? 'selected' : ''}`}
                    onClick={() => toggleSelection(provinceItem)}
                  >
                    <span className="rr-region-name">{name}</span>
                    <span className="rr-region-count">{data.count}条</span>
                  </button>
                </div>

                {isExpanded && hasChildren && (
                  <div className="rr-city-list">
                    {data.children
                      .sort((a, b) => {
                        if (a.type === 'provincial') return -1;
                        if (b.type === 'provincial') return 1;
                        return b.count - a.count;
                      })
                      .map((child) => {
                        const childItem = {
                          name: child.type === 'provincial' ? name : child.name,
                          level: child.type === 'provincial' ? 'provincial' : 'city',
                        };
                        return (
                          <button
                            key={`${name}-${child.name}-${child.type}`}
                            type="button"
                            className={`rr-region-item rr-region-item-city ${isSelected(childItem) ? 'selected' : ''}`}
                            onClick={() => toggleSelection(childItem)}
                          >
                            {child.type === 'provincial' ? <Building2 size={14} /> : <Building size={14} />}
                            <span className="rr-region-name">
                              {child.type === 'provincial' ? '省级' : child.name}
                            </span>
                            <span className="rr-region-count">{child.count}条</span>
                          </button>
                        );
                      })}
                  </div>
                )}
              </div>
            );
          })}
      </div>
    );
  };

  const promptSummary = useMemo(() => {
    if (!selectedPromptId) return '';
    return promptOptions.find((item) => item.id === selectedPromptId)?.description || '';
  }, [promptOptions, selectedPromptId]);

  const selectedPrompt = useMemo(
    () => promptOptions.find((item) => item.id === selectedPromptId) || null,
    [promptOptions, selectedPromptId]
  );

  const activePromptMode = selectedRegions.length <= 1 ? 'single' : 'multi';

  const promptPreview = useMemo(() => {
    if (!selectedPrompt) return null;
    return {
      systemPrompt: selectedPrompt.systemPrompt || '',
      userPrompt: activePromptMode === 'single'
        ? (selectedPrompt.userPromptSingle || '')
        : (selectedPrompt.userPromptMulti || ''),
    };
  }, [selectedPrompt, activePromptMode]);

  const effectivePreviewRows = useMemo(() => {
    if (!previewData?.rows) return [];
    return previewData.rows.map((row) => {
      const overrideValue = manualOverrides[String(row.id)];
      if (typeof overrideValue !== 'boolean') {
        return row;
      }
      return {
        ...row,
        includedInAnalysis: overrideValue,
        filterReason: overrideValue ? '人工纳入' : '人工排除',
        filterSource: 'manual',
      };
    });
  }, [previewData, manualOverrides]);

  const effectiveFilteredNewsCount = useMemo(
    () => effectivePreviewRows.filter((row) => row.includedInAnalysis).length,
    [effectivePreviewRows]
  );

  const effectiveExcludedNewsCount = useMemo(
    () => effectivePreviewRows.length - effectiveFilteredNewsCount,
    [effectivePreviewRows, effectiveFilteredNewsCount]
  );

  const manualOverridesSignature = useMemo(() => {
    const normalized = Object.keys(manualOverrides)
      .sort()
      .reduce((acc, key) => {
        acc[key] = manualOverrides[key];
        return acc;
      }, {});
    return JSON.stringify(normalized);
  }, [manualOverrides]);

  const includedNewsReferences = useMemo(
    () => effectivePreviewRows
      .filter((row) => row.includedInAnalysis)
      .map((row) => ({
        id: row.id,
        title: row.title,
        source: row.source,
        date: formatDate(row.fetchdate),
        region: row.region,
      })),
    [effectivePreviewRows]
  );

  const canGenerate = !!previewData && !!selectedPromptId && effectiveFilteredNewsCount > 0 && !generating;
  const isReportOutdated = !!reportData && reportSnapshot?.overrideSignature !== manualOverridesSignature;
  const canExportPdf = !!reportData?.reportContent && !exporting && !isReportOutdated;

  const savePromptEditor = async () => {
    const body = {
      promptId: (promptEditorForm.promptId || '').trim(),
      name: (promptEditorForm.name || '').trim(),
      description: (promptEditorForm.description || '').trim(),
      systemPrompt: promptEditorForm.systemPrompt || '',
      userPromptSingle: promptEditorForm.userPromptSingle || '',
      userPromptMulti: promptEditorForm.userPromptMulti || '',
      isDefault: !!promptEditorForm.isDefault,
    };

    if (!body.name || !body.description || !body.systemPrompt || !body.userPromptSingle || !body.userPromptMulti) {
      setPromptEditorError('请完整填写版本名称、描述、System Prompt、单地区 User Prompt、多地区 User Prompt。');
      return;
    }

    setPromptEditorSaving(true);
    setPromptEditorError('');
    try {
      const res = await fetch('/api/config/region-policy-report-prompts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '保存 Prompt 配置失败');
      }

      await fetchPromptOptions();
      setSelectedPromptId(data.prompt.id);
      setPromptTouched(true);
      setShowPromptEditor(false);
    } catch (error) {
      setPromptEditorError(error.message);
    } finally {
      setPromptEditorSaving(false);
    }
  };

  const deletePromptEditor = async () => {
    const promptId = (promptEditorForm.promptId || '').trim();
    if (!promptId) {
      setPromptEditorError('当前是未保存的新版本草稿，无法删除。');
      return;
    }

    if (!window.confirm(`确认删除 Prompt 版本“${promptEditorForm.name || promptId}”吗？`)) {
      return;
    }

    setPromptEditorDeleting(true);
    setPromptEditorError('');
    try {
      const res = await fetch(`/api/config/region-policy-report-prompts/${encodeURIComponent(promptId)}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || '删除 Prompt 版本失败');
      }

      const remaining = promptOptions.filter((item) => item.id !== promptId);
      await fetchPromptOptions();

      const fallbackPrompt = remaining.find((item) => item.isDefault) || remaining[0] || null;
      setSelectedPromptId(fallbackPrompt?.id || '');
      setPromptTouched(false);
      if (fallbackPrompt) {
        openPromptEditor(fallbackPrompt);
      } else {
        resetPromptEditorForm();
      }
    } catch (error) {
      setPromptEditorError(error.message);
    } finally {
      setPromptEditorDeleting(false);
    }
  };

  return (
    <div className="region-report-page">
      <header className="rr-page-header">
        <div>
          <div className="rr-eyebrow">Policy Intelligence</div>
          <h1>地区政策报告</h1>
          <p>按日期区间与地区组合筛选，自动排除问答/指南类噪声新闻，并生成区域政策分析报告。</p>
        </div>
        <div className="rr-header-badge">
          <Sparkles size={16} />
          <span>DeepSeek Reasoner</span>
        </div>
      </header>

      <div className="rr-layout">
        <aside className="rr-sidebar">
          <section className="rr-panel">
            <div className="rr-panel-title">
              <Calendar size={16} />
              <span>筛选条件</span>
            </div>
            <div className="rr-date-grid">
              <label>
                <span>开始日期</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setDateRange((prev) => ({ ...prev, startDate: e.target.value }))}
                />
              </label>
              <label>
                <span>结束日期</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setDateRange((prev) => ({ ...prev, endDate: e.target.value }))}
                />
              </label>
            </div>
          </section>

          <section className="rr-panel">
            <div className="rr-panel-title">
              <MapPinned size={16} />
              <span>地区多选</span>
            </div>
            <div className="rr-selected-tags">
              {selectedRegions.length > 0 ? selectedRegions.map((item) => (
                <button
                  key={buildSelectionKey(item)}
                  type="button"
                  className="rr-tag"
                  onClick={() => toggleSelection(item)}
                >
                  {item.label}
                </button>
              )) : <span className="rr-placeholder">尚未选择地区</span>}
            </div>
            <div className="rr-tree-shell">
              {renderRegionTree()}
            </div>
            <button type="button" className="rr-link-btn" onClick={clearSelections}>
              清空已选地区
            </button>
          </section>

          <section className="rr-panel">
            <div className="rr-panel-title">
              <FileSearch size={16} />
              <span>Prompt 版本</span>
            </div>
            <select
              value={selectedPromptId}
              onChange={(e) => {
                setSelectedPromptId(e.target.value);
                setPromptTouched(true);
              }}
            >
              {promptOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}{item.isDefault ? '（默认）' : ''}
                </option>
              ))}
            </select>
            <p className="rr-panel-hint">{promptSummary || '根据单地区/多地区场景自动推荐版本。'}</p>
            <div className="rr-prompt-actions">
              <button type="button" className="rr-link-btn" onClick={() => openPromptEditor()}>
                编辑当前版本
              </button>
              <button type="button" className="rr-link-btn" onClick={resetPromptEditorForm}>
                清空编辑草稿
              </button>
              <button type="button" className="rr-link-btn" onClick={() => { resetPromptEditorForm(); setShowPromptEditor(true); }}>
                新建版本
              </button>
            </div>
          </section>

          {promptPreview && (
            <section className="rr-panel rr-prompt-preview-panel">
              <div className="rr-panel-title">
                <FileSearch size={16} />
                <span>Prompt 预览</span>
              </div>
              <div className="rr-prompt-mode-chip">
                当前模式：{activePromptMode === 'single' ? '单地区时间线模板' : '多地区对比模板'}
              </div>
              <div className="rr-prompt-preview-block">
                <div className="rr-prompt-preview-label">System Prompt</div>
                <pre>{promptPreview.systemPrompt}</pre>
              </div>
              <div className="rr-prompt-preview-block">
                <div className="rr-prompt-preview-label">User Prompt 模板</div>
                <pre>{promptPreview.userPrompt}</pre>
              </div>
            </section>
          )}

          <section className="rr-panel rr-workflow-panel">
            <div className="rr-panel-title">
              <Sparkles size={16} />
              <span>生成流程</span>
            </div>
            <div className="rr-workflow-steps">
              <div className={`rr-workflow-step ${canPreview ? 'ready' : ''}`}>
                <span className="rr-step-index">1</span>
                <div>
                  <strong>先加载预览</strong>
                  <p>确认地区、时间和自动过滤结果。</p>
                </div>
              </div>
              <div className={`rr-workflow-step ${previewData ? 'ready' : ''}`}>
                <span className="rr-step-index">2</span>
                <div>
                  <strong>再生成报告</strong>
                  <p>使用当前 Prompt 与人工勾选结果生成最终报告。</p>
                </div>
              </div>
            </div>
            <button
              type="button"
              className="rr-generate-btn"
              onClick={handleGenerate}
              disabled={!canGenerate}
            >
              {generating ? <Loader2 size={18} className="spin" /> : <Sparkles size={18} />}
              <span>{generating ? '正在生成地区政策报告...' : '生成地区政策报告'}</span>
            </button>
            <button type="button" className="rr-secondary-btn rr-preview-btn" onClick={handlePreview} disabled={previewLoading}>
              {previewLoading ? <Loader2 size={16} className="spin" /> : <RefreshCcw size={16} />}
              <span>{previewLoading ? '加载预览中...' : '加载新闻预览'}</span>
            </button>
            <p className="rr-workflow-hint">
              {!previewData
                ? '建议先点击“加载新闻预览”，检查哪些新闻被纳入分析。'
                : `当前可纳入 ${effectiveFilteredNewsCount} 条新闻，确认无误后点击上方主按钮生成报告。`}
            </p>
          </section>
        </aside>

        <main className="rr-main">
          <section className="rr-summary-grid">
            <article className="rr-stat-card">
              <span className="rr-stat-label">已选地区</span>
              <strong>{selectedRegions.length}</strong>
            </article>
            <article className="rr-stat-card">
              <span className="rr-stat-label">原始命中</span>
              <strong>{previewData?.rawNewsCount || 0}</strong>
            </article>
            <article className="rr-stat-card">
              <span className="rr-stat-label">纳入分析</span>
              <strong>{effectiveFilteredNewsCount || 0}</strong>
            </article>
            <article className="rr-stat-card">
              <span className="rr-stat-label">排除新闻</span>
              <strong>{effectiveExcludedNewsCount || 0}</strong>
            </article>
          </section>

          {previewError && <div className="rr-error-box">{previewError}</div>}
          {generateError && <div className="rr-error-box">{generateError}</div>}

          <section className="rr-panel rr-preview-panel">
            <div className="rr-panel-headline">
              <div>
                <h2>新闻预览</h2>
                <p>系统会先自动预过滤政策问答、办事指南、历史政策回顾及无明确政策动作的新闻，你也可以用勾选框人工纳入或排除。</p>
              </div>
            </div>

            {!previewData ? (
              <div className="rr-empty-box">选择日期与地区后，点击“加载新闻预览”。</div>
            ) : (
              <div className="rr-table-wrap">
                <table className="rr-table">
                  <thead>
                    <tr>
                      <th>纳入</th>
                      <th>标题</th>
                      <th>日期</th>
                      <th>来源</th>
                      <th>评分</th>
                      <th>地区</th>
                      <th>过滤状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {effectivePreviewRows.map((row) => (
                      <tr key={row.id}>
                        <td className="rr-cell-check">
                          <input
                            type="checkbox"
                            checked={!!row.includedInAnalysis}
                            onChange={(e) => handleOverrideToggle(row, e.target.checked)}
                          />
                        </td>
                        <td className="rr-cell-title">
                          <a href={row.link} target="_blank" rel="noreferrer">
                            {row.title}
                          </a>
                        </td>
                        <td className="rr-cell-date">
                          <span>{formatDate(row.fetchdate)}</span>
                        </td>
                        <td className="rr-cell-source">{row.source || '-'}</td>
                        <td className="rr-cell-score">{row.score ?? '-'}</td>
                        <td className="rr-cell-region">{row.region || '-'}</td>
                        <td className="rr-cell-status">
                          <span className={`rr-status-pill ${row.includedInAnalysis ? 'included' : 'excluded'}`}>
                            {row.filterSource === 'manual'
                              ? (row.includedInAnalysis ? '人工纳入' : '人工排除')
                              : (row.includedInAnalysis ? '自动纳入' : `自动排除：${row.filterReason}`)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rr-panel rr-report-panel">
            <div className="rr-panel-headline">
              <div>
                <h2>报告结果</h2>
                <p>单地区默认输出时间线演变分析，多地区默认输出共性与差异对比分析。</p>
              </div>
              <div className="rr-report-actions">
                <button
                  type="button"
                  className="rr-link-btn"
                  onClick={() => setShowDebug((prev) => !prev)}
                  disabled={!reportData?.debug}
                >
                  {showDebug ? '隐藏 Prompt' : '查看 Prompt'}
                </button>
                <button
                  type="button"
                  className="rr-secondary-btn"
                  onClick={handleExportPdf}
                  disabled={!canExportPdf}
                >
                  {exporting ? <Loader2 size={16} className="spin" /> : <FileDown size={16} />}
                  <span>{exporting ? '导出中...' : '生成 PDF'}</span>
                </button>
              </div>
            </div>

            {!reportData?.reportContent ? (
              <div className="rr-empty-box">生成完成后，这里将展示 Markdown 报告正文。</div>
            ) : (
              <div className="rr-report-content">
                <div className="rr-report-meta">
                  <span>模型：{reportData.meta?.modelName}</span>
                  <span>Prompt：{reportData.meta?.promptVersion}</span>
                  <span>地区：{reportData.meta?.regions?.join('、')}</span>
                </div>
                {isReportOutdated && (
                  <div className="rr-warning-box">你已修改纳入/排除勾选，当前报告与预览状态不一致。请重新生成后再导出 PDF。</div>
                )}
                <article className="rr-markdown">
                  <ReactMarkdown>{reportData.reportContent}</ReactMarkdown>
                </article>
              </div>
            )}

            {showDebug && reportData?.debug && (
              <div className="rr-debug-box">
                <div>
                  <h3>System Prompt</h3>
                  <pre>{reportData.debug.systemPrompt}</pre>
                </div>
                <div>
                  <h3>User Prompt</h3>
                  <pre>{reportData.debug.userPrompt}</pre>
                </div>
              </div>
            )}
          </section>
        </main>
      </div>

      {showPromptEditor && (
        <div className="rr-modal-overlay" onClick={() => setShowPromptEditor(false)}>
          <div className="rr-modal rr-prompt-editor-modal" onClick={(e) => e.stopPropagation()}>
            <div className="rr-modal-header">
              <div>
                <div className="rr-eyebrow">Prompt Studio</div>
                <h2>编辑地区政策报告 Prompt</h2>
                <p>支持编辑当前版本，也支持另存为新版本。保存后，当前页面的版本列表会立即刷新。</p>
              </div>
              <button type="button" className="rr-modal-close" onClick={() => setShowPromptEditor(false)}>×</button>
            </div>

            <div className="rr-modal-body">
              <aside className="rr-modal-sidebar">
                <button type="button" className="rr-modal-create-btn" onClick={resetPromptEditorForm}>
                  <CopyPlus size={16} />
                  <span>新建空白版本</span>
                </button>
                <div className="rr-modal-version-list">
                  {promptOptions.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`rr-modal-version-item ${promptEditorForm.promptId === item.id ? 'active' : ''}`}
                      onClick={() => openPromptEditor(item)}
                    >
                      <strong>{item.name}</strong>
                      <span>{item.description || '无描述'}</span>
                    </button>
                  ))}
                </div>
              </aside>

              <section className="rr-modal-form">
                <div className="rr-modal-form-grid">
                  <label>
                    <span>版本 ID</span>
                    <input
                      value={promptEditorForm.promptId}
                      onChange={(e) => setPromptEditorForm((prev) => ({ ...prev, promptId: e.target.value }))}
                      placeholder="如：single-region-default"
                    />
                  </label>
                  <label>
                    <span>版本名称</span>
                    <input
                      value={promptEditorForm.name}
                      onChange={(e) => setPromptEditorForm((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="如：管理层单地区版"
                    />
                  </label>
                </div>

                <label className="rr-modal-field">
                  <span>描述</span>
                  <input
                    value={promptEditorForm.description}
                    onChange={(e) => setPromptEditorForm((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="说明这个版本适合什么场景"
                  />
                </label>

                <label className="rr-modal-field">
                  <span>System Prompt</span>
                  <textarea
                    rows={6}
                    value={promptEditorForm.systemPrompt}
                    onChange={(e) => setPromptEditorForm((prev) => ({ ...prev, systemPrompt: e.target.value }))}
                    placeholder="系统提示词"
                  />
                </label>

                <label className="rr-modal-field">
                  <span>单地区 User Prompt</span>
                  <textarea
                    rows={9}
                    value={promptEditorForm.userPromptSingle}
                    onChange={(e) => setPromptEditorForm((prev) => ({ ...prev, userPromptSingle: e.target.value }))}
                    placeholder="支持 {analysisMode} {startDate} {endDate} {regions} {rawNewsCount} {filteredNewsCount} {excludedNewsCount} {usertopic} {regionBlocks}"
                  />
                </label>

                <label className="rr-modal-field">
                  <span>多地区 User Prompt</span>
                  <textarea
                    rows={9}
                    value={promptEditorForm.userPromptMulti}
                    onChange={(e) => setPromptEditorForm((prev) => ({ ...prev, userPromptMulti: e.target.value }))}
                    placeholder="支持 {analysisMode} {startDate} {endDate} {regions} {rawNewsCount} {filteredNewsCount} {excludedNewsCount} {usertopic} {regionBlocks}"
                  />
                </label>

                <label className="rr-modal-checkbox">
                  <input
                    type="checkbox"
                    checked={!!promptEditorForm.isDefault}
                    onChange={(e) => setPromptEditorForm((prev) => ({ ...prev, isDefault: e.target.checked }))}
                  />
                  <span>设为默认版本</span>
                </label>

                {promptEditorError && <div className="rr-error-box">{promptEditorError}</div>}

                <div className="rr-modal-footer">
                  <button type="button" className="rr-link-btn" onClick={() => setShowPromptEditor(false)}>
                    取消
                  </button>
                  <button type="button" className="rr-secondary-btn" onClick={duplicatePromptEditorForm}>
                    <CopyPlus size={16} />
                    <span>另存为副本</span>
                  </button>
                  <button type="button" className="rr-secondary-btn" onClick={resetPromptEditorForm}>
                    <ChevronLeft size={16} />
                    <span>重置表单</span>
                  </button>
                  <button
                    type="button"
                    className="rr-danger-btn"
                    onClick={deletePromptEditor}
                    disabled={promptEditorDeleting || !promptEditorForm.promptId || promptOptions.length <= 1}
                  >
                    {promptEditorDeleting ? <Loader2 size={16} className="spin" /> : null}
                    <span>{promptEditorDeleting ? '删除中...' : '删除当前版本'}</span>
                  </button>
                  <button type="button" className="rr-generate-btn rr-modal-save-btn" onClick={savePromptEditor} disabled={promptEditorSaving}>
                    {promptEditorSaving ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
                    <span>{promptEditorSaving ? '保存中...' : '保存 Prompt 版本'}</span>
                  </button>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RegionPolicyReport;
