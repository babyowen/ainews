const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { prepareProductionRuntime } = require('../scripts/prepare-production-runtime.cjs');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'keydigest-runtime-migration-'));
  const sourceConfig = path.join(root, 'legacy', 'config');
  const sourcePolicies = path.join(sourceConfig, 'policies');
  const targetRoot = path.join(root, 'shared');
  fs.mkdirSync(sourcePolicies, { recursive: true });
  fs.writeFileSync(path.join(sourceConfig, 'users.json'), JSON.stringify([
    { username: 'admin', password: 'production-secret', role: 'admin' },
  ]));
  fs.writeFileSync(path.join(sourcePolicies, 'policy_initial.json'), JSON.stringify({ version: 'initial' }));
  fs.writeFileSync(path.join(sourcePolicies, 'policy_20260817010101.json'), JSON.stringify({ version: 'history' }));
  return { root, sourceConfig, targetRoot };
}

test('prepareProductionRuntime only copies users and policy history', () => {
  const { sourceConfig, targetRoot } = fixture();
  const result = prepareProductionRuntime({ sourceConfig, targetRoot });

  assert.equal(result.users.action, 'copy');
  assert.equal(result.policies.length, 2);
  const usersPath = path.join(targetRoot, 'config/runtime/users.json');
  assert.equal(JSON.parse(fs.readFileSync(usersPath, 'utf8'))[0].password, 'production-secret');
  assert.equal(fs.statSync(usersPath).mode & 0o777, 0o600);
  assert.ok(fs.existsSync(path.join(targetRoot, 'config/policies/policy_20260817010101.json')));
  assert.equal(fs.existsSync(path.join(targetRoot, 'config/runtime/prompts.md')), false);
});

test('prepareProductionRuntime dry-run does not write and rerun skips identical files', () => {
  const { sourceConfig, targetRoot } = fixture();
  const dryRun = prepareProductionRuntime({ sourceConfig, targetRoot, dryRun: true });
  assert.equal(dryRun.dryRun, true);
  assert.equal(fs.existsSync(targetRoot), false);

  prepareProductionRuntime({ sourceConfig, targetRoot });
  const rerun = prepareProductionRuntime({ sourceConfig, targetRoot });
  assert.equal(rerun.users.action, 'skip');
  assert.ok(rerun.policies.every((policy) => policy.action === 'skip'));
});

test('prepareProductionRuntime refuses conflicting history and users unless explicitly allowed', () => {
  const { sourceConfig, targetRoot } = fixture();
  prepareProductionRuntime({ sourceConfig, targetRoot });

  fs.writeFileSync(path.join(sourceConfig, 'users.json'), JSON.stringify([
    { username: 'admin', password: 'new-production-secret', role: 'admin' },
  ]));
  assert.throws(
    () => prepareProductionRuntime({ sourceConfig, targetRoot }),
    /users\.json.*拒绝覆盖/,
  );

  const replaced = prepareProductionRuntime({ sourceConfig, targetRoot, forceUsers: true });
  assert.equal(replaced.users.action, 'replace');

  fs.writeFileSync(path.join(sourceConfig, 'policies/policy_initial.json'), JSON.stringify({ changed: true }));
  assert.throws(
    () => prepareProductionRuntime({ sourceConfig, targetRoot, forceUsers: true }),
    /政策历史 policy_initial\.json.*拒绝覆盖/,
  );
});
