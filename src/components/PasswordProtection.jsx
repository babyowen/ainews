import React, { useState, useEffect, useRef } from 'react';
import './PasswordProtection.css';

const PasswordProtection = ({ children, onAuthenticated, title = '管理员验证', description = '请输入管理员密码来访问修改评分功能' }) => {
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    // 检查是否在30分钟内已经验证过
    const authTime = localStorage.getItem('admin_auth_time');
    if (authTime) {
      const now = Date.now();
      const timeDiff = now - parseInt(authTime);
      return timeDiff < 30 * 60 * 1000; // 30分钟
    }
    return false;
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const passwordInputRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.user?.role !== 'admin') {
        setError('密码错误，请重试');
        return;
      }
      localStorage.setItem('admin_auth_time', Date.now().toString());
      setIsAuthenticated(true);
      onAuthenticated?.();
    } catch {
      setError('验证服务暂时不可用，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('admin_auth_time');
    setIsAuthenticated(false);
    setPassword('');
  };

  // 设置密码输入框的显示样式
  useEffect(() => {
    if (passwordInputRef.current) {
      const input = passwordInputRef.current;
      // 强制设置密码输入框属性
      input.type = 'password';
      input.style.webkitTextSecurity = 'disc';
      input.style.textSecurity = 'disc';
      input.style.letterSpacing = '0.1em';
      input.style.fontFamily = 'system-ui, -apple-system, sans-serif';
    }
  }, []);

  if (isAuthenticated) {
    return (
      <div className="authenticated-container">
        <div className="logout-header">
          <span className="auth-status">管理员模式</span>
          <button onClick={handleLogout} className="logout-btn">
            退出登录
          </button>
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className="password-protection">
      <div className="password-card">
        <div className="password-header">
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        
        <form onSubmit={handleSubmit} className="password-form">
          <div className="input-group">
            <label htmlFor="password">管理员密码</label>
            <input
              ref={passwordInputRef}
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              disabled={loading}
              required
              autoComplete="current-password"
              spellCheck="false"
              style={{
                WebkitTextSecurity: 'disc',
                textSecurity: 'disc',
                letterSpacing: '0.1em',
                fontFamily: 'system-ui, -apple-system, sans-serif'
              }}
            />
          </div>
          
          {error && <div className="error-message">{error}</div>}
          
          <button type="submit" disabled={loading} className="submit-btn">
            {loading ? (
              <>
                <span className="spinner"></span>
                验证中...
              </>
            ) : (
              '验证密码'
            )}
          </button>
        </form>
        
                  <div className="password-hint">
            <p>验证后30分钟内无需重复输入密码</p>
           
            
          </div>
      </div>
    </div>
  );
};

export default PasswordProtection;