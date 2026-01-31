import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './CurrentPolicy.css';
import { ChevronRight, ChevronDown, Edit2, Save, X, Plus, Trash2, FileText } from 'lucide-react';
import PasswordProtection from '../../components/PasswordProtection';
import ErrorBoundary from '../../components/ErrorBoundary';

// 通用图标组件封装
const IconBtn = ({ icon: Icon, onClick, className = '', title, disabled = false }) => (
  <button 
    className={`icon-btn ${className}`} 
    onClick={(e) => { e.stopPropagation(); onClick(e); }}
    title={title}
    disabled={disabled}
  >
    <Icon size={16} />
  </button>
);

// 递归渲染值编辑器 (用于政策明细的编辑)
const DetailEditor = ({ value, onChange, onCancel, onSave }) => {
  const [localValue, setLocalValue] = useState(value);

  // 简单的对象/数组编辑器，或者直接文本域
  const renderInput = (val, path = []) => {
    if (Array.isArray(val)) {
      return (
        <div className="detail-array">
          {val.map((item, idx) => (
            <div key={idx} className="detail-array-item">
              <div className="detail-array-header">
                <span>条目 #{idx + 1}</span>
                <IconBtn icon={Trash2} className="text-red-500" onClick={() => {
                  const newVal = [...val];
                  newVal.splice(idx, 1);
                  updateLocalValue(path, newVal); // 这里逻辑稍微复杂，简化处理：直接更新父级
                }} />
              </div>
              {renderInput(item, [...path, idx])}
            </div>
          ))}
          <button className="text-btn" onClick={() => {
             // 简化处理，实际需要更复杂的深层更新逻辑，这里暂时只支持顶层或简单的嵌套
             // 为了稳定性，我们在这个版本先简化：如果value是复杂对象，提供一个JSON文本编辑器
          }}>
            (复杂结构建议使用JSON模式编辑)
          </button>
        </div>
      );
    }
    return null; 
  };

  // 为了保证灵活性和稳定性，对于"政策明细"这种结构不固定的数据，
  // 编辑模式下我们提供一个基于文本的 JSON 编辑器或者 Key-Value 表单。
  // 鉴于 policy_v1.json 中明细结构多变（有时是对象，有时是数组），
  // 最稳妥的方式是提供一个智能的 Key-Value 编辑界面，或者直接是格式化的文本编辑。
  
  // 这里我们实现一个简易的 JSON 文本编辑器，但为了用户体验，我们尝试解析它。
  // 如果是简单的对象 { "核心内容": "...", "依据文档": "..." }，我们显示表单。
  
  const isSimpleObject = typeof localValue === 'object' && localValue !== null && !Array.isArray(localValue);
  const isArray = Array.isArray(localValue);

  if (isSimpleObject) {
    return (
      <div className="detail-edit-form">
        {Object.entries(localValue).map(([k, v]) => (
          <div key={k} className="form-group">
            <label>{k}</label>
            {typeof v === 'string' ? (
              <textarea 
                value={v} 
                onChange={(e) => setLocalValue({ ...localValue, [k]: e.target.value })}
                rows={3}
              />
            ) : (
              <div className="complex-value-notice">复杂结构，请切换至JSON源码模式修改</div>
            )}
          </div>
        ))}
        <div className="edit-actions">
          <button className="cancel-btn" onClick={onCancel}>取消</button>
          <button className="confirm-btn" onClick={() => onSave(localValue)}>保存修改</button>
        </div>
      </div>
    );
  }
  
  // 数组或其他复杂结构，回退到 JSON 文本编辑，或者简单的多条目编辑
  if (isArray) {
     // 针对 policy_v1.json 中 "政策明细": [ { "类型": "...", ... } ] 的情况
     return (
       <div className="detail-edit-list">
         {localValue.map((item, idx) => (
           <div key={idx} className="detail-edit-item-card">
             <div className="item-card-header">
                <span>条目 {idx + 1}</span>
                <button className="text-red-500 text-sm" onClick={() => {
                  const newData = [...localValue];
                  newData.splice(idx, 1);
                  setLocalValue(newData);
                }}>删除</button>
             </div>
             {typeof item === 'object' ? (
                Object.entries(item).map(([k, v]) => (
                  <div key={k} className="form-group">
                    <label>{k}</label>
                    <textarea 
                      value={v} 
                      onChange={(e) => {
                        const newData = [...localValue];
                        newData[idx] = { ...newData[idx], [k]: e.target.value };
                        setLocalValue(newData);
                      }}
                      rows={2}
                    />
                  </div>
                ))
             ) : (
               <textarea 
                  value={item} 
                  onChange={(e) => {
                    const newData = [...localValue];
                    newData[idx] = e.target.value;
                    setLocalValue(newData);
                  }}
               />
             )}
           </div>
         ))}
         <button className="add-item-btn" onClick={() => {
           // 尝试复制第一个条目的结构，如果没有则为空对象
           const template = localValue.length > 0 ? Object.keys(localValue[0]).reduce((acc, key) => ({...acc, [key]: ''}), {}) : {};
           setLocalValue([...localValue, template]);
         }}>+ 添加条目</button>
         
         <div className="edit-actions">
          <button className="cancel-btn" onClick={onCancel}>取消</button>
          <button className="confirm-btn" onClick={() => onSave(localValue)}>保存修改</button>
        </div>
       </div>
     )
  }

  // 兜底：纯文本/JSON编辑
  return (
    <div className="detail-edit-raw">
      <textarea 
        value={typeof localValue === 'string' ? localValue : JSON.stringify(localValue, null, 2) || ''}
        onChange={(e) => {
           try {
             const parsed = JSON.parse(e.target.value);
             setLocalValue(parsed);
           } catch(err) {
             setLocalValue(e.target.value);
           }
        }}
        rows={10}
      />
      <div className="edit-actions">
        <button className="cancel-btn" onClick={onCancel}>取消</button>
        <button className="confirm-btn" onClick={() => onSave(localValue)}>保存修改</button>
      </div>
    </div>
  );
};

// 详情展示组件
const DetailView = ({ value }) => {
  if (value === null || value === undefined) {
    return <span className="text-gray-400 italic">空</span>;
  }

  if (Array.isArray(value)) {
    return (
      <div className="detail-view-list">
        {value.map((item, idx) => (
          <div key={idx} className="detail-view-item">
            <DetailView value={item} />
          </div>
        ))}
      </div>
    );
  }

  if (typeof value === 'object') {
    return (
      <div className="detail-view-object">
        {Object.entries(value).map(([k, v]) => (
          <div key={k} className="view-row">
            <span className="view-label">{k}:</span>
            <div className="view-value-wrapper">
              <DetailView value={v} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return <div className="detail-view-text">{String(value)}</div>;
};

// 3. 政策类别组件 (二级)
const CategoryItem = ({ category, onChange, onDelete }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingContent, setIsEditingContent] = useState(false);
  const [title, setTitle] = useState(category['类别名称']);

  const handleTitleSave = () => {
    onChange({ ...category, '类别名称': title });
    setIsEditingTitle(false);
  };

  const handleContentSave = (newContent) => {
    onChange({ ...category, '政策明细': newContent });
    setIsEditingContent(false);
  };

  return (
    <div className="category-item">
      <div className="category-row" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="row-left">
          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <span className="icon-category">📑</span>
          {isEditingTitle ? (
            <div className="inline-edit" onClick={(e) => e.stopPropagation()}>
              <input 
                value={title} 
                onChange={(e) => setTitle(e.target.value)} 
                autoFocus 
              />
              <IconBtn icon={Save} className="text-green-600" onClick={handleTitleSave} />
              <IconBtn icon={X} className="text-gray-500" onClick={() => { setTitle(category['类别名称']); setIsEditingTitle(false); }} />
            </div>
          ) : (
            <span className="category-title">{category['类别名称']}</span>
          )}
        </div>
        <div className="row-actions">
          {!isEditingTitle && (
            <IconBtn icon={Edit2} title="重命名" onClick={() => setIsEditingTitle(true)} />
          )}
          <IconBtn icon={Trash2} title="删除类别" className="delete-hover" onClick={onDelete} />
        </div>
      </div>

      {isExpanded && (
        <div className="category-body">
          <div className="detail-header">
            <span className="detail-label">政策明细</span>
            {!isEditingContent && (
              <button className="edit-content-btn" onClick={() => setIsEditingContent(true)}>
                <Edit2 size={14} /> 编辑内容
              </button>
            )}
          </div>
          
          <div className="detail-content-area">
            {isEditingContent ? (
              <DetailEditor 
                value={category['政策明细']} 
                onCancel={() => setIsEditingContent(false)}
                onSave={handleContentSave}
              />
            ) : (
              <DetailView value={category['政策明细']} />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// 2. 政策领域组件 (一级)
const DomainItem = ({ domain, onChange, onDelete }) => {
  const [isExpanded, setIsExpanded] = useState(false); // 默认折叠
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  
  // 兼容不同的字段名: '领域名称' (新) vs '政策领域' (旧)
  const titleKey = domain['领域名称'] !== undefined ? '领域名称' : '政策领域';
  const [title, setTitle] = useState(domain[titleKey]);

  const handleTitleSave = () => {
    onChange({ ...domain, [titleKey]: title });
    setIsEditingTitle(false);
  };

  const handleCategoryChange = (idx, newCategory) => {
    const newCategories = [...(domain['政策类别'] || [])];
    newCategories[idx] = newCategory;
    onChange({ ...domain, '政策类别': newCategories });
  };

  const handleCategoryDelete = (idx) => {
    if (window.confirm('确定删除该类别吗？')) {
      const newCategories = [...(domain['政策类别'] || [])];
      newCategories.splice(idx, 1);
      onChange({ ...domain, '政策类别': newCategories });
    }
  };

  const addCategory = () => {
    const newCategories = [...(domain['政策类别'] || []), {
      '类别名称': '新建类别',
      '政策明细': { '核心内容': '请填写内容', '依据文档': '' }
    }];
    onChange({ ...domain, '政策类别': newCategories });
    setIsExpanded(true); // 添加后自动展开
  };

  return (
    <div className={`domain-item ${isExpanded ? 'expanded' : ''}`}>
      <div className="domain-header-row" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="row-left">
          {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
          <span className="icon-domain">🏛️</span>
          {isEditingTitle ? (
            <div className="inline-edit" onClick={(e) => e.stopPropagation()}>
              <input 
                value={title} 
                onChange={(e) => setTitle(e.target.value)} 
                autoFocus 
                className="domain-input"
              />
              <IconBtn icon={Save} className="text-green-600" onClick={handleTitleSave} />
              <IconBtn icon={X} className="text-gray-500" onClick={() => { setTitle(domain[titleKey]); setIsEditingTitle(false); }} />
            </div>
          ) : (
            <span className="domain-title">{domain[titleKey]}</span>
          )}
          <span className="badge-count">{(domain['政策类别'] || []).length} 项</span>
        </div>
        <div className="row-actions">
          {!isEditingTitle && (
            <IconBtn icon={Edit2} title="重命名" onClick={() => setIsEditingTitle(true)} />
          )}
          <IconBtn icon={Trash2} title="删除领域" className="delete-hover" onClick={onDelete} />
        </div>
      </div>

      {isExpanded && (
        <div className="domain-body">
          <div className="categories-list">
            {(domain['政策类别'] || []).map((cat, idx) => (
              <CategoryItem 
                key={idx} 
                category={cat} 
                onChange={(newCat) => handleCategoryChange(idx, newCat)}
                onDelete={() => handleCategoryDelete(idx)}
              />
            ))}
          </div>
          <button className="add-row-btn" onClick={addCategory}>
            <Plus size={16} /> 添加政策类别
          </button>
        </div>
      )}
    </div>
  );
};

// 1. 主容器组件
const PolicyTreeEditor = ({ data, onChange }) => {
  // 兼容根节点字段名: '政策领域' (新) vs '政策知识库' (旧)
  const listKey = data['政策领域'] ? '政策领域' : '政策知识库';
  const domains = data[listKey] || [];

  const handleDomainChange = (idx, newDomain) => {
    const newDomains = [...domains];
    newDomains[idx] = newDomain;
    onChange({ ...data, [listKey]: newDomains });
  };

  const handleDomainDelete = (idx) => {
    if (window.confirm('确定删除该领域及其所有下属政策吗？此操作不可恢复。')) {
      const newDomains = [...domains];
      newDomains.splice(idx, 1);
      onChange({ ...data, [listKey]: newDomains });
    }
  };

  const addDomain = () => {
    // 根据当前使用的键名决定新对象的结构
    const newDomain = listKey === '政策领域' 
      ? { '领域名称': '新建政策领域', '政策类别': [] }
      : { '政策领域': '新建政策领域', '政策类别': [] };
      
    const newDomains = [...domains, newDomain];
    onChange({ ...data, [listKey]: newDomains });
  };

  return (
    <div className="policy-tree">
      {domains.map((domain, idx) => (
        <DomainItem 
          key={idx} 
          domain={domain} 
          onChange={(newDomain) => handleDomainChange(idx, newDomain)}
          onDelete={() => handleDomainDelete(idx)}
        />
      ))}
      
      <button className="add-domain-main-btn" onClick={addDomain}>
        <Plus size={20} /> 添加新的政策领域
      </button>
    </div>
  );
};

// 页面入口
export default function CurrentPolicy() {
  const [data, setData] = useState(null);
  const [filename, setFilename] = useState('');
  const [lastUpdated, setLastUpdated] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [viewMode, setViewMode] = useState('ui'); // 'ui' or 'json'
  const [jsonText, setJsonText] = useState('');

  useEffect(() => {
    fetchLatestPolicy();
  }, []);

  const fetchLatestPolicy = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/policy/latest');
      if (res.data.content) {
        setData(res.data.content);
        setFilename(res.data.filename);
        setLastUpdated(res.data.lastUpdated);
      } else {
        setData({ "政策知识库": [] });
      }
    } catch (err) {
      setError('获取政策文件失败: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setMessage('');
    
    try {
      const res = await axios.post('/api/policy/save', { content: data });
      
      setMessage(`保存成功！已生成新版本: ${res.data.filename}`);
      setFilename(res.data.filename);
      setLastUpdated(new Date().toISOString());
      
      // 3秒后自动清除成功消息
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setError('保存失败: ' + (err.response?.data?.error || err.message));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="loading-container">
      <div className="spinner"></div>
      <p>正在加载最新政策库...</p>
    </div>
  );

  return (
    <PasswordProtection 
      title="🔐 政策编辑权限验证" 
      description="请输入管理员密码以编辑政策文件"
    >
      <div className="policy-container">
        <div className="policy-header">
          <div className="header-left">
            <h2>现行政策编辑</h2>
            <div className="policy-meta">
              {filename && <span className="meta-item version">📦 {filename}</span>}
              {lastUpdated && <span className="meta-item time">🕒 {new Date(lastUpdated).toLocaleString()}</span>}
            </div>
          </div>
          <div className="header-actions">
            <div className="mode-switch">
              <button 
                className={viewMode === 'ui' ? 'active' : ''}
                onClick={() => setViewMode('ui')}
              >
                视图模式
              </button>
              <button 
                className={viewMode === 'json' ? 'active' : ''}
                onClick={() => {
                  setJsonText(JSON.stringify(data, null, 2));
                  setViewMode('json');
                }}
              >
                源码模式
              </button>
            </div>
            <button 
              className="save-btn" 
              onClick={handleSave} 
              disabled={saving}
            >
              {saving ? '保存中...' : '💾 保存并发布'}
            </button>
          </div>
        </div>

        {error && <div className="alert error">{error}</div>}
        {message && <div className="alert success">{message}</div>}

        <div className="editor-content">
          {viewMode === 'ui' ? (
            data && <PolicyTreeEditor data={data} onChange={setData} />
          ) : (
            <textarea
              className="json-source-editor"
              value={jsonText}
              onChange={(e) => {
                setJsonText(e.target.value);
                try {
                  setData(JSON.parse(e.target.value));
                } catch (err) {
                  // Ignore parse errors while typing
                }
              }}
            />
          )}
        </div>
      </div>
    </PasswordProtection>
  );
}
