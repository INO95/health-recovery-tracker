# health-v2 backend (TC-01)

FastAPI 스캐폴딩만 포함된 최소 백엔드입니다.

## 1) 로컬 세팅

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install ".[dev]"
```

## 2) 테스트

```bash
cd backend
source .venv/bin/activate
python -m pytest
```

`No module named pytest`가 나오면 `.[dev]` 의존성이 설치되지 않은 상태이므로 1) 세팅 단계를 다시 실행합니다.

## 3) 서버 실행

```bash
cd backend
source .venv/bin/activate
python -m app.migrate_cli
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

## 4) 헬스체크

```bash
curl http://127.0.0.1:8000/api/health
```

예상 응답:

```json
{"status":"ok"}
```

## 5) 업로드 API (TC-03)

서버 실행 후:

```bash
curl -F file=@test.png http://127.0.0.1:8000/api/uploads
curl http://127.0.0.1:8000/api/uploads
curl http://127.0.0.1:8000/api/uploads/<uuid>
```

업로드 요청 시 DB row가 `status=pending`으로 생성되고, 파일은 `./data/uploads/`에 저장됩니다.
RQ 큐(`uploads`)에는 아래 payload가 enqueue 됩니다.

```json
{
  "upload_id": "8d4e9b7f-3e68-44cf-9bde-60d8f6f6a9f0",
  "storage_path": "/abs/path/to/data/uploads/8d4e9b7f-3e68-44cf-9bde-60d8f6f6a9f0.png",
  "parser_version": "tc03-parser-v1"
}
```

## 6) TC-04 통합 검증 순서

```bash
# 1) infra 실행 (repo root)
docker compose -f health-v2/infra/docker-compose.yml up -d

# 2) migrate up + 서버 실행 (backend)
cd health-v2/backend
source .venv/bin/activate
export DATABASE_URL='postgresql+psycopg://health:health@127.0.0.1:5432/health'
export REDIS_URL='redis://127.0.0.1:6379/0'
export UPLOAD_DIR='./data/uploads'
python -m app.migrate_cli
uvicorn app.main:app --host 127.0.0.1 --port 8000

# 3) 업로드/조회
curl -F file=@test.png http://127.0.0.1:8000/api/uploads
curl http://127.0.0.1:8000/api/uploads
curl http://127.0.0.1:8000/api/uploads/<uuid>

# 4) 테스트
python -m pytest
```

## 7) TC-05 워커 실행/검증

업로드 상태 전이(`pending -> processing -> parsed|failed`) 검증:

```bash
# 1) infra 실행 (repo root)
docker compose -f health-v2/infra/docker-compose.yml up -d

# 2) API 실행 (backend)
cd health-v2/backend
source .venv/bin/activate
export DATABASE_URL='postgresql+psycopg://health:health@127.0.0.1:5432/health'
export REDIS_URL='redis://127.0.0.1:6379/0'
python -m app.migrate_cli
uvicorn app.main:app --host 127.0.0.1 --port 8000

# 3) 다른 터미널에서 워커 실행
cd health-v2/backend
source .venv/bin/activate
export DATABASE_URL='postgresql+psycopg://health:health@127.0.0.1:5432/health'
export REDIS_URL='redis://127.0.0.1:6379/0'
python -m app.worker_cli

# 4) 업로드 후 상태 확인
curl -F file=@test.png http://127.0.0.1:8000/api/uploads
curl http://127.0.0.1:8000/api/uploads/<uuid>
```

정상 케이스:
- 파일 존재 시 `status=parsed`

실패 케이스:
- 파일 경로가 없으면 `status=failed`, `error_message=\"file not found\"`

## 8) TC-08-A 근육 스키마/시드

- 신규 테이블:
  - `muscle_groups`
  - `exercise_muscles`
- 마이그레이션 실행 시 기본 근육군 코드와 대표 운동-근육 매핑 시드가 함께 적재됩니다.

## 9) TC-08-B-2 Recovery 조회 API

```bash
curl http://localhost:8000/api/recovery
curl "http://localhost:8000/api/recovery?days=3"
curl "http://localhost:8000/api/recovery?from=2026-02-01&to=2026-02-08"
```
