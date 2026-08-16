# 部署与配置迁移手册（issue #22）

## 背景：config 双层架构

| 层 | 位置 | 角色 | 部署时 |
|---|---|---|---|
| 默认层 | `config/`（git 追踪） | 出厂默认 prompt 与配置 | 随代码覆盖更新 |
| 运行时层 | `config/runtime/`（gitignore） | 生产端通过管理界面保存的自定义 | **永不覆盖** |

- 所有管理界面（/config 页、地区报告页、自动周报配置）的保存动作**只写运行时层**，`config/` 默认层文件保持不动。
- 读取时两层合并：关键词/地区 prompt 按 prompt id 合并（运行时层优先，删除默认层条目会记录墓碑）；`prompts.md`、`policy_prompts.md` 整文件覆盖；`auto-report-config.json`、`llm-config.json` 按字段浅合并；`users.json` 整文件覆盖。
- 因此：**本地开发 → 部署生产，生产端已自定义的 prompt 不受任何影响**；未被自定义的部分自动采用开发端改良后的新默认。

## 一、首次升级到双层架构（一次性迁移）

> 前置：新版本代码已构建（`bash scripts/pack-release.sh` 会产出 `release-keydigest-<时间>.tar.gz`，**用实际文件名操作，不要用 `*.tar.gz` 通配符**——目录里若有多个包会导致解压命令解析错误）。

1. **停止服务**（避免迁移窗口期内进程读到「新默认层 + 未迁移 runtime」的混合状态）：
   ```bash
   pm2 stop keydigest
   ```
2. **备份生产配置**（带时分秒防止同日重复备份嵌套；目录已存在则报错停止，勿覆盖旧备份）：
   ```bash
   cp -r config "config-backup-$(date +%Y%m%d-%H%M%S)"
   ```
3. **部署新包**（用第 0 步产出的实际文件名）：解压覆盖项目目录。`config/` 默认层会被仓库版本覆盖——安全，因为第 2 步已有备份；`config/runtime/` 不在包内，不受影响。
   ```bash
   tar -xzf release-keydigest-<实际文件名>.tar.gz -C <服务器项目目录>
   ```
4. **执行迁移脚本**（三方比较：生产快照 + 旧默认层基线 + 新默认层）：
   ```bash
   node scripts/migrate-runtime-config.cjs --from config-backup-<日期> --dry-run   # 先预览
   node scripts/migrate-runtime-config.cjs --from config-backup-<日期>             # 实际写入
   ```
   - 基线（baseline）默认取部署包自带的 `config-baseline/` 目录；也可用 `--baseline <目录>` 指定旧版本的纯默认层（如从旧 tag 提取）。
   - 只迁移「生产相对旧默认层的真实修改」：生产改过的固定为生产版本；生产没动的自动采用新默认（含开发端改良）；新版新增的条目正常出现（不会误判为生产删除）；生产删除且新版仍内置的条目记墓碑。
   - **若没有 baseline**（旧版本部署包未携带 `config-baseline/`），脚本自动降级为两方比较且**不写墓碑**（保证不误杀新版新增条目），但未修改条目会被旧版本固定，之后可在 `/config` 按条目「恢复默认」。
   - 任何文件解析错误 → 脚本以**非零退出码**结束并提示勿重启上线，修好后重跑即可（幂等）。
   - 若某文件的运行时层已存在（迁移后又人工改过），脚本会跳过以防覆盖，确认后可加 `--force`。
5. **重启并核对**：
   ```bash
   pm2 start keydigest   # 之前是 stop 的用 start；restart 亦可
   ```
   登录 admin → `/config` → 「运行时配置」tab：被自定义的文件应显示「运行时已自定义」徽标；到「关键词 Prompt」等 tab 核对生产端各版本 prompt 内容无丢失。

## 二、本地打包

在**本地开发机**的仓库根目录执行（首次需先 `npm install` 装好依赖）：

```bash
bash scripts/pack-release.sh
```

该脚本会自动执行 `npm run build` 构建前端，然后在仓库根目录产出部署包：

```
release-keydigest-<YYYYMMDD-HHmm>.tar.gz
```

常用参数：

```bash
bash scripts/pack-release.sh --no-build   # 跳过前端构建（dist/ 已是最新时用，更快）
```

包内容与安全保证：

- 只包含：`server.cjs`、`services/`、`server/`（PDF 渲染）、`scripts/`（含迁移脚本）、`dist/`（前端构建产物）、`config/` **默认层**、`config-baseline/`（本次默认层快照，供**下一次**升级迁移做三方比较）、`package.json`、`package-lock.json`、`keydigest_start.sh`、本手册。
- **绝不包含** `config/runtime/`（生产自定义层）、`data/`、`node_modules/`、`.git`、各类备份文件——因此把包解压覆盖到服务器目录是安全的，永远不会冲掉生产端已自定义的 prompt。
- 脚本会先打包到临时文件并**校验包内确无 `config/runtime/`、确有 `config-baseline/`**，校验通过才输出正式文件名；校验失败直接报错退出，不会留下可用的坏包。
- 服务器上解压后如依赖有变化需执行一次 `npm install --omit=dev`（一般无变化时可跳过）。

## 三、日常部署（迁移完成后）

```bash
# 本地：打包并上传（scp / rsync / 宝塔面板上传均可）
bash scripts/pack-release.sh
scp release-keydigest-<实际文件名>.tar.gz <user>@<服务器>:/tmp/

# 服务器：解压覆盖项目目录并重启（注意用实际文件名，不要用通配符）
tar -xzf /tmp/release-keydigest-<实际文件名>.tar.gz -C <服务器项目目录>
pm2 restart keydigest
```

- 覆盖 `config/` 是安全的：只有「出厂默认」会更新，未被自定义的 prompt 自动采用新默认；被自定义的继续走 `config/runtime/`。
- 若希望某个文件/条目重新跟随出厂默认：`/config` → 「运行时配置」→「恢复默认」。

## 四、备份与跨环境迁移

- **导出**：`/config` → 「运行时配置」→「导出自定义包」，得到仅含运行时层覆盖的 JSON 包（也可 `curl -H "Authorization: Bearer <token>" .../api/config/prompt-export`）。
- **导入**：在目标环境 `/config` → 「运行时配置」→「导入自定义包」。导入会整体写入目标环境的运行时层。
- 服务器上直接 `cp -r config/runtime config-runtime-backup-<日期>` 同样有效。

## 五、注意事项

- `config/runtime/` 已加入 `.gitignore`，不要提交到仓库。
- prompt 配置写接口（`/api/config/*` 的 POST/DELETE）已要求 admin 登录态；前端会自动带上登录 token。
- `config/users.json` 含明文密码（历史遗留），随双层架构已归入运行时层管理，但明文存储问题仍在，建议后续单独处理。
- 自动周报 cron 每次运行时读取「生效配置」，迁移/修改后无需额外操作（重启一次即可）。

## 六、常见问题

**Q：部署后生产端某个 prompt 变回了旧版本？**
A：说明该 prompt 没有运行时层覆盖（迁移时与默认层一致被跳过），看到的是仓库里的出厂默认。若需找回生产旧文案，从 `config-backup-*` 快照里复制，或重新在 /config 页编辑保存（会进入运行时层）。

**Q：本地开发想让某条 prompt 生效到生产？**
A：改仓库里的默认层文件并部署即可；注意生产端若已自定义同一条目，运行时层优先——这是保护生产定制的预期行为，需要采纳新默认时在生产端点「恢复默认」。
