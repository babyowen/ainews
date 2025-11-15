import React, { useState, useEffect, useRef } from 'react';
import './PasswordProtection.css';

const PasswordProtection = ({ children, onAuthenticated }) => {
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

    // 模拟验证延迟，增加真实感
    await new Promise(resolve => setTimeout(resolve, 800));

    const correctPassword = import.meta.env.VITE_ADMIN_PASSWORD;
    
    // 调试日志
    console.log('输入的密码:', password);
    console.log('环境变量密码:', correctPassword);
    console.log('环境变量是否存在:', correctPassword !== undefined);
    
    // 如果没有设置环境变量，使用默认密码
    const targetPassword = correctPassword || 'keydigest2024';
    
    if (password === targetPassword) {
      localStorage.setItem('admin_auth_time', Date.now().toString());
      setIsAuthenticated(true);
      if (onAuthenticated) {
        onAuthenticated();
      }
    } else {
      setError('密码错误，请重试');
    }
    
    setLoading(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('admin_auth_time');
    setIsAuthenticated(false);
    setPassword('');
  };

  // 调试密码输入框
  useEffect(() => {
    if (passwordInputRef.current) {
      const input = passwordInputRef.current;
      console.log('密码输入框调试信息:');
      console.log('- 类型:', input.type);
      console.log('- 值:', input.value);
      console.log('- 字体:', getComputedStyle(input).fontFamily);
      console.log('- 字符间距:', getComputedStyle(input).letterSpacing);
      console.log('- WebKit text security:', getComputedStyle(input).webkitTextSecurity);
      console.log('- 计算后的样式:', getComputedStyle(input));
      
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
          <span className="auth-status">🔒 管理员模式</span>
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
          <h2>🔐 管理员验证</h2>
          <p>请输入管理员密码来访问修改评分功能</p>
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
            <p>💡 验证后30分钟内无需重复输入密码</p>
           
            
          </div>
      </div>
    </div>
  );
};

export default PasswordProtection; 