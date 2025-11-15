function formatDate(dateStr) {
  if (!dateStr) return '';
  // 处理时区问题：将UTC时间转换为本地时间显示
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function NewsTable({ data, pagination, onPageChange, onSort, sortBy, order }) {
  return (
    <div style={{ 
      border: '1px solid rgba(61, 139, 253, 0.1)', 
      borderRadius: 16, 
      padding: 0, 
      background: 'linear-gradient(135deg, #ffffff 0%, #fafbff 100%)', 
      boxShadow: '0 12px 40px rgba(61, 139, 253, 0.15), 0 4px 16px rgba(0, 0, 0, 0.08)', 
      overflow: 'hidden',
      position: 'relative'
    }}>
      {/* 顶部装饰条 */}
      <div style={{
        height: '3px',
        background: 'linear-gradient(90deg, #3d8bfd 0%, #5f6cff 50%, #3d8bfd 100%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 2s linear infinite'
      }}></div>
      <style jsx>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
      
      <table style={{ 
        width: '100%', 
        borderCollapse: 'separate', 
        borderSpacing: 0, 
        fontSize: '14px', 
        background: 'transparent' 
      }}>
        <thead>
          <tr style={{ 
            background: 'linear-gradient(135deg, rgba(61, 139, 253, 0.08) 0%, rgba(95, 108, 255, 0.12) 100%)',
            borderBottom: '2px solid rgba(61, 139, 253, 0.1)'
          }}>
            <th style={{
              padding: '12px 16px', 
              fontWeight: 700, 
              color: '#1a202c', 
              fontSize: 15, 
              textAlign: 'center',
              background: 'linear-gradient(135deg, #2d3748 0%, #4a5568 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: '0.3px',
              minWidth: '300px'
            }}>🔗 标题</th>
            <th style={{
              padding: '12px 16px', 
              fontWeight: 700, 
              color: '#1a202c', 
              fontSize: 15,
              textAlign: 'center',
              background: 'linear-gradient(135deg, #2d3748 0%, #4a5568 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: '0.3px',
              minWidth: '120px',
              whiteSpace: 'nowrap'
            }}>🏷️ 主关键词</th>
            <th style={{
              padding: '12px 16px', 
              fontWeight: 700, 
              color: '#1a202c', 
              fontSize: 15,
              textAlign: 'center',
              background: 'linear-gradient(135deg, #2d3748 0%, #4a5568 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: '0.3px',
              minWidth: '130px',
              whiteSpace: 'nowrap'
            }}>🔍 搜索关键词</th>
            <th style={{
              padding: '12px 16px', 
              fontWeight: 700, 
              color: '#1a202c', 
              fontSize: 15, 
              cursor:'pointer', 
              userSelect:'none',
              textAlign: 'center',
              background: 'linear-gradient(135deg, #2d3748 0%, #4a5568 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: '0.3px',
              transition: 'all 0.2s ease',
              borderRadius: '8px',
              minWidth: '140px'
            }} 
            onClick={() => onSort && onSort('source')}
            onMouseOver={e => e.currentTarget.style.background = 'rgba(61, 139, 253, 0.1)'}
            onMouseOut={e => e.currentTarget.style.background = 'transparent'}
            >
              🌐 来源{sortBy === 'source' ? (order === 'desc' ? ' ▼' : ' ▲') : ''}
            </th>
            <th style={{
              padding: '12px 16px', 
              fontWeight: 700, 
              color: '#1a202c', 
              fontSize: 15, 
              cursor:'pointer', 
              userSelect:'none',
              textAlign: 'center',
              background: 'linear-gradient(135deg, #2d3748 0%, #4a5568 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: '0.3px',
              transition: 'all 0.2s ease',
              borderRadius: '8px',
              minWidth: '100px'
            }} 
            onClick={() => onSort && onSort('sourceapi')}
            onMouseOver={e => e.currentTarget.style.background = 'rgba(61, 139, 253, 0.1)'}
            onMouseOut={e => e.currentTarget.style.background = 'transparent'}
            >
              ⚡ API{sortBy === 'sourceapi' ? (order === 'desc' ? ' ▼' : ' ▲') : ''}
            </th>
            <th style={{
              padding: '12px 16px', 
              fontWeight: 700, 
              color: '#1a202c', 
              fontSize: 15, 
              cursor:'pointer', 
              userSelect:'none',
              textAlign: 'center',
              background: 'linear-gradient(135deg, #2d3748 0%, #4a5568 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: '0.3px',
              transition: 'all 0.2s ease',
              borderRadius: '8px',
              minWidth: '120px',
              whiteSpace: 'nowrap'
            }} 
            onClick={() => onSort && onSort('score')}
            onMouseOver={e => e.currentTarget.style.background = 'rgba(61, 139, 253, 0.1)'}
            onMouseOut={e => e.currentTarget.style.background = 'transparent'}
            >
              🎯 AI评分{sortBy === 'score' ? (order === 'desc' ? ' ▼' : ' ▲') : ''}
            </th>
            <th style={{
              padding: '12px 16px', 
              fontWeight: 700, 
              color: '#1a202c', 
              fontSize: 15,
              textAlign: 'center',
              background: 'linear-gradient(135deg, #2d3748 0%, #4a5568 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: '0.3px',
              minWidth: '120px'
            }}>📅 日期</th>
          </tr>
        </thead>
        <tbody>
          {data && data.length ? data.map((item, index) => (
            <tr key={item.id} style={{ 
              transition: 'all 0.3s ease', 
              cursor: 'pointer',
              background: index % 2 === 0 ? 'rgba(255, 255, 255, 0.8)' : 'rgba(250, 251, 255, 0.6)',
              borderBottom: '1px solid rgba(61, 139, 253, 0.08)'
            }}
              onMouseOver={e => {
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(61, 139, 253, 0.08) 0%, rgba(95, 108, 255, 0.06) 100%)';
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(61, 139, 253, 0.15)';
              }}
              onMouseOut={e => {
                e.currentTarget.style.background = index % 2 === 0 ? 'rgba(255, 255, 255, 0.8)' : 'rgba(250, 251, 255, 0.6)';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <td style={{padding: '8px 16px', borderBottom: 'none'}}>
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ 
                    color: '#2563eb', 
                    textDecoration: 'none', 
                    cursor: 'pointer', 
                    fontWeight: 500, 
                    fontSize: '14px', 
                    transition: 'all 0.2s ease',
                    lineHeight: '1.3'
                  }}
                  title={item.content}
                  onMouseOver={e => { 
                    e.currentTarget.style.color = '#3d8bfd'; 
                    e.currentTarget.style.textShadow = '0 1px 3px rgba(61, 139, 253, 0.3)';
                  }}
                  onMouseOut={e => { 
                    e.currentTarget.style.color = '#2563eb'; 
                    e.currentTarget.style.textShadow = 'none';
                  }}
                >
                  {item.title}
                </a>
              </td>
              <td style={{
                padding: '8px 16px', 
                color: '#4a5568', 
                borderBottom: 'none',
                fontWeight: 500,
                fontSize: '13px',
                textAlign: 'center'
              }}>{item.keyword}</td>
              <td style={{
                padding: '8px 16px', 
                color: '#6366f1', 
                borderBottom: 'none',
                fontWeight: 500,
                fontSize: '13px',
                textAlign: 'center',
                fontStyle: 'italic'
              }}>{item.search_keyword || '-'}</td>
              <td style={{
                padding: '8px 16px', 
                color: '#5a678a', 
                borderBottom: 'none',
                fontSize: '13px',
                textAlign: 'center'
              }}>{item.source}</td>
              <td style={{
                padding: '8px 16px', 
                color: '#5a678a', 
                borderBottom: 'none',
                fontSize: '13px',
                textAlign: 'center'
              }}>{item.sourceapi}</td>
              <td style={{
                padding: '8px 16px', 
                borderBottom: 'none',
                fontSize: '13px',
                textAlign: 'center'
              }}>
                {(() => {
                  const score = Number(item.score);
                  const getScoreColor = (score) => {
                    switch(score) {
                      case 5: return {
                        bg: 'linear-gradient(135deg, #10b981 0%, #047857 100%)',
                        shadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
                        label: '优秀'
                      };
                      case 4: return {
                        bg: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                        shadow: '0 2px 8px rgba(59, 130, 246, 0.3)',
                        label: '良好'
                      };
                      case 3: return {
                        bg: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
                        shadow: '0 2px 8px rgba(6, 182, 212, 0.3)',
                        label: '中等'
                      };
                      case 2: return {
                        bg: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                        shadow: '0 2px 8px rgba(245, 158, 11, 0.3)',
                        label: '一般'
                      };
                      case 1: return {
                        bg: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                        shadow: '0 2px 8px rgba(249, 115, 22, 0.3)',
                        label: '较差'
                      };
                      case 0: return {
                        bg: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                        shadow: '0 2px 8px rgba(239, 68, 68, 0.3)',
                        label: '很差'
                      };
                      default: return {
                        bg: 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
                        shadow: '0 2px 8px rgba(107, 114, 128, 0.3)',
                        label: '未知'
                      };
                    }
                  };
                  
                  const scoreStyle = getScoreColor(score);
                  
                  return (
                    <span 
                      style={{
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: '13px',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        border: 'none',
                        background: scoreStyle.bg,
                        boxShadow: scoreStyle.shadow,
                        display: 'inline-block',
                        minWidth: '28px',
                        textAlign: 'center',
                        transition: 'all 0.2s ease'
                      }}
                      title={`评分: ${item.score}分 (${scoreStyle.label})`}
                    >
                      {item.score}
                    </span>
                  );
                })()}
              </td>
              <td style={{
                padding: '8px 16px', 
                color: '#6b7280', 
                borderBottom: 'none',
                fontSize: '13px',
                fontFamily: 'Monaco, Consolas, monospace',
                textAlign: 'center'
              }}>{formatDate(item.fetchdate)}</td>
            </tr>
          )) : (
            <tr>
              <td colSpan={7} style={{ 
                textAlign: 'center', 
                color: '#9ca3af', 
                fontSize: '14px', 
                padding: '32px 0',
                background: 'linear-gradient(135deg, rgba(156, 163, 175, 0.1) 0%, rgba(209, 213, 219, 0.08) 100%)'
              }}>
                💾 暂无数据
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {/* 分页控件 */}
      {pagination && pagination.totalPages > 1 && (
        <div style={{ 
          margin: '20px 0 0 0', 
          padding: '20px 24px',
          background: 'linear-gradient(135deg, rgba(61, 139, 253, 0.03) 0%, rgba(95, 108, 255, 0.05) 100%)',
          borderTop: '1px solid rgba(61, 139, 253, 0.1)',
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          gap: 12, 
          flexWrap: 'wrap'
        }}>
          <button
            disabled={pagination.page === 1}
            style={{ 
              padding: '8px 16px', 
              borderRadius: 8, 
              border: '1px solid rgba(61, 139, 253, 0.1)', 
              background: pagination.page === 1 ? 'rgba(156, 163, 175, 0.1)' : 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', 
              color: pagination.page === 1 ? '#9ca3af' : '#374151',
              cursor: pagination.page === 1 ? 'not-allowed' : 'pointer',
              fontWeight: 500,
              fontSize: '14px',
              boxShadow: pagination.page === 1 ? 'none' : '0 2px 8px rgba(61, 139, 253, 0.1)',
              transition: 'all 0.2s ease'
            }}
            onClick={() => onPageChange && onPageChange(1)}
            onMouseOver={e => {
              if (pagination.page !== 1) {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(61, 139, 253, 0.2)';
              }
            }}
            onMouseOut={e => {
              if (pagination.page !== 1) {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(61, 139, 253, 0.1)';
              }
            }}
          >⏮️ 首页</button>
          
          <button
            disabled={pagination.page === 1}
            style={{ 
              padding: '8px 16px', 
              borderRadius: 8, 
              border: '1px solid rgba(61, 139, 253, 0.1)', 
              background: pagination.page === 1 ? 'rgba(156, 163, 175, 0.1)' : 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', 
              color: pagination.page === 1 ? '#9ca3af' : '#374151',
              cursor: pagination.page === 1 ? 'not-allowed' : 'pointer',
              fontWeight: 500,
              fontSize: '14px',
              boxShadow: pagination.page === 1 ? 'none' : '0 2px 8px rgba(61, 139, 253, 0.1)',
              transition: 'all 0.2s ease'
            }}
            onClick={() => onPageChange && onPageChange(pagination.page - 1)}
            onMouseOver={e => {
              if (pagination.page !== 1) {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(61, 139, 253, 0.2)';
              }
            }}
            onMouseOut={e => {
              if (pagination.page !== 1) {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(61, 139, 253, 0.1)';
              }
            }}
          >⬅️ 上页</button>
          
          {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
            let p = i + Math.max(1, Math.min(pagination.page - 2, pagination.totalPages - 4));
            return (
              <button
                key={p}
                style={{
                  margin: '0 2px',
                  padding: '8px 12px',
                  background: p === pagination.page ? 
                    'linear-gradient(135deg, #3d8bfd 0%, #5f6cff 100%)' : 
                    'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
                  color: p === pagination.page ? '#fff' : '#374151',
                  border: '1px solid rgba(61, 139, 253, 0.1)',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontWeight: p === pagination.page ? 700 : 500,
                  fontSize: '14px',
                  minWidth: '40px',
                  transition: 'all 0.2s ease',
                  boxShadow: p === pagination.page ? 
                    '0 4px 12px rgba(61, 139, 253, 0.3)' : 
                    '0 2px 8px rgba(61, 139, 253, 0.1)'
                }}
                onClick={() => onPageChange && onPageChange(p)}
                onMouseOver={e => {
                  if (p !== pagination.page) {
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(61, 139, 253, 0.2)';
                    e.currentTarget.style.background = 'linear-gradient(135deg, #3d8bfd 0%, #5f6cff 100%)';
                    e.currentTarget.style.color = '#fff';
                  }
                }}
                onMouseOut={e => {
                  if (p !== pagination.page) {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(61, 139, 253, 0.1)';
                    e.currentTarget.style.background = 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)';
                    e.currentTarget.style.color = '#374151';
                  }
                }}
              >
                {p}
              </button>
            );
          })}
          
          <button
            disabled={pagination.page === pagination.totalPages}
            style={{ 
              padding: '8px 16px', 
              borderRadius: 8, 
              border: '1px solid rgba(61, 139, 253, 0.1)', 
              background: pagination.page === pagination.totalPages ? 'rgba(156, 163, 175, 0.1)' : 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', 
              color: pagination.page === pagination.totalPages ? '#9ca3af' : '#374151',
              cursor: pagination.page === pagination.totalPages ? 'not-allowed' : 'pointer',
              fontWeight: 500,
              fontSize: '14px',
              boxShadow: pagination.page === pagination.totalPages ? 'none' : '0 2px 8px rgba(61, 139, 253, 0.1)',
              transition: 'all 0.2s ease'
            }}
            onClick={() => onPageChange && onPageChange(pagination.page + 1)}
            onMouseOver={e => {
              if (pagination.page !== pagination.totalPages) {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(61, 139, 253, 0.2)';
              }
            }}
            onMouseOut={e => {
              if (pagination.page !== pagination.totalPages) {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(61, 139, 253, 0.1)';
              }
            }}
          >下页 ➡️</button>
          
          <button
            disabled={pagination.page === pagination.totalPages}
            style={{ 
              padding: '8px 16px', 
              borderRadius: 8, 
              border: '1px solid rgba(61, 139, 253, 0.1)', 
              background: pagination.page === pagination.totalPages ? 'rgba(156, 163, 175, 0.1)' : 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', 
              color: pagination.page === pagination.totalPages ? '#9ca3af' : '#374151',
              cursor: pagination.page === pagination.totalPages ? 'not-allowed' : 'pointer',
              fontWeight: 500,
              fontSize: '14px',
              boxShadow: pagination.page === pagination.totalPages ? 'none' : '0 2px 8px rgba(61, 139, 253, 0.1)',
              transition: 'all 0.2s ease'
            }}
            onClick={() => onPageChange && onPageChange(pagination.totalPages)}
            onMouseOver={e => {
              if (pagination.page !== pagination.totalPages) {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(61, 139, 253, 0.2)';
              }
            }}
            onMouseOut={e => {
              if (pagination.page !== pagination.totalPages) {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(61, 139, 253, 0.1)';
              }
            }}
          >末页 ⏭️</button>
          
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 8, 
            marginLeft: 16,
            padding: '8px 12px',
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.8) 0%, rgba(248, 250, 252, 0.9) 100%)',
            borderRadius: 8,
            border: '1px solid rgba(61, 139, 253, 0.1)'
          }}>
            <span style={{color:'#6b7280', fontSize:14, fontWeight: 500}}>🎯 跳转到</span>
            <input
              type="number"
              min={1}
              max={pagination.totalPages}
              defaultValue={pagination.page}
              style={{ 
                width: 60, 
                padding: '6px 8px', 
                borderRadius: 6, 
                border: '1px solid rgba(61, 139, 253, 0.2)', 
                margin: '0',
                fontSize: '14px',
                textAlign: 'center',
                background: '#fff',
                transition: 'all 0.2s ease',
                outline: 'none'
              }}
              onFocus={e => {
                e.currentTarget.style.borderColor = '#3d8bfd';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(61, 139, 253, 0.1)';
              }}
              onBlur={e => {
                e.currentTarget.style.borderColor = 'rgba(61, 139, 253, 0.2)';
                e.currentTarget.style.boxShadow = 'none';
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  let val = Number(e.target.value);
                  if (val >= 1 && val <= pagination.totalPages) {
                    onPageChange && onPageChange(val);
                  }
                }
              }}
            />
            <span style={{color:'#6b7280', fontSize:14, fontWeight: 500}}>页</span>
          </div>
        </div>
      )}
    </div>
  );
} 