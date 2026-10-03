const dayMilliseconds = 86400000;
const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
});

function beijingDate(now) {
  const parts = Object.fromEntries(dateFormatter.formatToParts(now).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function timestamp(record) {
  const value = Date.parse(record.loginAt);
  return Number.isFinite(value) ? value : -Infinity;
}

// The API supplies Beijing date/time fields; every view uses this same filtered set.
export function buildLoginStats(input, { days = 30, username = '', now = new Date() } = {}) {
  const today = beijingDate(now);
  const endTimestamp = Date.parse(`${today}T00:00:00Z`);
  const startDate = days === null ? '' : new Date(endTimestamp - (days - 1) * dayMilliseconds).toISOString().slice(0, 10);
  const records = input.filter(record => (!username || record.username === username)
    && (days === null || (timestamp(record) !== -Infinity && record.date >= startDate && record.date <= today)))
    .slice().sort((a, b) => timestamp(b) - timestamp(a));

  const users = new Map();
  const dailyCounts = new Map();
  let unknownTimeCount = 0;
  for (const record of records) {
    const current = users.get(record.username) || {
      username: record.username, count: 0, lastLoginAt: '', lastDate: '', lastTime: '',
    };
    current.count += 1;
    if (timestamp(record) > timestamp({ loginAt: current.lastLoginAt })) {
      current.lastLoginAt = record.loginAt;
      current.lastDate = record.date;
      current.lastTime = record.time;
    }
    users.set(record.username, current);
    if (timestamp(record) !== -Infinity && record.date) {
      dailyCounts.set(record.date, (dailyCounts.get(record.date) || 0) + 1);
    } else {
      unknownTimeCount += 1;
    }
  }

  const dates = [...dailyCounts.keys()].sort();
  const firstDate = startDate || dates[0];
  const lastDate = days === null && dates.at(-1) > today ? dates.at(-1) : today;
  const daily = [];
  if (firstDate) {
    for (let cursor = Date.parse(`${firstDate}T00:00:00Z`); cursor <= Date.parse(`${lastDate}T00:00:00Z`); cursor += dayMilliseconds) {
      const date = new Date(cursor).toISOString().slice(0, 10);
      daily.push({ date, count: dailyCounts.get(date) || 0 });
    }
  }

  return {
    total: records.length,
    userCount: users.size,
    latest: records.find(record => timestamp(record) !== -Infinity) || null,
    summary: [...users.values()].sort((a, b) => b.count - a.count || a.username.localeCompare(b.username)),
    records, daily, unknownTimeCount,
  };
}
