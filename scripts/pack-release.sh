#!/usr/bin/env bash
# 打生产部署包（issue #22）：
#   - 包内只含「出厂默认层」config/，绝不含 config/runtime/（生产自定义层）
#     → 解压覆盖部署永远不会碰生产端已自定义的 prompt
#   - 排除数据、备份、node_modules、.git、历史 tar 包等本地杂物
# 用法：
#   bash scripts/pack-release.sh          # 构建前端并打包
#   bash scripts/pack-release.sh --no-build
set -euo pipefail
cd "$(dirname "$0")/.."

NO_BUILD=0
for arg in "$@"; do
  [ "$arg" = "--no-build" ] && NO_BUILD=1
done

if [ "$NO_BUILD" -eq 0 ]; then
  echo "==> 构建前端 (npm run build)"
  npm run build
fi

STAMP="$(date +%Y%m%d-%H%M)"
OUT="release-keydigest-${STAMP}.tar.gz"

echo "==> 打包 $OUT"
tar -czf "$OUT" \
  server.cjs \
  services \
  server \
  scripts \
  dist \
  config \
  docs/deployment.md \
  package.json \
  package-lock.json \
  keydigest_start.sh \
  --exclude='config/runtime' \
  --exclude='config/*备份*' \
  --exclude='config/*_备份*' \
  --exclude='config/.DS_Store'

echo "==> 完成: $OUT"
echo "    部署步骤见 docs/deployment.md（首次升级需执行 migrate-runtime-config 迁移）"
