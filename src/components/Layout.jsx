import { Link, useLocation } from 'react-router-dom';
import './Layout.css';

export default function Layout({ children }) {
  const { pathname } = useLocation();
  return (
    <div className="layout-root">
      <aside className="sidebar">
        <h1 className="logo" style={{display:'flex',alignItems:'center',gap:10}}>
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
            <defs>
              <linearGradient id="aiGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#1a73e8"/>
                <stop offset="100%" stopColor="#5f6cff"/>
              </linearGradient>
            </defs>
            <circle cx="12" cy="12" r="9" fill="url(#aiGrad)" opacity="0.15"/>
            <path d="M6 12h12M12 6v12" stroke="url(#aiGrad)" strokeWidth="1.6" strokeLinecap="round"/>
            <circle cx="6" cy="12" r="1.6" fill="#1a73e8"/>
            <circle cx="12" cy="6" r="1.6" fill="#5f6cff"/>
            <circle cx="12" cy="18" r="1.6" fill="#5f6cff"/>
            <circle cx="18" cy="12" r="1.6" fill="#1a73e8"/>
          </svg>
          Ai News
        </h1>
        <nav>
          <Link className={pathname === "/summary" ? "active" : ""} to="/summary">每日总结</Link>
          <Link className={pathname === "/report" ? "active" : ""} to="/report">周报生成</Link>
          <Link className={pathname === "/score-edit" ? "active" : ""} to="/score-edit">评分修改</Link>
          <Link className={pathname === "/word-count" ? "active" : ""} to="/word-count">字数统计</Link>
          <Link className={pathname === "/config" ? "active" : ""} to="/config">周报参数</Link>
          <Link className={pathname === "/analysis" ? "active" : ""} to="/analysis">来源分析</Link>
          <Link className={pathname === "/quality" ? "active" : ""} to="/quality">质量分析</Link>
          <Link className={pathname === "/history" ? "active" : ""} to="/history">历史周报</Link>
        </nav>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  );
}