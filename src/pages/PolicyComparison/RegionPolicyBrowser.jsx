import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, MapPin, FileText, TrendingUp, ChevronDown, ChevronRight, Globe, Building2, Building, Landmark } from 'lucide-react';
import './RegionPolicyBrowser.css';

// 日期格式化
const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// 获取默认日期范围（最近30天）
const getDefaultDateRange = () => {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return {
    startDate: formatDate(start),
    endDate: formatDate(end)
  };
};

const RegionPolicyBrowser = () => {
  // 状态管理
  const [regionTree, setRegionTree] = useState({ national: null, provinces: {}, municipalities: {} });
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [expandedProvinces, setExpandedProvinces] = useState(new Set());
  const [dateRange, setDateRange] = useState(getDefaultDateRange());
  const [newsList, setNewsList] = useState([]);
  const [newsTotal, setNewsTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { startDate, endDate } = dateRange;

  // 加载地域列表
  const fetchRegionTree = async () => {
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const res = await fetch(`/api/policy/regions?${params.toString()}`);
      if (!res.ok) throw new Error('获取地域列表失败');
      const data = await res.json();
      setRegionTree(data);

      // 默认选中扬州（如果存在）
      if (!selectedRegion) {
        const jiangsuProvince = data.provinces?.['江苏省'];
        const hasYangzhou = jiangsuProvince?.children?.some(c => c.name === '扬州');
        if (hasYangzhou) {
          setSelectedRegion({ name: '扬州', level: 'city' });
          setExpandedProvinces(new Set(['江苏省']));
        } else if (data.national?.count > 0) {
          setSelectedRegion({ name: '全国', level: 'national' });
        }
      }
    } catch (err) {
      setError(err.message);
    }
  };

  // 加载新闻列表
  const fetchNews = async () => {
    if (!selectedRegion) return;

    setLoading(true);
    try {
      const params = new URLSearchParams({
        region: selectedRegion.name,
        regionLevel: selectedRegion.level,
        page: currentPage.toString(),
        pageSize: pageSize.toString()
      });
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const res = await fetch(`/api/policy/region-news?${params.toString()}`);
      if (!res.ok) throw new Error('获取新闻失败');
      const data = await res.json();
      setNewsList(data.rows || []);
      setNewsTotal(data.total || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 初始化加载
  useEffect(() => {
    fetchRegionTree();
  }, [startDate, endDate]);

  // 选中地域或页码变化时加载新闻
  useEffect(() => {
    fetchNews();
  }, [selectedRegion, currentPage, startDate, endDate]);

  // 切换省份展开状态
  const toggleProvince = (provinceName) => {
    setExpandedProvinces(prev => {
      const next = new Set(prev);
      if (next.has(provinceName)) {
        next.delete(provinceName);
      } else {
        next.add(provinceName);
      }
      return next;
    });
  };

  // 总页数
  const totalPages = useMemo(() => Math.ceil(newsTotal / pageSize), [newsTotal, pageSize]);

  // 渲染地域树
  const renderRegionTree = () => {
    const { national, provinces, municipalities = {} } = regionTree;

    return (
      <div className="region-tree">
        {/* 全国 */}
        {national && national.count > 0 && (
          <div
            className={`region-item national ${selectedRegion?.name === '全国' ? 'active' : ''}`}
            onClick={() => setSelectedRegion({ name: '全国', level: 'national' })}
          >
            <Globe size={16} />
            <span className="region-name">全国</span>
            <span className="region-count">{national.count}条</span>
          </div>
        )}

        {/* 直辖市（与省级同层级） */}
        {Object.entries(municipalities)
          .sort((a, b) => b[1].count - a[1].count)
          .map(([name, data]) => (
            <div
              key={name}
              className={`region-item municipality ${selectedRegion?.name === name ? 'active' : ''}`}
              onClick={() => setSelectedRegion({ name, level: 'municipality' })}
            >
              <Landmark size={16} />
              <span className="region-name">{name}</span>
              <span className="region-count">{data.count}条</span>
              {data.avgScore > 0 && (
                <span className="region-score">均分{data.avgScore}</span>
              )}
            </div>
          ))}

        {/* 省份列表 */}
        {Object.entries(provinces)
          .sort((a, b) => b[1].count - a[1].count)
          .map(([name, data]) => {
            const isExpanded = expandedProvinces.has(name);
            const hasChildren = data.children && data.children.length > 0;

            return (
              <div key={name} className="province-group">
                <div
                  className={`region-item province ${selectedRegion?.name === name && selectedRegion?.level === 'province' ? 'active' : ''}`}
                  onClick={() => {
                    if (hasChildren) toggleProvince(name);
                    setSelectedRegion({ name, level: 'province' });
                  }}
                >
                  {hasChildren ? (
                    isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />
                  ) : (
                    <Building2 size={16} />
                  )}
                  <span className="region-name">{name}</span>
                  <span className="region-count">{data.count}条</span>
                  {data.avgScore > 0 && (
                    <span className="region-score">均分{data.avgScore}</span>
                  )}
                </div>

                {/* 城市列表 */}
                {isExpanded && hasChildren && (
                  <div className="city-list">
                    {data.children
                      .sort((a, b) => {
                        // 省级排第一，其他按数量排序
                        if (a.type === 'provincial') return -1;
                        if (b.type === 'provincial') return 1;
                        return b.count - a.count;
                      })
                      .map(child => (
                        <div
                          key={child.name}
                          className={`region-item city ${child.type === 'provincial' ? 'provincial-sub' : ''} ${selectedRegion?.name === child.name && selectedRegion?.level === (child.type === 'provincial' ? 'provincial' : 'city') ? 'active' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            // 纯省级新闻使用 'provincial' level
                            setSelectedRegion({
                              name: child.name === '省级' ? name : child.name,
                              level: child.type === 'provincial' ? 'provincial' : 'city'
                            });
                          }}
                        >
                          {child.type === 'provincial' ? <Building2 size={14} /> : <Building size={14} />}
                          <span className="region-name">{child.name}</span>
                          <span className="region-count">{child.count}条</span>
                          {child.avgScore > 0 && (
                            <span className="region-score">均分{child.avgScore}</span>
                          )}
                        </div>
                      ))}
                  </div>
                )}
              </div>
            );
          })}
      </div>
    );
  };

  // 获取选中地域的显示名称
  const getDisplayTitle = () => {
    if (!selectedRegion) return '';
    if (selectedRegion.level === 'provincial') {
      return `${selectedRegion.name}（省级）`;
    }
    if (selectedRegion.level === 'municipality') {
      return selectedRegion.name;
    }
    return selectedRegion.name;
  };

  // 获取提示文本
  const getHintText = () => {
    if (!selectedRegion) return '';
    if (selectedRegion.level === 'province') {
      return '显示该省及下属城市所有新闻';
    }
    if (selectedRegion.level === 'provincial') {
      return '仅显示该省省级新闻（未精确到市）';
    }
    if (selectedRegion.level === 'municipality') {
      return '显示该直辖市所有新闻';
    }
    return '';
  };

  return (
    <div className="region-policy-browser">
      <header className="page-header">
        <div className="header-left">
          <div className="header-badge-icon">
            <svg width="44" height="44" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="44" height="44" rx="10" fill="var(--kd-panel)" stroke="var(--kd-line)" strokeWidth="1"/>
              <path d="M22 11C17.5 11 14 14.5 14 19C14 25 22 33 22 33C22 33 30 25 30 19C30 14.5 26.5 11 22 11ZM22 22C20.3 22 19 20.7 19 19C19 17.3 20.3 16 22 16C23.7 16 25 17.3 25 19C25 20.7 23.7 22 22 22Z" fill="#38a6a5"/>
              <circle cx="22" cy="19" r="2" fill="#fff"/>
            </svg>
          </div>
          <div className="header-text">
            <div className="header-label">政策研究工具</div>
            <h1>地域政策浏览</h1>
          </div>
        </div>
        <div className="header-meta">
          <div className="meta-card">
            <Globe size={14} />
            <span>覆盖全国</span>
          </div>
          <div className="meta-divider"></div>
          <div className="meta-text">
            更新于 {formatDate(new Date())}
          </div>
        </div>
      </header>

      <div className="browser-container">
        {/* 左侧地域树 */}
        <aside className="region-sidebar">
          <div className="sidebar-header">
            <h3>地域选择</h3>
            <span className="sidebar-hint">点击展开/收起</span>
          </div>

          {/* 时间筛选 */}
          <div className="date-filter">
            <div className="filter-row">
              <Calendar size={14} />
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setDateRange(prev => ({ ...prev, startDate: e.target.value }));
                  setCurrentPage(1);
                }}
              />
              <span>至</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setDateRange(prev => ({ ...prev, endDate: e.target.value }));
                  setCurrentPage(1);
                }}
              />
            </div>
          </div>

          {/* 地域树 */}
          <div className="region-tree-container">
            {renderRegionTree()}
          </div>
        </aside>

        {/* 右侧新闻列表 */}
        <main className="news-content">
          {selectedRegion ? (
            <>
              <div className="content-header">
                <h2>
                  {getDisplayTitle()}
                  <span className="header-badge">{newsTotal}条新闻</span>
                </h2>
                {getHintText() && (
                  <p className="header-hint">{getHintText()}</p>
                )}
              </div>

              {loading ? (
                <div className="loading-state">
                  <div className="spinner" />
                  <span>加载中...</span>
                </div>
              ) : error ? (
                <div className="error-state">{error}</div>
              ) : newsList.length === 0 ? (
                <div className="empty-state">
                  <FileText size={48} />
                  <p>该地域暂无新闻</p>
                </div>
              ) : (
                <>
                  <div className="news-table-container">
                    <table className="news-table">
                      <thead>
                        <tr>
                          <th style={{ width: '45%' }}>标题</th>
                          <th style={{ width: '12%' }}>来源</th>
                          <th style={{ width: '10%' }}>日期</th>
                          <th style={{ width: '8%' }}>评分</th>
                          <th style={{ width: '10%' }}>地域</th>
                          <th style={{ width: '15%' }}>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {newsList.map(news => (
                          <tr key={news.id}>
                            <td className="title-cell">
                              <a
                                href={news.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={news.title}
                              >
                                {news.title}
                              </a>
                            </td>
                            <td>{news.source}</td>
                            <td>{formatDate(news.fetchdate)}</td>
                            <td>
                              <span className={`score-badge score-${news.score || 0}`}>
                                {news.score || '-'}
                              </span>
                            </td>
                            <td>{news.region || '-'}</td>
                            <td>
                              <button
                                className="btn-link"
                                onClick={() => window.open(news.link, '_blank')}
                              >
                                查看原文
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* 分页 */}
                  {totalPages > 1 && (
                    <div className="pagination">
                      <button
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage(p => p - 1)}
                      >
                        上一页
                      </button>
                      <span className="page-info">
                        第 {currentPage} / {totalPages} 页
                      </span>
                      <button
                        disabled={currentPage === totalPages}
                        onClick={() => setCurrentPage(p => p + 1)}
                      >
                        下一页
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            <div className="empty-state">
              <MapPin size={48} />
              <p>请选择左侧地域查看新闻</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default RegionPolicyBrowser;
