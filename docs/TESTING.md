# 테스트 및 검증 가이드 (Cloudflare 운영 런타임)

## 개요
이 문서는 현재 운영 경로에 대한 테스트 전략을 설명합니다.

- API: `cloudflare-api`
- Frontend: `frontend`

`backend/tests`는 레거시 참고용입니다.

## 1) 실행 명령

### API 테스트 (Vitest)
```bash
cd /Users/moltbot/Projects/health-recovery-tracker/cloudflare-api
npm test
```

### API 타입체크
```bash
cd /Users/moltbot/Projects/health-recovery-tracker/cloudflare-api
npm run typecheck
```

### Frontend 타입체크
```bash
cd /Users/moltbot/Projects/health-recovery-tracker/frontend
npm run typecheck
```

### Frontend 빌드 검증
```bash
cd /Users/moltbot/Projects/health-recovery-tracker/frontend
npm run build
```

## 2) 커버리지 맵 (Cloudflare API)
| 테스트 파일 | 주요 리스크 |
|---|---|
| `test/parser.test.ts` | OCR 텍스트 파싱 품질, 요약/세트 추출 일관성 |
| `test/ocr-normalize.test.ts` | 정규화 텍스트 포맷 안정성, 경고 처리 |
| `test/upload-policy.test.ts` | `needs_review` 업로드 허용/차단 정책 |
| `test/session-mutations.test.ts` | 세션 수정 payload 정규화, 볼륨 재계산 |
| `test/exercise-muscles.test.ts` | 운동-근육 매핑 정확도, 맨몸운동 무게 추론 |
| `test/recovery-model.test.ts` | 기본 회복시간 설정값 규칙 |
| `test/recovery-timing.test.ts` | 기준시각/잔여회복시간 계산 안정성 |
| `test/trainer-advice.test.ts` | 추천/휴식 메시지 생성 로직 |
| `test/route-patterns.test.ts` | 동적 라우트 UUID 매칭 안정성 |
| `test/api-integration.test.ts` | Worker 라우팅/바인딩 + D1 + multipart 업로드 + 에러 계약(`detail/code/request_id`) + `429/retry-after` + recovery 결정성 회귀 |

## 3) 리스크별 검증 전략
### Risk A: OCR 입력 품질 편차
- 자동화: parser/normalize 테스트
- 수동: Upload 화면에서 OCR 결과 편집 후 업로드 가능 여부 확인

### Risk B: 매핑 누락으로 인한 계산 왜곡
- 자동화: exercise-muscles 테스트
- 런타임 안전장치: `unmapped_exercises` 경고 노출

### Risk C: 회복시간 계산의 시간축 오류
- 자동화: recovery-timing 테스트
- 수동: `reference_at` 변경 시 `remaining_hours` 변화 확인

### Risk D: 세션 편집 후 볼륨 불일치
- 자동화: session-mutations 테스트
- 수동: 세션 상세 수정 후 Recovery 반영 확인

### Risk E: 일시적 네트워크 오류로 조회 실패
- 프론트 동작: `Sessions/SessionDetail/Recovery` 조회는 지수 백오프로 최대 2회 자동 재시도
- 서버가 `Retry-After` 헤더를 보내면 해당 값(초/HTTP-date)을 재시도 대기시간 하한으로 반영
- API는 `x-ratelimit-limit`, `x-ratelimit-remaining`, `x-ratelimit-window` 헤더를 내려 클라이언트/운영 관측을 지원
- API는 `RATE_LIMIT_MAX_<SCOPE>_<READ|WRITE>`, `RATE_LIMIT_WINDOW_<SCOPE>_<READ|WRITE>` override가 있으면 버킷별 한도/윈도우를 다르게 반환
- 프론트는 남은 한도가 임계치 이하일 때(기본 5회 또는 10%) 사전 경고 문구를 표시
- 프론트는 남은 한도가 0에 도달하면 해당 조회 버튼에 윈도우 기반 쿨다운(초 단위)을 적용
- 수동: API를 잠시 끊었다 복구했을 때 재시도 안내 문구 후 자동 회복되는지 확인

## 4) 수동 E2E 스모크 시나리오
1. Upload 화면에서 이미지 선택 -> OCR -> AI 정리 -> Upload
2. Sessions 화면에서 생성된 세션 확인
3. Session Detail에서 세트 값 수정 후 저장
4. Recovery 화면에서 해당 부위 `fatigue/recovery/contributors` 변화 확인
5. Sessions에서 alias override 등록 후 재업로드, unmapped 감소 확인

## 5) API 계약 스모크 체크 (curl)
```bash
# health
curl http://127.0.0.1:8787/api/health

# sessions list
curl "http://127.0.0.1:8787/api/sessions?limit=5"

# recovery
curl "http://127.0.0.1:8787/api/recovery?days=7"
```

## 6) 레거시 테스트 위치
- `backend/tests/*`는 과거 FastAPI 경로 검증 자료입니다.
- 운영 회귀 판단 기준은 `cloudflare-api/test/*` + API 타입체크 + 프론트 타입체크/빌드 결과입니다.

## 7) 코드-문서 정합성 체크리스트
문서 갱신 시 아래 파일을 기준으로 대조합니다.

- API 라우팅: `cloudflare-api/src/router.ts`
- API 오류/응답 계약: `cloudflare-api/src/http.ts`
- 업로드/세션/설정 핸들러: `cloudflare-api/src/handlers/*`
- 업로드/세션/회복 서비스: `cloudflare-api/src/services/*`
- 회복 계산: `cloudflare-api/src/recovery.ts`
- 세션 정규화: `cloudflare-api/src/session-mutations.ts`
- 운동 매핑/맨몸 계산: `cloudflare-api/src/exercise-muscles.ts`
- 스키마: `cloudflare-api/migrations/0001_init.sql`, `cloudflare-api/migrations/0002_runtime_tables.sql`

이 체크리스트를 유지하면 문서-코드 불일치를 줄일 수 있습니다.
