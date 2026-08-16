# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

KeyDigest is an AI-powered keyword news analysis system. It aggregates news by keywords, scores articles with LLMs, generates weekly reports, and provides source analytics. The system is built around a keyword-centric data model and supports configurable AI prompts per keyword.

The app now has lightweight multi-user access for internal use. `admin` keeps full access, while `yzgjj` is restricted in the frontend to the `公积金` keyword and the selected daily/news/report/word-count/policy menu set. This is a UI-level permission model, not server-side data isolation.

`/auto-report` adds admin-configured automatic weekly reports. The cron runs every Sunday at 05:00 Asia/Shanghai, summarizes the previous Sunday through Saturday by `scored_news.fetchdate`, writes logs to `auto_report_log`, and stores downloadable contact-info PDFs under `data/auto-report-pdfs`.

## Common Commands

```bash
# Install dependencies
npm install

# Start full dev environment (frontend + backend, auto-cleans ports)
npm run dev

# Start backend only (port 3456, override with API_PORT)
node server.cjs

# Start frontend only (port 5174)
vite

# Build for production
npm run build

# Lint
npm run lint

# Preview production build
npm run preview

# Install Playwright browser for server-side PDF rendering
npm run pdf:install-browser

# Focused automatic weekly report tests
node --test test/auto-report-service.test.cjs

# Full backend test suite (config dual-layer store, prompt store, migration, etc.)
npm test   # = node --test test/（根目录裸跑 node --test 亦可，历史遗留的 config/test-*.js 已改名避免误识别）

# Build a production release tarball (excludes config/runtime/, see docs/deployment.md)
bash scripts/pack-release.sh
```

## Architecture

### Development Mode

- **Frontend**: Vite dev server on port 5174, proxies `/api` to the backend.
- **Backend**: Express on port 3456 (or `API_PORT`).
- **Production**: Express serves the built frontend from `/dist` and handles SPA routing.
- `npm run dev` uses `concurrently` to run both; `predev` kills ports 3456 and 5174 via `scripts/kill-ports.cjs`.

### Tech Stack

- **Frontend**: React 19, React Router DOM 7, ECharts, html2canvas, html2pdf.js, docx, dayjs, react-markdown, TanStack Query.
- **Backend**: Express 4, mysql2 (Promise-based pool), CORS.
- **AI/LLM**: DeepSeek R1 (primary), KIMI K2 (fallback), SiliconFlow (fallback), Google Custom Search API.
- **PDF Rendering**: Playwright (server-side) for report and policy comparison PDFs.

### High-Level Structure

```
Frontend (React + Vite)  ←→  Backend (Express + MySQL)
                                    │
                                    ├─ promptStore (services/promptStore.cjs)
                                    │   ├─ config/            ← 默认层（git 追踪，随部署）
                                    │   └─ config/runtime/    ← 运行时层（生产自定义，部署永不覆盖）
                                    │
                                    ├─ configStore (services/configStore.cjs)
                                    │   └─ 双层合并读取 / 差异写入 / 导入导出
                                    │
                                    ├─ LLMService (services/llmService.cjs)
                                    │   └─ config/llm-config.json（经 configStore 生效配置）
                                    │
                                    ├─ server/pdf/ (Playwright PDF renderers)
                                    │
                                    └─ MySQL Pool
```

### Key Architectural Patterns

1. **Single-file backend**: `server.cjs` is a monolithic Express file containing all routes, DB pool initialization, and business logic. It is not split into controllers or middleware directories.
2. **Config dual-layer store (issue #22)**: `services/configStore.cjs` merges `config/` (factory defaults, git-tracked) with `config/runtime/` (production customizations, gitignored). All admin UI saves write only to the runtime layer as a diff against defaults; deployments overwrite `config/` freely and never touch `config/runtime/`. `services/promptStore.cjs` is the single entry point for all prompt reads/writes (weekly `prompts.md`, `policy_prompts.md`, `keyword-prompts.json`, `region-policy-report-prompts.json`, plus the formerly-inline policy/JSON-repair prompt constants). Merge semantics: keyword/region prompts merge by prompt id (runtime wins, deletions recorded as `metadata.deletedIds` tombstones); markdown prompt files override whole-file; `auto-report-config.json`/`llm-config.json` shallow-merge per field; `users.json` replaces whole-file. Admin endpoints: `GET /api/config/runtime-status`, `GET /api/config/prompt-export`, `POST /api/config/prompt-import`, `POST /api/config/reset-default`. Config write routes require admin auth. Deployment and one-time migration runbook: `docs/deployment.md` (`scripts/migrate-runtime-config.cjs`, `scripts/pack-release.sh`).
3. **LLM abstraction**: `services/llmService.cjs` (must stay `.cjs` — the package is `"type": "module"`) reads the effective `llm-config.json` via configStore; `switchModel` writes only `activeModel` to the runtime layer.
4. **Streaming reports**: Report generation endpoints (`/api/generate-report`, `/api/generate-kimi-report`, etc.) use SSE (text/event-stream) to stream LLM chunks to the frontend.
5. **Server-side PDF rendering**: Report and policy comparison PDFs are rendered via Playwright in `server/pdf/`, not in the browser. The frontend posts HTML to the backend, which returns a PDF buffer.
6. **Keyword-specific prompts**: `config/keyword-prompts.json` allows overriding default prompts per keyword. The config UI at `/config` manages these.
7. **Region policy reports**: A newer workflow (`/policy/regions`, `/policy/region-report`) uses `config/region-policy-report-prompts.json` for region-specific policy analysis with separate single-region and multi-region prompt templates.
8. **Lightweight multi-user access**: `POST /api/auth/login` validates fixed usernames against `.env` passwords, the frontend stores the returned profile in `sessionStorage`, and `src/config/userAccess.js` controls visible routes and allowed keywords. Successful logins are appended to `data/login-audit.json` through `services/loginAudit.cjs`; `/login-stats` is admin-only in the frontend.
9. **Automatic weekly reports**: `node-cron` schedules `services/autoReportService.cjs` at `0 5 * * 0` in `Asia/Shanghai`. Admin config is stored in `config/auto-report-config.json` (read via configStore effective config each run); the service uses `config/weekly-report-models.json` (includes `deepseek-reasoner` used by modify-report and region reports), keyword-specific prompts, server-side report PDF rendering, and `auto_report_log` for run/download audit data.
10. **Page-scoped CSS convention**: Vite merges every `import './X.css'` into a single global stylesheet, so bare class selectors in `src/pages/*.css` leak across pages. Each page has a wrapper class (`.score-edit-page`, `.report-generator`, `.weekly-comparison-container`, `.word-count-stats`, `.history-reports-page`, `.config-container`, `.auto-report-config`, `.region-policy-browser`, `.region-report-page`, `.current-policy-page`) and page-level rules must be scoped under it. Truly shared utilities (`.kd-page`, `.kd-panel`, `.kd-state-card`, score badges) live in `src/index.css` and `src/overrides.css`; `src/overrides.css` is imported last and performs the final scoped visual normalization across pages.
9. **Page-scoped CSS convention**: Vite merges every `import './X.css'` into a single global stylesheet, so bare class selectors in `src/pages/*.css` leak across pages. Each page has a wrapper class (`.score-edit-page`, `.report-generator`, `.weekly-comparison-container`, `.word-count-stats`, `.history-reports-page`, `.config-container`, `.auto-report-config`, `.region-policy-browser`, `.region-report-page`, `.current-policy-page`) and page-level rules must be scoped under it. Truly shared utilities (`.kd-page`, `.kd-panel`, `.kd-state-card`, score badges) live in `src/index.css` and `src/overrides.css`; `src/overrides.css` is imported last and performs the final scoped visual normalization across pages.

### Database Schema

Core tables in MySQL:

- **`scored_news`**: AI-scored articles (`score` 0-5, `keyword`, `fetchdate`, `source`, `wordcount`, `short_summary`).
- **`summary_news`**: Daily keyword summaries (`keyword`, `date`, `round` 1/2/3, `summary` markdown).
- **`news_source_stats`**: Daily source counts per keyword.
- **`news_websites`**: Source website metadata.
- **`policy_versions`**: Policy comparison snapshots (region policy feature).
- **`weekly_reports`**: Saved weekly report history with metadata; used by manual report generation, automatic weekly reports, `/api/reports/history`, and policy comparison.
- **`auto_report_log`**: Automatic weekly report run log with keyword, date range, run parameters, source/news counts, PDF status/path, and error details.

### Environment Variables

Required in `.env`:

```
DB_HOST, DB_USER, DB_PASS, DB_NAME, DB_PORT
API_PORT=3456
DEEPSEEK_API_KEY
KIMI_API_KEY
SILICONFLOW_API_KEY
GOOGLE_API_KEY
GOOGLE_SEARCH_ENGINE_ID
VITE_ADMIN_PASSWORD
KEYDIGEST_ADMIN_PASSWORD
KEYDIGEST_YZGJJ_PASSWORD
KEYDIGEST_SESSION_SECRET
```

`VITE_ADMIN_PASSWORD` is still used by the legacy score-edit password guard. Full-site login uses `KEYDIGEST_ADMIN_PASSWORD` and `KEYDIGEST_YZGJJ_PASSWORD`; the backend falls back from `KEYDIGEST_ADMIN_PASSWORD` to `VITE_ADMIN_PASSWORD` for admin if the new variable is absent.

`KEYDIGEST_SESSION_SECRET` signs Bearer tokens. If absent, the backend falls back to `DB_PASS`, then `KEYDIGEST_ADMIN_PASSWORD`, then a local default.

### API Endpoints (Selected)

- `GET/POST /api/scored-news` — scored articles with filtering/pagination
- `GET /api/summary-news` — daily summaries
- `GET /api/news-source-stats` — source analytics data
- `GET /api/weekly-news` — articles for report generation
- `POST /api/generate-report` — DeepSeek SSE report stream
- `POST /api/generate-kimi-report` — KIMI SSE report stream
- `POST /api/modify-report` — two-round report refinement
- `POST /api/reports/export-pdf` — server-side PDF export
- `GET/POST /api/config/keyword-prompts` — keyword prompt CRUD
- `GET /api/weekly-report/models` — weekly report model list from `config/weekly-report-models.json`
- `GET/POST /api/config/auto-report` — admin automatic weekly report config
- `GET /api/auto-report/status` — admin automatic weekly report schedule/runtime status
- `POST /api/auto-report/trigger` — admin manual automatic-report cycle trigger
- `GET /api/auto-report/history` — automatic weekly report logs filtered by user keyword access
- `GET /api/auto-report/download/:logId` — automatic weekly report PDF download filtered by keyword access
- `GET/POST /api/config/region-policy-report-prompts` — region policy prompt CRUD
- `GET/POST /api/policy/*` — policy comparison and region report workflows
- `POST /api/google-search` — Google Custom Search proxy
- `POST /api/auth/login` — lightweight login for fixed internal users
- `GET /api/auth/login-stats` — JSON-backed successful login statistics for the admin page

### Routing

Frontend routes (`src/App.jsx`):
- `/login` — full-site login
- `/summary` — keyword summaries and news list
- `/analysis` — source analysis charts
- `/report` — weekly report generator
- `/config` — LLM and prompt configuration
- `/quality` — quality analysis
- `/score-edit` — admin score editing (password protected)
- `/word-count` — word count statistics
- `/history` — saved report history route kept for direct/internal use; hidden from the sidebar menu
- `/auto-report` — automatic weekly report config for admin and download logs for users
- `/login-stats` — admin-only successful login statistics
- `/policy/current`, `/policy/comparison`, `/policy/regions`, `/policy/region-report` — policy comparison workflow

Frontend route visibility is filtered by `src/config/userAccess.js`. `yzgjj` sees `/summary`, `/report`, `/word-count`, and the four `/policy/*` routes; its policy menu is expanded by default.

### Important File Locations

- `server.cjs` — all backend routes and DB logic
- `services/LLMService.js` — LLM abstraction layer
- `services/loginAudit.cjs` — JSON-backed successful login audit helpers
- `services/weeklyReportModelConfig.cjs` — DeepSeek V4 weekly report model config helpers
- `services/autoReportService.cjs` — automatic weekly report cycle, logging, LLM call, and PDF generation
- `src/auth/AuthContext.jsx` — frontend session user context
- `src/config/userAccess.js` — frontend user route and keyword permissions
- `src/api/autoReport.js` — frontend automatic weekly report API wrapper
- `src/pages/AutoReportConfig.jsx` — automatic weekly report admin/user page
- `server/pdf/renderReportPdf.cjs` — Playwright report PDF renderer
- `server/pdf/renderPolicyComparisonPdf.cjs` — policy comparison PDF renderer
- `server/pdf/renderRegionPolicyReportPdf.cjs` — region policy PDF renderer
- `config/llm-config.json` — model endpoints and settings
- `config/weekly-report-models.json` — weekly report model choices used by manual and automatic reports
- `config/auto-report-config.json` — automatic weekly report runtime configuration
- `config/prompts.md` — system/user/modify prompt templates
- `config/keyword-prompts.json` — keyword-specific prompt overrides
- `config/region-policy-report-prompts.json` — region policy prompt configs
- `vite.config.js` — Vite config with `/api` proxy to backend
