'use strict';

const path = require('node:path');

const deployRoot = process.env.KEYDIGEST_DEPLOY_ROOT || '/www/wwwroot/keydigest';
const appPort = process.env.KEYDIGEST_APP_PORT || '3456';

module.exports = {
  apps: [{
    name: 'keydigest',
    cwd: path.join(deployRoot, 'current'),
    script: 'server.cjs',
    env: {
      NODE_ENV: 'production',
      API_PORT: appPort,
      KEYDIGEST_DATA_DIR: path.join(deployRoot, 'shared', 'data'),
    },
    autorestart: true,
    max_restarts: 10,
    restart_delay: 3000,
  }],
};
