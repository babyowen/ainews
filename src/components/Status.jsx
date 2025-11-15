export function Loading() {
  return <div style={{ padding: 24, textAlign: 'center' }}>加载中...</div>;
}

export function Error() {
  return <div style={{ padding: 24, textAlign: 'center', color: 'red' }}>数据加载失败，请稍后重试</div>;
}

export function Empty() {
  return <div style={{ padding: 24, textAlign: 'center', color: '#888' }}>暂无数据</div>;
} 