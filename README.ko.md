# Health Recovery Tracker

> 운동 스크린샷 기반 근육 회복 추적 + 설명 가능한 추천.

## 운영 기준 (단일화)

이 저장소의 운영 기준 런타임은 **Cloudflare**입니다.
- API: Cloudflare Workers + D1 + R2 (`cloudflare-api`)
- Frontend: Vue + Vite + Cloudflare Pages (`frontend`)

`backend`의 FastAPI 코드는 **legacy read-only 참조용**으로 유지합니다.

## 시스템 개요

```text
브라우저/모바일
  -> Frontend (Cloudflare Pages)
  -> API (Cloudflare Worker)
  -> D1(세션/회복 데이터) + R2(업로드 파일)
```

핵심 흐름:
1. 스크린샷 + OCR 텍스트 업로드
2. 운동/세트 파싱 및 정규화
3. 세션/운동/세트 저장
4. 근육별 회복도 + 기여 운동 계산

## 디렉토리

- `cloudflare-api/`: 운영 API 및 테스트
- `frontend/`: 웹 UI
- `backend/`: legacy FastAPI 구현 (read-only)
- `docs/`: 아키텍처/테스트/배포 문서
- `infra/`: legacy/backend 보조 인프라

## 빠른 시작 (Cloudflare 기준)

### 1) API 로컬 실행

```bash
cd /Users/moltbot/Projects/health-recovery-tracker/cloudflare-api
npm install
npm run dev
```

로컬 주소는 보통 `http://127.0.0.1:8787` 입니다.

### 2) Frontend 로컬 실행

```bash
cd /Users/moltbot/Projects/health-recovery-tracker/frontend
npm install
npm run dev
```

API Base URL 설정 방법:
- `VITE_API_BASE_URL` 환경변수
- Upload 화면의 `API Base URL` 입력값(localStorage 저장)

### 3) 최소 검증

```bash
cd /Users/moltbot/Projects/health-recovery-tracker/cloudflare-api
npm run typecheck
npm test

cd /Users/moltbot/Projects/health-recovery-tracker/frontend
npm run typecheck
npm run build
```

## Rate Limit 기본값 (운영)

현재 기본 정책은 `cloudflare-api/wrangler.toml` 기준입니다.

| Scope Bucket | 예시 엔드포인트 | 한도 / 윈도우 | Override 환경변수 |
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

전역 기본값 키:
- `RATE_LIMIT_MAX_PER_MINUTE`
- `RATE_LIMIT_WINDOW_SECONDS`

## 배포 문서

Cloudflare 배포 절차는 아래 문서를 사용합니다.
- [Cloudflare 배포 가이드](docs/CLOUDFLARE_DEPLOY.md)
- [릴리즈 체크리스트](docs/RELEASE_CHECKLIST.md)
- [브랜치 보호 가이드](docs/BRANCH_PROTECTION.md)

## 초급자용 문서

- [입문 가이드 (한국어)](docs/BEGINNER_GUIDE.ko.md)
- [아키텍처 지도 (한국어)](docs/ARCHITECTURE_MAP.ko.md)

## 문서 신뢰 기준 (Source of Truth)

- API 라우팅 기준: `cloudflare-api/src/router.ts`
- API 핸들러 기준: `cloudflare-api/src/handlers/*`
- API 서비스 기준: `cloudflare-api/src/services/*`
- 회복 계산 기준: `cloudflare-api/src/recovery.ts`
- 문서와 코드가 다르면 위 두 파일을 우선으로 판단합니다.

## 참고

- 회복 계산은 부위별 회복시간/기여 운동을 제공합니다.
- OCR 오인식은 alias override 기능으로 보정할 수 있습니다.
- `backend`는 신규 기능 반영 대상이 아닙니다.
