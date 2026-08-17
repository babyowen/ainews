'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');

test('production deployment gates success on readiness and pins data to shared storage', () => {
  const deployScript = fs.readFileSync(path.join(root, 'scripts/deploy-from-gitee.sh'), 'utf8');
  const ecosystem = fs.readFileSync(path.join(root, 'deploy/ecosystem.config.cjs'), 'utf8');

  assert.match(deployScript, /\/api\/readiness/);
  assert.doesNotMatch(deployScript, /APP_PORT\/api\/health/);
  assert.match(ecosystem, /KEYDIGEST_DATA_DIR:\s*path\.join\(deployRoot, 'shared', 'data'\)/);
});
