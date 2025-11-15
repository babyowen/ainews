import ReactMarkdown from 'react-markdown';
import dayjs from 'dayjs';

function formatDate(dateStr) {
  if (!dateStr) return '';
  return dayjs(dateStr).format('YYYY-MM-DD');
}

const cardStyle = {
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  boxShadow: '0 1px 4px 0 rgba(60,80,120,0.04)',
  padding: '20px 28px 16px 28px',
  marginBottom: 18,
  width: '100%',
  textAlign: 'left',
};

const metaStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 18,
  marginBottom: 4,
  fontSize: 15,
  color: '#3d4673',
  fontWeight: 500,
  textAlign: 'left',
};

const tagStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  background: 'linear-gradient(90deg,#e3f0ff 0%,#f0f4ff 100%)',
  color: '#2563eb',
  fontWeight: 600,
  fontSize: 14,
  borderRadius: 6,
  padding: '2px 12px',
  marginRight: 8,
  letterSpacing: 1,
  boxShadow: '0 1px 2px 0 rgba(60,80,120,0.03)',
};

const dateTagStyle = {
  ...tagStyle,
  color: '#1e293b',
  background: 'linear-gradient(90deg,#f3f6fa 0%,#e9eefa 100%)',
  fontWeight: 500,
};

const roundTagStyle = {
  ...tagStyle,
  color: '#7c3aed',
  background: 'linear-gradient(90deg,#f3e8ff 0%,#ede9fe 100%)',
  fontWeight: 600,
};

const dividerStyle = {
  border: 0,
  borderTop: '1px solid #e5e7eb',
  margin: '12px 0',
};

const markdownStyle = {
  fontSize: 15,
  color: '#222',
  lineHeight: 1.7,
  wordBreak: 'break-word',
  textAlign: 'left',
  marginTop: 2,
};

export default function SummaryCard({ data }) {
  return (
    <div style={cardStyle}>
      <div style={metaStyle}>
        <span style={tagStyle}><span style={{fontSize:16,marginRight:4}}>🔑</span>{data.keyword}</span>
        <span style={dateTagStyle}><span style={{fontSize:15,marginRight:4}}>📅</span>{formatDate(data.date)}</span>
        {data.round && <span style={roundTagStyle}><span style={{fontSize:15,marginRight:4}}>🔄</span>第{data.round}轮</span>}
      </div>
      <hr style={dividerStyle} />
      <div style={markdownStyle}>
        <ReactMarkdown
          components={{
            h1: ({node, ...props}) => <h2 style={{fontSize:20,margin:'14px 0 8px 0',color:'#1a2240',fontWeight:800,textAlign:'left',letterSpacing:1}} {...props} />,
            h2: ({node, ...props}) => <h3 style={{fontSize:16,margin:'10px 0 6px 0',color:'#3d4673',fontWeight:600,textAlign:'left'}} {...props} />,
            h3: ({node, ...props}) => <h4 style={{fontSize:15,margin:'8px 0 4px 0',color:'#5a678a',fontWeight:500,textAlign:'left'}} {...props} />,
            ul: ({node, ...props}) => <ul style={{margin:'6px 0 6px 22px',padding:0,textAlign:'left'}} {...props} />,
            li: ({node, ...props}) => <li style={{margin:'4px 0',textAlign:'left'}} {...props} />,
            strong: ({node, ...props}) => <strong style={{color:'#1a2240',textAlign:'left'}} {...props} />,
            p: ({node, ...props}) => <p style={{margin:'6px 0',textAlign:'left'}} {...props} />,
          }}
        >
          {data.summary}
        </ReactMarkdown>
      </div>
    </div>
  );
} 