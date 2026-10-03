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
  assert.equal(stats.records[0].time, '16:00:00');
});

test('historical UTC timestamps display in Beijing time without rewriting the audit file', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keydigest-audit-time-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const auditPath = path.join(dir, 'login-audit.json');
  const original = JSON.stringify([
    { username: 'admin', loginAt: '2026-10-02T16:30:00.000Z', date: '2026-10-02', time: '16:30:00' },
    { username: 'admin', loginAt: '2026-10-02T15:59:59.000Z' },
    { username: 'offset', loginAt: '2026-10-03T00:30:00+08:00' },
  ]);
  fs.writeFileSync(auditPath, original);
  const stats = readLoginAuditStats(auditPath);
  assert.equal(stats.records[0].date, '2026-10-03');
  assert.equal(stats.records[0].time, '00:30:00');
  assert.equal(stats.records[2].date, '2026-10-02');
  assert.equal(stats.records[2].time, '23:59:59');
  assert.equal(stats.summary[0].lastDate, '2026-10-03');
  assert.equal(stats.summary[0].lastTime, '00:30:00');
  assert.equal(fs.readFileSync(auditPath, 'utf8'), original);
});

test('missing or invalid historical timestamps are not replaced by the current time', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keydigest-audit-invalid-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const auditPath = path.join(dir, 'login-audit.json');
  fs.writeFileSync(auditPath, JSON.stringify([
    { username: 'admin', loginAt: 'invalid' },
    { username: 'admin' },
    { username: 'admin', loginAt: '2026-10-02T16:30:00.000Z' },
  ]));
  const stats = readLoginAuditStats(auditPath);
  assert.equal(stats.total, 3);
  assert.equal(stats.records[0].time, '00:30:00');
  assert.deepEqual(stats.records.slice(1).map(record => [record.date, record.time]), [['', ''], ['', '']]);
  assert.equal(stats.summary[0].lastLoginAt, '2026-10-02T16:30:00.000Z');
});
