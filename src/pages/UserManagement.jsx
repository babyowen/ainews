import { useEffect, useState, useCallback } from 'react';
import { Users as UsersIcon, Plus, Trash2, Save, ShieldCheck, KeyRound } from 'lucide-react';
import { Empty, Error, Loading } from '../components/Status';
import { useAuth } from '../auth/AuthContext';
import './UserManagement.css';

export default function UserManagementPage() {
  const { authHeaders } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [msg, setMsg] = useState(null);

  const [form, setForm] = useState({
    username: '',
    displayName: '',
    password: '',
    role: 'restricted',
    keywords: [],
    routes: [],
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/admin/users', { headers: { ...authHeaders() } });
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (data && data.users.length > 0 && !isNew && selectedIdx === 0 && !form.username) {
      selectUser(0);
    }
  }, [data]);

  const flash = (text, type = 'success') => {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 3000);
  };

  const selectUser = (idx) => {
    setIsNew(false);
    setSelectedIdx(idx);
    const u = data.users[idx];
    setForm({
      username: u.username,
      displayName: u.displayName,
      password: '',
      role: u.role,
      keywords: [...u.keywords],
      routes: [...u.routes],
    });
  };

  const startNew = () => {
    setIsNew(true);
    setSelectedIdx(-1);
    setForm({
      username: '',
      displayName: '',
      password: '',
      role: 'restricted',
      keywords: [],
      routes: [],
    });
  };

  const toggleKeyword = (kw) => {
    setForm(f => ({
      ...f,
      keywords: f.keywords.includes(kw)
        ? f.keywords.filter(k => k !== kw)
        : [...f.keywords, kw],
    }));
  };

  const toggleRoute = (routePath) => {
    setForm(f => ({
      ...f,
      routes: f.routes.includes(routePath)
        ? f.routes.filter(r => r !== routePath)
        : [...f.routes, routePath],
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const url = isNew
        ? '/api/admin/users'
        : `/api/admin/users/${form.username}`;
      const method = isNew ? 'POST' : 'PUT';
      const body = isNew
        ? { ...form }
        : { displayName: form.displayName, password: form.password || undefined, role: form.role, keywords: form.keywords, routes: form.routes };
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (!res.ok) {
        flash(result.error || '保存失败', 'error');
        return;
      }
      flash(isNew ? '用户已创建' : '用户已更新');
      await loadData();
      if (isNew) {
        setIsNew(false);
        const idx = (await fetch('/api/admin/users', { headers: { ...authHeaders() } }).then(r => r.json())).users.length - 1;
        setSelectedIdx(idx);
        selectUser(idx);
      }
    } catch {
      flash('网络错误', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (form.username === 'admin') return;
    if (!window.confirm(`确定删除用户 "${form.displayName || form.username}"？`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/users/${form.username}`, { method: 'DELETE', headers: { ...authHeaders() } });
      const result = await res.json();
      if (!res.ok) {
        flash(result.error || '删除失败', 'error');
        return;
      }
      flash('用户已删除');
      setIsNew(false);
      setSelectedIdx(0);
      await loadData();
      if (data && data.users.length > 0) selectUser(0);
    } catch {
      flash('网络错误', 'error');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <div className="user-management-page kd-page"><Loading /></div>;
  if (error) return <div className="user-management-page kd-page"><Error text="读取用户配置失败" /></div>;
  if (!data) return null;

  const { users, allKeywords, availableRoutes } = data;
  const mainRoutes = availableRoutes.filter(r => r.group === 'main');
  const policyRoutes = availableRoutes.filter(r => r.group === 'policy');
  const current = isNew ? form : users[selectedIdx] || users[0];

  return (
    <div className="user-management-page kd-page">
      <header className="kd-page-header">
        <div>
          <p className="kd-page-kicker">USER MANAGEMENT</p>
          <h1 className="kd-page-title">用户管理</h1>
          <p className="kd-page-subtitle">新增、编辑用户，配置关键词与菜单权限。</p>
        </div>
        <div className="um-metrics" aria-label="用户概览">
          <span><UsersIcon size={16} /> 用户 {users.length} 个</span>
          <span><KeyRound size={16} /> 关键词 {allKeywords.length} 个</span>
        </div>
      </header>

      {msg && (
        <div className={`um-toast um-toast-${msg.type}`}>
          {msg.type === 'success' ? <ShieldCheck size={15} /> : <span>!</span>}
          {msg.text}
        </div>
      )}

      <div className="um-grid">
        {/* 左侧用户列表 */}
        <aside className="um-sidebar kd-panel">
          <div className="kd-panel-header">
            <h2 className="kd-panel-title">用户列表</h2>
            <button type="button" className="um-btn-add" onClick={startNew}>
              <Plus size={15} /> 新增
            </button>
          </div>
          <div className="um-user-list">
            {users.map((u, idx) => (
              <button
                key={u.username}
                type="button"
                className={`um-user-item ${!isNew && selectedIdx === idx ? 'active' : ''}`}
                onClick={() => selectUser(idx)}
              >
                <span className="um-user-icon"><UsersIcon size={15} /></span>
                <span className="um-user-info">
                  <strong>{u.displayName}</strong>
                  <span>@{u.username}</span>
                </span>
                <span className={`um-role-badge um-role-${u.role}`}>{u.role}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* 右侧编辑面板 */}
        <section className="um-detail">
          {!isNew && !current ? <Empty text="请选择一个用户" /> : (
            <div className="um-form kd-panel">
              <div className="kd-panel-header">
                <h2 className="kd-panel-title">{isNew ? '新增用户' : `编辑 · ${current.displayName}`}</h2>
              </div>

              <div className="um-form-body">
                {/* 基本信息 */}
                <div className="um-section">
                  <h3 className="um-section-title">基本信息</h3>
                  <div className="um-fields">
                    <label className="um-field">
                      <span>用户名</span>
                      {isNew ? (
                        <input type="text" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} placeholder="英文用户名" />
                      ) : (
                        <input type="text" value={form.username} disabled className="um-disabled" />
                      )}
                    </label>
                    <label className="um-field">
                      <span>显示名</span>
                      <input type="text" value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} placeholder="显示名称" />
                    </label>
                    <label className="um-field">
                      <span>密码{isNew ? '' : '（留空不修改）'}</span>
                      <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder={isNew ? '设置密码' : '留空不修改'} />
                    </label>
                    <label className="um-field">
                      <span>角色</span>
                      <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} disabled={!isNew && form.username === 'admin'}>
                        <option value="admin">admin</option>
                        <option value="restricted">restricted</option>
                      </select>
                    </label>
                  </div>
                </div>

                {/* 关键词权限 */}
                <div className="um-section">
                  <h3 className="um-section-title">关键词权限</h3>
                  <div className="um-checkbox-grid">
                    {allKeywords.map(kw => (
                      <label key={kw} className={`um-check ${form.keywords.includes(kw) ? 'checked' : ''}`}>
                        <input type="checkbox" checked={form.keywords.includes(kw)} onChange={() => toggleKeyword(kw)} />
                        {kw}
                      </label>
                    ))}
                  </div>
                  {allKeywords.length === 0 && <p className="um-empty-hint">数据库中暂无关键词</p>}
                </div>

                {/* 菜单权限 */}
                <div className="um-section">
                  <h3 className="um-section-title">菜单权限</h3>
                  <div className="um-route-group">
                    <p className="um-route-group-label">主菜单</p>
                    <div className="um-checkbox-grid">
                      {mainRoutes.map(r => (
                        <label key={r.path} className={`um-check ${form.routes.includes(r.path) ? 'checked' : ''}`}>
                          <input type="checkbox" checked={form.routes.includes(r.path)} onChange={() => toggleRoute(r.path)} />
                          {r.label}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="um-route-group">
                    <p className="um-route-group-label">政策子菜单</p>
                    <div className="um-checkbox-grid">
                      {policyRoutes.map(r => (
                        <label key={r.path} className={`um-check ${form.routes.includes(r.path) ? 'checked' : ''}`}>
                          <input type="checkbox" checked={form.routes.includes(r.path)} onChange={() => toggleRoute(r.path)} />
                          {r.label}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 操作按钮 */}
                <div className="um-actions">
                  <button type="button" className="um-btn um-btn-primary" onClick={handleSave} disabled={saving}>
                    <Save size={15} /> {saving ? '保存中...' : '保存'}
                  </button>
                  {!isNew && form.username !== 'admin' && (
                    <button type="button" className="um-btn um-btn-danger" onClick={handleDelete} disabled={deleting}>
                      <Trash2 size={15} /> {deleting ? '删除中...' : '删除用户'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
