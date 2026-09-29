#!/usr/bin/env node
'use strict';

const { setTimeout: sleep } = require('node:timers/promises');

async function waitForReadiness({
  url, commit, releaseId,
  timeoutMs = 40000, requestTimeoutMs = 3000, intervalMs = 2000,
  fetchImpl = fetch,
}) {
  for (const value of [timeoutMs, requestTimeoutMs, intervalMs]) {
    if (!Number.isFinite(value) || value <= 0) throw new Error('readiness 超时和重试间隔必须为正数');
  }
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    const remaining = deadline - performance.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(requestTimeoutMs, remaining));
    try {
      const response = await fetchImpl(url, { signal: controller.signal, redirect: 'error' });
      if (response.ok) {
        // Keep the abort timer active until the complete body has arrived.
        const payload = await response.json();
        if (performance.now() < deadline && payload.status === 'ready'
            && payload.releaseCommit === commit && payload.releaseId === releaseId) return true;
      }
    } catch {
      // Connection failures, invalid JSON, and a stalled response all consume
      // the same total deadline and lead to the deployment script's rollback.
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
    const waitMs = Math.min(intervalMs, deadline - performance.now());
    if (waitMs > 0) await sleep(waitMs);
  }
  return false;
}

if (require.main === module) {
  const [url, commit, releaseId] = process.argv.slice(2);
  if (!url || !commit || !releaseId) {
    console.error('用法：node scripts/wait-for-readiness.cjs <url> <commit> <release-id>');
    process.exitCode = 2;
  } else {
    waitForReadiness({ url, commit, releaseId })
      .then(ready => { process.exitCode = ready ? 0 : 1; })
      .catch(() => { process.exitCode = 1; });
  }
}

module.exports = { waitForReadiness };
