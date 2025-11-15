PATH=/www/server/nodejs/v20.18.1/bin:/bin:/sbin:/usr/bin:/usr/sbin:/usr/local/bin:/usr/local/sbin:~/bin
export PATH

export NODE_PROJECT_NAME="keydigest"
export HOME=/root
/www/server/nodejs/v20.18.1/bin/pm2 start /www/server/nodejs/vhost/pm2_configs/keydigest/ecosystem.config.cjs