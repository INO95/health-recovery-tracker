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
npm run typecheck
npm test

cd /Users/moltbot/Projects/health-recovery-tracker/frontend
npm run typecheck
npm run build
```

## Rate Limit Defaults (Ops)

Current default policy in `cloudflare-api/wrangler.toml`:

| Scope Bucket | Example Endpoints | Limit / Window | Override Keys |
|---|---|---|---|
| `health:read` | `GET /`, `GET /api/health` | `120 / 60s` | `RATE_LIMIT_MAX_HEALTH_READ`, `RATE_LIMIT_WINDOW_HEALTH_READ` |
| `upload:write` | `POST /api/uploads`, `POST /api/ocr/normalize` | `120 / 60s` | `RATE_LIMIT_MAX_UPLOAD_WRITE`, `RATE_LIMIT_WINDOW_UPLOAD_WRITE` |
| `sessions:read` | `GET /api/sessions`, `GET /api/sessions/:id` | `100 / 45s` | `RATE_LIMIT_MAX_SESSIONS_READ`, `RATE_LIMIT_WINDOW_SESSIONS_READ` |
| `sessions:write` | `PATCH/DELETE /api/sessions/:id`, `POST /api/sessions/:id/clone`, `POST /api/sessions/reset` | `120 / 60s` | `RATE_LIMIT_MAX_SESSIONS_WRITE`, `RATE_LIMIT_WINDOW_SESSIONS_WRITE` |
| `recovery:read` | `GET /api/recovery`, `GET /api/recovery/settings` | `120 / 60s` | `RATE_LIMIT_MAX_RECOVERY_READ`, `RATE_LIMIT_WINDOW_RECOVERY_READ` |
| `recovery:write` | `PUT /api/recovery/settings` | `120 / 60s` | `RATE_LIMIT_MAX_RECOVERY_WRITE`, `RATE_LIMIT_WINDOW_RECOVERY_WRITE` |
| `bodyweight:read` | `GET /api/bodyweight` | `120 / 60s` | `RATE_LIMIT_MAX_BODYWEIGHT_READ`, `RATE_LIMIT_WINDOW_BODYWEIGHT_READ` |
| `bodyweight:write` | `PUT /api/bodyweight` | `120 / 60s` | `RATE_LIMIT_MAX_BODYWEIGHT_WRITE`, `RATE_LIMIT_WINDOW_BODYWEIGHT_WRITE` |
| `exercise_aliases:read` | `GET /api/exercise-aliases` | `120 / 60s` | `RATE_LIMIT_MAX_EXERCISE_ALIASES_READ`, `RATE_LIMIT_WINDOW_EXERCISE_ALIASES_READ` |
| `exercise_aliases:write` | `POST/DELETE /api/exercise-aliases*` | `120 / 60s` | `RATE_LIMIT_MAX_EXERCISE_ALIASES_WRITE`, `RATE_LIMIT_WINDOW_EXERCISE_ALIASES_WRITE` |

Fallback keys:
- `RATE_LIMIT_MAX_PER_MINUTE`
- `RATE_LIMIT_WINDOW_SECONDS`

## Deployment

Use the Cloudflare deployment guide:
- [Cloudflare Deploy Guide](docs/CLOUDFLARE_DEPLOY.md)
- [Release Checklist](docs/RELEASE_CHECKLIST.md)
- [Branch Protection Guide](docs/BRANCH_PROTECTION.md)

## Beginner Docs (Korean)

- [Beginner Guide (Korean)](docs/BEGINNER_GUIDE.ko.md)
- [Architecture Map (Korean)](docs/ARCHITECTURE_MAP.ko.md)

## Documentation Source of Truth

- API routing: `cloudflare-api/src/router.ts`
- API handlers: `cloudflare-api/src/handlers/*`
- API services: `cloudflare-api/src/services/*`
- Recovery model: `cloudflare-api/src/recovery.ts`

## Notes

- Recovery model includes per-muscle rest settings and contributor visibility.
- Alias override is supported to fix recurring OCR exercise-name noise.
- Legacy backend is intentionally retained for reference, not active feature development.
