# Verdict Aggregation Rules

Advocate와 Challenger 에이전트의 결과를 종합하여 최종 판정을 내리는 규칙.

## Step 1: Parse Results

### Advocate 결과 파싱:
- `VERDICT:` 뒤의 판정 (CONFIRMED/REFUTED/INCONCLUSIVE)
- `CONFIDENCE:` 뒤의 신뢰도 (HIGH/MEDIUM/LOW)
- `CLAIMS:` 아래의 claim 목록 (각 줄이 `- [` 로 시작)
- `ALTERNATIVE_CAUSES:` 아래의 대안적 원인 목록
- `FIX_CANDIDATES:` 아래의 수정 방향 후보 목록 (CONFIRMED claim에 한해 필수, 각 줄이 `- [recommended]` 또는 `- [alt]`로 시작)
- `MANUAL_CHECKS:` 아래의 수동 확인 항목 목록

### Challenger 결과 파싱:
- `CHALLENGE_RESULT:` 뒤의 반박 결과 (REFUTATION_SUCCESS/REFUTATION_FAILED)
- `CHALLENGES:` 아래의 반박 시도 목록
- `ALTERNATIVE_HYPOTHESES:` 아래의 대안 가설 목록
- `FIX_CRITIQUE:` (선택) Advocate FIX_CANDIDATES에 대한 반박/보강 (후보 trade-off 검증, 새 후보 제안)
- `MISSED_EVIDENCE:` 아래의 놓친 증거 목록

### 하위호환:
- Advocate가 구 `NEXT_ACTIONS:` 블록만 반환하면 `FIX_CANDIDATES:` 없음으로 처리 (`len == 0` 분기 적용 — Step 5.5 스킵, 기존 "수정 계획 작성" 안내만 출력).
- Advocate가 단일 next action만 제시한 경우, 길이 1짜리 `FIX_CANDIDATES`로 변환 후 Step 5.5의 단일 후보 승인 게이트로 진입한다.

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
6. **FIX_CANDIDATES 병합 (CONFIRMED claim에 한함):**
   - Advocate의 `FIX_CANDIDATES` + Challenger의 `FIX_CRITIQUE`에서 제안된 새 후보를 union
   - 중복 후보(같은 `Apply` 텍스트)는 제거. `[recommended]`가 여러 개면 유지하되 첫 번째만 최종 `[recommended]`로 표기, 나머지는 `[alt]`로 재분류
   - Union 후 후보가 5개를 초과하면 `[recommended]` 우선 + 원 순서로 상위 4개로 절단. 절단된 후보는 보고서에 `"[alt] 외 N건 생략"`으로 명시

## Step 4: Determine Action

| 최종 판정 | 동작 |
|-----------|------|
| **CONFIRMED** | 진단 확정. 후보 개수 분기 (아래) → 수정 계획 작성 안내 → plan-review 연동. |
| **REFUTED** | 가설 기각. 대안 가설 제시. 새 디버깅 플랜 작성 유도. `FIX_CANDIDATES` 무시. |
| **INCONCLUSIVE** | 루프 카운트 확인. 최대 3회 미만이면 재루프. 3회 이상이면 사용자 위임. `FIX_CANDIDATES` 무시. |

### CONFIRMED 시 후보 개수 분기

| `len(FIX_CANDIDATES)` | 동작 |
|-----------------------|------|
| **≥ 2** | SKILL.md **Step 5.5 "Fix Direction Selection"**으로 분기하여 AskUserQuestion으로 사용자 선택 (옵션: 후보들 + "모두 건너뛰기"). 선택 결과(또는 `"skipped"`)를 `selected_fix_direction`에 저장하고 Step 6(Final Report)의 "Selected Fix Direction" 필드에 주입. |
| **== 1** | SKILL.md **Step 5.5**에서 단일 후보 승인 게이트 AskUserQuestion 호출 (옵션: "적용 (Recommended)" / "적용 안 함"). "적용" 시 후보를 `selected_fix_direction`에 저장, "적용 안 함" 시 `"skipped"` 저장. 하위호환 폴백 후보(`(legacy)` 마커, NEXT_ACTIONS 변환 등) 포함. |
| **== 0** | 기존 동작. "수정 계획을 작성하세요" 안내만 출력, Selected Fix Direction 없음. |

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
