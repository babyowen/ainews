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

先 dry-run，再正式迁移：

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

生产 Prompt 和自动周报配置已经审计并提升为 Git 默认基线，因此不会从旧目录再次整包导入。这样可避免把生产旧配置中的“烟草服务银行 `promptId: default`”错误重新带回；新默认明确使用存在的 `v1`。

若目标 `users.json` 已存在且确实需要用新的生产文件替换，必须显式增加 `--force-users`。政策历史同名但内容不同会始终拒绝覆盖，需人工查明原因。

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
2. 在新的临时 release 中执行 `npm ci`、完整测试和生产构建；
3. 接入共享 `.env`、runtime、政策历史和 data；
4. 原子切换 `current`；
5. 使用仓库内 `deploy/ecosystem.config.cjs` 启动或重载 PM2；
6. 请求 `127.0.0.1:<port>/api/readiness`，验证配置、Prompt、数据库和共享数据目录；失败时自动切回上一 release；
7. 成功后只保留最近 5 个 release，避免历史目录无限累积。

若首次仍需沿用宝塔外部 PM2 配置，可先加 `--skip-restart`，确认 `current` 后把外部配置的 `cwd`/`script` 改为 `/www/wwwroot/keydigest/current`，再人工重启。完成一次切换后，建议统一使用仓库内 PM2 配置。

## 上线后核对

必须完成以下只读检查：

```bash
readlink /www/wwwroot/keydigest/current
cat /www/wwwroot/keydigest/current/.release-commit
curl --fail http://127.0.0.1:3456/api/health
curl --fail http://127.0.0.1:3456/api/readiness
find /www/wwwroot/keydigest/shared/config/policies -maxdepth 1 -name 'policy_*.json' | wc -l
find /www/wwwroot/keydigest/shared/data/auto-report-pdfs -maxdepth 1 -name '*.pdf' | wc -l
```

然后用浏览器验证：

- 生产 admin 和 `yzgjj` 原密码均能登录；
- `yzgjj` 仅有“公积金”关键词；
- 自动周报页显示 6 个生产关键词；
- “中国烟草”“江苏地区银行”“烟草服务银行”分别命中现有 Prompt，烟草服务银行为 `v1`；
- 周报、政策提取/对比、地区政策报告均能读取原有模板；
- Prompt 管理页面能显示“默认/生产自定义”来源，保存后只新增 `shared/config/runtime/` 差异；
- Prompt 导出包不含 `users.json`。

## 回滚与日常纪律

生产就绪检查失败会自动回滚。`/api/health` 只表示 Node 进程存活，不作为发布成功依据。若业务检查后需要手工回滚，将 `current` 原子切回保留的上一 release，再执行 PM2 `startOrReload`。不要通过修改 `RELEASE_VERSION` 或复制新的基线目录来回滚。

日常规则：

- 服务器不提交、不开发，只从 Gitee 部署 tag/commit；
- 在线 Prompt 修改只进入 `config/runtime/`；
- 开发默认 Prompt 的改进通过 Git PR 发布，未被运行时覆盖的部分会自动继承新默认；
- 定期备份整个 `shared/` 和数据库；网页 Prompt 导出只是 Prompt 差异备份，不替代服务器备份；
- 部署前后记录 commit、健康检查结果和业务冒烟结果。
