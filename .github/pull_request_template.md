## 변경 요약
- 무엇을 바꿨는지 3줄 이내로 작성

## 배경 / 문제
- 왜 이 변경이 필요한지 작성

## 검증
- 실행한 명령과 결과를 작성
- 아래 형식으로 작성:
  - `cloudflare-api`: `npm run typecheck` → ✅ 통과
  - `cloudflare-api`: `npm test` → ✅ 통과
  - `frontend`: `npm run typecheck` → ✅ 통과
  - `frontend`: `npm run build` → ✅ 통과

## 체크리스트
- [ ] Cloudflare API 타입체크 통과 (`npm run typecheck`)
- [ ] Cloudflare API 테스트 통과 (`npm test`)
- [ ] Frontend 타입체크 통과 (`npm run typecheck`)
- [ ] Frontend 빌드 통과 (`npm run build`)
- [ ] API 에러 계약(`detail`, `code`, `request_id`) 영향 검토
- [ ] 문서 영향(README/docs) 반영 여부 검토

## 롤백 계획
- 장애 시 되돌리는 절차를 1~2줄로 작성
