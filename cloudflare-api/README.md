# Cloudflare API (무료 배포용)

기존 FastAPI 백엔드를 Cloudflare Workers + D1 + R2로 대체한 런타임입니다.

## 빠른 시작 (로컬 개발)

### 1) 사전 요구사항

- Node.js 20+
- npm 10+
- Cloudflare 계정 + Wrangler 로그인

```bash
cd cloudflare-api
npm install
npx wrangler whoami
```

`whoami`가 실패하면 먼저 로그인합니다.

```bash
npx wrangler login
```

### 2) 로컬 DB 초기화 (최초 1회)

로컬 개발에서는 D1 로컬 DB(Miniflare)를 사용합니다.

```bash
npx wrangler d1 execute health-v2-db --local --file=./migrations/0001_init.sql
npx wrangler d1 execute health-v2-db --local --file=./migrations/0002_runtime_tables.sql
```

### 3) 로컬 서버 실행

```bash
npm run dev
```

기본적으로 Wrangler가 로컬 Worker를 띄우며, 터미널에 출력된 주소(보통 `http://127.0.0.1:8787`)로 접근할 수 있습니다.

### 4) 동작 확인

```bash
curl http://127.0.0.1:8787/api/health
curl "http://127.0.0.1:8787/api/sessions?limit=5"
```

## Cloudflare 리소스 준비 (배포 전 1회)

아래는 실제 Cloudflare 리소스(D1/R2)가 아직 없을 때만 실행합니다.

```bash
npx wrangler d1 create health-v2-db
npx wrangler r2 bucket create health-v2-uploads
```

`wrangler.toml`의 `database_id`를 생성된 실제 D1 ID로 갱신합니다.

원격 DB에도 스키마를 반영하려면:

```bash
npx wrangler d1 execute health-v2-db --remote --file=./migrations/0001_init.sql
npx wrangler d1 execute health-v2-db --remote --file=./migrations/0002_runtime_tables.sql
```

## 배포

```bash
npm run deploy
```

## 테스트

```bash
npm run typecheck
npm test
```

`npm test`에는 API 통합 테스트(`test/api-integration.test.ts`)가 포함됩니다.

## API

- `GET /api/health`
- `POST /api/uploads` (`multipart/form-data`)
- 필수 필드: `file`, `ocr_text_raw`
- 선택 필드: `ocr_engine_version`, `parser_version`
- `GET /api/sessions`
- `GET /api/sessions/:id`
- `GET /api/recovery`
