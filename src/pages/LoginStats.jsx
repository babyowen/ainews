import { useEffect, useState } from 'react';
import { Clock3, ShieldCheck, Users } from 'lucide-react';
import { Empty, Error, Loading } from '../components/Status';
import './LoginStats.css';

export default function LoginStatsPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadStats = async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await fetch('/api/auth/login-stats');
      if (!response.ok) throw new Error('读取登录统计失败');
      setStats(await response.json());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  const summary = stats?.summary || [];
  const records = stats?.records || [];

  return (
    <div className="login-stats-page kd-page">
      <header className="kd-page-header">
        <div>
          <p className="kd-page-kicker">ACCESS LOG</p>
          <h1 className="kd-page-title">登录统计</h1>
          <p className="kd-page-subtitle">查看用户成功登录次数、最近登录时间和具体登录明细。</p>
        </div>
        <div className="login-stats-metrics" aria-label="登录概览">
          <span><Users size={16} /> 用户 {summary.length} 个</span>
          <span><ShieldCheck size={16} /> 成功登录 {stats?.total || 0} 次</span>
        </div>
      </header>

      {loading ? <Loading /> : error ? <Error text="读取登录统计失败" /> : (
        <>
          <section className="login-stats-summary">
            {summary.length ? summary.map(item => (
              <article key={item.username} className="login-stat-card kd-panel">
                <div>
                  <p className="login-stat-label">用户</p>
                  <h2>{item.username}</h2>
                </div>
                <strong>{item.count}</strong>
                <p><Clock3 size={15} /> 最近 {item.lastDate} {item.lastTime}</p>
              </article>
            )) : <Empty text="暂无登录记录" />}
          </section>

          {records.length > 0 && (
            <section className="login-stats-table kd-panel">
              <div className="kd-panel-header">
                <h2 className="kd-panel-title">登录明细</h2>
              </div>
              <div className="login-stats-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>用户</th>
                      <th>日期</th>
                      <th>时间</th>
                      <th>User Agent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((record, index) => (
                      <tr key={`${record.username}-${record.loginAt}-${index}`}>
                        <td>{record.username}</td>
                        <td>{record.date}</td>
                        <td>{record.time}</td>
                        <td className="user-agent-cell">{record.userAgent || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
