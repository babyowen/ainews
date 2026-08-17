# LLM配置说明

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
| `llm-config.json` | 顶层浅合并，`models` 按模型键深合并 |
| `users.json` | 运行时整文件覆盖；含明文密码，不允许通过网页 Prompt 包导入导出 |

`weekly-report-models.json` 是代码随附的模型能力清单，不属于可在线编辑的运行时配置。

生产首次迁移和 Gitee 部署见 [`docs/deployment-gitee.md`](../docs/deployment-gitee.md)。不要手工创建版本基线目录，也不要引入 `RELEASE_VERSION`；精确版本由 Git commit 标识。

## 配置文件结构

### 模型配置 (`models`)
每个模型包含以下字段：
- `provider`: 模型提供商 (deepseek/openai/anthropic)
- `model`: 具体模型名称
- `apiKey`: 环境变量中的API密钥名称
- `endpoint`: API端点
- `description`: 模型描述

### 全局设置 (`settings`)

#### 参数适用性说明：

| 参数 | DeepSeek | OpenAI | Claude | 说明 |
|------|----------|--------|--------|------|
| `temperature` | ✅ | ✅ | ✅ | 控制生成随机性 (0-1) |
| `timeout` | ✅ | ✅ | ✅ | HTTP请求超时 (毫秒) |
| `retryAttempts` | ✅ | ✅ | ✅ | 失败重试次数 |
| `fallbackModel` | ✅ | ✅ | ✅ | 主模型失败时的备用模型 |

#### 参数详细说明：

**temperature (0.7)**
- 控制文本生成的随机性和创造性
- 0 = 完全确定性，1 = 高度随机
- 建议值：0.3-0.8


**输出长度**
- 已移除 `maxTokens` 限制，允许模型自由输出完整内容
- 模型会根据上下文和自然语言结构决定合适的输出长度
- 这样可以获得更完整、更详细的分析报告

**timeout (30000)**
- HTTP请求超时时间，单位毫秒
- 建议值：30000-60000（30-60秒）
- 所有模型都适用

**retryAttempts (3)**
- API调用失败时的重试次数
- 建议值：2-5次
- 应用层逻辑，适用于所有模型

**fallbackModel**
- 主模型失败时使用的备用模型
- 建议设置为稳定性高的模型
- 当前设置为 `deepseek-r1`

## 模型特性对比

### DeepSeek R1
- 🎯 推理能力强，适合复杂分析
- 💰 成本相对较低
- 🚀 响应速度快
- 建议用途：日常分析、复杂推理

### OpenAI GPT-4
- 🌟 全能型模型，各方面均衡
- 💡 创造性强
- 💰 成本较高
- 建议用途：高质量内容生成

### Claude 3 Opus
- 📖 长文本处理能力强
- 🔍 分析深度好
- 💰 成本较高
- 建议用途：长文档分析、深度研究



## 使用建议

1. **主模型选择**：推荐DeepSeek R1作为主模型，性价比高
2. **备用模型**：设置为DeepSeek R1，确保稳定性
3. **参数调优**：
   - 分析类任务：temperature 0.3-0.5
   - 创作类任务：temperature 0.6-0.8
   - 无输出长度限制，模型可自由发挥生成完整内容

## 环境变量设置

请确保设置以下环境变量：
```bash
export DEEPSEEK_API_KEY="your_deepseek_key"
export OPENAI_API_KEY="your_openai_key"
export ANTHROPIC_API_KEY="your_anthropic_key"
```
