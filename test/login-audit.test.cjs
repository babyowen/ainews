const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  appendLoginAudit,
  readLoginAuditStats,
} = require('../services/loginAudit.cjs');

test('login audit appends successful logins and summarizes by user', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keydigest-audit-'));
  const auditPath = path.join(dir, 'login-audit.json');

  appendLoginAudit(auditPath, {
    username: 'admin',
    loginAt: '2026-05-15T09:01:02.000Z',
    userAgent: 'agent-a',
  });
  appendLoginAudit(auditPath, {
    username: 'yzgjj',
    loginAt: '2026-05-15T10:03:04.000Z',
    userAgent: 'agent-b',
  });
  appendLoginAudit(auditPath, {
    username: 'admin',
    loginAt: '2026-05-16T08:00:00.000Z',
    userAgent: 'agent-c',
  });

  const stats = readLoginAuditStats(auditPath);

  assert.equal(stats.total, 3);
  assert.deepEqual(stats.summary.map((item) => [item.username, item.count]), [
    ['admin', 2],
    ['yzgjj', 1],
  ]);
  assert.equal(stats.summary[0].lastLoginAt, '2026-05-16T08:00:00.000Z');
  assert.equal(stats.records[0].username, 'admin');
  assert.equal(stats.records[0].date, '2026-05-16');
  assert.equal(stats.records[0].time, '08:00:00');
});
