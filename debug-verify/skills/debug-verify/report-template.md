# Debug Verification Report Template

최종 리포트를 아래 형식으로 출력하세요.

## Single Loop Report (루프 1회로 종료)

```
### Debug Verification Report (Kapasi Loop)
- Verdict: {CONFIRMED|REFUTED|INCONCLUSIVE}
- Confidence: {HIGH|MEDIUM|LOW}
- Loop Count: {N} / 3
- Consensus: {AGREED|DISAGREED}
- Selected Fix Direction: {선택된 후보 id 또는 'n/a' (verdict≠CONFIRMED 또는 후보 없음)}

### Verified Claims
| # | Claim | Advocate | Challenger | Final |
|---|-------|----------|------------|-------|
| 1 | {claim 설명} | {CONFIRMED/REFUTED/INCONCLUSIVE} | {SUCCESS/FAILED} | {최종 판정} |

### Evidence Summary
#### Claim 1: {claim 설명}
- **Advocate 증거:** {증거 요약} (Source: {소스})
- **Challenger 반박:** {반박 결과 요약} (Source: {소스})

### Alternative Hypotheses
| # | Hypothesis | Likelihood | Source | Evidence |
|---|-----------|------------|--------|----------|
| 1 | {가설} | {HIGH/MEDIUM/LOW} | {Advocate/Challenger} | {근거} |

### Manual Checks Required
- {수동 확인 항목} | Reason: {이유}

### Recommended Action
{판정별 안내 메시지 — CONFIRMED면 Selected Fix Direction을 본문에 통합}
```

## Multi-Loop Report (루프 2회 이상)

```
### Debug Verification Report (Kapasi Loop)
- Verdict: {CONFIRMED|REFUTED|INCONCLUSIVE}
- Confidence: {HIGH|MEDIUM|LOW}
- Loop Count: {N} / 3
- Consensus: {AGREED|DISAGREED}
- Loop History: Loop 1: {verdict} → Loop 2: {verdict} [→ Loop 3: {verdict}]
- Selected Fix Direction: {선택된 후보 id 또는 'n/a'}

### Verified Claims
| # | Claim | Loop 1 | Loop 2 | Loop 3 | Final |
|---|-------|--------|--------|--------|-------|
| 1 | {claim} | {판정} | {판정} | {판정/-} | {최종} |

### Evidence Summary (Final Loop)
{마지막 루프의 증거만 상세 표시}

### Loop Progression
#### Loop 1
- Advocate: {요약}
- Challenger: {요약}
- Verdict: {판정}

#### Loop 2
- New evidence: {추가 발견 증거}
- Advocate: {요약}
- Challenger: {요약}
- Verdict: {판정}

### Alternative Hypotheses
{병합된 대안 가설 목록}

### Manual Checks Required
{수동 확인 항목}

### Recommended Action
{판정별 안내 메시지}
```

## Recommended Action Templates

### CONFIRMED (후보 1개 또는 0개):
```
진단이 확인되었습니다.

**확인된 원인:** {원인 요약}
**증거:** {핵심 증거 1-2개}
**수정 방향:** {FIX_CANDIDATES 단일 후보의 Apply 요약 — 후보 0개면 생략}

다음 단계: 수정 계획을 `~/.claude/plans/`에 작성하세요.
수정 계획에 다음을 포함하세요:
1. 확인된 원인 (이 리포트 참조)
2. 수정 방법 (위 '수정 방향' 참조)
3. 영향 범위
4. 테스트 계획

수정 계획 작성 시 plan-review가 자동으로 검증합니다.
```

### CONFIRMED (후보 2개 이상 — 사용자가 방향 선택):
```
진단이 확인되었습니다.

**확인된 원인:** {원인 요약}
**증거:** {핵심 증거 1-2개}

**사용자가 선택한 수정 방향:** {선택된 후보 설명}
- **Apply:** {선택 후보의 Apply}
- **Trade-off:** {선택 후보의 Trade-off}

**검토된 다른 후보:**
{선택되지 않은 후보 목록 — 선택 이유/제외 이유 간단히}

다음 단계: 위 선택된 방향으로 수정 계획을 `~/.claude/plans/`에 작성하세요.
수정 계획에 다음을 포함하세요:
1. 확인된 원인 (이 리포트 참조)
2. 선택된 수정 방향의 구체적 구현
3. 영향 범위
4. 테스트 계획

수정 계획 작성 시 plan-review가 자동으로 검증합니다.
```

### REFUTED:
```
가설이 기각되었습니다.

**기각 근거:** {핵심 반증}
**대안 가설:**
{대안 가설 목록 — 가능성 높은 순}

다음 단계: 대안 가설을 바탕으로 새 디버깅 플랜을 작성하세요.
```

### INCONCLUSIVE (최대 루프 후):
```
{N}회 검증 후에도 확정적인 판정을 내릴 수 없습니다.

**확인된 사항:**
{CONFIRMED된 claim 목록}

**미확인 사항:**
{INCONCLUSIVE claim 목록 + 필요한 추가 데이터}

**수동 확인 필요:**
{MANUAL_CHECKS 목록}

다음 단계: 위 수동 확인 항목을 직접 확인한 후 결과를 알려주세요.
```
