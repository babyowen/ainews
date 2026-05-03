import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { KEYWORDS } from '../config/keywords';
import './FilterBar.css';

function DatePicker({ value, onChange }) {
  const [isOpen, setIsOpen] = useState(false);

  const selectedDate = value ? new Date(value + 'T00:00:00') : null;

  const [currentDate, setCurrentDate] = useState(() => {
    if (selectedDate) {
      return new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    }
    return new Date();
  });

  useEffect(() => {
    if (selectedDate) {
      setCurrentDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
    }
  }, [value]);

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startWeekday = firstDay.getDay();

    const days = [];

    for (let i = startWeekday - 1; i >= 0; i--) {
      const prevDate = new Date(year, month, -i);
      days.push({ date: prevDate, isCurrentMonth: false });
    }

    for (let i = 1; i <= daysInMonth; i++) {
      const date = new Date(year, month, i);
      days.push({ date, isCurrentMonth: true });
    }

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

  const handleDateSelect = (date) => {
    setIsOpen(false);
    setTimeout(() => onChange(formatDate(date)), 0);
  };

  return (
    <div className="date-picker-wrap">
      <input
        type="text"
        value={value || ''}
        readOnly
        placeholder="选择日期"
        onClick={() => setIsOpen(!isOpen)}
        className="date-picker-input"
      />
      {isOpen && (
        <>
          <div className="date-picker-overlay" onClick={() => setIsOpen(false)} />
          <div className="date-picker-popup" onClick={e => e.stopPropagation()}>
            <div className="date-picker-nav">
              <button className="date-picker-nav-btn" onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))}>
                <ChevronLeft size={16} />
              </button>
              <span className="date-picker-month">{currentDate.getFullYear()}年{monthNames[currentDate.getMonth()]}</span>
              <button className="date-picker-nav-btn" onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))}>
                <ChevronRight size={16} />
              </button>
            </div>
            <div className="date-picker-weekdays">
              {weekdays.map(day => (
                <div key={day} className="date-picker-weekday">{day}</div>
              ))}
            </div>
            <div className="date-picker-days">
              {days.map((dayInfo, index) => {
                const isSelected = selectedDate &&
                  dayInfo.date.getFullYear() === selectedDate.getFullYear() &&
                  dayInfo.date.getMonth() === selectedDate.getMonth() &&
                  dayInfo.date.getDate() === selectedDate.getDate();
                const isToday = new Date().toDateString() === dayInfo.date.toDateString();
                return (
                  <button
                    key={index}
                    onClick={() => handleDateSelect(dayInfo.date)}
                    className={[
                      'date-picker-day',
                      !dayInfo.isCurrentMonth ? 'other-month' : '',
                      isToday ? 'today' : '',
                      isSelected ? 'selected' : ''
                    ].join(' ')}
                  >
                    {dayInfo.date.getDate()}
                  </button>
                );
              })}
            </div>
            <div className="date-picker-shortcuts">
              <button className="date-picker-shortcut" onClick={() => handleDateSelect(new Date())}>今天</button>
              <button className="date-picker-shortcut" onClick={() => handleDateSelect(new Date(Date.now() - 86400000))}>昨天</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function FilterBar({ filters, onChange, availableRounds = [] }) {
  const keywords = KEYWORDS;

  return (
    <div className="filter-bar">
      <div className="filter-group">
        <label>关键词</label>
        <select
          value={filters.keyword || ''}
          onChange={e => onChange({ ...filters, keyword: e.target.value })}
        >
          <option value=''>全部</option>
          {keywords.map(k => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select>
      </div>
      <div className="filter-group">
        <label>日期</label>
        <DatePicker value={filters.date || ''} onChange={date => onChange({ ...filters, date })} />
      </div>
      {availableRounds.length > 0 && (
        <div className="filter-group">
          <label>轮次</label>
          <div className="round-checkboxes">
            {availableRounds.map(round => (
              <label key={round}>
                <input
                  type="checkbox"
                  checked={filters.rounds && filters.rounds.includes(round)}
                  onChange={e => {
                    let newRounds = filters.rounds ? [...filters.rounds] : [];
                    if (e.target.checked) newRounds.push(round);
                    else newRounds = newRounds.filter(r => r !== round);
                    onChange({ ...filters, rounds: newRounds });
                  }}
                />
                {round}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ScoreFilter({ scores, onChange }) {
  const [localScores, setLocalScores] = useState(scores || []);

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
    <div className="score-filter">
      <span className="score-filter-label">AI评分</span>
      <div className="score-checkboxes">
        {[5,4,3,2,1,0].map(score => (
          <label key={score} className={localScores.includes(score) ? 'active' : ''}>
            <input
              type="checkbox"
              checked={localScores.includes(score)}
              onChange={e => handleCheck(score, e.target.checked)}
            />
            {score}
          </label>
        ))}
        <label className={localScores.includes('unscored') ? 'active' : ''}>
          <input
            type="checkbox"
            checked={localScores.includes('unscored')}
            onChange={e => handleCheck('unscored', e.target.checked)}
          />
          未评分
        </label>
      </div>
      <button className="score-filter-confirm" onClick={() => onChange(localScores)}>确定</button>
    </div>
  );
}
