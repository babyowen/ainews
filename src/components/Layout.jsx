import { Link, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import './Layout.css';

// 菜单图标组件
const MenuIcon = ({ type }) => {
  const icons = {
    news: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0v-9a2 2 0 0 1 2-2h2"/>
        <path d="M9 6h8"/>
        <path d="M9 10h8"/>
        <path d="M9 14h5"/>
      </svg>
    ),
    report: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <line x1="10" y1="9" x2="8" y2="9"/>
      </svg>
    ),
    edit: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg>
    ),
    chart: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10"/>
        <line x1="12" y1="20" x2="12" y2="4"/>
        <line x1="6" y1="20" x2="6" y2="14"/>
        <rect x="2" y="4" width="20" height="16" rx="2"/>
      </svg>
    ),
    settings: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    ),
    history: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 4v6h6"/>
        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
      </svg>
    ),
    policy: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    ),
    document: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
    ),
    scale: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        <path d="M8 11l4 4 4-4"/>
        <path d="M12 15V7"/>
      </svg>
    ),
    map: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
        <line x1="8" y1="2" x2="8" y2="18"/>
        <line x1="16" y1="6" x2="16" y2="22"/>
      </svg>
    )
  };

  return <span className="menu-icon">{icons[type] || icons.news}</span>;
};

// Logo图标
const LogoIcon = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="32" height="32" rx="8" fill="#d97706" fillOpacity="0.15"/>
    <path d="M8 16h16M16 8v16" stroke="#d97706" strokeWidth="2" strokeLinecap="round"/>
    <circle cx="8" cy="16" r="2" fill="#d97706"/>
    <circle cx="16" cy="8" r="2" fill="#f59e0b"/>
    <circle cx="16" cy="24" r="2" fill="#f59e0b"/>
    <circle cx="24" cy="16" r="2" fill="#d97706"/>
  </svg>
);

export default function Layout({ children }) {
  const { pathname } = useLocation();
  const [isPolicyOpen, setIsPolicyOpen] = useState(false);

  // 如果当前在政策相关页面，自动展开菜单
  useEffect(() => {
    if (pathname.startsWith('/policy')) {
      setIsPolicyOpen(true);
    }
  }, [pathname]);

  return (
    <div className="layout-root">
      <aside className="sidebar">
        <h1 className="logo">
          <LogoIcon />
          <span className="logo-text">
            <span className="primary">Ai News</span>
            <span className="secondary">智能新闻系统</span>
          </span>
        </h1>
        <nav>
          <Link className={pathname === "/summary" ? "active" : ""} to="/summary">
            <MenuIcon type="news" />
            每日新闻
          </Link>
          <Link className={pathname === "/report" ? "active" : ""} to="/report">
            <MenuIcon type="report" />
            周报生成
          </Link>
          <Link className={pathname === "/score-edit" ? "active" : ""} to="/score-edit">
            <MenuIcon type="edit" />
            评分修改
          </Link>
          <Link className={pathname === "/word-count" ? "active" : ""} to="/word-count">
            <MenuIcon type="chart" />
            字数统计
          </Link>
          <Link className={pathname === "/config" ? "active" : ""} to="/config">
            <MenuIcon type="settings" />
            周报参数
          </Link>
          <Link className={pathname === "/history" ? "active" : ""} to="/history">
            <MenuIcon type="history" />
            历史周报
          </Link>

          <div className="menu-group">
            <div
              className={`menu-trigger ${pathname.startsWith('/policy') ? 'active-group' : ''}`}
              onClick={() => setIsPolicyOpen(!isPolicyOpen)}
            >
              <span className="menu-label">
                <MenuIcon type="policy" />
                扬公政策对比
              </span>
              <span className={`arrow ${isPolicyOpen ? 'open' : ''}`}>▼</span>
            </div>
            <div className={`submenu ${isPolicyOpen ? 'open' : ''}`}>
              <Link className={pathname === "/policy/current" ? "active" : ""} to="/policy/current">
                <MenuIcon type="document" />
                现行政策编辑
              </Link>
              <Link className={pathname === "/policy/comparison" ? "active" : ""} to="/policy/comparison">
                <MenuIcon type="scale" />
                周报政策对比
              </Link>
              <Link className={pathname === "/policy/regions" ? "active" : ""} to="/policy/regions">
                <MenuIcon type="map" />
                地域政策浏览
              </Link>
            </div>
          </div>
        </nav>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  );
}
