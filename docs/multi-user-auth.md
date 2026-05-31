# KeyDigest 多用户登录与权限指南

## 概览

KeyDigest 使用轻量多用户登录，适合 2-5 个内部用户。当前固定用户为：

| 用户 | 权限 |
|------|------|
| `admin` | 全部菜单、全部关键词、登录统计 |
| `yzgjj` | 由 `config/users.json` 配置；当前包含 `公积金`、`养老` 关键词及每日新闻、周报生成、字数统计、自动周报下载、扬公政策对比子菜单 |

大部分业务权限仍主要在前端限制菜单、路由和关键词选择；自动周报下载接口会在后端按用户关键词权限过滤。

## 配置

用户配置保存在：

```text
config/users.json
```

如果该文件不存在，后端会用 `server.cjs` 中的 `AUTH_USERS` 默认值生成一份。之后以 `config/users.json` 为准。admin 可通过 `/user-management` 管理用户、关键词和路由。

`.env` 仍可为内置默认用户提供初始密码：

```bash
KEYDIGEST_ADMIN_PASSWORD=citic3104
KEYDIGEST_YZGJJ_PASSWORD=yzgjj
KEYDIGEST_SESSION_SECRET=replace-with-a-stable-secret
```

`VITE_ADMIN_PASSWORD` 仍用于旧的评分修改页二次密码保护。后端登录接口在 `KEYDIGEST_ADMIN_PASSWORD` 缺失时会用 `VITE_ADMIN_PASSWORD` 作为 admin 的兼容回退。`KEYDIGEST_SESSION_SECRET` 用于签名 Bearer token；缺失时会按后端 fallback 逻辑取其他本地 secret。

## 登录流程

1. 用户访问任意业务路由时，未登录会跳转到 `/login`。
2. 前端调用 `POST /api/auth/login`，提交 `username` 和 `password`。
3. 后端读取 `config/users.json`，校验用户名和密码。
4. 登录成功后返回用户资料和 Bearer token，前端保存在 `sessionStorage`。
5. 前端根据登录返回的 `routes` 和 `keywords` 过滤菜单、路由和可选关键词。

## 登录统计

成功登录会追加写入：

```text
data/login-audit.json
```

该目录已在 `.gitignore` 中忽略，不应提交。admin 可在 `/login-stats` 查看：

- 每个用户成功登录次数
- 最后一次登录日期和时间
- 成功登录明细列表

失败登录不会写入审计记录。

## 新增用户

推荐在 `/user-management` 中新增用户。该页面会写入 `config/users.json`。

手工新增时，需要在 `config/users.json` 中增加：

- `username`
- `displayName`
- `password`
- `role`
- `keywords`
- `routes`

如果用户需要真正的全站数据隔离，还需要继续在后端各业务 API 层增加按用户限制关键词的校验；当前版本只在自动周报日志和 PDF 下载上做了后端关键词权限过滤。
