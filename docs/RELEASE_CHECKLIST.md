# Release Checklist (Cloudflare Runtime)

## 1) Pre-deploy
- [ ] `cloudflare-api`: `npm run typecheck`
- [ ] `cloudflare-api`: `npm test`
- [ ] `frontend`: `npm run typecheck`
- [ ] `frontend`: `npm run build`
- [ ] CI(`.github/workflows/ci.yml`) green on target commit
- [ ] PR 본문 템플릿/필수 섹션 검증(`.github/workflows/pr-governance.yml`) green
- [ ] `main` 브랜치 보호 규칙이 활성화되어 있고 required checks가 설정됨 (`docs/BRANCH_PROTECTION.md`)

## 2) Migration
- [ ] Apply D1 migrations to target environment in order:
  - [ ] `cloudflare-api/migrations/0001_init.sql`
  - [ ] `cloudflare-api/migrations/0002_runtime_tables.sql`
- [ ] Confirm required runtime tables exist:
  - [ ] `user_settings`
  - [ ] `exercise_alias_overrides`
  - [ ] `recovery_settings`

## 3) Deploy
- [ ] Deploy API Worker
- [ ] Deploy Frontend Pages
- [ ] Verify frontend API base URL points to Worker endpoint

## 4) Smoke Test
- [ ] `GET /api/health` returns 200
- [ ] Upload one screenshot (`POST /api/uploads`) succeeds or returns actionable `detail/code`
- [ ] `GET /api/sessions?limit=5` returns valid list
- [ ] `GET /api/recovery?days=7` returns muscles + trainer_advice
- [ ] `PUT /api/bodyweight` updates and `GET /api/recovery` reflects value
- [ ] Response headers contain `x-request-id`

## 5) Rollback
- [ ] Keep previous Worker deployment version pinned for fast rollback
- [ ] If deployment causes request failures, roll back Worker first
- [ ] If schema-related errors (`schema_not_ready`) appear, re-run migration or restore previous DB state

## 6) Minimum Ops Metrics
- Error rate: 5xx ratio on `/api/*`
- API latency: p95 for `/api/uploads`, `/api/recovery`, `/api/sessions/*`
- Upload failure rate: `% of uploads with status=failed`
- Parsing quality: rate of `parse_warnings` and `unmapped_exercises` presence
- Debug traceability: ratio of responses carrying `x-request-id`
