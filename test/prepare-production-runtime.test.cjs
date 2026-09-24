const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { AUDITED_FILES } = require('../services/productionConfigAudit.cjs');

const { prepareProductionRuntime } = require('../scripts/prepare-production-runtime.cjs');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'keydigest-runtime-migration-'));
  const sourceConfig = path.join(root, 'legacy', 'config');
  const sourcePolicies = path.join(sourceConfig, 'policies');
  const sourceData = path.join(root, 'legacy', 'data');
  const targetRoot = path.join(root, 'shared');
  fs.mkdirSync(sourcePolicies, { recursive: true });
  for (const name of AUDITED_FILES) fs.copyFileSync(path.join(__dirname, '../config', name), path.join(sourceConfig, name));
  fs.mkdirSync(path.join(sourceData, 'auto-report-pdfs'), { recursive: true });
  fs.writeFileSync(path.join(sourceConfig, 'users.json'), JSON.stringify([
    { username: 'admin', password: 'production-secret', role: 'admin' },
  ]));
  fs.writeFileSync(path.join(sourcePolicies, 'policy_initial.json'), JSON.stringify({ version: 'initial' }));
  fs.writeFileSync(path.join(sourcePolicies, 'policy_20260817010101.json'), JSON.stringify({ version: 'history' }));
  fs.writeFileSync(path.join(sourceData, 'login-audit.json'), JSON.stringify([{ username: 'admin' }]));
  fs.writeFileSync(path.join(sourceData, 'auto-report-pdfs', 'history.pdf'), Buffer.from('%PDF-history'));
  return { root, sourceConfig, sourceData, targetRoot };
}

test('prepareProductionRuntime copies users, policy history, login audit, and report PDFs', () => {
  const { sourceConfig, targetRoot } = fixture();
  const result = prepareProductionRuntime({ sourceConfig, targetRoot });

  assert.equal(result.users.action, 'copy');
  assert.equal(result.policies.length, 2);
  const usersPath = path.join(targetRoot, 'config/runtime/users.json');
  assert.equal(JSON.parse(fs.readFileSync(usersPath, 'utf8'))[0].password, 'production-secret');
  assert.equal(fs.statSync(usersPath).mode & 0o777, 0o600);
  assert.ok(fs.existsSync(path.join(targetRoot, 'config/policies/policy_20260817010101.json')));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(targetRoot, 'data/login-audit.json'), 'utf8')), [{ username: 'admin' }]);
  assert.equal(fs.readFileSync(path.join(targetRoot, 'data/auto-report-pdfs/history.pdf'), 'utf8'), '%PDF-history');
  assert.equal(result.data.loginAudit.action, 'copy');
  assert.deepEqual(result.data.pdfs.map((item) => item.name), ['history.pdf']);
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
  assert.equal(rerun.data.loginAudit.action, 'skip');
  assert.ok(rerun.data.pdfs.every((pdf) => pdf.action === 'skip'));
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

  const preview = prepareProductionRuntime({ sourceConfig, targetRoot, forceUsers: true, dryRun: true });
  assert.equal(preview.users.action, 'replace');
  assert.match(preview.users.backupPath, /users\.json\.bak-\d{8}T\d{6}Z(?:-\d+)?$/);
  assert.equal(fs.existsSync(preview.users.backupPath), false);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(targetRoot, 'config/runtime/users.json'), 'utf8'))[0].password,
    'production-secret',
  );

  const replaced = prepareProductionRuntime({ sourceConfig, targetRoot, forceUsers: true });
  assert.equal(replaced.users.action, 'replace');
  assert.match(replaced.users.backupPath, /users\.json\.bak-\d{8}T\d{6}Z(?:-\d+)?$/);
  assert.equal(
    JSON.parse(fs.readFileSync(replaced.users.backupPath, 'utf8'))[0].password,
    'production-secret',
  );
  assert.equal(fs.statSync(replaced.users.backupPath).mode & 0o777, 0o600);
  assert.equal(JSON.parse(fs.readFileSync(path.join(targetRoot, 'config/runtime/users.json'), 'utf8'))[0].password, 'new-production-secret');

  fs.writeFileSync(path.join(sourceConfig, 'policies/policy_initial.json'), JSON.stringify({ changed: true }));
  assert.throws(
    () => prepareProductionRuntime({ sourceConfig, targetRoot, forceUsers: true }),
    /政策历史 policy_initial\.json.*拒绝覆盖/,
  );
});

test('prepareProductionRuntime refuses to overwrite conflicting historical data', () => {
  const { sourceConfig, sourceData, targetRoot } = fixture();
  prepareProductionRuntime({ sourceConfig, sourceData, targetRoot });

  fs.writeFileSync(path.join(sourceData, 'auto-report-pdfs/history.pdf'), Buffer.from('%PDF-changed'));
  assert.throws(
    () => prepareProductionRuntime({ sourceConfig, sourceData, targetRoot }),
    /自动周报 PDF history\.pdf.*拒绝覆盖/,
  );
});

test('configuration drift stops both dry-run and migration before creating any target files', () => {
  for (const name of ['prompts.md', 'policy_prompts.md', 'keyword-prompts.json', 'region-policy-report-prompts.json', 'auto-report-config.json', 'weekly-report-models.json']) {
    const { sourceConfig, targetRoot } = fixture();
    const file = path.join(sourceConfig, name);
    if (name.endsWith('.md')) fs.appendFileSync(file, '\nProduction-only customization\n');
    else {
      const config = JSON.parse(fs.readFileSync(file));
      if (name === 'auto-report-config.json') config.enabled = false;
      else config.productionOnly = 'must not disappear';
      fs.writeFileSync(file, JSON.stringify(config));
    }
    for (const dryRun of [true, false]) {
      assert.throws(() => prepareProductionRuntime({ sourceConfig, targetRoot, dryRun }), error => error.code === 'PRODUCTION_CONFIG_DRIFT' && error.message.includes(name));
      assert.equal(fs.existsSync(targetRoot), false);
    }
  }
});

test('missing configuration and existing source runtime overrides stop migration', () => {
  const { sourceConfig, targetRoot } = fixture();
  fs.mkdirSync(path.join(sourceConfig, 'runtime'));
  fs.writeFileSync(path.join(sourceConfig, 'runtime/prompts.md'), 'production runtime override');
  assert.throws(() => prepareProductionRuntime({ sourceConfig, targetRoot }), /runtime/);
  assert.equal(fs.existsSync(targetRoot), false);
  fs.rmSync(path.join(sourceConfig, 'runtime'), { recursive: true });
  fs.unlinkSync(path.join(sourceConfig, 'prompts.md'));
  assert.throws(() => prepareProductionRuntime({ sourceConfig, targetRoot }), /prompts\.md/);
  assert.equal(fs.existsSync(targetRoot), false);
});

test('only approved legacy model and prompt-reference conversions pass migration audit', () => {
  const { sourceConfig, targetRoot } = fixture();
  const autoPath = path.join(sourceConfig, 'auto-report-config.json');
  const auto = JSON.parse(fs.readFileSync(autoPath));
  auto.defaults.modelKey = 'deepseek-v4-pro';
  for (const item of Object.values(auto.keywords)) item.modelKey = 'deepseek-v4-flash';
  auto.keywords['烟草服务银行'].promptId = 'default';
  fs.writeFileSync(autoPath, JSON.stringify(auto));
  const keywordPath = path.join(sourceConfig, 'keyword-prompts.json');
  const keywords = JSON.parse(fs.readFileSync(keywordPath));
  keywords.keywords['潜在招标客户'].prompts[0].isDefault = false;
  fs.writeFileSync(keywordPath, JSON.stringify(keywords));
  const result = prepareProductionRuntime({ sourceConfig, targetRoot, dryRun: true });
  assert.equal(result.configAudit.transforms.length, 2);
  assert.equal(fs.existsSync(targetRoot), false);
  auto.keywords['烟草服务银行'].minScore = 1;
  fs.writeFileSync(autoPath, JSON.stringify(auto));
  assert.throws(() => prepareProductionRuntime({ sourceConfig, targetRoot }), /auto-report-config\.json/);
  assert.equal(fs.existsSync(targetRoot), false);
});

test('audited legacy model snapshots are accepted, but edited endpoints are rejected', () => {
  const { sourceConfig, targetRoot } = fixture();
  for (const name of ['llm-config.json', 'weekly-report-models.json']) {
    fs.copyFileSync(path.join(__dirname, 'fixtures', `legacy-${name}`), path.join(sourceConfig, name));
  }
  const result = prepareProductionRuntime({ sourceConfig, targetRoot, dryRun: true });
  assert.equal(result.configAudit.transforms.length, 2);
  assert.equal(fs.existsSync(targetRoot), false);
  const legacyPath = path.join(sourceConfig, 'llm-config.json');
  const legacy = JSON.parse(fs.readFileSync(legacyPath));
  legacy.models[Object.keys(legacy.models)[0]].endpoint = 'https://custom.example.invalid/v1/chat/completions';
  fs.writeFileSync(legacyPath, JSON.stringify(legacy));
  assert.throws(() => prepareProductionRuntime({ sourceConfig, targetRoot }), /llm-config\.json/);
  assert.equal(fs.existsSync(targetRoot), false);
});

test('standalone baseline verification uses the same drift rules and never prints prompt bodies', () => {
  const { spawnSync } = require('node:child_process');
  const { sourceConfig } = fixture();
  const args = [path.join(__dirname, '../scripts/verify-production-baseline.cjs'), '--snapshot', path.dirname(sourceConfig), '--repo', path.join(__dirname, '..')];
  const pass = spawnSync(process.execPath, args, { encoding: 'utf8' });
  assert.equal(pass.status, 0, pass.stderr);
  fs.appendFileSync(path.join(sourceConfig, 'prompts.md'), '\nPRIVATE_PROMPT_SENTINEL');
  const failed = spawnSync(process.execPath, args, { encoding: 'utf8' });
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /prompts\.md/);
  assert.doesNotMatch(failed.stdout + failed.stderr, /PRIVATE_PROMPT_SENTINEL/);
});
