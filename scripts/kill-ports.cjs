#!/usr/bin/env node
require('dotenv').config();
const killPort = require('kill-port');

const apiPort = Number(process.env.API_PORT) || 3456;
const vitePort = Number(process.env.VITE_PORT) || 5174;

async function kill(p) {
  try {
    await killPort(p, 'tcp');
    console.log(`[kill-ports] Killed port ${p}`);
  } catch (err) {
    const msg = (err && err.message) || String(err);
    if (/not find the process|No process found/.test(msg)) {
      console.log(`[kill-ports] Port ${p} not in use`);
    } else {
      console.log(`[kill-ports] Skipped killing port ${p}: ${msg}`);
    }
  }
}

(async () => {
  await kill(apiPort);
  await kill(vitePort);
})();