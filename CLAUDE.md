# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

KeyDigest is an AI-powered keyword news analysis system. It aggregates news by keywords, scores articles with LLMs, generates weekly reports, and provides source analytics. The system is built around a keyword-centric data model and supports configurable AI prompts per keyword.

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
                                    ├─ LLMService (services/LLMService.js)
                                    │   ├─ config/llm-config.json
                                    │   ├─ config/prompts.md
                                    │   └─ config/keyword-prompts.json
                                    │
                                    ├─ server/pdf/ (Playwright PDF renderers)
                                    │
                                    └─ MySQL Pool
```

### Key Architectural Patterns

1. **Single-file backend**: `server.cjs` is a monolithic Express file containing all routes, DB pool initialization, and business logic. It is not split into controllers or middleware directories.
2. **LLM abstraction**: `services/LLMService.js` encapsulates all AI calls. It reads `config/llm-config.json` for model endpoints and `config/prompts.md` for prompt templates. Configuration reloads at runtime via `/api/llm/reload-config`.
3. **Streaming reports**: Report generation endpoints (`/api/generate-report`, `/api/generate-kimi-report`, etc.) use SSE (text/event-stream) to stream LLM chunks to the frontend.
4. **Server-side PDF rendering**: Report and policy comparison PDFs are rendered via Playwright in `server/pdf/`, not in the browser. The frontend posts HTML to the backend, which returns a PDF buffer.
5. **Keyword-specific prompts**: `config/keyword-prompts.json` allows overriding default prompts per keyword. The config UI at `/config` manages these.
6. **Region policy reports**: A newer workflow (`/policy/regions`, `/policy/region-report`) uses `config/region-policy-report-prompts.json` for region-specific policy analysis with separate single-region and multi-region prompt templates.
7. **Page-scoped CSS convention**: Vite merges every `import './X.css'` into a single global stylesheet, so bare class selectors in `src/pages/*.css` leak across pages. Each page has a wrapper class (`.score-edit-page`, `.report-generator`, `.weekly-comparison-container`, `.word-count-stats`, `.history-reports-page`, `.config-container`, `.region-policy-browser`, `.region-report-page`, `.current-policy-page`) and page-level rules must be scoped under it. Truly shared utilities (`.kd-page`, `.kd-panel`, `.kd-state-card`, score badges) live in `src/index.css` and `src/overrides.css`; `src/overrides.css` is imported last and performs the final scoped visual normalization across pages.

### Database Schema

Core tables in MySQL:

- **`scored_news`**: AI-scored articles (`score` 0-5, `keyword`, `fetchdate`, `source`, `wordcount`, `short_summary`).
- **`summary_news`**: Daily keyword summaries (`keyword`, `date`, `round` 1/2/3, `summary` markdown).
- **`news_source_stats`**: Daily source counts per keyword.
- **`news_websites`**: Source website metadata.
- **`policy_versions`**: Policy comparison snapshots (region policy feature).
- **`reports_history`**: Saved report history with metadata.

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
```

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
- `GET/POST /api/config/region-policy-report-prompts` — region policy prompt CRUD
- `GET/POST /api/policy/*` — policy comparison and region report workflows
- `POST /api/google-search` — Google Custom Search proxy

### Routing

Frontend routes (`src/App.jsx`):
- `/summary` — keyword summaries and news list
- `/analysis` — source analysis charts
- `/report` — weekly report generator
- `/config` — LLM and prompt configuration
- `/quality` — quality analysis
- `/score-edit` — admin score editing (password protected)
- `/word-count` — word count statistics
- `/history` — saved report history
- `/policy/current`, `/policy/comparison`, `/policy/regions`, `/policy/region-report` — policy comparison workflow

### Important File Locations

- `server.cjs` — all backend routes and DB logic
- `services/LLMService.js` — LLM abstraction layer
- `server/pdf/renderReportPdf.cjs` — Playwright report PDF renderer
- `server/pdf/renderPolicyComparisonPdf.cjs` — policy comparison PDF renderer
- `server/pdf/renderRegionPolicyReportPdf.cjs` — region policy PDF renderer
- `config/llm-config.json` — model endpoints and settings
- `config/prompts.md` — system/user/modify prompt templates
- `config/keyword-prompts.json` — keyword-specific prompt overrides
- `config/region-policy-report-prompts.json` — region policy prompt configs
- `vite.config.js` — Vite config with `/api` proxy to backend
