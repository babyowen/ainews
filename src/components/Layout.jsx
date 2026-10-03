import { Link, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import {
  BarChart3,
  CalendarClock,
  ChevronDown,
  FileClock,
  FileText,
  Gauge,
  Globe,
  Landmark,
  LogOut,
  Map,
  Menu,
  Newspaper,
  PenLine,
  Scale,
  ShieldCheck,
  Settings2,
  Users,
  X,
  Tags
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import './Layout.css';
import {getVisibleNavigation, getActiveGroupIds} from '../config/navigation';

const icons={BarChart3,CalendarClock,FileClock,FileText,Globe,Landmark,Map,Newspaper,PenLine,Scale,ShieldCheck,Settings2,Users,Tags};
function NavBranch({node,pathname,openGroups,toggleGroup,closeMobile}) {
  const Icon=icons[node.icon]||FileText;
  if(node.path) return <Link to={node.path} className={pathname===node.path?'active':''} aria-current={pathname===node.path?'page':undefined} onClick={closeMobile}><Icon className="menu-icon" size={18}/>{node.label}</Link>;
  const open=!!openGroups[node.id];
  const active=getActiveGroupIds(pathname).includes(node.id);
  return <div className={`menu-group ${node.id==='housing-fund'?'fund-menu-group':'fund-subgroup'}`}>
    <button type="button" className={`menu-trigger ${active?'active-group':''}`} onClick={()=>toggleGroup(node.id)} aria-expanded={open} aria-controls={`nav-${node.id}`}>
      <span className="menu-label"><Icon className="menu-icon" size={18}/>{node.label}</span><ChevronDown className={`arrow ${open?'open':''}`} size={16}/>
    </button>
    <div id={`nav-${node.id}`} className="fund-submenu" hidden={!open}>
      {node.children.map(child=><NavBranch key={child.id} node={child} pathname={pathname} openGroups={openGroups} toggleGroup={toggleGroup} closeMobile={closeMobile}/>)}
    </div>
  </div>;
}

function BrandMark() {
  return (
    <div className="brand-mark" aria-hidden="true">
      <Gauge size={22} />
    </div>
  );
}

export default function Layout({ children }) {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const [openGroups, setOpenGroups] = useState(() => Object.fromEntries(getActiveGroupIds(pathname).map(id => [id,true])));
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const visibleNavigation=getVisibleNavigation(user);
  useEffect(()=>{setOpenGroups(previous=>({...previous,...Object.fromEntries(getActiveGroupIds(pathname).map(id=>[id,true]))}));},[pathname]);

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
          {visibleNavigation.map(node=><NavBranch key={node.id} node={node} pathname={pathname} openGroups={openGroups} toggleGroup={id=>setOpenGroups(prev=>({...prev,[id]:!prev[id]}))} closeMobile={()=>setIsMobileMenuOpen(false)}/>)}
        </nav>
        <div className="sidebar-user">
          <div className="sidebar-user-meta">
            <span className="sidebar-user-label">当前用户</span>
            <strong>{user?.displayName || user?.username}</strong>
          </div>
          <button type="button" className="sidebar-logout" onClick={logout}>
            <LogOut size={16} />
            退出
          </button>
        </div>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  );
}
