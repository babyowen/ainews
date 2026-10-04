import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowDown, Download, LoaderCircle } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { getIntroductionPages, introductionParts, renderIntroductionPages } from '../introduction/content.mjs';
import '../introduction/introduction.css';
import './Introduction.css';

export default function Introduction() {
  const [params, setParams] = useSearchParams();
  const part = params.get('part') === 'fund' ? 'fund' : 'general';
  const [exportPart, setExportPart] = useState('all');
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState('');
  const [active, setActive] = useState(0);
  const bookRef = useRef(null);
  const exportLock = useRef(false);
  const requestRef = useRef(null);
  const { apiFetch } = useAuth();
  const pages = getIntroductionPages(part);
  // Keep the static DOM stable when chapter position or download status changes.
  // Otherwise React replaces nodes that IntersectionObserver is still observing.
  const markup = useMemo(() => ({ __html: renderIntroductionPages(part) }), [part]);

  useEffect(() => () => requestRef.current?.abort(), []);

  useEffect(() => {
    const root = bookRef.current;
    if (!root) return;
    const sheets = [...root.querySelectorAll('.intro-sheet')];
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let observer;
    const configureMotion = () => {
      observer?.disconnect();
      root.classList.remove('intro-motion');
      sheets.forEach(sheet => sheet.classList.remove('intro-visible'));
      if (media.matches || !('IntersectionObserver' in window)) return;
      root.classList.add('intro-motion');
      observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('intro-visible');
            observer.unobserve(entry.target);
          }
        }
      }, { rootMargin: '0px 0px -30px 0px', threshold: 0.06 });
      sheets.forEach(sheet => observer.observe(sheet));
    };
    configureMotion();
    media.addEventListener('change', configureMotion);
    let frame;
    const updatePosition = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const line = window.innerHeight * 0.45;
        let index = 0;
        sheets.forEach((sheet, i) => { if (sheet.getBoundingClientRect().top <= line) index = i; });
        setActive(index);
      });
    };
    updatePosition();
    window.addEventListener('scroll', updatePosition, { passive: true });
    return () => {
      observer?.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', updatePosition);
      media.removeEventListener('change', configureMotion);
    };
  }, [part]);

  const jumpTo = id => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById(id)?.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'start' });
  };
  const changePart = next => {
    setParams({ part: next }, { replace: true });
    setActive(0);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const exportPdf = async () => {
    if (exportLock.current) return;
    exportLock.current = true;
    const controller = new AbortController();
    requestRef.current = controller;
    setExporting(true);
    setMessage('');
    try {
      const response = await apiFetch('/api/introduction/export-pdf', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ part: exportPart }), signal: controller.signal,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'PDF 导出失败，请重试');
      }
      const blob = await response.blob();
      if (!blob.type.includes('application/pdf')) throw new Error('未收到 PDF 文件，请重试');
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `KeyDigest_${introductionParts[exportPart].shortLabel}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('PDF 已生成，下载已开始。');
    } catch (error) {
      if (error.name !== 'AbortError') setMessage(error.message);
    } finally {
      exportLock.current = false;
      if (!controller.signal.aborted) setExporting(false);
    }
  };

  return <div className="introduction-page">
    <header className="intro-toolbar">
      <div className="intro-toolbar-main">
        <h1>网站介绍</h1>
        <div className="intro-part-switch" role="group" aria-label="选择介绍">
          <button type="button" aria-pressed={part === 'general'} onClick={() => changePart('general')}>网站总体介绍</button>
          <button type="button" aria-pressed={part === 'fund'} onClick={() => changePart('fund')}>公积金专区</button>
        </div>
        <div className="intro-export">
          <label htmlFor="intro-export-part" className="intro-sr-only">PDF 导出范围</label>
          <select id="intro-export-part" value={exportPart} onChange={event => setExportPart(event.target.value)} disabled={exporting}>
            <option value="general">网站介绍 · 3 页</option>
            <option value="fund">公积金专区 · 6 页</option>
            <option value="all">合并导出 · 9 页</option>
          </select>
          <button type="button" onClick={exportPdf} disabled={exporting} className="intro-export-button">
            {exporting ? <LoaderCircle size={15} className="intro-loading" /> : <Download size={15} />}
            {exporting ? '生成中…' : '导出 PDF'}
          </button>
        </div>
      </div>
      <nav className="intro-chapters" aria-label="介绍章节">
        {pages.map((page, index) => <button key={page.id} type="button" aria-current={active === index ? 'step' : undefined} onClick={() => jumpTo(page.id)}><span>{String(index + 1).padStart(2, '0')}</span>{page.label}</button>)}
      </nav>
      <div role="status" aria-live="polite" className={message ? 'intro-export-status' : 'intro-sr-only'}>{message}</div>
    </header>
    <div key={part} ref={bookRef} className="intro-book" dangerouslySetInnerHTML={markup} />
    <div className="intro-end"><span>KeyDigest · 让信息成为有依据的业务参考</span><button type="button" onClick={() => changePart(part === 'general' ? 'fund' : 'general')}>{part === 'general' ? '继续了解公积金专区' : '返回网站总体介绍'}<ArrowDown size={15} /></button></div>
  </div>;
}
