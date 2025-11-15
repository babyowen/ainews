function formatDate(dateStr) {
  if (!dateStr) return '';
  // 处理时区问题：将UTC时间转换为本地时间显示
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// API标签渲染
function renderApiTags(apiStr) {
  if (!apiStr) return '-';
  const apis = apiStr.split(',').map(s => s.trim()).filter(Boolean);
  return apis.map(api => {
    let label = '';
    let color = '#d9d9d9';
    if (/google/i.test(api)) {
      label = 'G';
      color = '#4285F4';
    } else if (/baidu/i.test(api)) {
      label = 'BA';
      color = '#3170e6';
    } else if (/bing/i.test(api)) {
      label = 'BI';
      color = '#008373';
    } else {
      label = api.slice(0,2).toUpperCase();
      color = '#888';
    }
    return (
      <span key={api} style={{
        display: 'inline-block',
        minWidth: 22,
        padding: '0 6px',
        marginRight: 4,
        background: color + '22',
        color,
        border: `1.5px solid ${color}`,
        borderRadius: 6,
        fontWeight: 700,
        fontSize: 12,
        textAlign: 'center',
        letterSpacing: 1,
      }}>{label}</span>
    );
  });
}

export default function SourceTable({ data, onSort, sortBy, order, page, pageSize, total, onPageChange }) {
  const columns = [
    { key: 'domain', label: '网站' },
    { key: 'keyword', label: '关键词' },
    { key: 'count', label: '抓取量' },
    { key: 'date', label: '日期' },
  ];

  // 分页数据
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const pageData = data.slice(start, end);
  const totalPages = Math.ceil((total || data.length) / pageSize);

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 8, boxShadow: '0 2px 8px #f0f1f2', background: '#fff' }}>
      <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 13, color: '#222', borderRadius: 10, overflow: 'hidden' }}>
        <thead>
          <tr style={{ background: '#f5f7fa', fontWeight: 700, fontSize: 13 }}>
            {columns.map(col => (
              <th key={col.key} style={{ cursor: 'pointer', padding: '6px 6px', borderBottom: '2px solid #e5e7eb', textAlign: 'left', letterSpacing: 1 }} onClick={() => onSort && onSort(col.key)}>
                {col.label}
                {sortBy === col.key && (order === 'asc' ? ' ▲' : ' ▼')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pageData && pageData.length ? pageData.map(item => (
            <tr key={item.id || item.domain + item.keyword + item.date}
                style={{ transition: 'background 0.2s', height: 26, lineHeight: '26px' }}
                onMouseEnter={e => e.currentTarget.style.background = '#e6f7ff'}
                onMouseLeave={e => e.currentTarget.style.background = ''}>
              <td style={{ padding: '4px 6px' }}>{item.domain}</td>
              <td style={{ padding: '4px 6px' }}>{item.keyword}</td>
              <td style={{ padding: '4px 6px' }}>{item.count}</td>
              <td style={{ padding: '4px 6px' }}>{formatDate(item.date)}</td>
            </tr>
          )) : <tr><td colSpan={5} style={{ textAlign: 'center', color: '#888', padding: 12 }}>暂无数据</td></tr>}
        </tbody>
      </table>
      {/* 分页控件 */}
      <div style={{ marginTop: 8, textAlign: 'right' }}>
        {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
          <button
            key={p}
            style={{
              margin: '0 2px',
              padding: '1px 6px',
              background: p === page ? '#3d4673' : '#f7f7f7',
              color: p === page ? '#fff' : '#333',
              border: 'none',
              borderRadius: 3,
              cursor: 'pointer',
              fontSize: 12
            }}
            onClick={() => onPageChange && onPageChange(p)}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
} 