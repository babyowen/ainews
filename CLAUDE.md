# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

KeyDigest is an AI-powered keyword news analysis system. It aggregates news by keywords, scores articles with LLMs, generates weekly reports, and provides source analytics. The system is built around a keyword-centric data model and supports configurable AI prompts per keyword.

The app now has lightweight multi-user access for internal use. `admin` keeps full access, while `yzgjj` is restricted to the `公积金` keyword and the selected daily/news/report/word-count/policy menu set. Admin mutation endpoints require a signed Bearer token; this remains lightweight application authorization rather than complete row-level database isolation.

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

# Full test suite
npm test

# Preview production build
npm run preview

# Install Playwright browser for server-side PDF rendering
npm run pdf:install-browser

# Focused automatic weekly report tests
node --test test/auto-report-service.test.cjs
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
- **AI/LLM**: Agent Router DeepSeek V4.1 Flash (single model, no provider fallback), Google Custom Search API.
- **PDF Rendering**: Playwright (server-side) for report and policy comparison PDFs.

### High-Level Structure

```
Frontend (React + Vite)  ←→  Backend (Express + MySQL)
                                    │
                                    ├─ configStore + promptStore
                                    │   ├─ config/* (Git defaults)
                                    │   └─ config/runtime/* (server overrides)
                                    │
                                    ├─ LLMService (services/llmService.cjs)
                                    │
                                    ├─ server/pdf/ (Playwright PDF renderers)
                                    │
                                    └─ MySQL Pool
```

### Key Architectural Patterns

1. **Single-file backend**: `server.cjs` registers Express routes and initializes the DB pool. Reusable configuration, model, housing-fund query and report logic live in `services/`; no controllers or middleware directory is required.
2. **Layered runtime configuration**: `services/configStore.cjs` reads Git defaults from `config/` and merges ignored production differences from `config/runtime/`. `services/promptStore.cjs` is the only prompt parsing/CRUD entry point. Admin writes never modify Git defaults.
3. **LLM abstraction**: `services/llmService.cjs` encapsulates AI calls and uses services/modelClient.cjs and the fixed Agent Router model from config/weekly-report-models.json; prompts come from promptStore. The compatibility reload endpoint requires admin authentication.
4. **Streaming reports**: Report generation endpoints (`/api/generate-report`, `/api/generate-kimi-report`, etc.) use SSE (text/event-stream) to stream LLM chunks to the frontend.
5. **Server-side PDF rendering**: Report and policy comparison PDFs are rendered via Playwright in `server/pdf/`, not in the browser. The frontend posts report data; server templates produce the printable HTML and return a PDF buffer. Housing-fund exports require the signed generation snapshot.
6. **Keyword-specific prompts**: `config/keyword-prompts.json` contains defaults. The config UI at `/config` manages runtime overrides and shows each entry's source.
7. **Housing-fund workspace**: global `/summary` keeps generic fields. Dedicated daily/region/business pages share `ProvidentFundNewsView` and `policyNewsQuery.cjs`; separate region/business report routes share `ProvidentFundReportView` and `businessTopicReport.cjs`. The layered region prompt library includes `business-topic-comparison-v1`. See `docs/issue-25-business-types.md` for bounded queries, evidence snapshots and validation.
8. **Lightweight multi-user access**: `POST /api/auth/login` validates `users.json`, and admin mutation endpoints validate the signed token. Successful logins are appended to `data/login-audit.json`.
9. **Automatic weekly reports**: `node-cron` schedules `services/autoReportService.cjs` at `0 5 * * 0` in `Asia/Shanghai`. The service reads effective auto-report and prompt config on each cycle.
10. **Page-scoped CSS convention**: Vite merges every `import './X.css'` into a single global stylesheet, so bare class selectors in `src/pages/*.css` leak across pages. Page-level rules must remain scoped under their page wrapper.

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
AGENT_ROUTER_API_KEY
GOOGLE_API_KEY
GOOGLE_SEARCH_ENGINE_ID
VITE_ADMIN_PASSWORD
KEYDIGEST_SESSION_SECRET
```

`VITE_ADMIN_PASSWORD` is still used by the legacy score-edit password guard. Full-site login uses the effective layered `users.json`; on production, the complete credential file lives at `config/runtime/users.json`. `KEYDIGEST_ADMIN_PASSWORD` and `KEYDIGEST_YZGJJ_PASSWORD` are bootstrap fallbacks only when no valid users config exists and do not override an existing file.

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
- `POST /api/auth/login` — lightweight login using the effective layered users config
- `GET /api/auth/login-stats` — JSON-backed successful login statistics for the admin page
- `GET /api/config/runtime-status` — admin-only runtime override status
- `GET/POST /api/config/prompt-export|prompt-import` — admin-only prompt override backup/restore; never includes users
- `POST /api/config/reset-default` — admin-only file or prompt-entry reset
- `GET /api/health` — liveness check without a database query
- `GET /api/readiness` — production deployment gate for config, prompts, shared data, and database readiness

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
- `/provident-fund/news` — dedicated housing-fund daily news
- `/provident-fund/business`, `/provident-fund/business-report` — business browsing and multi-region topic reports
- `/policy/regions`, `/policy/region-report` — general region browsing and reports
- `/policy/current`, `/policy/comparison` — Yangzhou-only baseline editing and weekly comparison

Navigation metadata lives in `config/navigation.json`. `src/config/navigation.js` and `services/routeAccess.cjs` enforce the same leaf permissions, including the housing-fund keyword requirement. Runtime routes are authoritative, including for built-in users; never silently restore revoked routes. Parent groups derive from visible leaves and the current URL. `/api/auth/me` refreshes public user permissions. New entry permissions require an administrator to grant them to existing restricted users.

### Important File Locations

- `server.cjs` — backend routes and shared DB pool
- `services/newsBusinessTypes.cjs`, `newsRegions.cjs` — canonical tags/regions and unique-ID counts
- `services/policyNewsQuery.cjs` — bounded read-only query snapshots, facets and pagination
- `services/businessTopicReport.cjs` — material filtering, hashes, prompt input and citation validation
- `services/configStore.cjs` — default/runtime merge engine and atomic runtime writes
- `services/promptStore.cjs` — unified prompt parsing and CRUD
- `services/llmService.cjs` — LLM abstraction layer
- `services/llmService.cjs` — CommonJS compatibility service for LLM management
- `services/modelClient.cjs` — unified model discovery, generation, SSE parsing and response validation
- `services/policyExtraction.cjs` — validated policy JSON extraction with one format repair
- `services/loginAudit.cjs` — JSON-backed successful login audit helpers
- `services/weeklyReportModelConfig.cjs` — Unified Agent Router model config and legacy-key compatibility helpers
- `services/autoReportService.cjs` — automatic weekly report cycle, logging, LLM call, and PDF generation
- `services/appDataPaths.cjs` — stable shared-data and historical PDF path resolution
- `src/auth/AuthContext.jsx` — frontend session user context
- `src/config/userAccess.js` — frontend user route and keyword permissions
- `src/api/autoReport.js` — frontend automatic weekly report API wrapper
- `src/pages/AutoReportConfig.jsx` — automatic weekly report admin/user page
- `server/pdf/renderReportPdf.cjs` — Playwright report PDF renderer
- `server/pdf/renderPolicyComparisonPdf.cjs` — policy comparison PDF renderer
- `server/pdf/renderRegionPolicyReportPdf.cjs` — region policy PDF renderer
- `config/auto-report-config.json` — automatic weekly report Git defaults
- `config/runtime/` — ignored production overrides; shared across releases
- `config/weekly-report-models.json` — single shared model used by every generation workflow
- `config/prompts.md` — system/user/modify prompt templates
- `config/keyword-prompts.json` — keyword-specific prompt overrides
- `config/region-policy-report-prompts.json` — region policy prompt configs
- `vite.config.js` — Vite config with `/api` proxy to backend
- `scripts/prepare-production-runtime.cjs` — explicit first-cutover migration of production users, policy history, login audit, and report PDFs
- `scripts/deploy-from-gitee.sh` — exact-commit release deployment, readiness check, rollback, and bounded retention
- `docs/deployment-gitee.md` — GitHub→Gitee→production runbook
