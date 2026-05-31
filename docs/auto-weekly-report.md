# 自动周报与 PDF 下载

## 概览

自动周报用于在每周日 05:00 自动生成一个完整周日到周六周期的关键词新闻周报，并导出带联系方式的 PDF。查询字段使用 `scored_news.fetchdate` 的 `yyyy-mm-dd` 日期格式。

该功能由 admin 配置；普通用户不能修改自动运行参数，但可以在 `/auto-report` 下载自己有权限关键词的自动周报 PDF。

## 配置入口

- 前端页面：`/auto-report`
- 配置文件：`config/auto-report-config.json`
- 模型配置：`config/weekly-report-models.json`
- Prompt 配置：`config/keyword-prompts.json`

admin 在页面中为每个关键词单独配置：

- 是否启用自动运行
- 使用哪个周报模型
- 使用哪个 Prompt
- 最低新闻分数
- 使用短摘要还是全文

保存时，只要至少一个关键词启用，配置文件中的 `enabled` 就会写为 `true`。未启用的关键词会保留参数，但不会进入自动任务队列。

## 运行机制

后端启动时会注册 cron：

```text
0 5 * * 0
timezone: Asia/Shanghai
```

主要实现文件：

- `server.cjs`：注册 cron、提供配置/状态/下载 API、限制下载路径。
- `services/autoReportService.cjs`：读取配置、计算周范围、查询新闻、调用 LLM、写入报告、生成 PDF、记录日志。
- `server/pdf/renderReportPdf.cjs`：生成带联系方式的周报 PDF。

自动任务会跳过未启用的关键词。若任务仍在运行，下一次触发会被跳过，避免并发生成同一批周报。

## 数据库

自动周报会写入或使用以下表：

- `scored_news`：按 `keyword`、`fetchdate`、`score` 查询入选新闻。
- `weekly_reports`：保存生成后的周报正文，自动周报和手动周报使用同一张历史表。
- `auto_report_log`：记录每个关键词的一次自动运行结果。

`auto_report_log` 包含运行参数和排查指标：

- `trigger_type`
- `week_start`
- `week_end`
- `keyword`
- `status`
- `news_count`
- `model_key`
- `model_used`
- `prompt_id`
- `prompt_name`
- `min_score`
- `summary_version`
- `source_word_count`
- `prompt_char_count`
- `pdf_status`
- `pdf_filename`
- `duration_ms`
- `error_message`
- `pdf_error_message`

## API

admin-only:

- `GET /api/config/auto-report`
- `POST /api/config/auto-report`
- `GET /api/auto-report/status`
- `POST /api/auto-report/trigger`

登录用户可用：

- `GET /api/auto-report/history`
- `GET /api/auto-report/download/:logId`

`history` 和 `download` 会按用户关键词权限过滤。admin 可查看全部关键词；restricted 用户只能查看或下载自己有权限关键词的记录。下载端点会校验 PDF 路径必须位于 `data/auto-report-pdfs` 下。

## 运维检查

常用验证命令：

```bash
npm run build
npm run lint
node --test test/auto-report-service.test.cjs
node --test test/*.test.*
```

本地检查当前配置是否会被任务识别：

```bash
node - <<'NODE'
const fs = require('fs');
const { buildAutoReportConfig } = require('./services/autoReportService.cjs');
const config = JSON.parse(fs.readFileSync('config/auto-report-config.json', 'utf8'));
console.log(buildAutoReportConfig(config).enabledKeywords);
NODE
```

如果页面显示启用状态和自动任务不一致，优先检查：

1. `config/auto-report-config.json` 中关键词项的 `enabled`。
2. 关键词是否仍存在于 `config/users.json` 的 admin `keywords` 中。
3. 对应 `promptId` 是否存在于 `config/keyword-prompts.json`。
4. `modelKey` 是否存在于 `config/weekly-report-models.json`。
