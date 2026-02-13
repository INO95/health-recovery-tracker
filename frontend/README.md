# health-v2 frontend

Cloudflare API(`cloudflare-api`)를 기준으로 동작하는 Vue + TypeScript 프론트엔드입니다.

## Features

- Upload view (OCR + AI normalize + upload)
- Sessions list/detail
- Recovery view (근육별 상태/기여도/회복시간 설정)

## 1) Install

```bash
cd /Users/moltbot/Projects/health-recovery-tracker/frontend
npm install
```

## 2) Run

```bash
npm run dev
```

LAN/mobile test:

```bash
npm run dev:lan
```

## 3) API Base

기본 우선순위:
1. `VITE_API_BASE_URL` 환경변수
2. Upload 화면에서 저장한 `API Base URL` (localStorage)
3. 코드 기본값

프로덕션 권장값:
- `https://health-v2-api.health-recovery-tracker.workers.dev`

예시:

```bash
VITE_API_BASE_URL=https://health-v2-api.health-recovery-tracker.workers.dev npm run dev
```

## 4) Validate

```bash
npm run build
```

## 5) Deployment Reference

- [/Users/moltbot/Projects/health-recovery-tracker/docs/CLOUDFLARE_DEPLOY.md](../docs/CLOUDFLARE_DEPLOY.md)
