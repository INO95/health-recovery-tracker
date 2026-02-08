# Cloudflare API (무료 배포용)

이 디렉토리는 기존 FastAPI 백엔드를 Cloudflare Workers + D1 + R2로 대체하기 위한 런타임입니다.

## 1) 준비

```bash
cd cloudflare-api
npm install
npx wrangler whoami
```

## 2) 리소스 생성

```bash
npx wrangler d1 create health-v2-db
npx wrangler r2 bucket create health-v2-uploads
```

`wrangler.toml`의 `database_id`를 실제 값으로 교체합니다.

## 3) 마이그레이션

```bash
npx wrangler d1 execute health-v2-db --remote --file=./migrations/0001_init.sql
```

## 4) 로컬 실행

```bash
npm run dev
```

## 5) 배포

```bash
npm run deploy
```

## API

- `GET /api/health`
- `POST /api/uploads` (`multipart/form-data`)
  - `file` (required)
  - `ocr_text_raw` (required for parsed result)
  - `ocr_engine_version` (optional)
  - `parser_version` (optional)
- `GET /api/sessions`
- `GET /api/sessions/:id`
- `GET /api/recovery`
