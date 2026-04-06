# Aggregation Rules

에이전트 결과를 집계하여 최종 판정을 내리는 규칙.

## Step 1: Parse Results

각 에이전트/팀 멤버의 결과에서 다음을 추출:
- `PHASE:` 뒤의 Phase 번호
- `SCORE:` 뒤의 점수 (숫자)
- `ISSUES:` 아래의 이슈 목록 (각 줄이 `- [` 로 시작)

에이전트가 표준 출력 포맷을 따르지 않은 경우:
- 결과 텍스트에서 점수와 이슈를 최선으로 추출
- 파싱 불가 시 해당 Phase 점수 = 0으로 처리하고 경고 표시

에이전트가 완전히 실패하거나 결과를 반환하지 않은 경우:
- 해당 Phase 점수 = 0으로 처리
- 결과에 "⚠ Agent failed for Phase {N}" 경고 표시
- 나머지 Phase 결과로 부분 집계 진행

## Step 2: Aggregate Scores

```
총점 = sum(모든 Phase SCORE)
최대 = 120 (Phase 1: 30 + Phase 2: 30 + Phase 3: 25 + Phase 4: 15 + Phase 5: 20)
```

## Step 3: Merge Issues

1. 모든 에이전트의 ISSUES를 하나의 목록으로 수집
2. severity 순 정렬: CRITICAL > IMPORTANT > MINOR
3. 중복 제거: 같은 Location AND 같은 Problem description = 중복 → 하나만 유지

## Step 4: Determine Verdict

| 총점 | 판정 | 동작 |
|------|------|------|
| ≤ 24 | **PASS** | "플랜 검토 완료. 큰 문제 없음." 보고 후 종료 |
| 25~60 | **NEEDS_REVISION** | Auto-fix + 승인 게이트 (아래 참조) |
| > 60 | **MAJOR_ISSUES** | 전체 이슈 나열, Critical은 사용자 확인 필수 |

## Step 5: Apply Fixes (NEEDS_REVISION / MAJOR_ISSUES)

### Auto-fixable (개별 항목 Score ≤ 5):
- 이슈의 Fix 텍스트를 플랜 파일에 직접 적용
- before/after diff를 표시:
  ```
  Fix #N: {한줄 설명}
  Before: {플랜 원문}
  After: {수정된 텍스트}
  ```

### Requires Approval (개별 항목 Score > 5):
- AskUserQuestion으로 사용자에게 제시:
  ```
  Issue #N: {설명}
  Severity: {CRITICAL|IMPORTANT}
  Current plan says: {플랜 인용}
  Suggested change: {제안 수정}
  Rationale: {사용자 판단이 필요한 이유}
  ```
- 사용자 승인 후 적용

## Final Output Format

```
### Plan Review Summary
- Total Score: {score}/120
- Verdict: {PASS|NEEDS_REVISION|MAJOR_ISSUES}
- Strategy Used: {Sequential|Subagent 2x|Subagent 4x|Team mode}
- Auto-fixed: {count} items
- Requires approval: {count} items

### Issues (by severity)
{집계된 이슈 목록 — severity 순}

### Auto-Applied Fixes
{적용된 자동 수정 diff}

### Pending Approval
{사용자 승인 대기 항목}
```
