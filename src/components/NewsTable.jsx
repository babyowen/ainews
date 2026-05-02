import { Link, Tag, Search, Globe, Zap, Target, Calendar, ChevronFirst, ChevronLeft, ChevronRight, ChevronLast, Database } from 'lucide-react';
import './NewsTable.css';

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const scoreConfig = {
  5: { className: 'nt-score-5', label: '优秀' },
  4: { className: 'nt-score-4', label: '良好' },
  3: { className: 'nt-score-3', label: '中等' },
  2: { className: 'nt-score-2', label: '一般' },
  1: { className: 'nt-score-1', label: '较差' },
  0: { className: 'nt-score-0', label: '很差' },
};

function ScoreBadge({ score }) {
  const num = Number(score);
  const config = scoreConfig[num] || { className: 'nt-score-unknown', label: '未知' };
  return (
    <span className={`nt-score-badge ${config.className}`} title={`评分: ${score}分 (${config.label})`}>
      {score}
    </span>
  );
}

function SortArrow({ active, order }) {
  if (!active) return null;
  return (
    <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.6 }}>
      {order === 'desc' ? '▼' : '▲'}
    </span>
  );
}

export default function NewsTable({ data, pagination, onPageChange, onSort, sortBy, order }) {
  return (
    <div className="nt-wrapper">
      <div className="nt-accent" />
      <table className="nt">
        <thead>
          <tr>
            <th style={{ minWidth: 300 }}>
              <span className="nt-th-icon"><Link size={14} /> 标题</span>
            </th>
            <th style={{ minWidth: 120 }}>
              <span className="nt-th-icon"><Tag size={14} /> 主关键词</span>
            </th>
            <th style={{ minWidth: 130 }}>
              <span className="nt-th-icon"><Search size={14} /> 搜索关键词</span>
            </th>
            <th style={{ minWidth: 140, textAlign: 'center' }} className="nt-sortable" onClick={() => onSort?.('source')}>
              <span className="nt-th-icon"><Globe size={14} /> 来源<SortArrow active={sortBy === 'source'} order={order} /></span>
            </th>
            <th style={{ minWidth: 100, textAlign: 'center' }} className="nt-sortable" onClick={() => onSort?.('sourceapi')}>
              <span className="nt-th-icon"><Zap size={14} /> API<SortArrow active={sortBy === 'sourceapi'} order={order} /></span>
            </th>
            <th style={{ minWidth: 120, textAlign: 'center' }} className="nt-sortable" onClick={() => onSort?.('score')}>
              <span className="nt-th-icon"><Target size={14} /> AI评分<SortArrow active={sortBy === 'score'} order={order} /></span>
            </th>
            <th style={{ minWidth: 120, textAlign: 'center' }}>
              <span className="nt-th-icon"><Calendar size={14} /> 日期</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {data && data.length ? data.map(item => (
            <tr key={item.id}>
              <td data-label="标题">
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="nt-title"
                  title={item.content}
                >
                  {item.title}
                </a>
              </td>
              <td data-label="主关键词" className="nt-keyword">{item.keyword}</td>
              <td data-label="搜索关键词" className="nt-search-keyword">{item.search_keyword || '-'}</td>
              <td data-label="来源" className="nt-source">{item.source}</td>
              <td data-label="API" className="nt-source">{item.sourceapi}</td>
              <td data-label="AI评分" style={{ textAlign: 'center' }}>
                <ScoreBadge score={item.score} />
              </td>
              <td data-label="日期" className="nt-date">{formatDate(item.fetchdate)}</td>
            </tr>
          )) : (
            <tr className="nt-empty-row">
              <td colSpan={7}>
                <div className="nt-empty-state">
                  <Database size={32} />
                  <span>暂无数据</span>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {pagination && pagination.totalPages > 1 && (
        <div className="nt-pagination">
          <button className="nt-page-btn" disabled={pagination.page === 1} onClick={() => onPageChange?.(1)}>
            <ChevronFirst size={14} /> 首页
          </button>
          <button className="nt-page-btn" disabled={pagination.page === 1} onClick={() => onPageChange?.(pagination.page - 1)}>
            <ChevronLeft size={14} /> 上页
          </button>
          {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
            let p = i + Math.max(1, Math.min(pagination.page - 2, pagination.totalPages - 4));
            return (
              <button
                key={p}
                className={`nt-page-btn ${p === pagination.page ? 'active' : ''}`}
                onClick={() => onPageChange?.(p)}
              >
                {p}
              </button>
            );
          })}
          <button className="nt-page-btn" disabled={pagination.page === pagination.totalPages} onClick={() => onPageChange?.(pagination.page + 1)}>
            下页 <ChevronRight size={14} />
          </button>
          <button className="nt-page-btn" disabled={pagination.page === pagination.totalPages} onClick={() => onPageChange?.(pagination.totalPages)}>
            末页 <ChevronLast size={14} />
          </button>
          <div className="nt-page-jump">
            <span>跳转到</span>
            <input
              type="number"
              min={1}
              max={pagination.totalPages}
              defaultValue={pagination.page}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  let val = Number(e.target.value);
                  if (val >= 1 && val <= pagination.totalPages) {
                    onPageChange?.(val);
                  }
                }
              }}
            />
            <span>页</span>
          </div>
        </div>
      )}
    </div>
  );
}
