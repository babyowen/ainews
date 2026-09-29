'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');

test('production deployment gates success on readiness and pins data to shared storage', () => {
  const deployScript = fs.readFileSync(path.join(root, 'scripts/deploy-from-gitee.sh'), 'utf8');
  const readiness = fs.readFileSync(path.join(root, 'scripts/wait-for-readiness.cjs'), 'utf8');
  const ecosystem = fs.readFileSync(path.join(root, 'deploy/ecosystem.config.cjs'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'server.cjs'), 'utf8');

  assert.match(deployScript, /\/api\/readiness/);
  assert.doesNotMatch(deployScript, /APP_PORT\/api\/health/);
  assert.match(deployScript, /KEYDIGEST_APP_PORT="\$APP_PORT"/);
  assert.match(deployScript, /wait-for-readiness\.cjs/);
  assert.match(readiness, /payload\.releaseCommit === commit/);
  assert.match(readiness, /payload\.releaseId === releaseId/);
  assert.match(deployScript, /rm -rf -- "\$FINAL_RELEASE"/);
  assert.match(ecosystem, /API_PORT:\s*appPort/);
  assert.match(ecosystem, /KEYDIGEST_DATA_DIR:\s*path\.join\(deployRoot, 'shared', 'data'\)/);
  assert.match(server, /releaseCommit:\s*readReleaseMetadata\('\.release-commit'\)/);
  assert.match(server, /releaseId:\s*readReleaseMetadata\('\.release-id'\)/);
});

const { waitForReadiness } = require('../scripts/wait-for-readiness.cjs');
const target = { url: 'http://isolated.test/api/readiness', commit: 'target-commit', releaseId: 'target-release' };
const response = payload => ({ ok: true, json: async () => payload });
const ready = { status: 'ready', releaseCommit: target.commit, releaseId: target.releaseId };

test('readiness retries wrong releases and invalid responses until the actual target is ready', async () => {
  const responses = [
    { ok: false },
    { ok: true, json: async () => { throw new Error('invalid JSON'); } },
    response({ ...ready, releaseCommit: 'old-commit' }),
    response({ ...ready, releaseId: 'old-release' }),
    response(ready),
  ];
  const attempts = responses.length;
  assert.equal(await waitForReadiness({ ...target, timeoutMs: 1000, intervalMs: 1, fetchImpl: async () => responses.shift() }), true);
  assert.equal(responses.length, 0, `all ${attempts} responses must be checked`);
});

test('unready or stale process cannot satisfy deployment readiness', async () => {
  for (const payload of [{ ...ready, status: 'not_ready' }, { ...ready, releaseId: 'old-release' }]) {
    assert.equal(await waitForReadiness({ ...target, timeoutMs: 25, intervalMs: 1, fetchImpl: async () => response(payload) }), false);
  }
});

test('readiness deadline aborts both hung connections and hung response bodies', async () => {
  for (const stage of ['headers', 'body']) {
    let aborted = false;
    const fetchImpl = async (_url, { signal }) => {
      const hang = () => new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); }, { once: true });
      });
      return stage === 'headers' ? hang() : { ok: true, json: hang };
    };
    const start = performance.now();
    assert.equal(await waitForReadiness({ ...target, timeoutMs: 30, requestTimeoutMs: 1000, intervalMs: 1, fetchImpl }), false);
    assert.equal(aborted, true);
    assert.ok(performance.now() - start < 1000, 'must terminate instead of waiting forever');
  }
});
