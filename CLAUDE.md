# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 提供在本仓库中工作的指导。

## 项目概述

KeyDigest 是一个基于AI的关键词新闻分析系统,通过多维度数据收集、智能评分和自动化报告生成,为企业提供新闻情报和竞品分析能力。系统核心围绕"关键词"维度展开,支持新闻聚合、质量评分、来源分析和周报生成等完整工作流。

## 开发环境设置

### 环境要求
- Node.js 14+
- MySQL 5.7+ (推荐使用腾讯云CynosDB)

### 常用开发命令

```bash
# 安装依赖
npm install

# 启动完整开发环境 (前端+后端,自动处理端口冲突) 【推荐】
npm run dev

# 单独启动后端API服务器 (端口 3456 或 API_PORT 环境变量)
node server.cjs

# 单独启动前端开发服务器 (端口 5174)
vite

# 构建生产版本
npm run build

# 代码检查
npm run lint

# 预览生产版本
npm run preview
```

**重要说明**:
- `npm run dev` 是推荐的启动方式,通过 `concurrently` 同时运行前端(5174)和后端(3456)
- 启动前自动执行 `predev` 钩子,运行 `scripts/kill-ports.cjs` 清理端口占用
- 开发阶段应始终使用此命令来启动完整环境
- 后端通过 Express 静态文件服务提供前端资源(生产模式)

### 环境变量配置

项目使用 `.env` 文件管理环境变量,主要配置项:

```env
# 数据库配置
DB_HOST=host
DB_USER=user
DB_PASS=password
DB_NAME=database
DB_PORT=3306

# API配置
API_PORT=3456

# AI服务API密钥
DEEPSEEK_API_KEY=           # DeepSeek R1 主模型
KIMI_API_KEY=               # KIMI K2 备用模型
SILICONFLOW_API_KEY=        # 硅基流动备用端点
GOOGLE_API_KEY=             # Google搜索API
GOOGLE_SEARCH_ENGINE_ID=    # Google搜索引擎ID

# 管理员配置
VITE_ADMIN_PASSWORD=        # 评分编辑功能密码
```

**关键点**:
- 所有AI密钥通过环境变量管理,永不提交到代码仓库
- 生产环境需单独配置 `.env` 文件
- API密钥格式验证在启动时进行

## 项目架构

### 技术栈

**前端**:
- React 19.2.1 + React Router DOM 7.6.2
- Vite 6.3.5 (构建工具与开发服务器)
- ECharts 5.6.0 (数据可视化)
- html2canvas + html2pdf.js + docx (多格式导出)
- dayjs (日期处理)
- react-markdown (Markdown渲染)

**后端**:
- Node.js + Express 4.21.2
- MySQL 2 (mysql2 3.14.1) with Promise支持
- CORS 2.8.5 (跨域处理)
- dotenv 16.5.0 (环境配置)

**AI/LLM集成**:
- **DeepSeek R1** (主模型) - 推理能力强,适合复杂分析
- **KIMI K2** (备用) - 128k上下文智能对话模型
- **SiliconFlow** (备用) - DeepSeek备用端点
- Google Custom Search API - 新闻来源搜索

**开发工具**:
- concurrently 9.2.1 (多进程管理)
- kill-port 2.0.1 (端口清理)
- ESLint 9.25.0 (代码检查)

### 核心架构模式

```
┌─────────────────────────────────────────────┐
│           Frontend (React + Vite)          │
│  ┌──────────────────────────────────────┐  │
│  │  Pages → Components → API Layer      │  │
│  └──────────────────────────────────────┘  │
└─────────────────────┬───────────────────────┘
                      │ HTTP/JSON
                      ▼
┌─────────────────────────────────────────────┐
│        Backend (Express + MySQL)           │
│  ┌──────────────────────────────────────┐  │
│  │  Routes → Controllers → Services     │  │
│  │  (LLMService for AI abstraction)     │  │
│  └──────────────────────────────────────┘  │
└─────────────────────┬───────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────┐
│         Database (MySQL)                    │
│  • scored_news    • summary_news            │
│  • news_source_stats • news_websites        │
└─────────────────────────────────────────────┘
```

**关键架构决策**:

1. **双进程开发模式**: 前端(Vite)和后端(Express)独立运行,通过concurrently统一管理
2. **服务层抽象**: `LLMService` 类统一封装所有AI模型调用逻辑
3. **配置驱动设计**: AI行为由外部配置文件控制(`llm-config.json`, `prompts.md`)
4. **流式响应**: AI报告生成使用Server-Sent Events (SSE)流式返回
5. **静态资源服务**: 生产环境下Express提供前端静态文件(`/dist`目录)

### 目录结构

```
src/
├── api/                    # API调用封装
│   ├── newsApi.js         # 新闻相关API
│   └── ...
├── components/            # 可复用组件
│   ├── Layout.jsx         # 应用布局和侧边栏
│   ├── FilterBar.jsx      # 通用筛选组件
│   ├── NewsTable.jsx      # 新闻列表表格
│   └── PasswordProtection.jsx  # 密码保护
├── pages/                 # 页面组件
│   ├── SummaryNewsPage.jsx      # 关键词总结
│   ├── NewsSourceAnalysisPage.jsx  # 来源分析
│   ├── ReportGeneratorPage.jsx  # 周报生成
│   ├── ConfigManagerPage.jsx     # 配置管理
│   ├── QualityAnalysisPage.jsx   # 质量分析
│   ├── ScoreEditPage.jsx         # 评分编辑
│   └── WordCountPage.jsx         # 字数统计
├── assets/               # 静态资源
├── App.jsx              # 应用主入口和路由配置
└── main.jsx             # 应用渲染入口

config/                    # 配置文件目录
├── README.md            # LLM模型配置说明
├── prompts.md           # AI周报生成提示词模板
├── llm-config.json      # LLM模型配置
├── keyword-prompts.json # 关键词特定提示词
└── google-search-setup.md  # Google搜索API设置指南

services/                 # 业务逻辑层
└── LLMService.js        # AI模型调用抽象层

scripts/                  # 工具脚本
└── kill-ports.cjs       # 端口清理脚本

server.cjs               # Express后端服务器
vite.config.js           # Vite配置和代理设置
```

### 数据库结构

**核心数据表**:

1. **`scored_news`** - AI评分新闻数据
   - `id` - 主键
   - `title`, `content`, `link` - 新闻内容
   - `source` - 新闻来源网站
   - `score` (0-5) - AI评分
   - `keyword` - 关联关键词
   - `search_keyword` - 搜索关键词
   - `fetchdate` - 抓取日期
   - `wordcount` - 字数统计
   - `sourceapi` - 数据来源API
   - `short_summary` - 简短摘要

2. **`summary_news`** - 关键词每日总结
   - `keyword` - 关键词
   - `date` - 日期
   - `round` (1/2/3) - 总结轮次
   - `summary` - Markdown格式总结

3. **`news_source_stats`** - 新闻来源统计
   - `keyword` - 关键词
   - `date` - 日期
   - `source` - 来源网站
   - `count` - 新闻数量

4. **`news_websites`** - 网站元数据
   - 网站配置和分类信息

**评分系统**:
- 0-5分制,由AI模型自动评分
- 用于新闻质量筛选和分析
- 支持手动编辑(需管理员密码)

## 主要功能模块

### 1. 关键词总结与新闻列表 (`/summary`)

**功能**:
- 多维度筛选:关键词、日期、轮次、分数
- Markdown格式总结展示
- 新闻列表展示和分页
- 实时数据更新

**关键组件**: `SummaryNewsPage.jsx`, `FilterBar.jsx`, `NewsTable.jsx`

**API端点**:
- `GET /api/keywords` - 获取关键词列表
- `GET /api/summary-news` - 获取关键词摘要(支持分页、排序)
- `GET /api/scored-news` - 获取评分新闻(支持多条件筛选)

### 2. 新闻来源分析 (`/analysis`)

**功能**:
- ECharts可视化图表(柱状图、折线图)
- 来源分布统计
- 时间范围和关键词筛选
- 分数分布分析
- 图表与表格联动

**关键组件**: `NewsSourceAnalysisPage.jsx`(使用ECharts)

**API端点**:
- `GET /api/news-sources` - 获取新闻来源列表
- `GET /api/news-source-stats` - 获取来源统计数据

### 3. 关键词新闻周报生成 (`/report`) ⭐

**核心功能**:
- 基于多AI模型的智能化周报生成
- **流式响应**: 实时显示AI生成内容
- **两轮修改**: 支持对初稿进行二次修改
- **多格式导出**: 图片、PDF、Word文档
- 关键词特定提示词支持
- 自定义提示词注入

**AI模型支持**:
1. **DeepSeek R1** (主模型) - 推理能力强
2. **KIMI K2** - 备用模型
3. **SiliconFlow** - DeepSeek备用端点

**工作流**:
```
选择新闻 → 预览 → 选择模型 → 流式生成 → 显示结果 → 两轮修改 → 导出
```

**关键组件**: `ReportGeneratorPage.jsx`

**API端点**:
- `GET /api/weekly-news` - 获取待生成报告的新闻
- `POST /api/generate-report` - 生成报告(DeepSeek主模型)
- `POST /api/generate-kimi-report` - 生成报告(KIMI模型)
- `POST /api/generate-siliconflow-report` - 生成报告(SiliconFlow)
- `POST /api/modify-report` - 修改现有报告
- `POST /api/preview-report-message` - 预览报告消息(无AI调用)
- `POST /api/preview-modify-message` - 预览修改消息

**配置文件**:
- `config/prompts.md` - System/User/Modify提示词模板
- `config/keyword-prompts.json` - 关键词特定提示词

### 4. 周报配置管理 (`/config`)

**功能**:
- LLM模型切换和配置
- 提示词模板编辑
- 关键词特定提示词管理
- 实时配置更新(无需重启)

**关键组件**: `ConfigManagerPage.jsx`

**API端点**:
- `GET /api/llm/models` - 列出所有可用模型
- `GET /api/llm/active-model` - 获取当前激活模型
- `POST /api/llm/switch-model` - 切换模型
- `GET /api/llm/custom-prompts` - 获取自定义提示词
- `POST /api/llm/reload-config` - 重新加载配置
- `GET /api/config/prompts` - 获取提示词配置
- `GET /api/config/keyword-prompts` - 获取关键词提示词
- `POST /api/config/keyword-prompts` - 保存关键词提示词
- `DELETE /api/config/keyword-prompts/:keyword/:promptId` - 删除提示词

**配置文件**:
- `config/llm-config.json` - 模型配置(自动热重载)
- `config/prompts.md` - 提示词模板
- `config/keyword-prompts.json` - 关键词提示词

### 5. 评分编辑 (`/score-edit`)

**功能**:
- 密码保护的管理员界面
- 实时评分更新
- 批量评分管理
- 内容预览

**关键组件**: `ScoreEditPage.jsx`, `PasswordProtection.jsx`

**API端点**:
- `POST /api/score-edit` - 获取待编辑新闻(需密码验证)
- `POST /api/update-score` - 更新新闻评分

**安全机制**:
- 使用 `VITE_ADMIN_PASSWORD` 环境变量验证
- 前端密码验证 + 后端二次验证

### 6. 字数统计 (`/word-count`)

**功能**:
- 90天滚动统计
- 关键词细分
- 评分分段统计
- 来源类型分析(自定义抓取 vs 微信)

**关键组件**: `WordCountPage.jsx`

**API端点**:
- `GET /api/word-count-stats` - 获取字数统计数据

### 7. 质量分析 (`/quality`)

**功能**:
- 多轮总结对比
- 昨日vs今日对比
- 修改建议生成
- 质量指标可视化

**关键组件**: `QualityAnalysisPage.jsx`

**API端点**:
- `GET /api/quality-analysis` - 获取质量分析数据
- `GET /api/low-score-distribution` - 获取评分分布
- `GET /api/debug-data` - 数据调试端点

### 8. Google搜索集成

**API端点**:
- `POST /api/google-search` - Google自定义搜索

**配置要求**:
- `GOOGLE_API_KEY` 环境变量
- `GOOGLE_SEARCH_ENGINE_ID` 环境变量
- 参考 `config/google-search-setup.md`

## LLM集成详解

### 服务层抽象

`services/LLMService.js` 统一封装所有AI模型调用:

**核心方法**:
- `callLLM(messages, options)` - 通用LLM调用
- `streamLLM(messages, onChunk, options)` - 流式响应
- `switchModel(modelId)` - 模型切换

**配置系统**:
- 模型配置: `config/llm-config.json`
- 提示词模板: `config/prompts.md`
- 关键词提示词: `config/keyword-prompts.json`

### 模型特性

**DeepSeek R1**(主模型):
- 推理能力强,适合复杂分析
- 成本相对较低
- 响应速度快
- 流式输出支持

**KIMI K2**(备用):
- 128k长上下文
- 智能对话能力
- 适合大规模文本处理

**SiliconFlow**(备用):
- DeepSeek备用端点
- 高可用性保障

### 提示词工程

**三层提示词结构**:
1. **System Prompt** - 定义AI角色和任务
2. **User Prompt** - 用户输入和上下文
3. **Modify Prompt** - 二次修改指令

**关键词特定提示词**:
- 支持为不同关键词定制专属提示词
- 优先级:关键词特定 > 默认提示词
- 配置文件: `config/keyword-prompts.json`

### 流式响应处理

```javascript
// Server-Sent Events (SSE) 实现
app.post('/api/generate-report', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');

  for await (const chunk of streamLLM(messages)) {
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  }
});
```

**前端处理**:
- `EventSource` 或 `fetch` with `ReadableStream`
- 实时渲染AI生成内容
- 支持中断和重试

### 配置热重载

```javascript
// 监听配置文件变化,自动重载
chokidar.watch('config/*.json').on('change', () => {
  llmService.reloadConfig();
});
```

## 开发模式与最佳实践

### 时区处理
- **数据库存储**: UTC时间
- **前端显示**: 本地时区转换(使用dayjs)
- **API格式**: ISO 8601字符串

### 中文编码
- 数据库字符集: UTF-8
- API响应: `Content-Type: application/json; charset=utf-8`
- 前端Meta标签: `<meta charset="UTF-8">`

### API密钥管理
- 所有密钥存储在 `.env` 文件
- 启动时验证必需的环境变量
- 密钥格式: `DEEPSEEK_API_KEY`, `KIMI_API_KEY`, 等
- 生产环境单独配置,不使用开发密钥

### 跨域处理
- 开发环境: Vite代理配置(`vite.config.js`)
- 生产环境: Express CORS中间件
- 允许的源: 根据环境配置

### 错误处理
- **前端**: Error Boundaries + 用户友好提示
- **后端**: 统一错误中间件 + HTTP状态码
- **AI调用**: 自动重试机制(最多3次)
- **数据库**: 连接池 + 超时处理

### 性能优化
- 分页加载(默认每页20条)
- 图片懒加载
- 图表渲染优化(ECharts实例复用)
- API响应缓存(可选)

### 端口管理

**开发端口**:
- 前端: `http://localhost:5174`
- 后端: `http://localhost:3456`(可通过 `API_PORT` 环境变量覆盖)

**端口清理脚本** (`scripts/kill-ports.cjs`):
```javascript
// 自动杀死占用3456和5174端口的进程
const { execSync } = require('child_process');
execSync(`kill-port 3456 5174`);
```

**环境变量覆盖**:
```bash
# 使用自定义端口启动后端
API_PORT=8080 node server.cjs
```

### 安全最佳实践

1. **密码保护**:
   - 评分编辑功能需要管理员密码
   - 前端 + 后端双重验证

2. **API密钥隔离**:
   - 不同环境使用不同密钥
   - 密钥定期轮换

3. **输入验证**:
   - SQL参数化查询(防止SQL注入)
   - XSS防护(React自动转义)
   - 请求体大小限制(50MB)

4. **CORS配置**:
   - 生产环境限制允许的源
   - 不使用 `*` 通配符

### 浏览器访问

- **开发环境**: http://localhost:5174
- **生产环境**: http://localhost:3456(或自定义 `API_PORT`)

### 部署说明

**本地部署**:
```bash
# 1. 构建前端
npm run build

# 2. 启动后端(同时提供静态文件服务)
node server.cjs
```

**生产环境特点**:
- Express提供 `/dist` 静态文件服务
- SPA路由支持(所有路由返回 `index.html`)
- 环境变量单独配置
- 日志和监控(可选)

**云服务部署**:
- 支持Vercel等平台(仅前端)
- 后端需单独部署到Node.js环境
- 数据库使用云MySQL(如腾讯云CynosDB)

## 常见开发任务

### 添加新的AI模型

1. 更新 `config/llm-config.json`:
```json
{
  "models": {
    "new-model": {
      "provider": "provider-name",
      "model": "model-name",
      "apiKey": "ENV_VAR_NAME",
      "endpoint": "https://api.example.com/v1/chat/completions",
      "description": "Model description"
    }
  }
}
```

2. 添加环境变量到 `.env`:
```env
NEW_MODEL_API_KEY=your_key_here
```

3. 重启服务,LLMService自动加载新配置

### 修改提示词模板

编辑 `config/prompts.md`:
```markdown
## System Prompt
You are a news analysis expert...

## User Prompt
Analyze the following news...
```

修改后自动生效(无需重启)。

### 添加关键词特定提示词

编辑 `config/keyword-prompts.json`:
```json
{
  "keywords": {
    "人工智能": {
      "prompts": [
        {
          "id": "tech-focus",
          "name": "技术深度分析",
          "description": "专注于技术细节",
          "content": "Focus on technical details...",
          "isDefault": true
        }
      ]
    }
  }
}
```

### 调整AI模型参数

编辑 `config/llm-config.json` 的 `settings` 部分:
```json
{
  "settings": {
    "temperature": 0.7,
    "timeout": 30000,
    "retryAttempts": 3,
    "fallbackModel": "deepseek-r1"
  }
}
```

**注意**: `maxTokens` 已移除,允许模型自由输出完整内容。

### 调试AI调用

启用调试日志:
```javascript
// server.cjs
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`, req.body);
  next();
});
```

查看LLM服务日志:
```bash
# LLMService会输出详细的调用信息
node server.cjs 2>&1 | grep "LLM"
```

## 故障排查

### 端口被占用
```bash
# 手动清理端口
npx kill-port 3456
npx kill-port 5174

# 或使用项目脚本
node scripts/kill-ports.cjs
```

### AI调用失败
1. 检查API密钥是否正确设置
2. 查看 `config/llm-config.json` 配置
3. 检查网络连接(API端点可达性)
4. 查看服务器日志了解详细错误

### 数据库连接失败
1. 验证 `.env` 中的数据库配置
2. 检查MySQL服务是否运行
3. 确认数据库用户权限
4. 测试网络连通性

### 前端构建错误
```bash
# 清理缓存重新构建
rm -rf node_modules dist
npm install
npm run build
```

## 技术债务与改进建议

### 已知限制
1. 无自动化测试(建议添加Jest/Vitest)
2. 无前端状态管理(建议复杂场景使用Zustand)
3. 错误监控不完善(建议集成Sentry)
4. 日志系统简单(建议使用Winston)

### 性能优化建议
1. 实现Redis缓存层
2. 数据库查询优化(添加索引)
3. CDN加速静态资源
4. API响应压缩

### 开发体验改进
1. 添加TypeScript支持
2. 实现热重载配置系统
3. 组件文档化(Storybook)
4. API文档自动化(Swagger)

## 更新日志

### 2025-01-11
- 更新React到19.2.1
- 完善CLAUDE.md文档
- 添加DeepSeek R1主模型支持
- 优化流式响应处理

### 2024-09-09
- **Kimi模型升级**: 从 `kimi-k2-0711-preview` 更新到 `kimi-k2-0905-preview`
- **生产构建**: 完成项目生产版本构建
- **部署准备**: 确定服务器部署文件清单

### 历史版本
详见 Git commit 历史。
