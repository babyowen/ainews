const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { randomUUID } = require('node:crypto');

const root = path.resolve(__dirname, '../..');
const actualRequire = createRequire(path.join(root, 'server.cjs'));

// Execute the real Express handlers with test-owned files and SQL. Never load .env,
// listen on a port, register cron jobs, or connect to a real database/model provider.
function createIsolatedApp({ configDir, dataDir, readiness = false, env = {} }) {
  const pool = { async query(sql) {
    if (sql.includes('SELECT DISTINCT keyword FROM scored_news')) return [[{ keyword: '公积金' }, { keyword: '养老' }]];
    if (readiness && (/CREATE TABLE IF NOT EXISTS auto_report_log|SHOW COLUMNS FROM auto_report_log|ALTER TABLE auto_report_log|SELECT 1 AS ready/.test(sql))) return [[]];
    throw new Error(`Unexpected SQL in isolated test: ${sql}`);
  } };
  function isolatedRequire(name) {
    if (name === 'dotenv') return { config() {} };
    if (name === 'mysql2/promise') return { createPool: () => pool };
    if (name === 'node-cron') return { schedule() {
      if (readiness) return { stop() {} }; // Fake scheduler; no timers or jobs.
      throw new Error('Tests must not register cron jobs');
    } };
    if (name === './services/configStore.cjs') return {
      createConfigStore: () => actualRequire(name).createConfigStore({ configDir }),
    };
    if (name === './services/appDataPaths.cjs') return {
      ...actualRequire(name),
      resolveAppDataDir: () => dataDir,
    };
    if (name === './services/modelClient.cjs') return {
      redactError: String,
      async completeChat() { throw new Error('Tests must not call a model provider'); },
      async streamChat() { throw new Error('Tests must not call a model provider'); },
    };
    return actualRequire(name);
  }
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'server.cjs'), 'utf8'), {
    require: isolatedRequire, module, __dirname: path.dirname(configDir), Buffer,
    process: { env: { KEYDIGEST_DATA_DIR: dataDir, KEYDIGEST_SESSION_SECRET: randomUUID(), ...env } },
    console: { log() {}, warn() {}, error() {} },
  }, { filename: 'server.cjs' });
  const app = module.exports;
  return async function request(method, urlPath, body, token) {
    const url = new URL(urlPath, 'http://isolated.test');
    const layer = app._router.stack.find(layer => layer.route?.methods[method.toLowerCase()] && layer.match(url.pathname));
    if (!layer) throw new Error(`Route not found: ${method} ${url.pathname}`);
    const headers = token ? { authorization: `Bearer ${token}` } : {};
    const req = { body, headers, params: layer.params, query: Object.fromEntries(url.searchParams), get: name => headers[name.toLowerCase()] };
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(value) { this.body = value; return this; },
      setHeader() {},
    };
    await layer.route.stack[0].handle(req, res);
    return { status: res.statusCode, body: JSON.parse(JSON.stringify(res.body)) };
  };
}

module.exports = { createIsolatedApp };
