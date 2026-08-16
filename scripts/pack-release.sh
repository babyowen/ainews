#!/usr/bin/env bash
# 打生产部署包（issue #22）：
#   - 包内只含「出厂默认层」config/，绝不含 config/runtime/（生产自定义层）
#     → 解压覆盖部署永远不会碰生产端已自定义的 prompt
#   - 同时附带 config-baseline-<版本标识>/（本包默认层快照）与 RELEASE_VERSION 标识文件。
#     目录名含唯一版本标识，解压不会覆盖服务器上已有的旧基线；
#     迁移脚本据此自动拾取「生产正在运行版本」的基线做三方比较，见 docs/deployment.md
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

# 版本标识：git 短 SHA + 构建时间，保证唯一。基线目录以此命名（config-baseline-<标识>/），
# 与 RELEASE_VERSION 文件内容一致——迁移脚本据此排除「本包自带的快照」、
# 拾取服务器上沉淀的「上一版基线」。唯一命名保证解压永远不会覆盖旧基线。
RELEASE_ID="$(git rev-parse --short=12 HEAD 2>/dev/null || echo local)-$(date +%Y%m%d%H%M)"

# 准备基线：本包默认层的干净副本（不含 runtime / 备份 / .DS_Store / 运行时政策快照）
STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT
BASELINE_DIR_NAME="config-baseline-${RELEASE_ID}"
cp -R config "$STAGING/$BASELINE_DIR_NAME"
rm -rf "$STAGING/$BASELINE_DIR_NAME/runtime"
find "$STAGING/$BASELINE_DIR_NAME" -name '*.DS_Store' -delete
rm -f "$STAGING/$BASELINE_DIR_NAME/"*备份* "$STAGING/$BASELINE_DIR_NAME/"*_备份*
rm -f "$STAGING/$BASELINE_DIR_NAME/policies/"policy_2*
printf '%s\n' "$RELEASE_ID" > "$STAGING/RELEASE_VERSION"

echo "==> 打包 ${OUT}（临时文件 ${TMP}，校验通过后改名；基线 ${BASELINE_DIR_NAME}）"
# 注意：bsdtar/GNU tar 的 --exclude 必须放在文件列表之前，否则会被当作文件名（macOS bsdtar 实测）
# config/policies/policy_2*.json 为运行时生成的政策快照（/api/policy/save 写入，
# 且读取按 mtime 选最新），打进包会在解压时刷新 mtime、干扰生产最新版选择——排除。
tar -czf "$TMP" \
  --exclude='config/runtime' \
  --exclude='config/*备份*' \
  --exclude='config/*_备份*' \
  --exclude='config/.DS_Store' \
  --exclude='config/policies/policy_2*' \
  -C "$STAGING" "$BASELINE_DIR_NAME" RELEASE_VERSION \
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
if tar -tzf "$TMP" | grep -q '^config/policies/policy_2'; then
  echo "❌ 校验失败：包内包含运行时政策快照 config/policies/policy_2*，禁止发布" >&2
  rm -f "$TMP"
  exit 1
fi
if tar -tzf "$TMP" | grep -qE '^config-baseline/'; then
  echo "❌ 校验失败：包内包含无版本标识的 config-baseline/（会覆盖旧基线），禁止发布" >&2
  rm -f "$TMP"
  exit 1
fi
if ! tar -tzf "$TMP" | grep -q "^${BASELINE_DIR_NAME}/"; then
  echo "❌ 校验失败：包内缺少基线目录 ${BASELINE_DIR_NAME}" >&2
  rm -f "$TMP"
  exit 1
fi
if ! tar -tzf "$TMP" | grep -qx 'RELEASE_VERSION'; then
  echo "❌ 校验失败：包内缺少 RELEASE_VERSION 标识文件" >&2
  rm -f "$TMP"
  exit 1
fi

mv "$TMP" "$OUT"
echo "==> 完成: $OUT"
echo "    包内含 ${BASELINE_DIR_NAME}/ 与 RELEASE_VERSION（版本标识，供迁移自动选择正确基线）"
echo "    部署步骤见 docs/deployment.md（首次升级需执行 migrate-runtime-config 迁移）"
