# 아키텍처 지도 (초급 개발자용)

## 문서 목적
한 줄 결론: 이 문서는 컴포넌트 경계, 데이터 흐름, 설계 의도를 "구조" 중심으로 보여줍니다.

- 런타임 기준: Cloudflare (`frontend` + `cloudflare-api`)
- 레거시(`backend`)는 운영 경로에서 제외

## 1) 구성요소와 책임 경계
| 구성요소 | 핵심 책임 | 입출력 |
|---|---|---|
| Frontend (`frontend`) | 사용자 입력/수정, API 호출, 결과 시각화 | 입력: 파일/텍스트/설정값, 출력: HTTP 요청 |
| API Worker (`cloudflare-api/src/router.ts`, `cloudflare-api/src/handlers/*`) | 요청 라우팅/검증, 파싱/정규화, DB/R2 저장, 회복 계산 응답 | 입력: HTTP, 출력: JSON |
| D1 | 세션/운동/세트/설정 데이터 영속화 | 입력: SQL, 출력: 조회 결과 |
| R2 | 업로드 원본 파일 저장 | 입력: 파일 바이트, 출력: 스토리지 키 |

핵심 경계:
- 프론트는 계산 로직을 가지지 않고 API 응답을 렌더링
- API는 상태 저장과 계산을 모두 담당
- D1은 정형 데이터, R2는 바이너리 파일 저장 전용

## 2) 요청-응답 시퀀스
### 업로드 경로 (`POST /api/uploads`)
1. Frontend가 이미지 파일 + `ocr_text_raw` 전송
2. Worker가 파일을 R2에 저장하고 `uploads` 레코드 생성
3. OCR 텍스트 파싱 후 `sessions`, `exercises`, `sets` 저장
4. 업로드 상태를 `parsed` 또는 `failed`로 갱신
5. Frontend는 업로드 결과와 경고(`parse_warnings`) 표시

### 회복 조회 경로 (`GET /api/recovery`)
1. Frontend가 기간/기준시각 파라미터로 조회
2. Worker가 세션/운동/세트/근육/설정 데이터를 로드
3. 근육별 피로도와 회복도 계산
4. `contributors`, `remaining_hours`, `next_train_at`, `trainer_advice` 생성
5. Frontend가 근육 카드와 추천 메시지로 표시

```mermaid
flowchart LR
  A["sessions 조회 (기간 필터)"] --> B["exercises / sets 로드"]
  B --> C["exercise-mapping 결정\n(직접 매핑 -> 이름 fallback -> 정적 매핑)"]
  C --> D["세트 볼륨 계산\n(effective weight x reps)"]
  D --> E["시간 감쇠 적용\nexp(-(ln5/rest_hours) x deltaHours)"]
  E --> F["근육별 fatigue/recovery 계산"]
  F --> G["status/remaining_hours/next_train_at 산출"]
  G --> H["contributors + trainer_advice 응답"]
```

## 3) 데이터 모델 최소 ERD 설명
### 핵심 운영 테이블
- `uploads`: 업로드 메타/상태/오류/원문 OCR
- `sessions`: 날짜/시작시각/요약 지표
- `exercises`: 세션 내 운동명과 순서
- `sets`: 세트별 무게/횟수
- `muscle_groups`: 근육 코드 마스터
- `exercise_muscles`: 운동-근육 가중치 매핑
- `recovery_settings`: 부위별 회복시간 설정
- `user_settings`: 사용자 설정(체중 등)
- `exercise_alias_overrides`: OCR 오인식 보정 규칙

### 관계 구조
- 한 세션은 여러 운동을 가진다 (`sessions 1:N exercises`)
- 한 운동은 여러 세트를 가진다 (`exercises 1:N sets`)
- 운동과 근육은 가중치 기반 다대다 구조 (`exercise_muscles`)

### Seed Session (`1970-01-01`)의 역할
- 초기 운동-근육 매핑을 시스템 데이터로 유지
- 회복 계산 시에는 제외해 실제 사용자 데이터 오염 방지

## 4) 설계 의도와 트레이드오프
### A. 회복 계산을 저장하지 않고 실시간 계산한 이유
- 선택: On-demand 계산 (`GET /api/recovery` 시 계산)
- 장점: 최신 설정값(체중/rest_hours)이 즉시 반영됨
- 단점: 요청당 계산 비용 증가
- 현재 판단: 데이터 규모가 작고 설명 가능성이 중요해 실시간 계산이 적합

### B. Alias Override를 도입한 이유
- 선택: 사용자가 오인식을 직접 보정할 수 있는 운영 장치 제공
- 장점: OCR 품질 한계를 제품 운영으로 보완 가능
- 단점: 수동 관리 포인트가 생김
- 현재 판단: 초급 사용자 실제 체감 품질을 빠르게 높이는 데 유리

### C. Seed Session 분리 전략
- 선택: 시스템 데이터를 일반 세션 테이블 안에 두되 날짜로 분리
- 장점: 테이블 수 증가 없이 참조 데이터 유지
- 단점: 쿼리에서 제외 조건을 항상 신경 써야 함
- 현재 판단: 현재 규모에서 단순성과 유지보수 균형이 좋음

## 5) 실패 모드와 안전장치
| 실패/오류 | 주 원인 | 시스템 동작 | 사용자 체감 |
|---|---|---|---|
| `invalid_json` | JSON body 파싱 실패 | 400 반환 | 잘못된 요청 즉시 피드백 |
| `invalid_time_window` | from > to | 400 반환 | 기간 입력 수정 필요 |
| `invalid_reference_time` | 기준 시각 포맷 오류 | 400 반환 | 기준 시각 재입력 필요 |
| `invalid_bodyweight_kg` | 체중 범위(30~250) 위반 | 400 반환 | 값 보정 필요 |
| `schema_not_ready` | 런타임 테이블 미적용 | 500 반환 | 마이그레이션 필요 신호 |
| `summary_date_missing` | OCR 파싱에 날짜 누락 | 업로드 `failed` 처리 | 텍스트 보정 후 재업로드 |
| `unmapped_exercises` | 운동명 매핑 실패 | 계산은 계속, 경고만 반환 | 결과는 나오지만 정확도 경고 |

## 코드-문서 대조 체크리스트
- 엔드포인트 기준: `cloudflare-api/src/router.ts`
- 오류/응답 계약 기준: `cloudflare-api/src/http.ts`
- 회복 모델 기준: `cloudflare-api/src/recovery.ts`
- 매핑 규칙 기준: `cloudflare-api/src/exercise-muscles.ts`
- 스키마 기준: `cloudflare-api/migrations/0001_init.sql`, `cloudflare-api/migrations/0002_runtime_tables.sql`

문서 갱신 시 위 파일과 먼저 대조하면 문서 노후화를 줄일 수 있습니다.
