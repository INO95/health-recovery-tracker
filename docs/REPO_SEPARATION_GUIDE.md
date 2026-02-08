# Health Recovery Tracker - Repo Separation Guide

## 목차
1. [분리 전략 비교](#1-분리-전략-비교)
2. [파일 정리 체크리스트](#2-파일-정리-체크리스트)
3. [포트폴리오 친화 구조](#3-포트폴리오-친화-구조)
4. [실행 가능성 체크리스트](#4-실행-가능성-체크리스트)
5. [GitHub Actions CI](#5-github-actions-ci)
6. [실행 명령어 모음](#6-실행-명령어-모음)

---

## 1. 분리 전략 비교

### Option A: Git History 유지 (git filter-repo)

```bash
# 1. 원본 repo 백업
cp -r /Users/moltbot/Documents/Moltbot_Workspace /tmp/Moltbot_Workspace_backup

# 2. health-v2만 추출 (새 디렉토리에)
cd /tmp
git clone /Users/moltbot/Documents/Moltbot_Workspace health-recovery-tracker
cd health-recovery-tracker

# 3. git-filter-repo로 subdirectory만 추출
pip install git-filter-repo
git filter-repo --subdirectory-filter health-v2

# 4. 새 remote 설정
git remote add origin git@github.com:YOUR_USERNAME/health-recovery-tracker.git
git push -u origin main
```

| 장점 | 단점 |
|------|------|
| ✅ 커밋 히스토리 보존 | ❌ 설정 복잡 |
| ✅ 작업 이력 증명 | ❌ 불필요한 커밋도 포함될 수 있음 |
| ✅ blame/log 가능 | ❌ 큰 파일 히스토리 정리 필요 |

### Option B: Snapshot 복사 (새 repo init) ⭐ 추천

```bash
# 1. 새 디렉토리 생성
mkdir -p ~/Projects/health-recovery-tracker
cd ~/Projects/health-recovery-tracker

# 2. 필요한 파일만 복사
cp -r /Users/moltbot/Documents/Moltbot_Workspace/health-v2/* .

# 3. 불필요 파일 제거 (아래 체크리스트 참조)
rm -rf backend/.venv backend/.pytest_cache backend/build
rm -rf backend/health_v2_backend.egg-info backend/health_v2.db
rm -rf backend/data frontend/node_modules frontend/dist
rm -f .env backend/.env frontend/.env

# 4. Git 초기화
git init
git add .
git commit -m "Initial commit: Health Recovery Tracker v1.0"

# 5. Remote 설정 및 push
git remote add origin git@github.com:YOUR_USERNAME/health-recovery-tracker.git
git push -u origin main
```

| 장점 | 단점 |
|------|------|
| ✅ 깔끔한 시작 | ❌ 커밋 히스토리 없음 |
| ✅ 불필요 파일 확실히 제거 | ❌ 작업 이력 증명 어려움 |
| ✅ 설정 단순 | |
| ✅ .gitignore 적용 용이 | |

### 💡 추천: Option B

**이유**:
- 포트폴리오 목적에서는 "깔끔한 코드"가 "긴 히스토리"보다 중요
- README와 문서로 작업 과정 충분히 설명 가능
- 보안 위험 요소 완전 제거 용이

---

## 2. 파일 정리 체크리스트

### ❌ 제거 필수 (보안/불필요)

| 경로 | 이유 |
|------|------|
| `backend/.venv/` | Python 가상환경 (재생성 가능) |
| `backend/.pytest_cache/` | 테스트 캐시 |
| `backend/build/` | 빌드 아티팩트 |
| `backend/health_v2_backend.egg-info/` | 설치 메타데이터 |
| `backend/health_v2.db` | 로컬 SQLite DB (개인 데이터) |
| `backend/data/` | 업로드된 파일 (개인 데이터) |
| `backend/__pycache__/` | Python 캐시 |
| `frontend/node_modules/` | npm 패키지 (재설치 가능) |
| `frontend/dist/` | 빌드 결과물 |
| `.env` (모든 위치) | 🔴 **보안**: API 키, DB 비밀번호 |
| `*.log` | 로그 파일 |
| `.DS_Store` | macOS 메타데이터 |

### ⚠️ 확인 필요

| 경로 | 확인 사항 |
|------|----------|
| `backend/migrations/` | 민감한 데이터 없는지 확인 |
| `infra/docker-compose.yml` | 하드코딩된 비밀번호 확인 |
| `frontend/src/api/` | API URL이 하드코딩되어 있으면 환경변수로 변경 |

### ✅ 유지

| 경로 | 이유 |
|------|------|
| `README.md`, `README.ja.md`, `README.ko.md` | 문서 |
| `backend/app/` | 소스코드 |
| `backend/tests/` | 테스트 코드 |
| `backend/migrations/` | DB 마이그레이션 |
| `backend/pyproject.toml` | 의존성 정의 |
| `frontend/src/` | 소스코드 |
| `frontend/package.json` | 의존성 정의 |
| `frontend/vite.config.ts` | 빌드 설정 |
| `docs/` | 기술 문서 |
| `infra/` | 인프라 설정 |
| `.env.example` | 환경변수 템플릿 |
| `.gitignore` | Git 설정 |

---

## 3. 포트폴리오 친화 구조

### 최종 디렉토리 구조

```
health-recovery-tracker/
├── README.md                    # 영문 (메인)
├── README.ja.md                 # 일본어
├── README.ko.md                 # 한국어
├── .gitignore
├── .env.example                 # 루트 레벨 환경변수 템플릿
│
├── backend/
│   ├── README.md               # Backend 실행 방법
│   ├── app/
│   ├── tests/
│   ├── migrations/
│   ├── pyproject.toml
│   └── .env.example            # Backend 전용 환경변수
│
├── frontend/
│   ├── README.md               # Frontend 실행 방법
│   ├── src/
│   ├── package.json
│   ├── vite.config.ts
│   └── .env.example            # Frontend 전용 환경변수
│
├── infra/
│   └── docker-compose.yml      # Postgres + Redis
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── RECOVERY_ALGORITHM.md
│   └── TESTING.md
│
└── scripts/                    # (선택적) 편의 스크립트
    ├── setup.sh               # 환경 초기화
    └── run-all.sh             # 전체 서비스 실행
```

### 루트 .gitignore 제안

```gitignore
# Python
__pycache__/
*.py[cod]
.venv/
*.egg-info/
build/
dist/
.pytest_cache/

# Node
node_modules/
dist/

# Environment
.env
.env.local

# Database
*.db
*.sqlite
backend/data/

# IDE
.idea/
.vscode/

# OS
.DS_Store
Thumbs.db

# Logs
*.log
```

### 루트 .env.example

```bash
# Database
POSTGRES_USER=health
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DB=health_v2
DATABASE_URL=postgresql://health:your_secure_password@localhost:5432/health_v2

# Redis
REDIS_URL=redis://localhost:6379

# API
API_HOST=0.0.0.0
API_PORT=8000

# Frontend
VITE_API_URL=http://localhost:8000
```

---

## 4. 실행 가능성 체크리스트

### 4.1 Clone & Setup

```bash
# 1. Clone
git clone https://github.com/YOUR_USERNAME/health-recovery-tracker.git
cd health-recovery-tracker

# 2. 환경변수 설정
cp .env.example .env
# .env 파일 편집 (비밀번호 등 설정)
```

### 4.2 Infrastructure Up

```bash
# 3. Postgres + Redis 시작
cd infra
docker compose up -d

# 확인
docker compose ps
# postgres와 redis가 healthy 상태인지 확인
```

### 4.3 Backend Setup

```bash
# 4. Backend 환경 설정
cd ../backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate

# 5. 의존성 설치
pip install -e .

# 6. DB 마이그레이션
python -m app.migrate_cli

# 7. API 서버 실행
uvicorn app.main:app --host 0.0.0.0 --port 8000
# 별도 터미널에서 실행, 또는 & 붙여 백그라운드

# 8. Worker 실행 (별도 터미널)
python -m app.worker_cli
```

### 4.4 Frontend Setup

```bash
# 9. Frontend 환경 설정 (별도 터미널)
cd ../frontend
npm install

# 10. 개발 서버 실행
npm run dev -- --host 0.0.0.0
# http://localhost:5173 접속 확인
```

### 4.5 Health Check

```bash
# 11. API 상태 확인
curl http://localhost:8000/api/health
# Expected: {"status": "ok", ...}

# 12. 브라우저 접속
open http://localhost:5173
```

### 4.6 iPhone LAN 테스트

```bash
# 13. Mac IP 확인
ifconfig en0 | grep "inet " | awk '{print $2}'
# 예: 192.168.1.100

# 14. iPhone Safari에서 접속
# URL: http://192.168.1.100:5173

# 15. 테스트 시나리오
# a) 업로드 버튼 탭 → 카메라/갤러리 선택
# b) 이미지 선택 후 업로드
# c) 업로드 목록에서 상태 확인 (pending → done)
# d) 세션 상세 확인
# e) Recovery 페이지에서 근육별 상태 확인
```

### 체크리스트 표

| # | 단계 | 명령어 | 확인 방법 |
|---|------|--------|----------|
| 1 | Clone | `git clone ...` | 디렉토리 생성됨 |
| 2 | Infra | `docker compose up -d` | `docker compose ps` 모두 healthy |
| 3 | Backend venv | `python -m venv .venv` | `.venv/` 폴더 생성 |
| 4 | Backend deps | `pip install -e .` | 에러 없음 |
| 5 | Migrate | `python -m app.migrate_cli` | "Migration complete" 출력 |
| 6 | API | `uvicorn app.main:app ...` | `curl /api/health` → 200 |
| 7 | Worker | `python -m app.worker_cli` | "Worker started" 출력 |
| 8 | Frontend | `npm install && npm run dev` | http://localhost:5173 접속 |
| 9 | iPhone | Safari 접속 | 페이지 로드됨 |
| 10 | E2E | 업로드 테스트 | 상태 done으로 변경 |

---

## 5. GitHub Actions CI

### 최소 필수 CI (`.github/workflows/ci.yml`)

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  backend-test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_USER: health
          POSTGRES_PASSWORD: testpass
          POSTGRES_DB: health_v2_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      
      redis:
        image: redis:7
        ports:
          - 6379:6379

    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      
      - name: Install dependencies
        working-directory: backend
        run: |
          pip install -e .
          pip install pytest pytest-cov
      
      - name: Run migrations
        working-directory: backend
        env:
          DATABASE_URL: postgresql://health:testpass@localhost:5432/health_v2_test
          REDIS_URL: redis://localhost:6379
        run: python -m app.migrate_cli
      
      - name: Run tests
        working-directory: backend
        env:
          DATABASE_URL: postgresql://health:testpass@localhost:5432/health_v2_test
          REDIS_URL: redis://localhost:6379
        run: pytest tests/ -v --cov=app

  frontend-build:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json
      
      - name: Install dependencies
        working-directory: frontend
        run: npm ci
      
      - name: Build
        working-directory: frontend
        run: npm run build
```

### (선택) Lint 추가

```yaml
  # backend-test job에 추가
  - name: Lint (optional)
    working-directory: backend
    run: |
      pip install ruff
      ruff check app/

  # frontend-build job에 추가
  - name: Lint (optional)
    working-directory: frontend
    run: npm run lint  # package.json에 lint 스크립트 필요
```

---

## 6. 실행 명령어 모음

### 빠른 시작 (복붙용)

```bash
# === 1. 인프라 ===
cd infra && docker compose up -d && cd ..

# === 2. 백엔드 ===
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e .
python -m app.migrate_cli
uvicorn app.main:app --host 0.0.0.0 --port 8000 &
python -m app.worker_cli &
cd ..

# === 3. 프론트엔드 ===
cd frontend
npm install
npm run dev -- --host 0.0.0.0

# === 4. 테스트 ===
curl http://localhost:8000/api/health
open http://localhost:5173
```

### iPhone 테스트용 IP 확인

```bash
# Mac IP 확인
ifconfig en0 | grep "inet " | awk '{print $2}'

# 또는
ipconfig getifaddr en0
```

---

## 확인 필요 사항

| 항목 | 확인 필요 |
|------|----------|
| `backend/app/main.py` | CORS 설정이 `0.0.0.0` 허용하는지 |
| `frontend/src/api/` | API URL이 환경변수(`VITE_API_URL`)로 설정되어 있는지 |
| `infra/docker-compose.yml` | 비밀번호가 하드코딩되어 있다면 환경변수로 변경 |
| `backend/tests/` | 테스트가 실제로 통과하는지 (`pytest` 실행) |

---

*이 가이드는 2026-02-08 기준 health-v2 구조를 분석하여 작성되었습니다.*
