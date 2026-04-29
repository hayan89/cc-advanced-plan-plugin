# Report Template — Grounded Findings

Step 4에서 메인 세션이 출력할 최종 리포트 형식.

## Standard Report (사실 수집 성공)

```
# Data Grounding Report

**Session:** {sessionId}
**Mode:** {auto-triggered | manual (/ground)}
**Total Calls:** {0~12} / 12 ({Budget Exceeded: yes | no})

## Grounded Facts

| Target | 사실 요약 | Source | Data |
|--------|----------|--------|------|
| T1 | ... | mcp__grafana__query_loki_logs | 최근 1h간 500 에러 32건, 전부 /api/users 엔드포인트 |
| T2 | ... | Bash(psql -c "...") | users.email 인덱스 부재 (b-tree 미설정) |

## Data Gaps

- {Target ID}: {사유}
- ...

(또는 `none`)

## Narrowed Hypotheses

- [HIGH] {가설 1} — Supporting: T1, T2 / Counter-evidence: none
- [MEDIUM] {가설 2} — Supporting: T1 / Counter-evidence: 약한 반증 설명

(또는 `none — 사실로부터 도출 가능한 가설 없음`)

## Open Questions

- {사용자에게 물어볼 추가 정보}
- ...

(또는 `none`)

---

**다음 단계:** 위 GROUNDED_FACTS를 컨텍스트로 플랜을 작성해 주세요. 플랜이 `~/.claude/plans/`에 저장되면 plan-review (또는 디버깅 키워드 ≥ 2이면 debug-verify)가 자동 트리거되어 플랜의 데이터 가정을 사후 검증합니다.
```

## Skipped Report (DATA_TARGET_MAP 비어있음)

분류 단계에서 조회 후보를 추출하지 못했을 때:

```
# Data Grounding Report

**Session:** {sessionId}
**Mode:** {auto-triggered | manual}
**Status:** Skipped — 사용자 프롬프트만으론 조회할 데이터 후보를 특정할 수 없음

## Open Questions

- 어떤 환경(prod/staging/local)에서 발생하는지?
- 발생 시각/빈도/재현 조건?
- 영향받은 컴포넌트/엔드포인트/사용자 식별자?
- 관찰된 증상의 구체적 형태 (에러 메시지, 응답 코드, 지연 시간 등)?

---

**다음 단계:** 위 질문에 답해 주시면 다시 `/ground`로 사전 그라운딩을 진행하거나, 일반 플랜 작성으로 진입할 수 있습니다.
```

## Failure Report (Grounder 에이전트 실패)

```
# Data Grounding Report

**Session:** {sessionId}
**Mode:** {auto-triggered | manual}
**Status:** Failed — Grounder 에이전트 호출 실패

## Failure Reason

{실패 사유 — 타임아웃, 도구 호출 에러, 결과 파싱 실패 등}

## Recovery

본 스킬 실패는 후속 흐름을 막지 않습니다. 메인 세션은 다음 중 하나를 선택할 수 있습니다:

1. 일반 플랜 작성으로 진입 (그라운딩 없이)
2. `/ground`로 재시도

---

세션 상태에 `grounded: false, declined: false, run_count: <증가>` 기록.
```

## 출력 규칙

- 모든 필드(Grounded Facts / Data Gaps / Narrowed Hypotheses / Open Questions)가 비어있으면 `none` 명시. 필드 자체를 생략하지 않음.
- 출처는 도구명(MCP) 또는 `Bash(요약)`(CLI) 형태로 일관 표기.
- "다음 단계" 안내 메시지는 항상 마지막에 포함하여 메인 세션이 후속 행동을 결정할 수 있도록 함.
- **플랜 파일을 만들지 않습니다.** 본 리포트는 메인 세션 컨텍스트 입력용 사실 묶음일 뿐, 디스크 산출물이 아닙니다.
