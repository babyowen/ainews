const fs = require('node:fs');
const path = require('node:path');

function ensureAuditFile(auditPath) {
  fs.mkdirSync(path.dirname(auditPath), { recursive: true });
  if (!fs.existsSync(auditPath)) {
    fs.writeFileSync(auditPath, '[]\n', 'utf8');
  }
}

function readRecords(auditPath) {
  if (!fs.existsSync(auditPath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const beijingFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function timestamp(record) {
  const value = Date.parse(record.loginAt);
  return Number.isFinite(value) ? value : -Infinity;
}

function normalizeRecord(record) {
  const loginAt = record.loginAt || '';
  const instant = new Date(loginAt);
  let date = '';
  let time = '';
  if (Number.isFinite(instant.getTime())) {
    const parts = Object.fromEntries(beijingFormatter.formatToParts(instant).map(part => [part.type, part.value]));
    date = `${parts.year}-${parts.month}-${parts.day}`;
    time = `${parts.hour}:${parts.minute}:${parts.second}`;
  }

  return {
    username: String(record.username || ''),
    loginAt,
    date,
    time,
    userAgent: record.userAgent || '',
  };
}

function appendLoginAudit(auditPath, record) {
  ensureAuditFile(auditPath);
  const records = readRecords(auditPath);
  const nextRecord = normalizeRecord({ ...record, loginAt: record.loginAt || new Date().toISOString() });
  records.push(nextRecord);
  fs.writeFileSync(auditPath, `${JSON.stringify(records, null, 2)}\n`, 'utf8');
  return nextRecord;
}

function readLoginAuditStats(auditPath) {
  const records = readRecords(auditPath)
    .filter(record => record && typeof record === 'object')
    .map(normalizeRecord)
    .sort((a, b) => timestamp(b) - timestamp(a));

  const summaryByUser = new Map();
  for (const record of records) {
    const current = summaryByUser.get(record.username) || {
      username: record.username,
      count: 0,
      lastLoginAt: '',
      lastDate: '',
      lastTime: '',
    };
    current.count += 1;
    if (timestamp(record) > timestamp({ loginAt: current.lastLoginAt })) {
      current.lastLoginAt = record.loginAt;
      current.lastDate = record.date;
      current.lastTime = record.time;
    }
    summaryByUser.set(record.username, current);
  }

  return {
    total: records.length,
    summary: Array.from(summaryByUser.values()).sort((a, b) => b.count - a.count || a.username.localeCompare(b.username)),
    records,
  };
}

module.exports = {
  appendLoginAudit,
  readLoginAuditStats,
};
