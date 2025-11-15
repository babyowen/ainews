# LLM配置说明

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