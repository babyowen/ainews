import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock3, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import ReactECharts from 'echarts-for-react';
import { Empty, Error, Loading } from '../components/Status';
import { useAuth } from '../auth/AuthContext';
import { buildLoginStats } from '../utils/loginStats';
import './LoginStats.css';

const emptyRecords = [];
const ranges = [{ value: '7', label: '近 7 天' }, { value: '30', label: '近 30 天' }, { value: 'all', label: '全部记录' }];
const pageSize = 20;

export default function LoginStatsPage() {
  const { authHeaders } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [range, setRange] = useState('30');
  const [username, setUsername] = useState('');
  const [page, setPage] = useState(1);

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await fetch('/api/auth/login-stats', { headers: { ...authHeaders() } });
      if (!response.ok) throw new Error('读取登录统计失败');
      setStats(await response.json());
      setPage(1);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => { loadStats(); }, [loadStats]);

  const allRecords = stats?.records || emptyRecords;
  const usernames = useMemo(() => [...new Set(allRecords.map(record => record.username))].sort(), [allRecords]);
  const view = useMemo(() => buildLoginStats(allRecords, {
    days: range === 'all' ? null : Number(range), username,
  }), [allRecords, range, username]);
  const pageCount = Math.max(1, Math.ceil(view.total / pageSize));
  const currentPage = Math.min(page, pageCount);
  const records = view.records.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const rangeLabel = ranges.find(item => item.value === range).label;

  const chartOptions = useMemo(() => {
    const base = {
      color: ['#147d83'], animationDuration: 300,
      aria: { enabled: true },
      tooltip: { trigger: 'axis', renderMode: 'richText', confine: true },
      textStyle: { fontFamily: 'inherit', color: '#52646a' },
    };
    return {
      trend: {
        ...base,
        grid: { left: 44, right: 20, top: 30, bottom: view.daily.length > 60 ? 65 : 34 },
        xAxis: { type: 'category', boundaryGap: false, data: view.daily.map(day => day.date), axisLabel: { formatter: date => date.slice(5) }, axisLine: { lineStyle: { color: '#dce6e7' } }, axisTick: { show: false } },
        yAxis: { type: 'value', minInterval: 1, name: '次数', splitLine: { lineStyle: { color: '#edf2f3' } } },
        dataZoom: view.daily.length > 60 ? [{ type: 'inside' }, { type: 'slider', height: 18, bottom: 6 }] : [],
        series: [{ name: '成功登录', type: 'line', data: view.daily.map(day => day.count), symbolSize: 6, lineStyle: { width: 3 }, areaStyle: { color: 'rgba(20,125,131,0.10)' } }],
      },
      users: {
        ...base,
        grid: { left: 16, right: 40, top: 16, bottom: 20, containLabel: true },
        xAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: '#edf2f3' } } },
        yAxis: { type: 'category', inverse: true, data: view.summary.map(user => user.username), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { width: 100, overflow: 'truncate' } },
        series: [{ name: '成功登录', type: 'bar', barMaxWidth: 26, data: view.summary.map(user => user.count), label: { show: true, position: 'right' }, itemStyle: { borderRadius: [0, 5, 5, 0] } }],
      },
    };
  }, [view]);

  function selectUser(value) { setUsername(value); setPage(1); }

  return (
    <div className="login-stats-page kd-page">
      <header className="kd-page-header">
        <div>
          <p className="kd-page-kicker">ACCESS LOG</p>
          <h1 className="kd-page-title">登录统计</h1>
          <p className="kd-page-subtitle">查看登录趋势、用户分布与完整明细。所有时间均为北京时间。</p>
        </div>
        <button className="login-stats-refresh" onClick={loadStats} disabled={loading}>
          <RefreshCw size={16} /> {loading ? '加载中' : '刷新数据'}
        </button>
      </header>

      <section className="login-stats-filters kd-panel" aria-label="登录统计筛选">
        <div className="login-stats-range" aria-label="日期范围">
          {ranges.map(item => <button key={item.value} aria-pressed={range === item.value} onClick={() => { setRange(item.value); setPage(1); }}>{item.label}</button>)}
        </div>
        <label>用户 <select aria-label="用户" value={username} onChange={event => selectUser(event.target.value)}><option value="">全部用户</option>{usernames.map(user => <option key={user} value={user}>{user}</option>)}</select></label>
        <span className="login-stats-timezone">北京时间 · UTC+8</span>
      </section>

      {loading ? <Loading /> : error ? <Error text="读取登录统计失败，请点击刷新重试" /> : (
        <>
          <section className="login-stats-overview" aria-label="所选范围登录概览">
            <article className="kd-panel login-stat-metric"><span><ShieldCheck size={17} /> 成功登录</span><strong>{view.total.toLocaleString()}</strong><small>{rangeLabel} · {username || '全部用户'}</small></article>
            <article className="kd-panel login-stat-metric"><span><Users size={17} /> 登录用户</span><strong>{view.userCount.toLocaleString()}<em>人</em></strong><small>所选范围内成功登录的用户</small></article>
            <article className="kd-panel login-stat-metric"><span><Clock3 size={17} /> 最近登录</span><strong className="login-stat-latest">{view.latest?.time || '—'}</strong><small>{view.latest ? `${view.latest.date} · ${view.latest.username}` : '所选范围内暂无登录'}</small></article>
          </section>

          {view.total > 0 ? (
            <>
              <section className="login-stats-charts" aria-label="登录统计图表">
                <article className="kd-panel login-stats-chart"><div className="kd-panel-header"><div><h2 className="kd-panel-title">每日登录趋势</h2><p>按北京时间统计，未登录的日期计为 0</p></div><span>{rangeLabel}</span></div><ReactECharts notMerge option={chartOptions.trend} style={{ height: 290 }} /></article>
                <article className="kd-panel login-stats-chart"><div className="kd-panel-header"><div><h2 className="kd-panel-title">用户登录次数</h2><p>点击柱形可筛选该用户</p></div></div><ReactECharts notMerge option={chartOptions.users} style={{ height: Math.max(290, view.summary.length * 36 + 50) }} onEvents={{ click: event => selectUser(event.name) }} /></article>
              </section>
              {view.unknownTimeCount > 0 && <p className="login-stats-note">有 {view.unknownTimeCount} 条记录的时间未知，已保留在明细和总次数中，不计入每日趋势。</p>}
              <section className="login-stats-summary" aria-label="用户登录汇总">
                {view.summary.map(item => <article key={item.username} className="login-stat-card kd-panel"><div><p className="login-stat-label">用户</p><h2>{item.username}</h2></div><strong>{item.count}<span> 次</span></strong><p><Clock3 size={15} /> 最近 {item.lastDate ? `${item.lastDate} ${item.lastTime}` : '时间未知'}</p></article>)}
              </section>
            </>
          ) : <Empty text="所选范围内暂无登录记录，可调整日期或用户筛选" />}

          <section className="login-stats-table kd-panel">
            <div className="kd-panel-header"><h2 className="kd-panel-title">登录明细</h2><span>共 {view.total} 条 · 北京时间</span></div>
            <div className="login-stats-table-wrap">
              <table><thead><tr><th>用户</th><th>日期</th><th>时间</th><th>User Agent</th></tr></thead><tbody>
                {records.map((record, index) => <tr key={`${record.username}-${record.loginAt}-${index}`}><td>{record.username}</td><td>{record.date || '时间未知'}</td><td>{record.time || '—'}</td><td className="user-agent-cell">{record.userAgent || '—'}</td></tr>)}
                {!records.length && <tr><td colSpan={4} className="login-stats-empty-cell">暂无符合筛选条件的记录</td></tr>}
              </tbody></table>
            </div>
            <nav className="login-stats-pagination" aria-label="登录明细分页"><span>每页 {pageSize} 条 · 第 {currentPage} / {pageCount} 页</span><div><button disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>上一页</button><button disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>下一页</button></div></nav>
          </section>
        </>
      )}
    </div>
  );
}
