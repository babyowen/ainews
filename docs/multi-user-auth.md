# KeyDigest 多用户登录与权限指南

## 概览

KeyDigest 使用轻量多用户登录，适合少量内部用户。当前默认用户为：

| 用户 | 权限 |
|------|------|
| `admin` | 全部菜单、全部关键词、登录统计 |
| `yzgjj` | 仅“公积金”关键词及默认模板中的通用页面、公积金专区；实际授权以 runtime 为准 |

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
5. 启动时通过 `GET /api/auth/me` 刷新公开资料后，以实际 `routes` 和 `keywords` 过滤菜单及路由。401 清理会话；公积金请求收到403时刷新权限。

## 登录统计

成功登录会追加写入：

```text
data/login-audit.json
```

该目录已在 `.gitignore` 中忽略，不应提交。admin 可在 `/login-stats` 查看，后端统计接口同样要求 admin token：

- 每个用户成功登录次数
- 最后一次登录日期和时间
- 成功登录明细列表

登录统计页面提供近 7 天、近 30 天（默认）、全部记录和用户筛选；概览、每日趋势、用户次数、用户汇总和明细使用同一筛选口径。每日趋势按北京时间自然日统计并补零，明细每页 20 条，保留全部历史记录。

原始 `loginAt` 保留 UTC/带时区时间戳，日期和时间统一按 `Asia/Shanghai` 展示；读取旧日志时重新计算展示字段，不重写历史文件。时间缺失或无效的记录只在“全部记录”中保留并标注时间未知，不虚构当前时间或计入每日趋势。

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

如果用户需要真正的全站数据隔离，还需要继续在后端各业务 API 层增加按用户限制关键词的校验；目前自动周报日志/PDF 校验关键词，公积金及扬州接口另校验叶子页面；其他旧业务 API 未全部覆盖。

### 私有登录凭据（PR #24）

仓库 `config/users.json` 仅保存账号和权限模板，不保存密码。登录时不会使用该文件中的密码字段，即使旧版本文件仍含密码。

- 已有部署：先用迁移脚本将现有用户配置保存在私有 `config/runtime/users.json`。私有配置整文件优先，升级和环境变量不会替换其密码。线上管理员需自行更换曾提交到 Git 的口令，验证旧口令失效后再关闭安全告警。
- 新安装且没有私有用户配置：使用服务端 `KEYDIGEST_ADMIN_PASSWORD`、`KEYDIGEST_YZGJJ_PASSWORD` 配置内置账号；不再使用可能进入前端构建的 `VITE_ADMIN_PASSWORD` 作为登录口令。没有密码的账号不能登录。
- 用户管理页面保存的修改进入私有 runtime 层。一旦存在该层，修改 `.env` 不会覆盖其中的用户密码；应通过用户管理页面或私有配置更改。
- 生产 readiness 要求配置中的账号均有非空密码。不要把私有用户文件提交到 Git，也不要通过删除私有用户文件重置密码。

此修改不会撤销已泄露的口令，也不会自动清除 Git 历史或关闭 GitGuardian 告警。

## 公积金专区权限（Issue #25）

默认层新增 `/provident-fund/news`、`/provident-fund/business`、`/provident-fund/business-report`。已有 runtime 用户不会自动补权；管理员在用户管理页选择“公积金”关键词，并分别勾选所需浏览或报告入口，保存即可。原四个 `/policy/*` 地址继续有效。

菜单父组不单独授权。地区浏览、地区报告、业务浏览、业务报告、扬州编辑和扬州对比相互独立；没有子权限的组不显示。仅授权全国通用页面不会授予扬州权限。已有内置账号被撤销的路径不会在登录或配置读取时重新出现。管理员修改自身权限后会立即刷新资料，无可访问页面时显示联系管理员提示。

全国报告和新闻接口固定公积金关键词及评分门槛；扬州 `versions/latest` 允许编辑或对比权限，`save` 需要编辑权限，提取/预览/对比/导出需要对比权限，按 reportId 读取仅接受公积金周报。详细菜单和接口见 [专区说明](issue-25-business-types.md)。
