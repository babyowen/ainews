'use strict';

const path = require('node:path');

const deployRoot = process.env.KEYDIGEST_DEPLOY_ROOT || '/www/wwwroot/keydigest';

module.exports = {
  apps: [{
    name: 'keydigest',
    cwd: path.join(deployRoot, 'current'),
    script: 'server.cjs',
    env: {
      NODE_ENV: 'production',
    },
    autorestart: true,
    max_restarts: 10,
    restart_delay: 3000,
  }],
};
