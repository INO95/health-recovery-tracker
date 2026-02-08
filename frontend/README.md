# health-v2 frontend (TC-09-lite)

Vue + TypeScript 기반의 최소 데모 UI입니다.

- Upload view
- Recent sessions view
- Session detail view

## 1) 설치

```bash
cd health-v2/frontend
npm install
```

## 2) 개발 실행

기본:

```bash
npm run dev
```

iPhone/LAN 테스트:

```bash
npm run dev:lan
```

## 3) 백엔드/워커 실행 (별도 터미널)

```bash
cd health-v2/backend
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

```bash
cd health-v2/backend
source .venv/bin/activate
python -m app.worker_cli
```

## 4) iPhone Safari 테스트 절차

1. iPhone과 Mac을 같은 Wi-Fi에 연결
2. iPhone Safari에서 `http://<mac-ip>:5173` 접속
3. Upload 화면에서 `API Base URL`을 `http://<mac-ip>:8000`으로 저장
4. 스크린샷 업로드
5. Sessions 화면에서 최근 세션 확인
6. 상세 화면에서 exercise/set 중첩 데이터 확인

## 5) API base 설정

- 기본값: `VITE_API_BASE_URL` 또는 `http://127.0.0.1:8000`
- UI 입력값은 localStorage에 저장되어 이후에도 재사용됩니다.
