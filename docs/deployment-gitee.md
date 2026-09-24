# GitHub → Gitee → 生产部署手册

## 目标与边界

- GitHub 仍是开发、Issue、PR 和代码审查的主仓库。
- Gitee 是面向受网络限制服务器的只读发布镜像。
- 服务器只部署明确指定的 tag 或 commit，不追随一个可能继续变化的分支名。
- `.env`、`config/runtime/`、`config/policies/` 和 `data/` 是共享生产数据，不进入 Git，也不会被新 release 覆盖。
- 不使用 `RELEASE_VERSION`，不创建配置基线目录。代码版本只认 Git commit，运行时覆盖只保留当前生效差异。

## 本地同步到 Gitee

首次配置：

```bash
git remote add gitee https://gitee.com/<owner>/ainews.git
git remote -v
```

PR 在 GitHub 合并并完成验证后，为待发布提交创建 tag，再将同一提交推送到两端：

```bash
git switch main
git pull --ff-only origin main
git tag release-YYYYMMDD-N
git push origin main --tags
git push gitee main --tags
git ls-remote gitee refs/tags/release-YYYYMMDD-N
```

最后一条输出的 commit 必须与本地 `git rev-list -n 1 release-YYYYMMDD-N` 一致。服务器部署使用这个 tag；不要在服务器上直接修改代码或 Prompt 默认文件。

## 第一次迁移：只做一次

假设：

- 旧生产目录为 `/www/wwwroot/keydigest-legacy`
- 新发布根目录为 `/www/wwwroot/keydigest`
- 已从 Gitee 临时 clone 新代码，用于执行迁移脚本

先保留旧目录和数据库备份，再建立共享数据目录并复制 `.env`：

```bash
mkdir -p /www/wwwroot/keydigest/shared/config/runtime
mkdir -p /www/wwwroot/keydigest/shared/config/policies
mkdir -p /www/wwwroot/keydigest/shared/data
cp /www/wwwroot/keydigest-legacy/.env /www/wwwroot/keydigest/shared/.env
chmod 600 /www/wwwroot/keydigest/shared/.env
```

在旧服务停止配置修改后取得最新快照，先 dry-run，再正式迁移。两次调用都会重新审计源文件，审计失败不会创建或覆盖目标文件：

```bash
node scripts/prepare-production-runtime.cjs \
  --source-config /www/wwwroot/keydigest-legacy/config \
  --source-data /www/wwwroot/keydigest-legacy/data \
  --target-root /www/wwwroot/keydigest/shared \
  --dry-run

node scripts/prepare-production-runtime.cjs \
  --source-config /www/wwwroot/keydigest-legacy/config \
  --source-data /www/wwwroot/keydigest-legacy/data \
  --target-root /www/wwwroot/keydigest/shared
```

该脚本处理四类服务器真值：

1. 完整生产 `users.json` → `shared/config/runtime/users.json`，保留真实密码和权限；
2. 全部 `policy_*.json` → `shared/config/policies/`，保留历史政策版本。
3. `login-audit.json` → `shared/data/login-audit.json`，保留登录审计；
4. `auto-report-pdfs/*.pdf` → `shared/data/auto-report-pdfs/`，保留历史自动周报文件。

首次迁移会逐文件比较源配置与待发布 Git 默认层。允许的转换仅包括：审计过的旧模型元数据升级到当前固定模型、自动周报旧模型 key 的转换、“潜在招标客户”唯一默认标记修正，以及不存在的烟草服务银行 `default` 引用修正为已有 `v1`。历史 `llm-config.json` 只接受已审计的旧默认内容；自定义端点会导致审计中止。

Prompt 正文、启停状态、关键词集合、分数、摘要版本或其他内容存在额外差异时，脚本会列出文件名并中止。先重新审计这些差异，确认应进入 Git 默认层还是共享 runtime，再制定迁移；不要为了通过检查直接用默认文件覆盖生产文件。脚本不提供绕过配置审计的 force 参数。若源目录已含 runtime 覆盖，应保留并复用其共享目录，不能套用旧单层配置首次迁移脚本。

原始生产快照不进入 Git；不能用 2026-08-17 的历史审计结论代替上线当天的校验。`verify-production-baseline.cjs --snapshot <最新快照>` 和正式迁移复用同一审计规则。

若目标 `users.json` 已存在且确实需要用新的生产文件替换，必须显式增加 `--force-users`。覆盖前脚本会在同目录创建权限为 `0600` 的 `users.json.bak-<UTC时间>`；备份失败则拒绝覆盖。政策历史同名但内容不同会始终拒绝覆盖，需人工查明原因。

## 发布一个精确版本

第一次可在临时 clone 中执行，以后直接使用 `current/scripts/deploy-from-gitee.sh`：

```bash
bash scripts/deploy-from-gitee.sh \
  --repo https://gitee.com/<owner>/ainews.git \
  --ref release-YYYYMMDD-N \
  --root /www/wwwroot/keydigest \
  --port 3456 \
  --test-port 13456 \
  --keep 5
```

脚本会依次执行：

1. 从 Gitee 镜像解析 ref 对应的精确 commit；
2. 在新的临时 release 中执行 `npm ci`、完整测试和生产构建；测试使用独立临时配置、随机测试口令和数据库替身，不读取 `.env`、不修改生产用户、不连接生产数据库或注册真实定时任务；
3. 接入共享 `.env`、runtime、政策历史和 data；
4. 原子切换 `current`；
5. 把 `--port` 作为 `API_PORT` 传给仓库内 `deploy/ecosystem.config.cjs`，启动或重载 PM2；
6. 通过 `scripts/wait-for-readiness.cjs` 请求 `127.0.0.1:<port>/api/readiness`，验证配置、Prompt、数据库、共享数据目录，并核对 release commit 与唯一 release ID；单次请求含响应体最多 3 秒，整个就绪阶段最多 40 秒。失败时自动切回上一 release 并清理失败 release；
7. 成功后只保留最近 5 个 release，避免历史目录无限累积。

`--test-port` 为旧命令兼容参数；当前测试直接运行隔离的 Express 处理函数，不监听端口。服务器需准备 Node.js 20+、Linux Bash、PM2，以及供运行账户使用的 Playwright Chromium（`npm run pdf:install-browser`）。

若首次仍需沿用宝塔外部 PM2 配置，可先加 `--skip-restart`，确认 `current` 后把外部配置的 `cwd`/`script` 改为 `/www/wwwroot/keydigest/current`，再人工重启。完成一次切换后，建议统一使用仓库内 PM2 配置。

## 上线后核对

必须完成以下只读检查：

```bash
readlink /www/wwwroot/keydigest/current
cat /www/wwwroot/keydigest/current/.release-commit
curl --fail --max-time 5 http://127.0.0.1:3456/api/health
curl --fail --max-time 5 http://127.0.0.1:3456/api/readiness  # releaseCommit 与 releaseId 必须对应当前目录
find /www/wwwroot/keydigest/shared/config/policies -maxdepth 1 -name 'policy_*.json' | wc -l
find /www/wwwroot/keydigest/shared/data/auto-report-pdfs -maxdepth 1 -name '*.pdf' | wc -l
```

然后用浏览器验证：

- 生产 admin 和 `yzgjj` 原密码均能登录；
- `yzgjj` 仅有“公积金”关键词；
- 自动周报页启停状态、关键词集合与本次审计确认的配置一致；当前 Git 默认层包含 6 个关键词；
- 所有报告工作流均使用 Agent Router / DeepSeek V4.1 Flash；模型不由用户切换；
- “中国烟草”“江苏地区银行”“烟草服务银行”分别命中现有 Prompt，烟草服务银行为 `v1`；
- 周报、政策提取/对比、地区政策报告均能读取原有模板；
- Prompt 管理页面能显示“默认/生产自定义”来源，保存后只新增 `shared/config/runtime/` 差异；
- Prompt 导出包不含 `users.json`。

## 回滚与日常纪律

生产就绪检查失败会自动回滚；回滚后的 PM2 重载成功时，失败 release 会立即删除，避免挤占保留名额。`/api/health` 只表示 Node 进程存活，不作为发布成功依据。若业务检查后需要手工回滚，将 `current` 原子切回保留的上一 release，再执行 PM2 `startOrReload`。不要通过修改 `RELEASE_VERSION` 或复制新的基线目录来回滚。

日常规则：

- 服务器不提交、不开发，只从 Gitee 部署 tag/commit；
- 在线 Prompt 修改只进入 `config/runtime/`；
- 开发默认 Prompt 的改进通过 Git PR 发布，未被运行时覆盖的部分会自动继承新默认；
- 定期备份整个 `shared/` 和数据库；网页 Prompt 导出只是 Prompt 差异备份，不替代服务器备份；
- 部署前后记录 commit、健康检查结果和业务冒烟结果。
