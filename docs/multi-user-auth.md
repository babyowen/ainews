# KeyDigest 多用户登录与权限指南

## 概览

KeyDigest 使用轻量多用户登录，适合 2-5 个内部用户。当前固定用户为：

| 用户 | 权限 |
|------|------|
| `admin` | 全部菜单、全部关键词、登录统计 |
| `yzgjj` | `公积金` 关键词；每日新闻、周报生成、字数统计、扬公政策对比及其 4 个子菜单 |

权限目前只在前端限制菜单、路由和关键词选择，不做后端 API 级数据隔离。

## 配置

在 `.env` 中配置密码：

```bash
KEYDIGEST_ADMIN_PASSWORD=citic3104
KEYDIGEST_YZGJJ_PASSWORD=yzgjj
```

`VITE_ADMIN_PASSWORD` 仍用于旧的评分修改页二次密码保护。后端登录接口在 `KEYDIGEST_ADMIN_PASSWORD` 缺失时会用 `VITE_ADMIN_PASSWORD` 作为 admin 的兼容回退。

## 登录流程

1. 用户访问任意业务路由时，未登录会跳转到 `/login`。
2. 前端调用 `POST /api/auth/login`，提交 `username` 和 `password`。
3. 后端用 `.env` 密码验证固定用户名。
4. 登录成功后前端把用户资料保存在 `sessionStorage`，关闭浏览器会话后失效。
5. 前端根据 `src/config/userAccess.js` 过滤菜单、路由和可选关键词。

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

新增用户时需要同步三处：

1. 在 `server.cjs` 的 `AUTH_USERS` 中增加用户和密码环境变量名。
2. 在 `src/config/userAccess.js` 中增加同名用户的前端权限。
3. 在 `.env` 中增加对应密码。

如果用户需要真正的数据隔离，还需要在后端 API 层增加按用户限制关键词的校验；当前版本没有实现这一层。
