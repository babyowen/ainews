# 模型与提示词配置

全站统一使用 Agent Router 提供的 **DeepSeek V4.1 Flash**，用户无需选择模型。

## 默认层与运行时层

Issue #22 之后，配置分为两层：

- `config/`：Git 追踪的出厂默认值，部署时随代码更新。
- `config/runtime/`：服务器上的生产自定义差异，Git 忽略，部署时通过共享目录持久化。

应用读取“默认值 + 运行时差异”的生效结果；管理页面保存时只写 `config/runtime/`，不会改写 Git 默认文件。运行时内容与默认值完全相同时，对应覆盖文件会自动删除。

| 文件 | 合并方式 |
|---|---|
| `prompts.md`、`policy_prompts.md` | 运行时整文件覆盖 |
| `keyword-prompts.json` | 按关键词和 Prompt ID 合并，支持删除墓碑 |
| `region-policy-report-prompts.json` | 按 Prompt ID 合并，支持删除墓碑 |
| `auto-report-config.json` | 顶层浅合并，`keywords` 按关键词深合并 |
| `users.json` | 运行时整文件覆盖；含明文密码，不允许通过网页 Prompt 包导入导出 |

`weekly-report-models.json` 是代码随附的模型能力清单，不属于可在线编辑的运行时配置。

生产首次迁移和 Gitee 部署见 [`docs/deployment-gitee.md`](../docs/deployment-gitee.md)。不要手工创建版本基线目录，也不要引入 `RELEASE_VERSION`；精确版本由 Git commit 标识。

## 配置文件结构

## 唯一模型配置

`config/weekly-report-models.json` 是所有生成入口的模型配置来源，包括手动/自动周报、周报修改、政策提取/比对、地区政策报告及通用 LLM 服务。原 `llm-config.json` 已移除，避免配置互不生效。

- `model`: 供应商实际模型 ID，目前为 `DeepSeek-V4.1-Flash`，大小写不可随意更改。
- `apiKey`: 保存密钥的环境变量名称，目前为 `AGENT_ROUTER_API_KEY`；配置文件不保存密钥。
- `endpoint`: 完整 Chat Completions 地址。
- `requestMaxTokens`: 实际请求输出预算，目前为 32768。
- `maxOutputTokens` / `contextWindow`: 供应商模型列表提供的能力元数据，不代表每次请求使用整个上限。
- `thinking`: 当前关闭思考，避免政策提取额度被思考过程耗尽。

在本机和服务器的 `.env` 中分别配置：

```dotenv
AGENT_ROUTER_API_KEY=
```

不要用示例文件覆盖已有 `.env`。代码不会读取旧 DeepSeek/KIMI/SiliconFlow 密钥进行回退，原密钥可暂时保留用于部署回滚。

## 运行行为

`services/modelClient.cjs` 统一发送请求。每次生成前读取供应商 `/v1/models`，确认精确模型 ID 可用；失败时直接提示，不切换供应商。默认 180 秒超时覆盖响应体接收。

政策提取使用 JSON 模式、关闭思考和 32768 token 预算。仅 JSON 语法/结构错误进行一次格式修复；空正文、截断、鉴权失败不会伪装成成功。无有效政策时不进入比对。流式报告只有完整结束且正文非空才允许保存。

旧自动任务中的 `deepseek-v4-pro` / `deepseek-v4-flash` 等模型 key 在运行时兼容映射到新模型；关键词开关、提示词、评分阈值、摘要设置保持原值。旧 KIMI/硅基流动路由作为兼容入口调用同一模型。历史报告的模型记录不改写。

## 提示词

- `prompts.md`：默认周报及修改提示词。
- `keyword-prompts.json`：关键词专属提示词。
- `policy_prompts.md`：政策提取和比对模板。
- `region-policy-report-prompts.json`：地区政策报告模板。

此次迁移不修改业务提示词和政策基准文件。

部署与验证见 `docs/agent-router-migration.md`。
