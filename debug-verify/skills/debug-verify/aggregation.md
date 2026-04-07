# Verdict Aggregation Rules

Advocate와 Challenger 에이전트의 결과를 종합하여 최종 판정을 내리는 규칙.

## Step 1: Parse Results

### Advocate 결과 파싱:
- `VERDICT:` 뒤의 판정 (CONFIRMED/REFUTED/INCONCLUSIVE)
- `CONFIDENCE:` 뒤의 신뢰도 (HIGH/MEDIUM/LOW)
- `CLAIMS:` 아래의 claim 목록 (각 줄이 `- [` 로 시작)
- `ALTERNATIVE_CAUSES:` 아래의 대안적 원인 목록
- `MANUAL_CHECKS:` 아래의 수동 확인 항목 목록

### Challenger 결과 파싱:
- `CHALLENGE_RESULT:` 뒤의 반박 결과 (REFUTATION_SUCCESS/REFUTATION_FAILED)
- `CHALLENGES:` 아래의 반박 시도 목록
- `ALTERNATIVE_HYPOTHESES:` 아래의 대안 가설 목록
- `MISSED_EVIDENCE:` 아래의 놓친 증거 목록

파싱 실패 시:
- Advocate 결과 파싱 실패 → 전체 검증 실패, 사용자에게 수동 검증 안내
- Challenger 결과 파싱 실패 → Advocate 결과만으로 판정 (Challenger 반박 없이 진행, 경고 표시)

## Step 2: Verdict Consensus

| Advocate VERDICT | Challenger CHALLENGE_RESULT | 최종 판정 | 신뢰도 |
|------------------|----------------------------|-----------|--------|
| CONFIRMED | REFUTATION_FAILED | **CONFIRMED** | HIGH |
| CONFIRMED | REFUTATION_SUCCESS | **INCONCLUSIVE** | LOW |
| REFUTED | REFUTATION_FAILED | **REFUTED** | HIGH |
| REFUTED | REFUTATION_SUCCESS | **INCONCLUSIVE** | LOW |
| INCONCLUSIVE | REFUTATION_FAILED | **INCONCLUSIVE** | MEDIUM |
| INCONCLUSIVE | REFUTATION_SUCCESS | **INCONCLUSIVE** | LOW |

## Step 3: Merge Evidence

1. Advocate의 CLAIMS와 Challenger의 CHALLENGES를 claim별로 매칭
2. 같은 claim에 대한 증거와 반증을 나란히 정리
3. Challenger의 MISSED_EVIDENCE를 반영하여 증거 목록 보강
4. 대안적 원인/가설 병합 (Advocate ALTERNATIVE_CAUSES + Challenger ALTERNATIVE_HYPOTHESES)
5. 중복 제거: 같은 대상 + 같은 근거 = 중복

## Step 4: Determine Action

| 최종 판정 | 동작 |
|-----------|------|
| **CONFIRMED** | 진단 확정. 수정 계획 작성 안내 → plan-review 연동. |
| **REFUTED** | 가설 기각. 대안 가설 제시. 새 디버깅 플랜 작성 유도. |
| **INCONCLUSIVE** | 루프 카운트 확인. 최대 3회 미만이면 재루프. 3회 이상이면 사용자 위임. |

## Loop Management

### 재루프 조건
- 최종 판정이 INCONCLUSIVE
- 현재 loop_count < 3

### 재루프 시 에이전트 프롬프트 조정
- Advocate에게 이전 라운드의 INCONCLUSIVE claim과 Challenger의 MISSED_EVIDENCE 전달
- Challenger에게 이전 라운드의 ALTERNATIVE_HYPOTHESES와 새 Advocate 결과 전달
- 이전 라운드에서 시도한 도구/쿼리 목록을 전달하여 중복 탐색 방지

### 루프 종료 조건
1. 최종 판정이 CONFIRMED 또는 REFUTED
2. loop_count >= 3
3. 이전 루프와 동일한 결과 (교착 상태)

### 교착 상태 감지
- 현재 라운드의 CLAIMS 판정 분포가 이전 라운드와 동일하면 교착으로 판정
- 교착 시 즉시 루프 종료, 사용자에게 판단 위임

## Final Report Format

report-template.md 참조.
