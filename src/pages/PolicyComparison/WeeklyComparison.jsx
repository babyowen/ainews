import React, { useState, useEffect, useRef } from 'react';
import { FileText, ArrowRight, Check, Loader2, Download, ChevronRight, FileJson, Scale } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import html2canvas from 'html2canvas';
import './WeeklyComparison.css';

const PolicyMarkdown = ({ content }) => {
  const parseMarkerMarkdown = (markdown) => {
    const lines = (markdown || '').split('\n');
    const result = [];
    let currentSection = '';
    let currentCard = null;
    let currentBlock = null;

    const flushBlock = () => {
      if (currentCard && currentBlock) {
        currentCard.blocks.push(currentBlock);
        currentBlock = null;
      }
    };

    const flushCard = () => {
      flushBlock();
      if (currentCard) {
        result.push(currentCard);
        currentCard = null;
      }
    };

    const parseCardMeta = (metaStr) => {
      const meta = {};
      (metaStr || '').split('|').forEach((seg) => {
        const [k, ...rest] = seg.split('=');
        if (!k || rest.length === 0) return;
        meta[k.trim()] = rest.join('=').trim().replace(/\]\]+$/, '');
      });
      return meta;
    };

    lines.forEach((rawLine) => {
      const line = (rawLine || '').trim();
      if (!line) return;

      const sec = line.match(/^\[\[SECTION\|(.*)\]\]$/);
      if (sec) {
        flushCard();
        currentSection = sec[1].trim();
        result.push({ type: 'section', title: currentSection });
        return;
      }

      const card = line.match(/^\[\[CARD\|(.*)\]\]$/);
      if (card) {
        flushCard();
        const meta = parseCardMeta(card[1]);
        currentCard = { type: 'card', category: meta.category || currentSection, city: meta.city || '', blocks: [] };
        return;
      }

      if (line === '[[/CARD]]') {
        flushCard();
        return;
      }

      const block = line.match(/^\[\[BLOCK\|(.+?)\]\]$/);
      if (block) {
        if (!currentCard) currentCard = { type: 'card', category: currentSection, city: '', blocks: [] };
        flushBlock();
        const key = (block[1] || '').trim();
        const isYangzhou = key === 'yangzhou';
        const isDiff = key === 'diff';
        const label = isYangzhou ? '扬州' : (isDiff ? '对比分析' : key);
        const labelClass = isYangzhou ? 'yangzhou' : (isDiff ? 'comparison' : 'other');
        if (labelClass === 'other' && !currentCard.city) currentCard.city = key;
        currentBlock = { type: 'block', label, labelClass, blockKey: key, content: [], list: [] };
        return;
      }

      if (line === '---') {
        flushCard();
        result.push({ type: 'separator' });
        return;
      }

      if (line.startsWith('- ')) {
        const text = line.replace(/^-+\s*/, '').trim();
        if (currentBlock) currentBlock.list.push(text);
        else if (currentCard) {
          if (!currentCard.list) currentCard.list = [];
          currentCard.list.push(text);
        } else {
          result.push({ type: 'content', text });
        }
        return;
      }

      if (currentBlock) currentBlock.content.push(line);
      else if (currentCard) {
        if (!currentCard.content) currentCard.content = [];
        currentCard.content.push(line);
      } else {
        result.push({ type: 'content', text: line });
      }
    });

    flushCard();
    return result;
  };

  const parseMarkdown = (markdown) => {
    const lines = (markdown || '').split('\n');
    const result = [];
    let currentCard = null;
    let currentBlock = null;

    const flushCard = () => {
      if (currentBlock && currentCard) {
        currentCard.blocks.push(currentBlock);
        currentBlock = null;
      }
      if (currentCard) {
        result.push(currentCard);
        currentCard = null;
      }
    };

    lines.forEach((line) => {
      const trimmed = (line || '').trim();
      if (!trimmed) return;

      if (trimmed.startsWith('### ')) {
        flushCard();
        result.push({ type: 'section', title: trimmed.replace(/^###\s*/, '').trim() });
        return;
      }

      if (trimmed === '---') {
        flushCard();
        result.push({ type: 'separator' });
        return;
      }

      const labelMatch = trimmed.match(/^\*\*(扬州|其他城市|对比分析)\*\*(?:\s*[:：]\s*(.*))?$/);
      if (labelMatch) {
        if (!currentCard) currentCard = { type: 'card', blocks: [] };
        if (currentBlock) currentCard.blocks.push(currentBlock);
        const label = labelMatch[1];
        const labelClass = label === '扬州' ? 'yangzhou' : (label === '对比分析' ? 'comparison' : 'other');
        currentBlock = { type: 'block', label, labelClass, content: [], list: [] };
        const inlineText = (labelMatch[2] || '').trim();
        if (inlineText) currentBlock.content.push(inlineText);
        return;
      }

      if (trimmed.startsWith('- ')) {
        const text = trimmed.replace(/^-+\s*/, '').trim();
        if (currentBlock) {
          currentBlock.list.push(text);
        } else if (currentCard) {
          if (!currentCard.list) currentCard.list = [];
          currentCard.list.push(text);
        } else {
          result.push({ type: 'content', text });
        }
        return;
      }

      if (currentBlock) {
        currentBlock.content.push(trimmed);
      } else if (currentCard) {
        if (!currentCard.content) currentCard.content = [];
        currentCard.content.push(trimmed);
      } else {
        result.push({ type: 'content', text: trimmed });
      }
    });

    flushCard();
    return result;
  };

  const parsed = (content || '').includes('[[SECTION|') ? parseMarkerMarkdown(content) : parseMarkdown(content);
  const order = { other: 1, yangzhou: 2, comparison: 3 };
  const renderInline = (text) => {
    const s = String(text ?? '').replace(/__(.+?)__/g, '**$1**');
    const parts = [];
    const re = /\*\*(.+?)\*\*/g;
    let lastIndex = 0;
    let match;
    while ((match = re.exec(s)) !== null) {
      const start = match.index;
      if (start > lastIndex) parts.push(s.slice(lastIndex, start));
      parts.push(<strong key={`${start}-${re.lastIndex}`}>{match[1]}</strong>);
      lastIndex = re.lastIndex;
    }
    if (lastIndex < s.length) parts.push(s.slice(lastIndex));
    return parts.length > 0 ? parts : s;
  };

  const parseCityLine = (text) => {
    const s = String(text ?? '').trim();
    const m = s.match(/^\*\*(.+?)\*\*\s*[:：]\s*(.*)$/);
    if (!m) return { city: '', text: s };
    return { city: m[1].trim(), text: (m[2] || '').trim() };
  };

  const getBlockEntries = (block) => {
    const list = Array.isArray(block?.list) ? block.list : [];
    const contentLines = Array.isArray(block?.content) ? block.content : [];
    return [...list, ...contentLines].filter(Boolean);
  };

  return (
    <div className="markdown-content">
      {(() => {
        const groups = [];
        let current = null;

        parsed.forEach((item) => {
          if (item.type === 'section') {
            current = { title: item.title, items: [] };
            groups.push(current);
            return;
          }
          if (!current) {
            current = { title: '', items: [] };
            groups.push(current);
          }
          current.items.push(item);
        });

        return groups.map((group, gIdx) => {
          const cards = group.items.filter((it) => it.type === 'card');
          const separators = group.items.filter((it) => it.type === 'separator');
          const contents = group.items.filter((it) => it.type === 'content');

          return (
            <div key={gIdx} className="policy-section-card">
              {group.title ? <div className="policy-section-card-title">{group.title}</div> : null}

              {contents.length > 0 ? (
                <div className="policy-section-card-notes">
                  {contents.map((c, i) => <p key={i}>{renderInline(c.text)}</p>)}
                </div>
              ) : null}

              <div className="policy-section-card-list">
                {cards.map((card, cIdx) => {
                  const blocks = Array.isArray(card.blocks) ? card.blocks : [];
                  const sorted = [...blocks].sort((a, b) => (order[a.labelClass] || 99) - (order[b.labelClass] || 99));
                  const otherBlock = sorted.find(b => b.labelClass === 'other');
                  const otherEntries = getBlockEntries(otherBlock);
                  const otherFirst = otherEntries[0] || '';
                  const parsedCity = parseCityLine(otherFirst);
                  const cityName = card.city || parsedCity.city || '';
                  const cardTitle = parsedCity.text || otherFirst || group.title || card.category || '';

                  return (
                    <div key={cIdx} className="policy-entry">
                      <div className="policy-entry-body">
                        {sorted.map((block, bIdx) => {
                          const entries = getBlockEntries(block);
                          const primary = entries[0] || '';
                          const rest = entries.slice(1);

                          let primaryText = primary;
                          if (block.labelClass === 'other') {
                            const parsed = parseCityLine(primary);
                            primaryText = parsed.text || primary;
                          }

                          return (
                            <div key={bIdx} className={`policy-block ${block.labelClass}`}>
                              <div className="policy-inline-row">
                                <span className={`city-label ${block.labelClass}`}>{block.label}</span>
                                <div className="policy-inline-text">{renderInline(primaryText)}</div>
                              </div>
                              {rest.length > 0 ? (
                                <ul className="policy-inline-list">
                                  {rest.map((t, i) => <li key={i}>{renderInline(t)}</li>)}
                                </ul>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {separators.length > 0 ? null : null}
            </div>
          );
        });
      })()}
    </div>
  );
};

const STEPS = [
  { id: 'select', label: '选择周报', icon: <FileText size={20} /> },
  { id: 'extract', label: '提取政策', icon: <FileJson size={20} /> },
  { id: 'compare', label: '对比分析', icon: <Scale size={20} /> },
  { id: 'result', label: '生成报告', icon: <Check size={20} /> }
];

const WeeklyComparison = () => {
  const [currentStep, setCurrentStep] = useState('select');
  const [loading, setLoading] = useState(false);
  const [reports, setReports] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [sourceMode, setSourceMode] = useState('report'); // 'report' | 'news'
  const [weeklyNews, setWeeklyNews] = useState([]);
  const [selectedNews, setSelectedNews] = useState([]);
  const [newsDigest, setNewsDigest] = useState('');
  const [newsLoading, setNewsLoading] = useState(false);
  const [extractionBatches, setExtractionBatches] = useState([]);
  const [extractionBatchTotal, setExtractionBatchTotal] = useState(0);
  const [extractionBatchCurrent, setExtractionBatchCurrent] = useState(0);
  const [extractedPolicy, setExtractedPolicy] = useState(null);
  const [comparisonResult, setComparisonResult] = useState('');
  const [debugInfo, setDebugInfo] = useState({ extraction: null, comparison: null });
  const [error, setError] = useState('');
  const reportRef = useRef(null);

  // Load reports on mount
  useEffect(() => {
    fetchReports();
  }, []);

  useEffect(() => {
    if (sourceMode !== 'news') return;
    if (!selectedReport?.start_date || !selectedReport?.end_date) return;
    fetchWeeklyNews(selectedReport.start_date, selectedReport.end_date);
  }, [sourceMode, selectedReport?.id]);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/reports/history?keyword=公积金&limit=20');
      const data = await res.json();
      setReports(data.data || []);
    } catch (err) {
      setError('获取周报列表失败');
    } finally {
      setLoading(false);
    }
  };

  const toLocalYMD = (value) => {
    try {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    } catch {
      return String(value).slice(0, 10);
    }
  };

  const fetchWeeklyNews = async (startDate, endDate) => {
    setNewsLoading(true);
    try {
      const start = toLocalYMD(startDate);
      const end = toLocalYMD(endDate);
      const params = new URLSearchParams({
        keyword: '公积金',
        startDate: start,
        endDate: end,
        minScore: '4'
      });
      const res = await fetch(`/api/weekly-news?${params.toString()}`);
      if (!res.ok) throw new Error('获取新闻失败');
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setWeeklyNews(list);
      setSelectedNews(list);
    } catch (err) {
      setWeeklyNews([]);
      setSelectedNews([]);
      setError('获取当周新闻失败: ' + err.message);
    } finally {
      setNewsLoading(false);
    }
  };

  const buildNewsDigest = (startDate, endDate, newsList, options = {}) => {
    const start = toLocalYMD(startDate);
    const end = toLocalYMD(endDate);
    const sorted = [...(newsList || [])].sort((a, b) => {
      const sa = Number(a?.score ?? 0);
      const sb = Number(b?.score ?? 0);
      if (sb !== sa) return sb - sa;
      const da = new Date(a?.fetchdate || 0).getTime();
      const db = new Date(b?.fetchdate || 0).getTime();
      return db - da;
    });

    const {
      chunkIndex,
      totalChunks,
      totalSelected,
      batchId,
      maxSummaryChars = 500,
      includeLink = true
    } = options || {};

    const picked = sorted;
    const head = [
      '【当周全部新闻（用于政策抽取）】',
      `关键词：公积金`,
      `时间范围：${start} ~ ${end}`,
      `筛选规则：评分 >= 4`,
      `内容来源：数据库 short_summary（缺失则回退 content 并截断）`,
      (batchId ? `批次：${batchId}` : null),
      (chunkIndex && totalChunks) ? `分组：第 ${chunkIndex}/${totalChunks} 组` : null,
      (typeof totalSelected === 'number') ? `本次选中新闻总数：${totalSelected} 条` : null,
      `本组新闻条数：${picked.length} 条`,
      ''
    ].filter(Boolean).join('\n');

    const body = picked.map((n, idx) => {
      const title = n?.title || '(无标题)';
      const score = n?.score ?? '';
      const date = n?.fetchdate ? String(n.fetchdate).slice(0, 10) : '';
      const source = n?.source || '';
      const link = n?.link || '';
      const text = (n?.short_summary || n?.content || '').slice(0, maxSummaryChars);
      return [
        `【新闻${idx + 1}】${title}`,
        score !== '' ? `【评分】${score}` : null,
        date ? `【日期】${date}` : null,
        source ? `【来源】${source}` : null,
        (includeLink && link) ? `【链接】${link}` : null,
        `【短总结】${text}`,
        '---'
      ].filter(Boolean).join('\n');
    }).join('\n');

    return `${head}${body}`.trim();
  };

  const countPolicyDetails = (policy) => {
    const domains = policy?.政策领域;
    if (!Array.isArray(domains)) return 0;
    return domains.reduce((acc, d) => {
      const cats = d?.政策类别;
      if (!Array.isArray(cats)) return acc;
      return acc + cats.reduce((a, c) => a + (Array.isArray(c?.政策明细) ? c.政策明细.length : 0), 0);
    }, 0);
  };

  const mergeExtractedPolicy = (basePolicy, addPolicy) => {
    if (!basePolicy) return addPolicy;
    if (!addPolicy) return basePolicy;
    if (!Array.isArray(basePolicy.政策领域) || !Array.isArray(addPolicy.政策领域)) return basePolicy;

    const next = JSON.parse(JSON.stringify(basePolicy));
    const domainMap = new Map(next.政策领域.map((d) => [d?.领域名称, d]));

    for (const addDomain of addPolicy.政策领域) {
      const name = addDomain?.领域名称;
      if (!name) continue;
      if (!domainMap.has(name)) {
        next.政策领域.push(addDomain);
        domainMap.set(name, addDomain);
        continue;
      }

      const baseDomain = domainMap.get(name);
      if (!Array.isArray(baseDomain.政策类别) || !Array.isArray(addDomain.政策类别)) continue;
      const catMap = new Map(baseDomain.政策类别.map((c) => [c?.类别名称, c]));

      for (const addCat of addDomain.政策类别) {
        const catName = addCat?.类别名称;
        if (!catName) continue;
        if (!catMap.has(catName)) {
          baseDomain.政策类别.push(addCat);
          catMap.set(catName, addCat);
          continue;
        }

        const baseCat = catMap.get(catName);
        if (!Array.isArray(baseCat.政策明细) || !Array.isArray(addCat.政策明细)) continue;

        const seen = new Set(
          baseCat.政策明细.map((it) => `${it?.明细项 ?? ''}||${it?.内容 ?? ''}||${it?.依据文件 ?? ''}`)
        );
        for (const it of addCat.政策明细) {
          const key = `${it?.明细项 ?? ''}||${it?.内容 ?? ''}||${it?.依据文件 ?? ''}`;
          if (seen.has(key)) continue;
          baseCat.政策明细.push(it);
          seen.add(key);
        }
      }
    }

    return next;
  };

  const handleExtract = async () => {
    if (!selectedReport) return;
    
    setLoading(true);
    setCurrentStep('extract');
    setError('');
    // Clear previous extraction debug info but keep comparison if any (though usually we clear forward steps)
    setDebugInfo(prev => ({ ...prev, extraction: null }));

    try {
      const useNewsMode = sourceMode === 'news';
      const chunkSize = 30;
      const chunks = useNewsMode
        ? Array.from({ length: Math.ceil(selectedNews.length / chunkSize) }, (_, i) => selectedNews.slice(i * chunkSize, (i + 1) * chunkSize))
        : [];
      if (useNewsMode) {
        const initial = chunks.map((chunk, idx) => ({
          id: String(idx + 1),
          news: chunk,
          newsCount: chunk.length,
          status: 'pending',
          extractedCount: 0,
          addedCount: 0,
          result: null,
          error: '',
          depth: 0
        }));
        setExtractionBatchTotal(initial.length);
        setExtractionBatchCurrent(initial.length > 0 ? 1 : 0);
        setExtractionBatches(initial.map(({ id, newsCount, status, extractedCount, addedCount, result, error, depth }) => ({
          id, newsCount, status, extractedCount, addedCount, result, error, depth
        })));
      } else {
        setExtractionBatchTotal(0);
        setExtractionBatchCurrent(0);
        setExtractionBatches([]);
      }

      const digestText = useNewsMode
        ? (chunks.length <= 1
          ? buildNewsDigest(selectedReport.start_date, selectedReport.end_date, selectedNews, { totalSelected: selectedNews.length, includeLink: false })
          : chunks.map((chunk, idx) => buildNewsDigest(selectedReport.start_date, selectedReport.end_date, chunk, { chunkIndex: idx + 1, totalChunks: chunks.length, totalSelected: selectedNews.length, batchId: String(idx + 1), includeLink: false })).join('\n\n==== 分组分隔 ====\n\n'))
        : '';

      if (useNewsMode) setNewsDigest(digestText);

      // 1. Get Preview Prompt immediately
      try {
        const previewContent = useNewsMode
          ? (chunks.length > 1
            ? buildNewsDigest(selectedReport.start_date, selectedReport.end_date, chunks[0], { chunkIndex: 1, totalChunks: chunks.length, totalSelected: selectedNews.length, batchId: '1', includeLink: false })
            : digestText)
          : null;
        const previewRes = await fetch('/api/policy/preview-prompt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            type: 'extraction',
            ...(useNewsMode ? { reportContent: previewContent } : { reportId: selectedReport.id })
          })
        });
        if (previewRes.ok) {
          const previewData = await previewRes.json();
          setDebugInfo(prev => ({ ...prev, extraction: previewData }));
        }
      } catch (e) {
        console.error('Failed to fetch preview prompt', e);
      }

      // 2. Start actual extraction
      if (!useNewsMode || chunks.length <= 1) {
        const res = await fetch('/api/policy/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(useNewsMode ? { reportContent: digestText } : { reportId: selectedReport.id })
        });

        if (!res.ok) {
          let details = '';
          try {
            const j = await res.json();
            details = j?.details || j?.error || '';
          } catch {}
          throw new Error(`提取失败${details ? `：${details}` : ''}`);
        }
        
        const data = await res.json();
        setExtractedPolicy(data.result);
        if (data.debug) {
          setDebugInfo(prev => ({ ...prev, extraction: data.debug }));
        }
        if (useNewsMode && chunks.length === 1) {
          const extractedCount = countPolicyDetails(data.result);
          setExtractionBatches(prev => prev.map((b) => b.id === '1' ? { ...b, status: 'done', extractedCount, addedCount: extractedCount, result: data.result } : b));
        }
      } else {
        let merged = null;
        let lastDebug = null;

        let queue = chunks.map((chunk, idx) => ({
          id: String(idx + 1),
          news: chunk,
          depth: 0
        }));

        const updateBatch = (id, patch) => {
          setExtractionBatches(prev => prev.map((b) => b.id === id ? { ...b, ...patch } : b));
        };

        const insertBatchesAfter = (afterId, children) => {
          setExtractionBatches(prev => {
            const idx = prev.findIndex(b => b.id === afterId);
            if (idx < 0) return [...prev, ...children];
            const next = [...prev.slice(0, idx + 1), ...children, ...prev.slice(idx + 1)];
            setExtractionBatchTotal(next.length);
            return next;
          });
        };

        const callExtract = async (batch) => {
          const maxSummaryChars = batch.depth > 0 ? 350 : 500;
          const includeLink = batch.depth === 0 ? false : false;
          const groupDigest = buildNewsDigest(selectedReport.start_date, selectedReport.end_date, batch.news, {
            totalSelected: selectedNews.length,
            batchId: batch.id,
            maxSummaryChars,
            includeLink
          });
          const res = await fetch('/api/policy/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reportContent: groupDigest })
          });
          if (!res.ok) {
            let details = '';
            try {
              const j = await res.json();
              details = j?.details || j?.error || '';
            } catch {}
            throw new Error(details || `HTTP ${res.status}`);
          }
          return await res.json();
        };

        for (let i = 0; i < queue.length; i++) {
          const batch = queue[i];
          setExtractionBatchCurrent(i + 1);
          updateBatch(batch.id, { status: 'running', error: '' });

          try {
            const data = await callExtract(batch);
            const before = countPolicyDetails(merged);
            merged = mergeExtractedPolicy(merged, data.result);
            const after = countPolicyDetails(merged);
            const extractedCount = countPolicyDetails(data.result);
            const addedCount = Math.max(0, after - before);
            updateBatch(batch.id, { status: 'done', extractedCount, addedCount, result: data.result, depth: batch.depth });
            if (data.debug) lastDebug = data.debug;
          } catch (e) {
            const errMsg = String(e?.message || e || '');
            updateBatch(batch.id, { status: 'split', error: errMsg, depth: batch.depth });
            if (batch.news.length <= 1) {
              throw new Error(`提取失败（批次 ${batch.id}）：${errMsg}`);
            }
            const mid = Math.ceil(batch.news.length / 2);
            const left = { id: `${batch.id}a`, news: batch.news.slice(0, mid), depth: batch.depth + 1 };
            const right = { id: `${batch.id}b`, news: batch.news.slice(mid), depth: batch.depth + 1 };
            const childrenMeta = [left, right].map((c) => ({
              id: c.id,
              newsCount: c.news.length,
              status: 'pending',
              extractedCount: 0,
              addedCount: 0,
              result: null,
              error: '',
              depth: c.depth
            }));
            insertBatchesAfter(batch.id, childrenMeta);
            queue.splice(i + 1, 0, left, right);
          }
        }

        setExtractionBatchTotal(queue.length);
        setExtractedPolicy(merged);
        if (lastDebug) setDebugInfo(prev => ({ ...prev, extraction: lastDebug }));
      }
    } catch (err) {
      setExtractionBatches(prev => prev.map((b) => b.status === 'running' ? { ...b, status: 'error', error: String(err?.message || err) } : b));
      setError('政策提取失败: ' + err.message);
      setCurrentStep('select');
    } finally {
      setLoading(false);
    }
  };

  const handleCompare = async () => {
    if (!extractedPolicy) return;
    
    setLoading(true);
    setCurrentStep('compare');
    setError('');
    setDebugInfo(prev => ({ ...prev, comparison: null }));

    try {
      // 1. Get Preview Prompt immediately
      try {
        const previewRes = await fetch('/api/policy/preview-prompt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            type: 'comparison',
            extractedPolicy: extractedPolicy 
          })
        });
        if (previewRes.ok) {
          const previewData = await previewRes.json();
          setDebugInfo(prev => ({ ...prev, comparison: previewData }));
        }
      } catch (e) {
        console.error('Failed to fetch preview prompt', e);
      }

      // 2. Start actual comparison
      const res = await fetch('/api/policy/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extractedPolicy })
      });

      if (!res.ok) throw new Error('对比失败');
      
      const data = await res.json();
      setComparisonResult(data.markdown);
      if (data.debug) {
        setDebugInfo(prev => ({ ...prev, comparison: data.debug }));
      }
      setCurrentStep('result');
    } catch (err) {
      setError('对比分析失败: ' + err.message);
      setCurrentStep('extract');
    } finally {
      setLoading(false);
    }
  };

  const handleExportPdf = async () => {
    if (!reportRef.current) return;

    const reportElement = reportRef.current;
    const originalWidth = reportElement.style.width;
    const originalMaxWidth = reportElement.style.maxWidth;

    try {
      reportElement.style.width = '430px';
      reportElement.style.maxWidth = '430px';

      ['div', 'p', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li'].forEach((tag) => {
        reportElement.querySelectorAll(tag).forEach((el) => {
          el.dataset.prevPageBreakInside = el.style.pageBreakInside || '';
          el.dataset.prevBreakInside = el.style.breakInside || '';
          el.style.pageBreakInside = 'avoid';
          el.style.breakInside = 'avoid';
        });
      });

      const html2pdf = (await import('html2pdf.js')).default;
      await html2pdf()
        .from(reportElement)
        .set({
          margin: 0.3,
          filename: `政策对比周报-${selectedReport.start_date}.pdf`,
          pagebreak: { mode: ['css', 'legacy'] },
          html2canvas: {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
            windowWidth: 430,
            width: 430
          },
          jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
        })
        .save();
    } finally {
      reportElement.style.width = originalWidth;
      reportElement.style.maxWidth = originalMaxWidth;

      ['div', 'p', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li'].forEach((tag) => {
        reportElement.querySelectorAll(tag).forEach((el) => {
          el.style.pageBreakInside = el.dataset.prevPageBreakInside || '';
          el.style.breakInside = el.dataset.prevBreakInside || '';
          delete el.dataset.prevPageBreakInside;
          delete el.dataset.prevBreakInside;
        });
      });
    }
  };

  const handleExportImage = async () => {
    if (!reportRef.current) return;

    const reportElement = reportRef.current;
    const originalWidth = reportElement.style.width;

    try {
      // 临时设置宽度以获得最佳移动端显示效果
      reportElement.style.width = '430px'; // iPhone Pro Max width

      // 长内容在生产环境更容易触发 dataURL / 大画布限制，按高度降级缩放更稳
      const contentHeight = Math.max(reportElement.scrollHeight, reportElement.offsetHeight, 1);
      if (contentHeight > 12000) {
        reportElement.style.width = originalWidth;
        await handleExportPdf();
        return;
      }
      const scale = contentHeight > 7000 ? 1.5 : 2;

      const canvas = await html2canvas(reportElement, {
        scale,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
        windowWidth: 430,
        width: 430
      });

      // 恢复原始宽度
      reportElement.style.width = originalWidth;

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((result) => {
          if (result) {
            resolve(result);
            return;
          }
          reject(new Error('图片生成失败'));
        }, 'image/png');
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `政策对比周报-${selectedReport.start_date}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      reportElement.style.width = originalWidth;
      console.error('导出失败:', err);
      alert('导出图片失败，请重试');
    }
  };

  // Render helpers
  const renderPromptViewer = (debugData, label, defaultOpen = false) => {
    if (!debugData) return null;
    
    return (
      <div className="debug-prompt-container" style={{ marginTop: '2rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem', textAlign: 'left' }}>
        <details open={defaultOpen}>
          <summary style={{ cursor: 'pointer', color: '#64748b', fontWeight: 500, userSelect: 'none' }}>
            🛠️ 查看完整提示词 ({label})
          </summary>
          <div style={{ marginTop: '1rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0', textAlign: 'left' }}>
            {debugData.systemPrompt && (
              <div style={{ marginBottom: '1rem' }}>
                <h4 style={{ fontSize: '0.875rem', color: '#475569', marginBottom: '0.5rem' }}>System Prompt:</h4>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem', color: '#334155', maxHeight: '200px', overflowY: 'auto', fontFamily: 'monospace' }}>
                  {debugData.systemPrompt}
                </pre>
              </div>
            )}
            <div>
              <h4 style={{ fontSize: '0.875rem', color: '#475569', marginBottom: '0.5rem' }}>User Prompt (Final):</h4>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem', color: '#334155', maxHeight: '400px', overflowY: 'auto', fontFamily: 'monospace' }}>
                {debugData.userPrompt}
              </pre>
            </div>
          </div>
        </details>
      </div>
    );
  };

  const renderStepIndicator = () => (
    <div className="wizard-steps">
      {STEPS.map((step, index) => {
        const isActive = step.id === currentStep;
        const stepIndex = STEPS.findIndex(s => s.id === step.id);
        const currentIndex = STEPS.findIndex(s => s.id === currentStep);
        const isCompleted = stepIndex < currentIndex;

        return (
          <div key={step.id} className={`step-item ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}>
            <div className="step-circle">
              {isCompleted ? <Check size={20} /> : index + 1}
            </div>
            <span className="step-label">{step.label}</span>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="weekly-comparison-container">
      <div className="header-section" style={{ marginBottom: '2rem' }}>
        <h1>📑 周报政策对比</h1>
        <p>基于历史周报提取政策要点，与现行政策库进行智能比对分析</p>
      </div>

      {renderStepIndicator()}

      {error && (
        <div className="error-banner" style={{
          background: '#fef2f2', color: '#ef4444', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem',
          display: 'flex', alignItems: 'center', gap: '0.5rem'
        }}>
          <span>⚠️</span> {error}
        </div>
      )}

      {/* Step 1: Select Report */}
      {currentStep === 'select' && (
        <div className="step-content">
          <div className="source-toggle">
            <button
              className={`source-btn ${sourceMode === 'report' ? 'active' : ''}`}
              onClick={() => {
                setSourceMode('report');
                setWeeklyNews([]);
                setSelectedNews([]);
                setNewsDigest('');
              }}
            >
              使用已生成周报
            </button>
            <button
              className={`source-btn ${sourceMode === 'news' ? 'active' : ''}`}
              onClick={() => {
                setSourceMode('news');
                setNewsDigest('');
              }}
            >
              使用当周全部新闻（公积金≥4分）
            </button>
          </div>
          {loading ? (
            <div className="loading-container">
              <div className="loading-spinner"></div>
              <p className="loading-text">正在加载历史周报...</p>
            </div>
          ) : (
            <div className="report-grid">
              {reports.map(report => (
                <div 
                  key={report.id} 
                  className={`report-card ${selectedReport?.id === report.id ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedReport(report);
                    setNewsDigest('');
                  }}
                >
                  <div className="report-date">
                    {new Date(report.start_date).toLocaleDateString()} - {new Date(report.end_date).toLocaleDateString()}
                  </div>
                  <div className="report-title">
                    {report.keyword}周报
                  </div>
                  <div className="report-meta">
                    <span>📰 {report.news_count} 条新闻</span>
                    <span>🤖 {report.model_used}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {sourceMode === 'news' && selectedReport && (
            <div className="news-picker">
              <div className="news-picker-header">
                <div className="news-picker-title">📰 当周新闻（评分≥4，使用短总结）</div>
                <div className="news-picker-meta">
                  已选 {selectedNews.length} / {weeklyNews.length} 条
                </div>
              </div>
              {newsLoading ? (
                <div className="news-loading">正在加载当周新闻...</div>
              ) : (
                <div className="news-list">
                  {weeklyNews.map((news) => {
                    const checked = selectedNews.some(n => n.id === news.id);
                    const summary = String(news.short_summary || news.content || '').slice(0, 500);
                    return (
                      <label key={news.id} className={`news-item ${checked ? 'checked' : ''}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setSelectedNews(prev => {
                              const exists = prev.some(n => n.id === news.id);
                              return exists ? prev.filter(n => n.id !== news.id) : [...prev, news];
                            });
                          }}
                        />
                        <div className="news-item-body">
                          <div className="news-item-title">
                            <span className="news-score">⭐ {news.score ?? '-'}</span>
                            <span>{news.title}</span>
                          </div>
                          <div className="news-item-summary">{summary}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          
          <div className="action-bar" style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end' }}>
            <button 
              className="action-btn btn-primary"
              disabled={sourceMode === 'news' ? (!selectedReport || selectedNews.length === 0) : !selectedReport}
              onClick={handleExtract}
            >
              下一步：提取政策 <ArrowRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Extracting / Preview */}
      {currentStep === 'extract' && (
        <div className="step-content">
          {loading ? (
            <>
              <div className="loading-container compact">
                <div className="loading-spinner"></div>
                <p className="loading-text">
                  {sourceMode === 'news' ? '正在提取当周新闻政策要点...' : '正在提取周报政策要点...'}
                </p>
                {sourceMode === 'news' && extractionBatchTotal > 1 ? (
                  <div className="batch-progress">
                    <div className="batch-progress-row">
                      <span>分批提取</span>
                      <span>第 {extractionBatchCurrent}/{extractionBatchTotal} 批</span>
                    </div>
                    <div className="batch-progress-bar">
                      <div
                        className="batch-progress-bar-fill"
                        style={{ width: `${Math.round((Math.max(1, extractionBatchCurrent) / extractionBatchTotal) * 100)}%` }}
                      />
                    </div>
                    <div className="batch-progress-list">
                      {extractionBatches.map((b) => (
                        <div key={b.id} className={`batch-pill ${b.status}`}>
                          批次{b.id}·{b.newsCount}条
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
              
              {/* Show extraction prompt while loading */}
              {debugInfo.extraction ? (
                 renderPromptViewer(debugInfo.extraction, '提取阶段 - 实时预览', true)
              ) : (
                selectedReport && (
                   <div className="debug-prompt-container" style={{ marginTop: '2rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem', textAlign: 'left' }}>
                      <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0', textAlign: 'left' }}>
                         <div style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Loader2 className="animate-spin" size={16} color="#3b82f6" />
                            <h4 style={{ fontSize: '0.875rem', color: '#475569', margin: 0 }}>正在使用的提取提示词:</h4>
                         </div>
                         <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '1rem' }}>系统将使用以下指令从周报中提取结构化数据</p>
                         <div style={{ fontSize: '0.8rem', color: '#334155', background: '#fff', padding: '0.75rem', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                            <p>正在请求服务器生成最终 Prompt 并进行提取...</p>
                            <p>请稍候，结果生成后将显示完整 Prompt。</p>
                         </div>
                      </div>
                   </div>
                )
              )}
            </>
          ) : (
            <div className="extraction-container" style={{
              background: 'white',
              borderRadius: '16px',
              padding: '2rem',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <h3 style={{ margin: 0 }}>🔍 提取结果预览</h3>
                {extractedPolicy && (
                  <div style={{ 
                    background: '#e0f2fe', 
                    color: '#0284c7', 
                    padding: '0.25rem 0.75rem', 
                    borderRadius: '9999px', 
                    fontSize: '0.875rem', 
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem'
                  }}>
                    <span>📊</span>
                    <span>
                      共提取 {countPolicyDetails(extractedPolicy)} 条政策明细
                     </span>
                  </div>
                )}
              </div>
              <p style={{ marginTop: 0, marginBottom: '1rem' }}>系统已从周报中提取以下政策结构信息：</p>
              
              <style>{`
                .json-preview::-webkit-scrollbar { width: 8px; height: 8px; }
                .json-preview::-webkit-scrollbar-track { background: #0f172a; border-radius: 4px; }
                .json-preview::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
                .json-preview::-webkit-scrollbar-thumb:hover { background: #475569; }
              `}</style>
              <div className="json-preview" style={{
                background: '#1e293b',
                color: '#a5b3ce',
                padding: '1.5rem',
                borderRadius: '8px',
                fontFamily: "'Fira Code', 'Menlo', 'Monaco', 'Courier New', monospace",
                fontSize: '0.875rem',
                maxHeight: '500px',
                overflowY: 'auto',
                margin: '1.5rem 0',
                whiteSpace: 'pre',
                tabSize: 2,
                lineHeight: 1.5,
                border: '1px solid #334155',
                textAlign: 'left'
              }}>
                <pre>{JSON.stringify(extractedPolicy, null, 2)}</pre>
              </div>

              {sourceMode === 'news' && extractionBatchTotal > 1 && extractionBatches.length > 0 ? (
                <details className="raw-llm-output">
                  <summary>📦 查看分批提取明细（每批结果）</summary>
                  <div className="batch-results">
                    {extractionBatches.map((b) => (
                      <details key={b.id} className="batch-result-item">
                        <summary>
                          批次 {b.id} · 新闻 {b.newsCount} 条 · 本批提取 {b.extractedCount} 条 · 合并新增 {b.addedCount} 条
                        </summary>
                        {b.error ? <div className="batch-error">{b.error}</div> : null}
                        {b.result ? <pre>{JSON.stringify(b.result, null, 2)}</pre> : <div className="batch-empty">暂无结果</div>}
                      </details>
                    ))}
                  </div>
                </details>
              ) : null}

              {sourceMode === 'news' && newsDigest ? (
                <details className="raw-llm-output">
                  <summary>🧾 查看当周新闻拼接文本（用于提取）</summary>
                  <pre>{newsDigest}</pre>
                </details>
              ) : null}

              {renderPromptViewer(debugInfo.extraction, '提取阶段')}

              <div className="action-bar" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <button 
                  className="action-btn btn-secondary"
                  onClick={() => setCurrentStep('select')}
                >
                  上一步
                </button>
                <button 
                  className="action-btn btn-primary"
                  onClick={handleCompare}
                >
                  开始对比分析 <ArrowRight size={18} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Comparing (Loading only, usually) */}
      {currentStep === 'compare' && (
        <div className="step-content">
          <div className="loading-container compact">
            <div className="loading-spinner"></div>
            <p className="loading-text">正在与现行政策库进行比对...</p>
            <div className="loading-subtext">深度思考中</div>
          </div>
          
          {/* Show the comparison prompt while loading */}
          {debugInfo.comparison ? (
              renderPromptViewer(debugInfo.comparison, '对比阶段 - 实时预览', true)
          ) : (
            extractedPolicy && (
               <div className="debug-prompt-container" style={{ marginTop: '2rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem', textAlign: 'left' }}>
                  <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0', textAlign: 'left' }}>
                     <div style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Loader2 className="animate-spin" size={16} color="#3b82f6" />
                        <h4 style={{ fontSize: '0.875rem', color: '#475569', margin: 0 }}>正在使用的对比提示词:</h4>
                     </div>
                     <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '1rem' }}>系统将使用以下指令进行分析（已自动填入提取的政策和现行政策）</p>
                     {/* We don't have the final prompt yet (it's generated on server), but we can show the template or explanation */}
                     <div style={{ fontSize: '0.8rem', color: '#334155', background: '#fff', padding: '0.75rem', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                        <p>正在请求服务器生成最终 Prompt 并进行推理...</p>
                        <p>请稍候，结果生成后将显示完整 Prompt。</p>
                     </div>
                  </div>
               </div>
            )
          )}
        </div>
      )}

      {/* Step 4: Result */}
      {currentStep === 'result' && (
        <div className="step-content">
          <div className="export-actions">
            <button
              className="action-btn btn-secondary"
              onClick={() => setCurrentStep('select')}
            >
              重新开始
            </button>
            <button
              className="action-btn btn-primary"
              onClick={handleExportImage}
            >
              <Download size={18} /> 导出高清图片（超长自动PDF）
            </button>
          </div>

          {/* Mobile Preview Container */}
          <div style={{
            maxWidth: '430px',
            margin: '0 auto',
            background: '#ffffff',
            borderRadius: '0',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            overflow: 'hidden'
          }}>
            <div className="comparison-report" ref={reportRef} style={{
              width: '100%',
              maxWidth: '430px'
            }}>
              <div className="report-header">
                <div className="report-header-bg" />
                <div className="report-header-inner">
                  <div className="report-header-title">新闻周报-扬州公积金政策比对报告</div>
                  {selectedReport?.start_date && selectedReport?.end_date ? (
                    <div className="report-subtitle">
                      对比周报时间：{new Date(selectedReport.start_date).toLocaleDateString()} ~ {new Date(selectedReport.end_date).toLocaleDateString()}
                    </div>
                  ) : null}
                </div>
              </div>
              <PolicyMarkdown content={comparisonResult} />

              <div className="report-footer">
                <p>功能定制联系人:顾芷西 13305150560</p>
              </div>
            </div>
          </div>
          
          {renderPromptViewer(debugInfo.comparison, '对比阶段')}

          <details className="raw-llm-output">
            <summary>🧾 查看LLM原始输出（开发用）</summary>
            <pre>{comparisonResult}</pre>
          </details>
        </div>
      )}
    </div>
  );
};

export default WeeklyComparison;
