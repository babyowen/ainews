#!/usr/bin/env bash
# 打生产部署包（issue #22）：
#   - 包内只含「出厂默认层」config/，绝不含 config/runtime/（生产自定义层）
#     → 解压覆盖部署永远不会碰生产端已自定义的 prompt
#   - 同时附带 config-baseline/（本次发布时的默认层快照），
#     供「下一次」升级迁移做三方比较（旧默认 + 生产快照 + 新默认），见 docs/deployment.md
#   - 打包到临时文件，校验包内确无 config/runtime 后才改名为正式发布包
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

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="release-keydigest-${STAMP}.tar.gz"
TMP="${OUT}.building"

# 准备 config-baseline：默认层的干净副本（不含 runtime / 备份 / .DS_Store）
STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT
cp -R config "$STAGING/config-baseline"
rm -rf "$STAGING/config-baseline/runtime"
find "$STAGING/config-baseline" -name '*.DS_Store' -delete
rm -f "$STAGING/config-baseline/"*备份* "$STAGING/config-baseline/"*_备份*

echo "==> 打包 ${OUT}（临时文件 ${TMP}，校验通过后改名）"
# 注意：bsdtar/GNU tar 的 --exclude 必须放在文件列表之前，否则会被当作文件名（macOS bsdtar 实测）
tar -czf "$TMP" \
  --exclude='config/runtime' \
  --exclude='config/*备份*' \
  --exclude='config/*_备份*' \
  --exclude='config/.DS_Store' \
  -C "$STAGING" config-baseline \
  -C "$PWD" \
  server.cjs \
  services \
  server \
  scripts \
  dist \
  config \
  docs/deployment.md \
  package.json \
  package-lock.json \
  keydigest_start.sh

echo "==> 校验包内容"
if tar -tzf "$TMP" | grep -q '^config/runtime'; then
  echo "❌ 校验失败：包内包含 config/runtime，禁止发布" >&2
  rm -f "$TMP"
  exit 1
fi
if ! tar -tzf "$TMP" | grep -q '^config-baseline/'; then
  echo "❌ 校验失败：包内缺少 config-baseline 基线目录" >&2
  rm -f "$TMP"
  exit 1
fi

mv "$TMP" "$OUT"
echo "==> 完成: $OUT"
echo "    包内含 config-baseline/（本次默认层快照，供下次迁移三方比较用）"
echo "    部署步骤见 docs/deployment.md（首次升级需执行 migrate-runtime-config 迁移）"
