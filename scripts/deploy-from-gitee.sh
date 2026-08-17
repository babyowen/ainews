#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  cat <<'EOF'
用法：
  bash scripts/deploy-from-gitee.sh \
    --repo https://gitee.com/<owner>/<repo>.git \
    --ref <tag-or-commit> \
    [--root /www/wwwroot/keydigest] \
    [--port 3456] [--test-port 13456] [--keep 5] [--skip-restart]

前置条件：
  <root>/shared/.env
  <root>/shared/config/runtime/users.json
  <root>/shared/config/policies/policy_*.json

脚本按精确 Git commit 创建独立 release，成功后原子切换 current，并仅保留最近 N 个 release。
EOF
}

REPO_URL=''
DEPLOY_REF=''
DEPLOY_ROOT='/www/wwwroot/keydigest'
APP_PORT='3456'
TEST_PORT='13456'
KEEP_RELEASES='5'
SKIP_RESTART='0'

while (($#)); do
  case "$1" in
    --repo) REPO_URL="${2:-}"; shift 2 ;;
    --ref) DEPLOY_REF="${2:-}"; shift 2 ;;
    --root) DEPLOY_ROOT="${2:-}"; shift 2 ;;
    --port) APP_PORT="${2:-}"; shift 2 ;;
    --test-port) TEST_PORT="${2:-}"; shift 2 ;;
    --keep) KEEP_RELEASES="${2:-}"; shift 2 ;;
    --skip-restart) SKIP_RESTART='1'; shift ;;
    --help|-h) usage; exit 0 ;;
    *) echo "未知参数：$1" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ -z "$REPO_URL" || -z "$DEPLOY_REF" ]]; then
  echo '必须提供 --repo 和 --ref。' >&2
  usage >&2
  exit 2
fi
if [[ "$REPO_URL" != *gitee.com* ]]; then
  echo "--repo 必须是 Gitee 地址，实际为：$REPO_URL" >&2
  exit 2
fi
if [[ "$DEPLOY_ROOT" != /* || "$DEPLOY_ROOT" == '/' || "$DEPLOY_ROOT" == '/root' || "$DEPLOY_ROOT" == '/home' || "$DEPLOY_ROOT" == '/usr' ]]; then
  echo "不安全的 --root：$DEPLOY_ROOT" >&2
  exit 2
fi
if [[ ! "$APP_PORT" =~ ^[0-9]+$ || ! "$TEST_PORT" =~ ^[0-9]+$ || ! "$KEEP_RELEASES" =~ ^[1-9][0-9]*$ ]]; then
  echo '--port、--test-port 必须是端口数字，--keep 必须是正整数。' >&2
  exit 2
fi
if ((APP_PORT < 1 || APP_PORT > 65535 || TEST_PORT < 1 || TEST_PORT > 65535 || APP_PORT == TEST_PORT)); then
  echo '端口范围无效，且测试端口不能与生产端口相同。' >&2
  exit 2
fi

for command_name in git node npm tar curl mktemp; do
  command -v "$command_name" >/dev/null || { echo "缺少命令：$command_name" >&2; exit 1; }
done
if [[ "$SKIP_RESTART" == '0' ]]; then
  command -v pm2 >/dev/null || { echo '缺少命令：pm2（或使用 --skip-restart）' >&2; exit 1; }
fi

MIRROR_DIR="$DEPLOY_ROOT/repository.git"
RELEASES_DIR="$DEPLOY_ROOT/releases"
SHARED_DIR="$DEPLOY_ROOT/shared"
CURRENT_LINK="$DEPLOY_ROOT/current"
SHARED_ENV="$SHARED_DIR/.env"
SHARED_RUNTIME="$SHARED_DIR/config/runtime"
SHARED_POLICIES="$SHARED_DIR/config/policies"
SHARED_DATA="$SHARED_DIR/data"

if [[ ! -f "$SHARED_ENV" ]]; then
  echo "缺少共享环境文件：$SHARED_ENV" >&2
  exit 1
fi
if [[ ! -f "$SHARED_RUNTIME/users.json" ]]; then
  echo "缺少生产用户运行时文件：$SHARED_RUNTIME/users.json" >&2
  exit 1
fi
if ! find "$SHARED_POLICIES" -maxdepth 1 -type f -name 'policy_*.json' -print -quit 2>/dev/null | grep -q .; then
  echo "缺少生产政策历史：$SHARED_POLICIES/policy_*.json" >&2
  exit 1
fi

mkdir -p "$RELEASES_DIR" "$SHARED_RUNTIME" "$SHARED_POLICIES" "$SHARED_DATA"

if [[ ! -d "$MIRROR_DIR" ]]; then
  git clone --mirror "$REPO_URL" "$MIRROR_DIR"
else
  MIRROR_ORIGIN="$(git --git-dir="$MIRROR_DIR" config --get remote.origin.url || true)"
  if [[ "$MIRROR_ORIGIN" != "$REPO_URL" ]]; then
    echo "镜像仓库 origin 不匹配：$MIRROR_ORIGIN" >&2
    exit 1
  fi
  git --git-dir="$MIRROR_DIR" remote update --prune
fi

if ! DEPLOY_COMMIT="$(git --git-dir="$MIRROR_DIR" rev-parse --verify "${DEPLOY_REF}^{commit}" 2>/dev/null)"; then
  echo "Gitee 镜像中找不到 ref：$DEPLOY_REF" >&2
  exit 1
fi
SHORT_COMMIT="${DEPLOY_COMMIT:0:12}"
BUILD_DIR="$(mktemp -d "$RELEASES_DIR/.building.XXXXXX")"

cleanup_build() {
  if [[ -n "${BUILD_DIR:-}" && -d "$BUILD_DIR" && "$BUILD_DIR" == "$RELEASES_DIR"/.building.* ]]; then
    rm -rf -- "$BUILD_DIR"
  fi
}
trap cleanup_build EXIT

git --git-dir="$MIRROR_DIR" archive "$DEPLOY_COMMIT" | tar -x -C "$BUILD_DIR"
printf '%s\n' "$DEPLOY_COMMIT" > "$BUILD_DIR/.release-commit"

pushd "$BUILD_DIR" >/dev/null
npm ci
TEST_API_PORT="$TEST_PORT" npm test
npm run build
npm prune --omit=dev
popd >/dev/null

# 运行时数据在测试和构建成功后才接入。Git 中的政策种子保留作审计，但应用只读共享生产目录。
if [[ -d "$BUILD_DIR/config/policies" ]]; then
  mv "$BUILD_DIR/config/policies" "$BUILD_DIR/config/default-policies"
fi
if [[ -d "$BUILD_DIR/config/runtime" ]]; then
  if find "$BUILD_DIR/config/runtime" -mindepth 1 -print -quit | grep -q .; then
    echo '测试后 config/runtime 仍含文件，拒绝把运行时配置带入发布。' >&2
    exit 1
  fi
  rmdir "$BUILD_DIR/config/runtime"
elif [[ -e "$BUILD_DIR/config/runtime" ]]; then
  echo '发布内容意外包含非目录 config/runtime，拒绝上线。' >&2
  exit 1
fi
if [[ -d "$BUILD_DIR/data" ]]; then
  mv "$BUILD_DIR/data" "$BUILD_DIR/data-build-artifacts"
fi
ln -s "$SHARED_RUNTIME" "$BUILD_DIR/config/runtime"
ln -s "$SHARED_POLICIES" "$BUILD_DIR/config/policies"
ln -s "$SHARED_DATA" "$BUILD_DIR/data"
ln -s "$SHARED_ENV" "$BUILD_DIR/.env"

RELEASE_NAME="release-$(date -u +%Y%m%dT%H%M%SZ)-$SHORT_COMMIT"
FINAL_RELEASE="$RELEASES_DIR/$RELEASE_NAME"
printf '%s\n' "$RELEASE_NAME" > "$BUILD_DIR/.release-id"
mv "$BUILD_DIR" "$FINAL_RELEASE"
BUILD_DIR=''

PREVIOUS_RELEASE=''
if [[ -L "$CURRENT_LINK" ]]; then
  PREVIOUS_RELEASE="$(readlink "$CURRENT_LINK")"
fi
NEXT_LINK="$DEPLOY_ROOT/.current-next.$$"
ln -s "$FINAL_RELEASE" "$NEXT_LINK"
mv -Tf "$NEXT_LINK" "$CURRENT_LINK"

activate_pm2() {
  KEYDIGEST_DEPLOY_ROOT="$DEPLOY_ROOT" KEYDIGEST_APP_PORT="$APP_PORT" \
    pm2 startOrReload "$CURRENT_LINK/deploy/ecosystem.config.cjs" --update-env
}

rollback() {
  local reason="$1"
  echo "上线验证失败：$reason" >&2
  if [[ -n "$PREVIOUS_RELEASE" && -d "$PREVIOUS_RELEASE" ]]; then
    local rollback_link="$DEPLOY_ROOT/.current-rollback.$$"
    ln -s "$PREVIOUS_RELEASE" "$rollback_link"
    mv -Tf "$rollback_link" "$CURRENT_LINK"
    if activate_pm2; then
      if [[ -d "$FINAL_RELEASE" && "$FINAL_RELEASE" == "$RELEASES_DIR"/release-* ]]; then
        rm -rf -- "$FINAL_RELEASE"
      fi
      echo "已回滚到：$PREVIOUS_RELEASE；失败 release 已清理。" >&2
    else
      echo "current 已切回 $PREVIOUS_RELEASE，但 PM2 重载失败；保留失败 release 供排查。" >&2
    fi
  else
    echo '没有可用的上一版本，current 保持新版本，请人工处理。' >&2
  fi
  exit 1
}

if [[ "$SKIP_RESTART" == '0' ]]; then
  activate_pm2 || rollback 'PM2 启动失败'
  HEALTH_OK='0'
  for _attempt in {1..20}; do
    if curl --fail --silent --show-error "http://127.0.0.1:$APP_PORT/api/readiness" \
      | node -e '
          let body = "";
          process.stdin.setEncoding("utf8");
          process.stdin.on("data", chunk => { body += chunk; });
          process.stdin.on("end", () => {
            try {
              const payload = JSON.parse(body);
              const matchesTarget = payload.status === "ready"
                && payload.releaseCommit === process.argv[1]
                && payload.releaseId === process.argv[2];
              process.exit(matchesTarget ? 0 : 1);
            } catch {
              process.exit(1);
            }
          });
        ' "$DEPLOY_COMMIT" "$RELEASE_NAME"; then
      HEALTH_OK='1'
      break
    fi
    sleep 2
  done
  [[ "$HEALTH_OK" == '1' ]] || rollback '40 秒内未确认目标 commit 的生产就绪状态'
else
  echo '已跳过 PM2 重启和生产就绪检查；current 已切换，请人工启动并验证。'
fi

# 边界控制：成功后只保留最近 N 个 release，避免目录无限累积。
mapfile -t ALL_RELEASES < <(find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d -name 'release-*' -print | sort -r)
if ((${#ALL_RELEASES[@]} > KEEP_RELEASES)); then
  for OLD_RELEASE in "${ALL_RELEASES[@]:KEEP_RELEASES}"; do
    if [[ "$OLD_RELEASE" == "$RELEASES_DIR"/release-* && "$OLD_RELEASE" != "$(readlink "$CURRENT_LINK")" ]]; then
      rm -rf -- "$OLD_RELEASE"
    fi
  done
fi

trap - EXIT
echo "部署完成：$DEPLOY_COMMIT"
echo "当前版本：$FINAL_RELEASE"
