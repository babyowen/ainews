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

function normalizeRecord(record) {
  const loginAt = record.loginAt || new Date().toISOString();
  const [date, rawTime = ''] = loginAt.split('T');
  const time = rawTime.replace(/\.\d{3}Z$/, '').replace(/Z$/, '');

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
  const nextRecord = normalizeRecord(record);
  records.push(nextRecord);
  fs.writeFileSync(auditPath, `${JSON.stringify(records, null, 2)}\n`, 'utf8');
  return nextRecord;
}

function readLoginAuditStats(auditPath) {
  const records = readRecords(auditPath)
    .map(normalizeRecord)
    .sort((a, b) => new Date(b.loginAt) - new Date(a.loginAt));

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
    if (!current.lastLoginAt || new Date(record.loginAt) > new Date(current.lastLoginAt)) {
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
