# Aggregation Rules

에이전트 결과를 집계하여 최종 판정을 내리는 규칙.

## Step 1: Parse Results

각 에이전트/팀 멤버의 결과에서 다음을 추출:
- `PHASE:` 뒤의 Phase 번호
- `SCORE:` 뒤의 점수 (숫자)
- `ISSUES:` 아래의 이슈 목록 (각 줄이 `- [` 로 시작)

각 이슈에서 추출할 필드:
- severity (CRITICAL/IMPORTANT/MINOR)
- 설명, Score, Location, Evidence
- **`FIX_CANDIDATES` 블록**: 이슈 다음에 들여쓰기된 `  - [recommended|alt] {설명} | Apply: {...} | Trade-off: {...}` 형태의 후보 목록

**하위호환 파싱 (구 포맷 폴백):**
- 이슈 라인에 `| Fix: {...} | Auto-fixable: {yes|no}` 단일 필드가 있으면 길이 1짜리 `FIX_CANDIDATES`로 자동 변환:
  - `[recommended] (legacy) | Apply: {Fix 원문} | Trade-off: (unknown)` 으로 변환
  - `Auto-fixable: yes`는 무시 (이제 Score로만 판정)
- 신 포맷과 구 포맷이 동시에 존재하면 `FIX_CANDIDATES` 블록 우선.

에이전트가 표준 출력 포맷을 따르지 않은 경우:
- 결과 텍스트에서 점수와 이슈를 최선으로 추출
- 파싱 불가 시 해당 Phase 점수 = 0으로 처리하고 경고 표시
- 이슈는 있지만 `FIX_CANDIDATES`/`Fix:` 모두 누락된 경우: 길이 0짜리 후보로 처리 → Step 5에서 "수정 제안 없음"으로 분류, 자동 적용 금지.

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
   - **중복 이슈의 `FIX_CANDIDATES`는 union:** 서로 다른 에이전트가 제안한 후보를 합치되, 같은 `Apply` 텍스트는 제거. `[recommended]` 마커가 여러 개 붙은 동일 후보는 `[recommended]` 쪽 유지.
   - Union 후 후보가 5개를 초과하면 Step 5 직전에 상위 4개로 절단 (규칙: `[recommended]` 우선, 그 다음 원래 출력 순서).

## Step 4: Determine Verdict

| 총점 | 판정 | 동작 |
|------|------|------|
| ≤ 24 | **PASS** | "플랜 검토 완료. 큰 문제 없음." 보고 후 종료 |
| 25~60 | **NEEDS_REVISION** | Auto-fix + 승인 게이트 (아래 참조) |
| > 60 | **MAJOR_ISSUES** | 전체 이슈 나열, Critical은 사용자 확인 필수 |

## Step 5: Apply Fixes (NEEDS_REVISION / MAJOR_ISSUES)

각 이슈마다 `len(FIX_CANDIDATES)` 값과 Score에 따라 3-way 분기:

### Case A: 단일 후보 + Score ≤ 5 (auto-fix)
- 후보의 `Apply` 텍스트를 플랜 파일에 직접 적용
- before/after diff를 표시:
  ```
  Fix #N: {한줄 설명}
  Before: {플랜 원문}
  After: {수정된 텍스트}
  Applied candidate: [recommended] {후보 설명}
  ```

### Case B: 단일 후보 + Score > 5 (승인 게이트)
- AskUserQuestion(multiSelect: false)으로 사용자에게 제시:
  ```
  Issue #N: {설명}
  Severity: {CRITICAL|IMPORTANT}
  Current plan says: {플랜 인용}
  Suggested change: {후보의 Apply}
  Trade-off: {후보의 Trade-off}
  Rationale: {사용자 판단이 필요한 이유}
  ```
- 옵션: `["적용 (Recommended)", "적용 안 함"]`
- 사용자 승인 후 적용.

### Case C: 후보 2개 이상 (severity 무관, 항상 AskUserQuestion)
- AskUserQuestion(multiSelect: false)으로 후보 중 하나를 선택하게 함:
  - 질문: `"Issue #N ({설명})에 대해 어떤 수정안을 적용할까요?"`
  - 옵션 리스트 (최대 4개, 마지막 슬롯은 항상 "모두 건너뛰기"):
    1. `[recommended]` 후보 → label `"{후보 설명} (Recommended)"`
    2. `[alt]` 후보(들) → label `"{후보 설명}"`
    3. "모두 건너뛰기" → 이 이슈는 미수정 상태로 보고서에 남김
  - 각 옵션의 description에 `Apply` 요약과 `Trade-off` 표기.
- 후보가 5개 이상이면 `[recommended]` 우선 + 원 출력 순서로 상위 3개 + "모두 건너뛰기" (총 4개). 절단된 후보는 질문 description에 `"[alt] 외 {N}건 생략"`으로 명시.
- 사용자가 선택한 후보의 `Apply`를 플랜 파일에 반영. "모두 건너뛰기" 선택 시 미수정.

### 수정 제안 없음 (후보 0개):
- 자동 적용 금지. 보고서에 `Pending (no fix proposed)` 섹션으로 별도 나열하여 사용자 판단 유도.

**Multi-Iteration / Deep Review 경로에도 동일 3-way 분기 적용.** Deep Review 최종 집계 후 Step 5를 실행할 때도 `len(FIX_CANDIDATES)` 기반 분기가 일관되게 동작.

## Final Output Format

```
### Plan Review Summary
- Total Score: {score}/120
- Verdict: {PASS|NEEDS_REVISION|MAJOR_ISSUES}
- Strategy Used: {Sequential|Subagent 2x|Subagent 4x|Team mode}
- Auto-fixed: {count} items
- User-selected fixes: {count} items
- Requires approval: {count} items
- Skipped by user: {count} items
- Pending (no fix proposed): {count} items

### Issues (by severity)
{집계된 이슈 목록 — severity 순}

### Auto-Applied Fixes
{적용된 자동 수정 diff}

### User-Selected Fixes
{사용자가 다중 후보 중 선택한 수정 내용과 diff}

### Pending Approval
{사용자 승인 대기 항목}

### Skipped by User
{사용자가 "모두 건너뛰기" 선택한 이슈 — 미수정 상태로 보고서에 남김}
```

## Multi-Iteration Aggregation Rules

Iterative Deep Re-Review (Step 5)에서 여러 패스의 결과를 집계하는 규칙.

### Issue Identity Matching

두 이슈가 "동일"한지 판정:
- **같은 Phase 번호** AND **같은 Location** (또는 겹치는 Location) = 동일 이슈
- Problem description은 보조 매칭 기준 (같은 카테고리 + 같은 대상 = 유사)
- 동일 이슈로 판정되면 `FIX_CANDIDATES`는 Step 3의 union 규칙을 따라 병합.

### Issue Status Classification

| Status | 조건 | 처리 |
|--------|------|------|
| `confirmed` | 이전 패스에 존재 + 재검증에서 CONFIRMED | 최종 보고서에 포함, 점수 반영 |
| `false_positive` | 이전 패스에 존재 + 재검증에서 FALSE_POSITIVE로 명시적 반박 | 최종 보고서의 "False Positives Removed" 섹션에 이동, 점수 차감 |
| `unverified` | 이전 패스에 존재 + 재검증에서 언급 안 됨 | 최종 보고서에 `[unverified]` 태그 붙여 포함, 점수 유지 |
| `new` | 재검증에서 새로 발견됨 (Status: NEW) | 최종 보고서에 `[deep-review]` 태그 붙여 포함, 점수 반영 |

### Score Computation

- **최종 점수:** 마지막 iteration의 per-phase 점수를 사용
- **Skip된 Phase:** 이전 iteration에서 0점이어서 skip된 Phase는 0점 유지
- **Lightweight Phase:** 확인 결과에 따라 조정된 점수 사용 (false positive 제거 시 감소)
- **False positive 처리:** 재검증에서 false positive로 판정된 이슈의 점수는 해당 Phase 총점에서 차감

### Pass History Tracking

각 iteration의 per-phase 점수를 기록하여 Score Progression에 사용:
```
pass_history = [
  { pass: 1, scores: { p1: N, p2: N, p3: N, p4: N, p5: N }, total: N },
  { pass: 2, scores: { p1: N, p2: N, p3: N, p4: N, p5: N }, total: N },
  ...
]
```

## Deep Review Final Output Format

Iterative Deep Re-Review가 실행된 경우 아래 확장 형식을 사용:

```
### Plan Review Summary (Deep Review)
- Total Score: {최종 총점}/120
- Verdict: {PASS|NEEDS_REVISION|MAJOR_ISSUES}
- Strategy Used: {초기 전략}
- Review Depth: {N} passes (initial + {N-1} deep re-review)
- Score Progression: Pass 1: {s1} → Pass 2: {s2} [→ Pass 3: {s3}]
- Issues Confirmed: {count} | False Positives Removed: {count} | New Issues Found: {count}
- Auto-fixed: {count} items
- User-selected fixes: {count} items
- Requires approval: {count} items
- Skipped by user: {count} items
- Pending (no fix proposed): {count} items

### Score Breakdown by Phase
| Phase | Pass 1 | Pass 2 | Pass 3 | Final |
|-------|--------|--------|--------|-------|
| 1. Directive | {s} | {s} | {s/-} | {s} |
| 2. Structure | {s} | {s/skipped} | {s/-} | {s} |
| 3. Completeness | {s} | {s/skipped} | {s/-} | {s} |
| 4. Risk | {s} | {s/skipped} | {s/-} | {s} |
| 5. Security | {s} | {s/skipped} | {s/-} | {s} |

### Issues (by severity)
{confirmed 이슈 먼저}
{[deep-review] 태그 이슈 다음}
{[unverified] 태그 이슈 마지막}

### False Positives Removed
{제거된 이슈 + 이유 목록}

### Auto-Applied Fixes
{적용된 자동 수정 diff}

### User-Selected Fixes
{사용자가 다중 후보 중 선택한 수정 내용과 diff}

### Pending Approval
{사용자 승인 대기 항목}

### Skipped by User
{사용자가 "모두 건너뛰기" 선택한 이슈}
```

Deep Re-Review가 실행되지 않은 경우 (진입 조건 미충족), 기존 Final Output Format을 그대로 사용.
