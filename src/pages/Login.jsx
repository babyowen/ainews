import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Gauge } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import './Login.css';

export default function LoginPage() {
  const { isAuthenticated, login, user } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) {
    return <Navigate to={user?.defaultPath || '/summary'} replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const profile = await login({ username, password });
      navigate(profile.defaultPath || '/summary', { replace: true });
    } catch (err) {
      setError(err.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-brand-panel" aria-label="系统介绍">
        <div className="login-brand-topline">
          <div className="login-brand-mark">
            <Gauge size={30} />
          </div>
          <p className="login-kicker">KEY INTELLIGENCE</p>
        </div>
        <h1 className="login-title">
          <span className="login-title-cn">智能新闻工作台</span>
          <span className="login-title-en">KeyDigest</span>
        </h1>
        <p className="login-subtitle">面向关键词监测、AI 评分、周报生成与政策对比的内部工作台。</p>
      </section>

      <section className="login-card" aria-label="登录表单">
        <div className="login-card-header">
          <p className="login-card-kicker">SIGN IN</p>
          <h2>账号登录</h2>
          <p>请输入分配的用户名和密码进入工作台。</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            <span>用户名</span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label>
            <span>密码</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="login-submit" disabled={loading}>
            {loading ? '登录中...' : '进入工作台'}
          </button>
        </form>
      </section>
    </main>
  );
}
