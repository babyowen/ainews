# KeyDigest 多用户登录与权限指南

## 概览

KeyDigest 使用轻量多用户登录，适合少量内部用户。当前默认用户为：

| 用户 | 权限 |
|------|------|
| `admin` | 全部菜单、全部关键词、登录统计 |
| `yzgjj` | 仅“公积金”关键词及每日新闻、周报生成、字数统计、自动周报下载、扬公政策对比子菜单 |

管理用户、修改 Prompt、修改自动周报、切换模型和查看登录统计等管理接口会在后端校验 admin Bearer token；自动周报下载接口会按用户关键词权限过滤。其他业务数据接口仍未实现完整的逐行权限隔离。

## 配置

用户默认配置保存在：

```text
config/users.json                    # Git 默认层，仅账号和权限模板
config/runtime/users.json            # 生产完整用户文件，优先生效且不进 Git
```

应用通过 `configStore` 读取生效用户配置，runtime 文件存在时整文件覆盖默认层。admin 可通过 `/user-management` 管理用户、关键词和路由，保存只会写入 runtime 层，不改动 Git 默认文件。

只有在默认层和 runtime 都没有合法用户数组时，`.env` 才会为内置用户提供引导密码：

```bash
KEYDIGEST_ADMIN_PASSWORD=<set-a-private-random-value>
KEYDIGEST_YZGJJ_PASSWORD=<set-a-private-random-value>
KEYDIGEST_SESSION_SECRET=<set-a-private-random-value>
```

这些变量不会覆盖已经存在的 `config/runtime/users.json`。`VITE_ADMIN_PASSWORD` 仍用于旧的评分修改页二次密码保护；`KEYDIGEST_SESSION_SECRET` 用于签名 Bearer token，应在生产设置为稳定随机值。

## 登录流程

1. 用户访问任意业务路由时，未登录会跳转到 `/login`。
2. 前端调用 `POST /api/auth/login`，提交 `username` 和 `password`。
3. 后端优先使用私有 runtime 用户配置；不存在时从服务端环境变量获取口令，校验用户名和密码。
4. 登录成功后返回用户资料和 Bearer token，前端保存在 `sessionStorage`。
5. 前端根据登录返回的 `routes` 和 `keywords` 过滤菜单、路由和可选关键词。

## 登录统计

成功登录会追加写入：

```text
data/login-audit.json
```

该目录已在 `.gitignore` 中忽略，不应提交。admin 可在 `/login-stats` 查看，后端统计接口同样要求 admin token：

- 每个用户成功登录次数
- 最后一次登录日期和时间
- 成功登录明细列表

失败登录不会写入审计记录。

## 新增用户

推荐在 `/user-management` 中新增用户。该页面会写入 `config/runtime/users.json`。

手工新增时，需要在生产 runtime 文件中增加：

- `username`
- `displayName`
- `password`
- `role`
- `keywords`
- `routes`

如果用户需要真正的全站数据隔离，还需要继续在后端各业务 API 层增加按用户限制关键词的校验；当前版本只在自动周报日志和 PDF 下载上做了后端关键词权限过滤。

### 私有登录凭据（PR #24）

仓库 `config/users.json` 仅保存账号和权限模板，不保存密码。登录时不会使用该文件中的密码字段，即使旧版本文件仍含密码。

- 已有部署：先用迁移脚本将现有用户配置保存在私有 `config/runtime/users.json`。私有配置整文件优先，升级和环境变量不会替换其密码。线上管理员需自行更换曾提交到 Git 的口令，验证旧口令失效后再关闭安全告警。
- 新安装且没有私有用户配置：使用服务端 `KEYDIGEST_ADMIN_PASSWORD`、`KEYDIGEST_YZGJJ_PASSWORD` 配置内置账号；不再使用可能进入前端构建的 `VITE_ADMIN_PASSWORD` 作为登录口令。没有密码的账号不能登录。
- 用户管理页面保存的修改进入私有 runtime 层。一旦存在该层，修改 `.env` 不会覆盖其中的用户密码；应通过用户管理页面或私有配置更改。
- 生产 readiness 要求配置中的账号均有非空密码。不要把私有用户文件提交到 Git，也不要通过删除私有用户文件重置密码。

此修改不会撤销已泄露的口令，也不会自动清除 Git 历史或关闭 GitGuardian 告警。
