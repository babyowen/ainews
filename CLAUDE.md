# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

KeyDigest 是一个围绕"关键词"维度的新闻打分与总结数据分析系统，提供新闻内容总结和来源分析功能。该系统通过AI对新闻进行打分和总结，帮助用户快速了解关键词相关的新闻动态和来源分布情况。

## 开发环境设置

### 环境要求
- Node.js 14+
- MySQL 5.7+

### 常用开发命令

```bash
# 安装依赖
npm install

# 启动完整开发环境 (前端+后端，自动处理端口冲突)
npm run dev

# 单独启动后端API服务器 (端口 3456)
node server.cjs

# 构建生产版本
npm run build

# 代码检查
npm run lint

# 预览生产版本
npm run preview
```

**重要说明**：
- `npm run dev` 是推荐的启动方式，它会同时启动前端开发服务器(5174端口)和后端API服务器(3456端口)
- 启动前会自动杀死占用相关端口的进程，避免端口冲突
- 开发阶段应始终使用此命令来启动完整环境

### 环境变量配置

项目使用 `.env` 文件管理环境变量，主要包含：
- 数据库连接配置 (DB_*)
- API端口配置 (API_PORT)
- 各种AI服务的API密钥 (GOOGLE_API_KEY, GEMINI_API_KEY, DEEPSEEK_API_KEY, KIMI_API_KEY, DOUBAO_API_KEY, SILICONFLOW_API_KEY)
- 管理员密码 (VITE_ADMIN_PASSWORD)

## 项目架构

### 技术栈
- **前端**: React 19.1.0 + Vite 6.3.5
- **后端**: Node.js + Express
- **数据库**: MySQL (腾讯云CynosDB)
- **UI组件**: 自定义组件 + ECharts 图表库
- **AI集成**: Google Gemini API, DeepSeek, Kimi, 豆包, 硅基流动

### 核心目录结构
```
src/
├── api/              # API调用函数
├── components/       # 可复用组件
├── pages/            # 页面组件
├── assets/           # 静态资源
├── App.jsx           # 应用主入口和路由配置
└── main.jsx          # 应用渲染入口

config/               # 配置文件目录
├── README.md         # LLM模型配置说明
├── prompts.md        # AI周报生成提示词配置
└── google-search-setup.md  # Google搜索API设置指南
```

### 主要功能模块

1. **关键词总结与新闻列表** (`/summary`)
   - 多维度筛选：关键词、日期、轮次、分数
   - Markdown格式总结展示
   - 新闻列表展示和分页

2. **新闻来源分析** (`/analysis`)
   - 可视化图表展示来源分布
   - 支持时间范围和关键词筛选
   - 分数分布分析

3. **关键词新闻周报生成** (`/report`)
   - 基于Google Gemini模型的智能化周报生成
   - 支持关键词选择和时间范围自定义
   - 个性化分析角度设置

4. **周报配置管理** (`/config`)
   - LLM模型配置和切换
   - 提示词模板管理

5. **质量分析** (`/quality`)
   - 新闻质量统计分析
   - 评分分布可视化

6. **评分编辑** (`/score-edit`)
   - 新闻评分手动调整
   - 批量评分管理

7. **字数统计** (`/word-count`)
   - 新闻内容长度统计
   - 文本量分析

### 数据库结构

主要数据表：
- `scored_news`: 存储带有AI评分的新闻数据
- `summary_news`: 存储关键词总结内容
- `news_source_stats`: 存储新闻来源统计数据
- `news_websites`: 存储网站信息

### 关键组件

- **Layout**: 应用布局和侧边栏导航
- **FilterBar**: 通用筛选组件
- **NewsTable**: 新闻列表表格组件
- **PasswordProtection**: 密码保护功能

### API接口

后端提供的主要API接口：
- `/api/keywords`: 获取关键词列表
- `/api/news-sources`: 获取新闻来源列表
- `/api/summary-news`: 获取关键词摘要和新闻列表
- `/api/scored-news`: 获取评分新闻数据
- `/api/source-stats`: 获取来源统计数据

### 开发注意事项

1. **时区处理**: 数据库存储UTC时间，前端显示需要正确处理时区转换
2. **中文编码**: 数据库和API都需要正确处理中文字符编码
3. **API密钥管理**: 各种AI服务的API密钥通过环境变量管理
4. **跨域处理**: 开发环境通过Vite代理配置解决跨域问题
5. **错误处理**: 前后端都有完善的错误处理机制

### 浏览器访问

- 开发环境：http://localhost:5174
- 生产环境：http://localhost:3456 (或自定义API_PORT)

### 部署说明

项目支持多种部署方式：
- 本地部署：直接运行 `npm run build` 和 `node server.cjs`
- 云服务部署：支持Vercel等云平台部署
- 容器化部署：可配置Docker容器化部署

## 更新日志

### 2025-09-09
- **Kimi模型升级**: 将周报生成功能中的Kimi模型从 `kimi-k2-0711-preview` 更新到 `kimi-k2-0905-preview`
- **生产构建**: 完成项目生产版本构建，生成优化的前端资源文件
- **部署准备**: 确定了需要部署到服务器的文件清单，包括前端dist目录和后端文件