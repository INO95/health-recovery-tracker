# backend (legacy read-only)

> **LEGACY NOTICE**
> - This backend is `legacy backend (read-only)`.
> - It is **not** a target for new feature development.
> - Operational runtime baseline is `cloudflare-api`.

This directory keeps the original FastAPI implementation for historical/reference purposes.

## Scope

- Reference implementation of upload/session/recovery APIs
- Legacy tests and migration history
- Not part of current production deployment path

## Current Production Path

Use Cloudflare runtime instead:
- API: `/Users/moltbot/Projects/health-recovery-tracker/cloudflare-api`
- Frontend: `/Users/moltbot/Projects/health-recovery-tracker/frontend`
- Deploy guide: `/Users/moltbot/Projects/health-recovery-tracker/docs/CLOUDFLARE_DEPLOY.md`

## If You Still Need Legacy Local Run

```bash
cd /Users/moltbot/Projects/health-recovery-tracker/backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install ".[dev]"
python -m app.migrate_cli
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

This run path is for reference only.
