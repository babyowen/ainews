'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');

test('production deployment gates success on readiness and pins data to shared storage', () => {
  const deployScript = fs.readFileSync(path.join(root, 'scripts/deploy-from-gitee.sh'), 'utf8');
  const ecosystem = fs.readFileSync(path.join(root, 'deploy/ecosystem.config.cjs'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'server.cjs'), 'utf8');

  assert.match(deployScript, /\/api\/readiness/);
  assert.doesNotMatch(deployScript, /APP_PORT\/api\/health/);
  assert.match(deployScript, /KEYDIGEST_APP_PORT="\$APP_PORT"/);
  assert.match(deployScript, /payload\.releaseCommit === process\.argv\[1\]/);
  assert.match(deployScript, /payload\.releaseId === process\.argv\[2\]/);
  assert.match(deployScript, /rm -rf -- "\$FINAL_RELEASE"/);
  assert.match(ecosystem, /API_PORT:\s*appPort/);
  assert.match(ecosystem, /KEYDIGEST_DATA_DIR:\s*path\.join\(deployRoot, 'shared', 'data'\)/);
  assert.match(server, /releaseCommit:\s*readReleaseMetadata\('\.release-commit'\)/);
  assert.match(server, /releaseId:\s*readReleaseMetadata\('\.release-id'\)/);
});
