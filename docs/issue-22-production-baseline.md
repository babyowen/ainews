# Issue #22 生产配置基线

## 目的

本文件记录 2026-08-17 从生产服务器取回的有效配置与当前 `main` 的核对结果。它只记录文件来源、哈希和已确认决策，不保存生产密码、完整 Prompt 文本或其他秘密。

原始生产快照保存在本地 `.production-snapshot/` 下。该目录被 `.gitignore` 排除，必须保持只读，不得进入提交、部署包或代码审查附件。

## 核对结论

- 生产 `server.cjs`、`services/`、`package.json` 和 `package-lock.json` 与基线提交 `22bece11` 一致。
- 生产侧不同的前端和 PDF 文件都能匹配到 Git 历史 blob，没有发现服务器独有的代码热修改。
- 生产 `prompts.md` 与仓库版本的四个周报 Prompt 小节完全一致，仅缺少文件末尾换行。
- `policy_prompts.md`、`region-policy-report-prompts.json`、`llm-config.json` 和 `weekly-report-models.json` 与生产一致。
- 生产修改过的“中国烟草”和“江苏地区银行”Prompt 已提升为 Git 默认配置。
- “烟草服务银行”Prompt 正文与开发版本相同；采用生产 ID `v1`，并将自动周报引用从不存在的 `default` 修正为 `v1`，避免静默回退到全局 Prompt。
- 自动周报保留生产实际启用的 6 个关键词及各自模型、Prompt、最低分数和摘要版本。
- `yzgjj` 的关键词权限按生产恢复为仅“公积金”。生产密码不进入 Git；首次上线时完整生产 `users.json` 写入 runtime 层。
- 生产的时间戳政策快照属于运行时历史数据，首次上线时原样保留，但不进入 Git 默认层或部署包。
- 生产 `.bak` 文件和历史手工备份只作为审计证据保存在忽略目录，不提升为默认配置。

## Git 默认层文件哈希

| 文件 | SHA-256 |
|---|---|
| `config/prompts.md` | `4c1175f3eb7b1d9d37464a133e7aa72e4ee15e1e66d4cfdf6fc19e90d9be3c13` |
| `config/policy_prompts.md` | `bcc5c7c8ca0527286a7c3ab05393f417ec1423a412470b8f7fe754cc52b0704c` |
| `config/keyword-prompts.json` | `fdd9ad239b7359796946b6f02ed3e8dc09aa5657a4612a33a4d2d8cbc7913d4d` |
| `config/region-policy-report-prompts.json` | `f346ce22f1fcd215e24ad1974adacf42f9918933c9932bf2e9123def60bae411` |
| `config/auto-report-config.json` | `1ab98adeea6002ce126be482c61811ed429689aa2f7b8bb6b1af8a1bf24c369f` |
| `config/llm-config.json` | `0953d029ab022afb72aae930e367847ea5f26abb363b0fa7ceb64c707c39ee7a` |
| `config/weekly-report-models.json` | `e45a02c7bb3c32b6805757e761515439c7395479fff444407a489a8b67822e20` |
| `config/users.json` | `7bf02e5e33b54b197658b13c208f9f33fef3294002544422b7951a9251b69387` |

`users.json` 的哈希对应脱敏的 Git 默认文件，不对应包含真实生产密码的运行时文件。

上表记录重构前的独立基线 commit `cfc1705d`。后续架构提交允许在 `weekly-report-models.json` 中新增原先硬编码的 `deepseek-reasoner`，校验脚本会显式验证该唯一允许的模型配置收口；其他生产基线内容仍须保持一致。

## 可复现校验

在仓库根目录运行：

```bash
node scripts/verify-production-baseline.cjs \
  --snapshot .production-snapshot/incoming/production-current

node --test test/production-config-baseline.test.cjs
```

校验脚本只输出文件哈希、关键词名称、引用状态和政策快照数量，不输出 Prompt 正文或密码。

首次上线时执行 `scripts/prepare-production-runtime.cjs`，显式把生产 `users.json` 和全部政策历史复制到共享运行时目录；后续按 [`deployment-gitee.md`](deployment-gitee.md) 从 Gitee 部署精确 commit。该流程不自动扫描旧目录，也不依赖可手工修改的版本号。

## 后续架构约束

1. Git 默认层以本基线为重构前行为真值。
2. `config/runtime/` 只保存生产相对默认层的运行时覆盖，不得进入 Git 或部署包。
3. 所有配置读取和管理界面写入必须经过统一存储入口。
4. 重构后的自动周报必须继续解析 6 个启用关键词，并精确命中对应 Prompt 和模型。
5. 用户密码、政策时间戳快照、数据库、PDF 和日志属于服务器共享运行时数据。
6. 后续若修改 Prompt，必须在独立提交中更新对应行为测试或哈希说明，不与无关架构改动混合。
