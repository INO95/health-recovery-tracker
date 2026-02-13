# Cloudflare 배포 가이드 (실사용 값 반영)

이 문서는 `/Users/moltbot/Projects/health-recovery-tracker` 프로젝트를 Cloudflare로 배포하는 절차를 정리합니다.

## 1) API (Workers + D1 + R2)

작업 디렉토리:

```bash
cd /Users/moltbot/Projects/health-recovery-tracker/cloudflare-api
```

인증:

```bash
npx wrangler whoami
```

D1 생성/확인:

```bash
npx wrangler d1 list --json
# 비어있으면 생성
npx wrangler d1 create health-v2-db
```

현재 사용 중인 DB ID:

- `82401b3e-7122-4ff1-8b92-6b1577071a26`

마이그레이션:

```bash
npx wrangler d1 execute health-v2-db --remote --file=./migrations/0001_init.sql
npx wrangler d1 execute health-v2-db --remote --file=./migrations/0002_runtime_tables.sql
```

R2 생성:

```bash
npx wrangler r2 bucket create health-v2-uploads
```

배포:

```bash
npm run deploy
```

배포된 API URL:

- `https://health-v2-api.health-recovery-tracker.workers.dev`

## 2) Frontend (Pages)

작업 디렉토리:

```bash
cd /Users/moltbot/Projects/health-recovery-tracker/frontend
```

프로덕션 API 환경변수:

```bash
cat .env.production
# VITE_API_BASE_URL=https://health-v2-api.health-recovery-tracker.workers.dev
```

빌드:

```bash
npm run build
```

첫 1회 프로젝트 생성:

```bash
npx wrangler pages project create health-v2-frontend --production-branch main
```

배포:

```bash
npm run deploy:pages
```

배포 URL:

- 고정 도메인: `https://health-v2-frontend.pages.dev`
- 최근 배포 예: `https://102d2eea.health-v2-frontend.pages.dev`

## 3) 스마트폰 검증

1. 아이폰 Safari에서 `https://health-v2-frontend.pages.dev` 접속
2. Upload 화면에서 OCR 실행
3. 업로드 후 Sessions/Recovery 확인

## 4) 비용 주의점

- R2/Workers/D1은 무료 한도 내에서 0원
- 초과 시 과금 가능
- Cloudflare 대시보드 Usage 탭에서 월간 사용량 확인 권장
