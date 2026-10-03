import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLoginStats } from '../src/utils/loginStats.js';

const now = new Date('2026-10-02T16:30:00.000Z'); // Beijing October 3
const records = [
  { username: 'alpha', loginAt: '2026-09-26T16:00:00.000Z', date: '2026-09-27', time: '00:00:00' },
  { username: 'alpha', loginAt: '2026-09-26T15:59:59.000Z', date: '2026-09-26', time: '23:59:59' },
  { username: 'beta', loginAt: '2026-10-02T16:00:00.000Z', date: '2026-10-03', time: '00:00:00' },
  { username: 'alpha', loginAt: '2026-10-03T00:00:00+08:00', date: '2026-10-03', time: '00:00:00' },
  { username: 'beta', loginAt: '2026-10-03T16:00:00.000Z', date: '2026-10-04', time: '00:00:00' },
  { username: 'alpha', loginAt: 'invalid', date: '', time: '' },
];

test('seven Beijing calendar days include the first midnight and today, with zero-filled gaps', () => {
  const stats = buildLoginStats(records, { days: 7, now });
  assert.equal(stats.total, 3);
  assert.equal(stats.userCount, 2);
  assert.deepEqual(stats.daily.map(day => [day.date, day.count]), [
    ['2026-09-27', 1], ['2026-09-28', 0], ['2026-09-29', 0],
    ['2026-09-30', 0], ['2026-10-01', 0], ['2026-10-02', 0], ['2026-10-03', 2],
  ]);
  assert.deepEqual(stats.summary.map(user => [user.username, user.count]), [['alpha', 2], ['beta', 1]]);
  assert.equal(stats.records[0].date, '2026-10-03');
  assert.equal(stats.latest.date, '2026-10-03');
});

test('user filtering keeps chart, overview, summary and details totals consistent', () => {
  const stats = buildLoginStats(records, { days: 7, username: 'alpha', now });
  assert.equal(stats.total, 2);
  assert.equal(stats.userCount, 1);
  assert.equal(stats.records.length, 2);
  assert.equal(stats.daily.reduce((sum, day) => sum + day.count, 0), 2);
  assert.equal(stats.summary[0].count, 2);
  assert.equal(stats.summary[0].lastDate, '2026-10-03');
  assert.equal(records.length, 6);
});

test('all records retain unknown times in details without inventing daily chart events', () => {
  const stats = buildLoginStats(records, { days: null, now });
  assert.equal(stats.total, 6);
  assert.equal(stats.unknownTimeCount, 1);
  assert.equal(stats.records.at(-1).loginAt, 'invalid');
  assert.equal(stats.daily.reduce((sum, day) => sum + day.count, 0), 5);
});

test('empty and unmatched records produce an empty overview and a complete zero trend', () => {
  for (const input of [[], records]) {
    const stats = buildLoginStats(input, { days: 30, username: 'absent', now });
    assert.equal(stats.total, 0);
    assert.equal(stats.userCount, 0);
    assert.equal(stats.latest, null);
    assert.equal(stats.daily.length, 30);
    assert.ok(stats.daily.every(day => day.count === 0));
  }
});
