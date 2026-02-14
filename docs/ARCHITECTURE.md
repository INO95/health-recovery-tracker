# 아키텍처 개요 (Cloudflare 운영 런타임)

## 개요
이 문서는 Health Recovery Tracker의 **현재 운영 아키텍처**를 설명합니다.

- 운영 기준: `cloudflare-api` + `frontend`
- 저장소: Cloudflare D1(정형 데이터) + R2(업로드 파일)
- 레거시 주의: `backend`는 read-only 참고용이며 운영 요청 경로가 아닙니다.

## 시스템 형태
```text
iPhone / Browser
  -> Frontend (Vue + Cloudflare Pages)
  -> API (Cloudflare Worker)
  -> D1 (sessions/recovery/settings)
  -> R2 (uploaded files)
```

## 요청 흐름

### 1) 업로드 흐름 (`POST /api/uploads`)
1. Frontend가 `multipart/form-data`로 `file`, `ocr_text_raw`를 전송합니다.
2. Worker가 파일 바이너리를 R2에 저장합니다.
3. Worker가 `uploads` 테이블에 업로드 메타를 기록합니다.
4. Worker가 OCR 텍스트를 파싱하고 요약 데이터를 검증합니다.
5. 성공 시 `sessions`, `exercises`, `sets`를 저장합니다.
6. 업로드 상태를 `parsed` 또는 `failed`로 갱신 후 응답합니다.

설계 의도:
- 업로드 경로를 동기 처리로 단순하고 예측 가능하게 유지
- 실패 이유를 `error_message`로 명시해 원인 추적 가능하게 유지

### 2) 세션 관리 흐름
- `GET /api/sessions`: 세션 목록 조회
- `GET /api/sessions/:id`: 운동/세트 포함 상세 조회
- `PATCH /api/sessions/:id`: payload 정규화 후 운동/세트 재작성
- `DELETE /api/sessions/:id`: 세트/운동/세션 순차 삭제
- `POST /api/sessions/:id/clone`: 지정 날짜로 세션 복제
- `POST /api/sessions/reset`: seed 제외 전체 세션 초기화

설계 의도:
- OCR/파서 오차를 사용자 편집으로 보정 가능하게 제공
- 수정 시 중첩 구조를 재작성해 데이터 형태를 일관되게 유지

### 3) 회복 조회 흐름 (`GET /api/recovery`)
1. 기간 조건(`from/to` 또는 `days`)으로 세션을 조회하고 seed 날짜를 제외합니다.
2. 운동/세트를 로드해 운동 볼륨을 계산합니다.
3. 운동-근육 매핑을 순차 규칙(직접 -> fallback -> 정적 매핑)으로 결정합니다.
4. 근육별 `rest_hours`를 사용해 시간 감쇠를 적용합니다.
5. `fatigue`, `recovery`, `status`, 타이밍 필드를 계산합니다.
6. `contributors`, `unmapped_exercises`, `trainer_advice`를 포함해 응답합니다.

설계 의도:
- 설정값(체중, 회복시간)이 즉시 반영되도록 실시간 계산 채택
- 단순 점수가 아니라 기여 근거를 함께 제공해 설명 가능성 확보

## 데이터 모델 (운영)

### 핵심 테이블
- `uploads`: 업로드 수명주기, 파싱 진단 정보
- `sessions`: 운동 세션 요약
- `exercises`: 세션 단위 운동명/순서
- `sets`: 세트 단위 무게/반복
- `muscle_groups`: 근육 마스터
- `exercise_muscles`: 운동-근육 가중치 매핑
- `user_settings`: 사용자 설정(`bodyweight_kg`)
- `exercise_alias_overrides`: OCR 오인식 보정 규칙
- `recovery_settings`: 부위별 회복시간 설정

### 핵심 불변 조건
- `sessions (1) -> (N) exercises`
- `exercises (1) -> (N) sets`
- 회복 계산에서 seed 세션 날짜 `1970-01-01` 제외
- 매핑 실패 운동은 요청 실패 대신 `unmapped_exercises`로 보고

## API 표면
기준 파일:
- 라우팅 진입점: `cloudflare-api/src/router.ts`
- 동적 경로 패턴: `cloudflare-api/src/route-patterns.ts`
- 핸들러 계층: `cloudflare-api/src/handlers/*`
- 쓰기/계산 워크플로우 서비스: `cloudflare-api/src/services/*`
- Worker export: `cloudflare-api/src/index.ts`

- `GET /api/health`
- `POST /api/uploads`
- `POST /api/ocr/normalize`
- `GET /api/sessions`
- `POST /api/sessions/reset`
- `GET/PATCH/DELETE /api/sessions/:id`
- `POST /api/sessions/:id/clone`
- `GET/POST /api/exercise-aliases`
- `DELETE /api/exercise-aliases/:id`
- `GET /api/recovery`
- `GET/PUT /api/recovery/settings`
- `GET/PUT /api/bodyweight`

## 설계 트레이드오프

### 실시간 회복 계산 vs 사전 계산
- 선택: 실시간 계산(on-demand)
- 장점: 최신 수정/설정이 즉시 반영, 캐시 무효화 문제 축소
- 단점: 요청당 계산 비용 증가
- 판단: 현재 데이터 규모와 설명 가능성 요구를 고려하면 적합

### 세션 단위 운동명 + alias override
- 선택: 세션 단위 raw 이름 저장 + 보정 규칙
- 장점: OCR 노이즈 수용력이 높고 사용자 보정이 빠름
- 단점: 매핑 품질이 운영 과정에 의존
- 판단: 초기/중간 규모에서 유지보수 부담 대비 효율적

### Seed Session(`1970-01-01`) 전략
- 선택: 같은 스키마 안에서 날짜로 시스템 데이터 분리
- 장점: 별도 참조 테이블 없이 단순 유지
- 단점: 관련 쿼리에서 제외 조건 누락 위험

## 실패 처리 원칙
- 입력 오류는 빠르게 검증하고 명시적 `4xx`를 반환
- 부분 데이터 이슈는 가능한 범위에서 계속 처리하고 경고로 노출
- 안전한 경우 hard fail보다 `parse_warnings`, `unmapped_exercises` 경로를 우선
- 모든 응답(성공/실패)에 `x-request-id`를 부여해 요청 단위 추적을 가능하게 유지
- 오류 바디는 `detail`, `code`, `request_id`를 포함해 프론트에서 단계별 오류 메시지를 구성할 수 있게 유지
- 과도한 요청은 `429 rate_limited`와 `retry-after` 헤더로 반환해 클라이언트 재시도 간격을 유도
- 정상/제한 응답 모두 `x-ratelimit-limit`, `x-ratelimit-remaining`, `x-ratelimit-window`를 노출해 클라이언트 관측성을 확보
- rate limit 버킷은 `도메인(scope) + read/write` 단위(`sessions:read`, `sessions:write` 등)로 묶어 경로 우회성 요청을 줄임
- 버킷별 한도/윈도우는 `RATE_LIMIT_MAX_<SCOPE>_<READ|WRITE>`, `RATE_LIMIT_WINDOW_<SCOPE>_<READ|WRITE>` 형식 환경변수로 override 가능
- 라우터는 요청 종료 시 `request_completed` 구조화 로그(`method`, `path`, `status`, `duration_ms`, `request_id`)를 남김

## 문서 신뢰 기준 (Source of Truth)
- API 라우팅: `cloudflare-api/src/router.ts`
- API 오류/응답 계약: `cloudflare-api/src/http.ts`
- 업로드/세션/설정 핸들러: `cloudflare-api/src/handlers/*`
- 업로드/세션/회복 서비스: `cloudflare-api/src/services/*`
- 회복 계산: `cloudflare-api/src/recovery.ts`
- 매핑 규칙: `cloudflare-api/src/exercise-muscles.ts`
- 스키마: `cloudflare-api/migrations/0001_init.sql`, `cloudflare-api/migrations/0002_runtime_tables.sql`
