import { useEffect, useState } from 'react';
import { KEYWORDS } from '../config/keywords';
// 移除fetchKeywords导入，改用固定关键词
// import { fetchKeywords } from '../api/keywords';

// 自定义日期选择器组件
function DatePicker({ value, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  
  // 解析当前选中的日期
  const selectedDate = value ? new Date(value + 'T00:00:00') : null;
  
  // 初始化显示月份：如果有选中日期，显示该日期所在月份，否则显示当前月份
  const [currentDate, setCurrentDate] = useState(() => {
    if (selectedDate) {
      return new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    }
    return new Date();
  });
  
  // 当选中的日期变化时，更新显示的月份
  useEffect(() => {
    if (selectedDate) {
      setCurrentDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
    }
  }, [value]);
  
  // 获取当前月份的所有日期
  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startWeekday = firstDay.getDay();
    
    const days = [];
    
    // 添加上个月的尾部日期
    for (let i = startWeekday - 1; i >= 0; i--) {
      const prevDate = new Date(year, month, -i);
      days.push({ date: prevDate, isCurrentMonth: false });
    }
    
    // 添加当前月的日期
    for (let i = 1; i <= daysInMonth; i++) {
      const date = new Date(year, month, i);
      days.push({ date, isCurrentMonth: true });
    }
    
    // 添加下个月的开头日期，确保总共42个格子（6行7列）
    const remainingDays = 42 - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      const nextDate = new Date(year, month + 1, i);
      days.push({ date: nextDate, isCurrentMonth: false });
    }
    
    return days;
  };
  
  const days = getDaysInMonth(currentDate);
  const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  
  const formatDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  const handleDateSelect = (date, event) => {
    // 阻止事件冒泡
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    
    // 先关闭弹窗，再调用onChange
    setIsOpen(false);
    
    // 使用setTimeout确保状态更新完成
    setTimeout(() => {
      onChange(formatDate(date));
    }, 0);
  };
  
  const goToPrevMonth = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    setCurrentDate(newDate);
  };
  
  const goToNextMonth = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    setCurrentDate(newDate);
  };
  
  // 处理输入框点击
  const handleInputClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(!isOpen);
  };
  
  // 处理点击外部区域关闭弹窗
  const handleOverlayClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(false);
  };
  
  // 阻止弹窗内部点击事件冒泡
  const handleCalendarClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };
  
  return (
    <div style={{ position: 'relative' }}>
      <input
        type="text"
        value={value || ''}
        readOnly
        placeholder="选择日期"
        onClick={handleInputClick}
        style={{
          marginLeft: 4,
          padding: '4px 12px',
          borderRadius: 8,
          border: '1px solid #e5e7eb',
          fontSize: 15,
          color: '#222',
          background: '#fafdff',
          outline: 'none',
          transition: 'border 0.2s',
          cursor: 'pointer',
          minWidth: 120,
        }}
        onFocus={e => e.target.style.border = '1.5px solid #3d8bfd'}
        onBlur={e => e.target.style.border = '1px solid #e5e7eb'}
      />
      
      {isOpen && (
        <>
          {/* 背景遮罩 */}
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 999,
              background: 'transparent',
            }}
            onClick={handleOverlayClick}
          />
          
          {/* 日历弹窗 */}
          <div 
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              zIndex: 1000,
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: 12,
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
              padding: 16,
              minWidth: 280,
              marginTop: 4,
            }}
            onClick={handleCalendarClick}
          >
            {/* 月份导航 */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 16,
            }}>
              <button
                onClick={goToPrevMonth}
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e5e7eb',
                  fontSize: 18,
                  cursor: 'pointer',
                  padding: '4px 8px',
                  borderRadius: 6,
                  color: '#374151',
                  transition: 'all 0.2s',
                }}
                onMouseOver={e => {
                  e.target.style.background = '#3d8bfd';
                  e.target.style.color = '#fff';
                }}
                onMouseOut={e => {
                  e.target.style.background = '#f8fafc';
                  e.target.style.color = '#374151';
                }}
              >
                ‹
              </button>
              <span style={{ fontWeight: 600, fontSize: 16, minWidth: 120, textAlign: 'center' }}>
                {currentDate.getFullYear()}年{monthNames[currentDate.getMonth()]}
              </span>
              <button
                onClick={goToNextMonth}
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e5e7eb',
                  fontSize: 18,
                  cursor: 'pointer',
                  padding: '4px 8px',
                  borderRadius: 6,
                  color: '#374151',
                  transition: 'all 0.2s',
                }}
                onMouseOver={e => {
                  e.target.style.background = '#3d8bfd';
                  e.target.style.color = '#fff';
                }}
                onMouseOut={e => {
                  e.target.style.background = '#f8fafc';
                  e.target.style.color = '#374151';
                }}
              >
                ›
              </button>
            </div>
            
            {/* 星期标题 */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: 2,
              marginBottom: 8,
            }}>
              {weekdays.map(day => (
                <div key={day} style={{
                  textAlign: 'center',
                  padding: '4px 0',
                  fontSize: 12,
                  color: '#666',
                  fontWeight: 500,
                }}>
                  {day}
                </div>
              ))}
            </div>
            
            {/* 日期网格 */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: 2,
            }}>
              {days.map((dayInfo, index) => {
                const isSelected = selectedDate && 
                  dayInfo.date.getFullYear() === selectedDate.getFullYear() &&
                  dayInfo.date.getMonth() === selectedDate.getMonth() &&
                  dayInfo.date.getDate() === selectedDate.getDate();
                
                const isToday = new Date().toDateString() === dayInfo.date.toDateString();
                
                return (
                  <button
                    key={index}
                    onClick={(e) => handleDateSelect(dayInfo.date, e)}
                    style={{
                      padding: '8px 4px',
                      border: 'none',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontSize: 14,
                      background: isSelected ? '#3d8bfd' : isToday ? '#f0f9ff' : 'transparent',
                      color: isSelected ? '#fff' : dayInfo.isCurrentMonth ? '#222' : '#ccc',
                      fontWeight: isSelected || isToday ? 600 : 400,
                      transition: 'all 0.2s',
                    }}
                    onMouseOver={e => {
                      if (!isSelected) {
                        e.target.style.background = '#f8fafc';
                      }
                    }}
                    onMouseOut={e => {
                      if (!isSelected) {
                        e.target.style.background = isToday ? '#f0f9ff' : 'transparent';
                      }
                    }}
                  >
                    {dayInfo.date.getDate()}
                  </button>
                );
              })}
            </div>
            
            {/* 快捷按钮 */}
            <div style={{
              display: 'flex',
              gap: 8,
              marginTop: 12,
              paddingTop: 12,
              borderTop: '1px solid #f0f0f0',
            }}>
              <button
                onClick={(e) => handleDateSelect(new Date(), e)}
                style={{
                  padding: '4px 12px',
                  border: '1px solid #e5e7eb',
                  borderRadius: 6,
                  background: '#fff',
                  cursor: 'pointer',
                  fontSize: 12,
                  color: '#666',
                }}
              >
                今天
              </button>
              <button
                onClick={(e) => handleDateSelect(new Date(Date.now() - 24 * 60 * 60 * 1000), e)}
                style={{
                  padding: '4px 12px',
                  border: '1px solid #e5e7eb',
                  borderRadius: 6,
                  background: '#fff',
                  cursor: 'pointer',
                  fontSize: 12,
                  color: '#666',
                }}
              >
                昨天
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function FilterBar({ filters, onChange, availableRounds = [] }) {
  // 固定的关键词列表（集中配置）
  const keywords = KEYWORDS;

  // 移除useEffect中的数据库请求
  // useEffect(() => {
  //   setLoading(true);
  //   fetchKeywords().then(data => {
  //     setKeywords(data);
  //     setLoading(false);
  //   });
  // }, []);

  return (
    <div style={{
      background: '#fff',
      borderRadius: 16,
      boxShadow: '0 2px 12px 0 rgba(60,80,120,0.06)',
      padding: '18px 32px',
      margin: '0 auto 28px auto',
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      gap: 32,
      position: 'relative',
      top: -24,
      zIndex: 2,
    }}>
      <label style={{ color: '#6b7280', fontWeight: 500, fontSize: 15, marginRight: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        关键词：
        <select
          value={filters.keyword || ''}
          onChange={e => onChange({ ...filters, keyword: e.target.value })}
          style={{
            marginLeft: 4,
            padding: '4px 16px',
            borderRadius: 8,
            border: '1px solid #e5e7eb',
            fontSize: 15,
            color: '#222',
            background: '#fafdff',
            outline: 'none',
            transition: 'border 0.2s',
          }}
          onFocus={e => e.target.style.border = '1.5px solid #3d8bfd'}
          onBlur={e => e.target.style.border = '1px solid #e5e7eb'}
        >
          <option value=''>全部</option>
          {keywords.map(k => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select>
        {/* 移除loading提示，因为不再需要加载 */}
      </label>
      <label style={{ color: '#6b7280', fontWeight: 500, fontSize: 15, marginRight: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        日期：
        <DatePicker
          value={filters.date || ''}
          onChange={date => onChange({ ...filters, date })}
        />
      </label>
      {/* 轮次复选框 */}
      {availableRounds.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#6b7280', fontWeight: 500, fontSize: 15 }}>轮次：</span>
          {availableRounds.map(round => (
            <label key={round} style={{ marginRight: 4, display: 'flex', alignItems: 'center', gap: 2, fontSize: 15, color: '#222' }}>
              <input
                type="checkbox"
                checked={filters.rounds && filters.rounds.includes(round)}
                onChange={e => {
                  let newRounds = filters.rounds ? [...filters.rounds] : [];
                  if (e.target.checked) {
                    newRounds.push(round);
                  } else {
                    newRounds = newRounds.filter(r => r !== round);
                  }
                  onChange({ ...filters, rounds: newRounds });
                }}
                style={{
                  accentColor: '#3d8bfd',
                  width: 16,
                  height: 16,
                  borderRadius: 4,
                  border: '1.5px solid #e5e7eb',
                  marginRight: 2,
                  background: filters.rounds && filters.rounds.includes(round) ? '#3d8bfd' : '#fff',
                  transition: 'background 0.2s',
                  cursor: 'pointer',
                }}
              />
              {round}
            </label>
          ))}
        </div>
      )}
      {/* 分数复选框已提取为ScoreFilter组件，由外部决定渲染位置 */}
    </div>
  );
}

// 分数复选框组件
export function ScoreFilter({ scores, onChange }) {
  const [localScores, setLocalScores] = useState(scores || []);
  // 同步外部scores变化
  useEffect(() => {
    setLocalScores(scores || []);
  }, [scores]);

  const handleCheck = (score, checked) => {
    let newScores = localScores ? [...localScores] : [];
    if (checked) {
      if (!newScores.includes(score)) newScores.push(score);
    } else {
      newScores = newScores.filter(s => s !== score);
    }
    setLocalScores(newScores);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ color: '#6b7280', fontWeight: 500, fontSize: 15 }}>AI评分：</span>
      {[5,4,3,2,1,0].map(score => (
        <label key={score} style={{ marginRight: 4, display: 'flex', alignItems: 'center', gap: 2, fontSize: 15, color: '#222' }}>
          <input
            type="checkbox"
            checked={localScores && localScores.includes(score)}
            onChange={e => handleCheck(score, e.target.checked)}
            style={{
              accentColor: '#3d8bfd',
              width: 16,
              height: 16,
              borderRadius: 4,
              border: '1.5px solid #e5e7eb',
              marginRight: 2,
              background: localScores && localScores.includes(score) ? '#3d8bfd' : '#fff',
              transition: 'background 0.2s',
              cursor: 'pointer',
            }}
          />
          {score}
        </label>
      ))}
      {/* 添加未评分选项 */}
      <label style={{ marginRight: 4, display: 'flex', alignItems: 'center', gap: 2, fontSize: 15, color: '#222' }}>
        <input
          type="checkbox"
          checked={localScores && localScores.includes('unscored')}
          onChange={e => handleCheck('unscored', e.target.checked)}
          style={{
            accentColor: '#3d8bfd',
            width: 16,
            height: 16,
            borderRadius: 4,
            border: '1.5px solid #e5e7eb',
            marginRight: 2,
            background: localScores && localScores.includes('unscored') ? '#3d8bfd' : '#fff',
            transition: 'background 0.2s',
            cursor: 'pointer',
          }}
        />
        未评分
      </label>
      <button
        style={{ marginLeft: 8, padding: '2px 12px', borderRadius: 4, border: 'none', background: '#3d8bfd', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 15 }}
        onClick={() => onChange(localScores)}
      >确定</button>
    </div>
  );
}