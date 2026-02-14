# Branch Protection Guide (GitHub)

`main` 브랜치 품질 게이트를 실제로 강제하기 위한 설정 가이드입니다.

## 0) 5분 빠른 적용 체크리스트
아래 3가지만 맞추면 최소 운영 기준이 적용됩니다.

- `Require a pull request before merging`
- `Require status checks to pass before merging`
- Required status checks에 아래 3개 선택
  - `Cloudflare API`
  - `Frontend`
  - `PR Template Check`

## 1) 보호 규칙 생성
1. GitHub 저장소 → `Settings` → `Branches`
2. `Add branch protection rule`
3. `Branch name pattern`에 `main` 입력

## 2) 필수 권장 옵션
- `Require a pull request before merging`
- `Require approvals` (최소 1)
- `Dismiss stale pull request approvals when new commits are pushed`
- `Require conversation resolution before merging`
- `Require status checks to pass before merging`
- `Require branches to be up to date before merging`

## 3) Required status checks (현재 워크플로우 기준)
아래 체크를 필수로 선택합니다.

- `Cloudflare API`
- `Frontend`
- `PR Template Check`

위 3개는 각각 다음 워크플로우에서 생성됩니다.

- `.github/workflows/ci.yml`
- `.github/workflows/pr-governance.yml`

체크 이름이 다르게 보일 경우:
- Actions 화면에서 최근 PR 실행의 Job 이름을 확인해 동일하게 선택합니다.
- 저장소 설정에 이전 워크플로우 캐시가 남아 있으면 최신 실행 1회를 완료한 뒤 다시 선택합니다.

## 4) 운영 팁
- Draft PR 단계에서는 체크리스트 미완료가 허용되도록 `PR Template Check`가 설계되어 있습니다.
- Ready for review로 전환하면 필수 체크리스트 항목이 모두 `[x]`여야 통과합니다.
- CI 실패 PR은 `main` 병합이 차단되므로, 로컬에서 먼저 아래 명령을 실행하는 것을 기본 루틴으로 유지합니다.

```bash
cd /Users/moltbot/Projects/health-recovery-tracker/cloudflare-api
npm run typecheck
npm test

cd /Users/moltbot/Projects/health-recovery-tracker/frontend
npm run typecheck
npm run build
```
