# 회복 알고리즘 노트 (Cloudflare 운영 런타임)

## 범위
이 문서는 현재 운영 코드 기준 회복 계산 로직을 설명합니다.

- `cloudflare-api/src/recovery.ts`
- `cloudflare-api/src/exercise-muscles.ts`

레거시 FastAPI 구현이 아니라, 위 파일의 실제 동작을 기준으로 작성합니다.

## 1) 핵심 입력값
- 기간 조건: `days` 또는 `from/to`
- 기준 시각: `reference_at` (기본값: 현재 시각)
- 체중: `user_settings.bodyweight_kg` (기본값: 70)
- 근육별 회복시간: `recovery_settings` (없으면 코드 기본값 사용)

## 2) 기간 해석
1. `toDate` 결정
- `to`가 있으면 `toT23:59:59.999Z`
- 없으면 현재 시각

2. `fromDate` 결정
- `from`이 있으면 `fromT00:00:00.000Z`
- 없으면 `toDate - days`

3. 유효성 검사
- `fromDate > toDate` 이면 `invalid_time_window`
- `reference_at` 파싱 실패면 `invalid_reference_time`

중요 포인트:
- `remaining_hours` 계산은 윈도우 끝이 아니라 `reference_at`을 기준으로 합니다.

## 3) 데이터 선택
- `muscle_groups`에서 근육 목록 로드
- `recovery_settings` + 코드 기본값으로 회복시간 결정
- 세션은 기간 내에서 조회하되 seed 날짜 `1970-01-01` 제외

기간 내 세션이 없으면:
- 모든 근육 `recovery=100`, `fatigue=0`, `status=green`
- `remaining_hours=0`, `next_train_at=null`

## 4) 운동 볼륨 계산
세트 단위 계산:

```text
effective_weight_kg = inferEffectiveWeightKg(raw_name, weight_kg, bodyweight_kg)
set_volume = effective_weight_kg x reps
exercise_volume = sum(set_volume)
```

`inferEffectiveWeightKg` 규칙:
- 일반 운동: 입력 무게가 있으면 해당 무게 사용
- 맨몸 계열(예: 풀업):
- 무게 미입력 -> `bodyweight x factor`
- 무게 입력 -> `(bodyweight x factor) + 추가중량`
- 맨몸 규칙이 없고 무게도 없으면 0 처리

## 5) 운동-근육 매핑 우선순위
운동 하나에 대해 아래 순서로 매핑을 찾습니다.

1. `exercise_id` 기준 직접 매핑(`exercise_muscles`)
2. 정규화된 `raw_name` 기준 fallback 매핑
3. `exercise-muscles.ts` 정적 매핑
4. 모두 실패하면 `unmapped_exercises` 카운트만 올리고 계속 진행

의도:
- 매핑이 일부 누락되어도 회복 API가 전체 실패하지 않게 유지

## 6) 시간 감쇠와 피로도 누적
세션 기준 시각:
- `started_at`이 유효하면 사용
- 아니면 `dateT12:00:00.000Z` 사용

경과 시간:

```text
deltaHours = max(0, referenceTime - sessionReference)
```

감쇠식:

```text
k = ln(5) / rest_hours
decay = exp(-k x deltaHours)
```

운동-근육 기여도:

```text
contribution = exercise_volume x mapping_weight x decay
fatigue_raw[muscle] += contribution
```

해석:
- `deltaHours = rest_hours`일 때 감쇠 계수는 `0.2`(20% 잔존)입니다.

## 7) 회복도, 상태, 타이밍 계산
정규화:

```text
fatigue = min(100, fatigue_raw / 100)
recovery = clamp(100 - fatigue, 0, 100)
```

상태 임계치:
- `green`: `recovery >= 70`
- `yellow`: `40 <= recovery < 70`
- `red`: `recovery < 40`

타이밍 필드:

```text
last_trained_at = 해당 근육에 마지막으로 기여한 세션 시각
next_train_at = last_trained_at + rest_hours
remaining_hours = max(0, next_train_at - referenceTime)
```

설명 가능성 필드:
- `contributors`: 감쇠 기여도 기준 상위 2개 운동명
- `unmapped_exercises`: 매핑 실패 운동명과 발생 횟수
- `trainer_advice`: 추천/휴식 요약 메시지

## 8) 오류 및 경계 상황
### 입력 오류(주요 400)
- `invalid_time_window`
- `invalid_reference_time`

### 스키마 준비 오류(주요 500)
- 설정/alias 관련 런타임 테이블이 없으면 `schema_not_ready`

### 데이터 품질 경계
- `started_at` 누락/오류 시 정오 기준으로 fallback
- 매핑 실패는 경고 경로(`unmapped_exercises`)로 처리
- 유효 볼륨이 0이면 해당 운동은 피로도에 실질 기여 없음

## 9) 의사코드 요약
```text
resolveWindow(options)
load muscles + rest settings
load sessions in range (exclude seed)
if no sessions: return all-100 response

load exercises + sets
build exerciseVolumeById
resolve mapping per exercise (direct -> fallback -> static)
for each mapped exercise-muscle:
  delta = hours(reference - session_time)
  decay = exp(-(ln5/restHours)*delta)
  fatigueRaw += volume * weight * decay
  contributors += same contribution
  update last_trained_at

for each muscle:
  fatigue = min(100, fatigueRaw/100)
  recovery = 100 - fatigue
  status by 70/40 thresholds
  compute next_train_at, remaining_hours

build trainer_advice + unmapped_exercises and return
```

## 10) 검증 앵커 테스트
- `cloudflare-api/test/recovery-model.test.ts`
- `cloudflare-api/test/recovery-timing.test.ts`
- `cloudflare-api/test/session-mutations.test.ts`
- `cloudflare-api/test/exercise-muscles.test.ts`
