# KeyDigest

关键词新闻浏览、评分和周报系统。上游 `serp_news` 采集并处理新闻，本项目读取 `scored_news`，提供手动报告、自动周报和 PDF。

## 本地开发

使用 Node.js 20+，运行 `npm install`，按 [项目说明](CLAUDE.md#environment-variables)配置本地环境。不要把生产 `.env` 或 `config/runtime/` 当作可写测试配置。

```bash
npm run dev   # 后端3456、前端5174；会清理这两个端口的进程
npm test      # 隔离回归测试
npm run build
```

## 文档入口

- [自动周报与运维](docs/auto-weekly-report.md)：每周日北京时间05:00，整理前一周日到周六的数据。
- [机关事务阶段验收](docs/government-wechat-20261115-handoff.md)：已上线范围、首轮运行和仍未解决的质量问题。
- [官微地域上下文](docs/weekly-wechat-context.md)：发布账号辖区只辅助消解指代，不能直接当作事件发生地。
- [调试与生成请求一致性](docs/weekly-debug-parity.md)。
- [部署与配置保护](docs/deployment-gitee.md)：保留生产自定义提示词、用户、政策历史和业务数据。
- [开发约定](CLAUDE.md)。

模型以 `config/weekly-report-models.json` 为准：自动周报使用 DeepSeek V4 Pro；手动及其他分析默认使用 Flash。配置与提示词通过 `configStore` / `promptStore` 读取，管理端修改只写运行时覆盖。
