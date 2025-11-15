import { Link, useLocation } from 'react-router-dom';
import './Layout.css';

export default function Layout({ children }) {
  const { pathname } = useLocation();
  return (
    <div className="layout-root">
      <aside className="sidebar">
        <h1 className="logo">KeyDigest</h1>
        <nav>
          <Link className={pathname === "/summary" ? "active" : ""} to="/summary">关键词总结</Link>
          <Link className={pathname === "/analysis" ? "active" : ""} to="/analysis">来源分析</Link>
          <Link className={pathname === "/report" ? "active" : ""} to="/report">周报生成</Link>
          <Link className={pathname === "/config" ? "active" : ""} to="/config">周报参数</Link>
          <Link className={pathname === "/quality" ? "active" : ""} to="/quality">质量分析</Link>
          <Link className={pathname === "/score-edit" ? "active" : ""} to="/score-edit">修改评分</Link>
          <Link className={pathname === "/word-count" ? "active" : ""} to="/word-count">字数统计</Link>
        </nav>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  );
}