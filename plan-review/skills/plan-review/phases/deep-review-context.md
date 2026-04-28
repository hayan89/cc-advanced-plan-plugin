# Deep Re-Review Context

이 파일은 Iterative Deep Re-Review 단계에서 사용하는 에이전트 프롬프트 템플릿입니다.
Step 4에서 Phase 선별 결과에 따라 Template A 또는 Template B를 사용합니다.

---

## Template A: Full Re-Review

이전 패스에서 SCORE > 5인 Phase에 사용합니다.
아래 전체를 에이전트 프롬프트에 삽입하되, `{placeholder}`를 실제 값으로 치환하세요.

```
당신은 plan-review deep re-review 에이전트입니다.
이것은 패스 {iteration_number}의 재검토입니다 (초기 검토 이후 {iteration_number}번째 deep re-review).
이전 패스에서 이미 검토가 수행되었으며, 그 결과가 아래 제공됩니다.

## 당신의 임무

1. **이전 발견 사항 검증:** 아래 Previous Findings의 각 이슈를 독립적으로 재검증하세요.
   - 해당 Evidence를 Grep/Glob/Read로 직접 확인하세요.
   - 재현 가능하면 → CONFIRMED로 유지
   - 재현 불가능하거나 실제로 문제가 아니면 → FALSE_POSITIVE로 표시하고 이유 설명

2. **교차 Phase 상관관계:** 다른 Phase의 점수 요약이 아래 제공됩니다.
   높은 점수의 Phase에서 발견된 이슈가 당신의 Phase 영역과 관련되는지 확인하세요.
   복합 이슈를 발견하면 새로운 이슈로 추가하세요.

3. **더 깊은 검증:** 이전 패스보다 더 넓은 범위의 코드베이스 탐색을 수행하세요.
   - 인접 파일, 실제 함수 구현, 임포트 체인을 확인하세요.
   - 이전 패스에서 놓쳤을 수 있는 이슈를 찾으세요.

4. **고점수 Phase 집중:** 당신의 Phase가 이전 패스에서 높은 점수를 받았다면,
   특별히 더 많은 시간을 투자하여 각 이슈를 면밀히 재검증하세요.

## Stricter Calibration

이전 패스보다 더 엄격한 기준을 적용합니다:
- Evidence를 독립적으로 재현할 수 없는 이슈는 유지하지 마세요.
- "아마 문제일 것이다"는 이 단계에서 충분하지 않습니다. 확실한 증거만.
- 기존 Calibration Rules (실제 문제만 플래그, 확인 후 판단 등)도 동일하게 적용됩니다.

== Previous Findings for Phase {phase_number} ==
Score: {previous_score}
{previous_issues_full_text}

== All Phase Scores from Previous Pass ==
{phase_scores_summary}

== Common Context ==
{common-context.md 전체 내용}

== Phase {N} Instructions ==
{phase-N-*.md 전체 내용}

== Plan File ==
{플랜 파일 전문}

== Directive File Paths ==
다음 경로의 지시사항 파일을 Read tool로 읽어 검토에 활용하세요:
{지시사항 파일 경로 목록}

프로젝트 루트: {cwd}

## Output Format

반드시 아래 형식으로 결과를 반환하세요:

PHASE: {Phase 번호}
SCORE: {재평가된 총점}
ISSUES:
- [{CRITICAL|IMPORTANT|MINOR}] {설명} | Score: +{n} | Location: {ref} | Evidence: {evidence} | Status: {CONFIRMED|NEW}
  FIX_CANDIDATES:
    - [recommended] {설명} | Apply: {적용 텍스트/전략} | Trade-off: {영향}
    - [alt] {설명} | Apply: {...} | Trade-off: {...}

FALSE_POSITIVES:
- Phase {N} Issue: {원래 이슈 설명} | Reason: {false positive인 이유}

이슈가 없는 경우:
PHASE: {Phase 번호}
SCORE: 0
ISSUES: none
FALSE_POSITIVES:
- Phase {N} Issue: {원래 이슈 설명} | Reason: {false positive인 이유}

규칙:
- PHASE와 SCORE는 반드시 첫 두 줄에 위치
- CONFIRMED 이슈만 SCORE에 반영 (FALSE_POSITIVE는 제외)
- 새로 발견한 이슈는 Status: NEW로 표시
- 각 CONFIRMED/NEW 이슈에 `FIX_CANDIDATES` 블록 필수 (최소 1개의 `[recommended]`)
- 합리적 대안이 있을 때만 2개 이상 반환
- FALSE_POSITIVES 섹션은 제거된 이슈가 없어도 항상 포함 (없으면 "none")
```

---

## Template B: Lightweight Confirmation

이전 패스에서 SCORE 1~5인 Phase에 사용합니다.
새로운 이슈를 찾는 것이 아니라, 기존 이슈의 유효성만 빠르게 확인합니다.

```
당신은 plan-review 확인 에이전트입니다.
이전 패스에서 발견된 아래 이슈들을 빠르게 검증하세요.

각 이슈에 대해:
1. Evidence를 Grep/Read로 직접 확인
2. CONFIRMED 또는 FALSE_POSITIVE로 판정
3. Score 변경이 필요하면 조정

새로운 이슈를 찾는 것은 이 프롬프트의 목적이 아닙니다.
기존 이슈의 유효성 확인에만 집중하세요.

== Issues to Verify (Phase {phase_number}) ==
{issues_list}

== Plan File ==
{플랜 파일 전문}

프로젝트 루트: {cwd}

## Output Format

PHASE: {Phase 번호}
SCORE: {검증 후 총점}
ISSUES:
- [{CRITICAL|IMPORTANT|MINOR}] {설명} | Score: +{n} | Location: {ref} | Evidence: {evidence} | Status: CONFIRMED
  FIX_CANDIDATES:
    - [recommended] {설명} | Apply: {적용 텍스트/전략} | Trade-off: {영향}
    - [alt] {설명} | Apply: {...} | Trade-off: {...}

FALSE_POSITIVES:
- Phase {N} Issue: {원래 이슈 설명} | Reason: {false positive인 이유}

이슈가 모두 false positive인 경우:
PHASE: {Phase 번호}
SCORE: 0
ISSUES: none
FALSE_POSITIVES:
- Phase {N} Issue: {원래 이슈 설명} | Reason: {이유}

규칙:
- CONFIRMED된 이슈만 SCORE에 반영
- 각 CONFIRMED 이슈에 `FIX_CANDIDATES` 블록 필수 (기존 이슈에서 상속 가능)
- FALSE_POSITIVES 섹션은 항상 포함 (없으면 "none")
```
