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
npm test

cd /Users/moltbot/Projects/health-recovery-tracker/frontend
npm run build
```

## 배포 문서

Cloudflare 배포 절차는 아래 문서를 사용합니다.
- [Cloudflare 배포 가이드](docs/CLOUDFLARE_DEPLOY.md)

## 참고

- 회복 계산은 부위별 회복시간/기여 운동을 제공합니다.
- OCR 오인식은 alias override 기능으로 보정할 수 있습니다.
- `backend`는 신규 기능 반영 대상이 아닙니다.
