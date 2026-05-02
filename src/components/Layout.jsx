import { Link, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import {
  BarChart3,
  ChevronDown,
  FileClock,
  FileText,
  Gauge,
  History,
  Landmark,
  Map,
  Menu,
  Newspaper,
  PenLine,
  Scale,
  Settings2,
  X
} from 'lucide-react';
import './Layout.css';

const menuItems = [
  { to: '/summary', label: '每日新闻', icon: Newspaper },
  { to: '/report', label: '周报生成', icon: FileText },
  { to: '/score-edit', label: '评分修改', icon: PenLine },
  { to: '/word-count', label: '字数统计', icon: BarChart3 },
  { to: '/config', label: '周报参数', icon: Settings2 },
  { to: '/history', label: '历史周报', icon: History }
];

const policyItems = [
  { to: '/policy/current', label: '现行政策编辑', icon: FileClock },
  { to: '/policy/comparison', label: '周报政策对比', icon: Scale },
  { to: '/policy/regions', label: '地域政策浏览', icon: Map },
  { to: '/policy/region-report', label: '地区政策报告', icon: FileText }
];

function BrandMark() {
  return (
    <div className="brand-mark" aria-hidden="true">
      <Gauge size={22} />
    </div>
  );
}

function NavIcon({ icon: Icon }) {
  return <Icon className="menu-icon" size={18} strokeWidth={2.1} />;
}

export default function Layout({ children }) {
  const { pathname } = useLocation();
  const [isPolicyOpen, setIsPolicyOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (pathname.startsWith('/policy')) {
      setIsPolicyOpen(true);
    }
  }, [pathname]);

  // 路由切换时自动关闭移动端菜单
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  return (
    <div className="layout-root">
      {/* 移动端顶部栏 */}
      <header className="mobile-topbar">
        <button
          type="button"
          className="mobile-menu-btn"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          aria-label={isMobileMenuOpen ? '关闭菜单' : '打开菜单'}
        >
          {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
        <span className="mobile-brand">KeyDigest</span>
      </header>

      {/* 移动端遮罩层 */}
      {isMobileMenuOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setIsMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside className={`sidebar ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
        <h1 className="logo">
          <BrandMark />
          <span className="logo-text">
            <span className="eyebrow">KEY INTELLIGENCE</span>
            <span className="primary">
              <span className="primary-key">Key</span><strong>Digest</strong>
            </span>
            <span className="secondary"><span>智能新闻工作台</span></span>
          </span>
        </h1>
        <nav aria-label="主导航">
          {menuItems.map(item => (
            <Link key={item.to} className={pathname === item.to ? 'active' : ''} to={item.to} onClick={() => setIsMobileMenuOpen(false)}>
              <NavIcon icon={item.icon} />
              {item.label}
            </Link>
          ))}

          <div className="menu-group">
            <button
              type="button"
              className={`menu-trigger ${pathname.startsWith('/policy') ? 'active-group' : ''}`}
              onClick={() => setIsPolicyOpen(!isPolicyOpen)}
              aria-expanded={isPolicyOpen}
            >
              <span className="menu-label">
                <NavIcon icon={Landmark} />
                扬公政策对比
              </span>
              <ChevronDown className={`arrow ${isPolicyOpen ? 'open' : ''}`} size={16} />
            </button>
            <div className={`submenu ${isPolicyOpen ? 'open' : ''}`}>
              {policyItems.map(item => (
                <Link key={item.to} className={pathname === item.to ? 'active' : ''} to={item.to} onClick={() => setIsMobileMenuOpen(false)}>
                  <NavIcon icon={item.icon} />
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </nav>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  );
}
