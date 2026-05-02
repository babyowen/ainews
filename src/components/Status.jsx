export function Loading({ text = '加载中...' }) {
  return (
    <div className="kd-status">
      <span className="kd-status-spinner" />
      <span>{text}</span>
    </div>
  );
}

export function Error({ text = '数据加载失败，请稍后重试' }) {
  return <div className="kd-status kd-status-error">{text}</div>;
}

export function Empty({ text = '暂无数据' }) {
  return <div className="kd-status kd-status-empty">{text}</div>;
}
