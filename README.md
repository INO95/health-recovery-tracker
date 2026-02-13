# Health Recovery Tracker

> Muscle-level recovery tracking from workout screenshots, with explainable recommendations.

## Runtime Baseline

This repository now treats **Cloudflare runtime** as the primary path:
- API: Cloudflare Workers + D1 + R2 (`cloudflare-api`)
- Frontend: Vue + Vite + Cloudflare Pages (`frontend`)

The Python FastAPI backend remains in `backend` as a **legacy read-only reference**.

## System Overview

```text
iPhone / Browser
  -> Frontend (Cloudflare Pages)
  -> API (Cloudflare Worker)
  -> D1 (sessions/recovery data) + R2 (uploads)
```

Core flow:
1. Upload screenshot + OCR text
2. Parse and normalize workout sets
3. Persist sessions/exercises/sets
4. Compute muscle recovery with explainable contributors

## Project Structure

- `cloudflare-api/`: production API runtime and tests
- `frontend/`: web UI
- `backend/`: legacy FastAPI implementation (read-only reference)
- `docs/`: architecture, testing, deployment docs
- `infra/`: local docker infra for legacy/backend workflows

## Quick Start (Cloudflare Runtime)

### 1) API local dev

```bash
cd /Users/moltbot/Projects/health-recovery-tracker/cloudflare-api
npm install
npm run dev
```

Local endpoint is typically `http://127.0.0.1:8787`.

### 2) Frontend local dev

```bash
cd /Users/moltbot/Projects/health-recovery-tracker/frontend
npm install
npm run dev
```

If needed, set API base URL in one of these ways:
- `VITE_API_BASE_URL` env var
- Upload page's `API Base URL` input (stored in localStorage)

### 3) Validate

```bash
cd /Users/moltbot/Projects/health-recovery-tracker/cloudflare-api
npm test

cd /Users/moltbot/Projects/health-recovery-tracker/frontend
npm run build
```

## Deployment

Use the Cloudflare deployment guide:
- [Cloudflare Deploy Guide](docs/CLOUDFLARE_DEPLOY.md)

## Notes

- Recovery model includes per-muscle rest settings and contributor visibility.
- Alias override is supported to fix recurring OCR exercise-name noise.
- Legacy backend is intentionally retained for reference, not active feature development.
