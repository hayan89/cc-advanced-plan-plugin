# Spec: 실증 데이터 검증 게이트 (plan-review · debug-verify 결합)

작성일: 2026-04-27
관련 플랜: `~/.claude/plans/dapper-jumping-wilkinson.md`
구현 PR: TBD

## 동기

사용자 지적: "계획 검증 시 실제 DB와 로그도 확인하도록 하는 단계가 빠진게 아닐까."

기존 두 스킬은 데이터 가정을 실제 데이터로 확인하지 않는다:

- **`plan-review` v2.2** — 5축(Directive / Structure / Completeness / Risk / Security) **정적 플랜 검토**만 수행. 플랜이 명시한 데이터 가정("테이블 X에 행 Y", "로그 라인 Z 발생", "지표 W 임계값")은 코드만으로 검증된다.
- **`debug-verify` v1.0** — Advocate가 Loki / Prometheus / Pyroscope / DB 도구를 권장 도구로 보유하나, "MCP 도구가 사용 가능하면 우선 사용"일 뿐 **강제력이 없다**. Advocate가 코드만 보고 판정해도 통과 가능.

## 목표

1. 일반 구현 플랜에서도 데이터 가정이 실제 데이터로 검증되도록 한다.
2. 디버깅 가설 검증 시 데이터 종속 claim에는 데이터 도구 호출이 강제되도록 한다.
3. 두 스킬의 책임을 분리한 채 결합한다 — `plan-review`는 "데이터 가정 추출 + 위임"만, `debug-verify`는 "실증 검증 강제"만.

## 설계

### 1. plan-review v2.3: Phase 6 (Empirical Delegation)

5축 검토 뒤에 신규 Phase 6을 추가한다. Phase 6은 **자체 검증을 수행하지 않고**, 플랜 본문에서 데이터 가정을 추출해 `debug-verify` Skill을 서브루틴으로 호출한다.

#### Phase 6 Procedure

| 단계 | 동작 |
|------|------|
| 6.1 | LLM 인라인 추출로 5개 카테고리(TABLE_ROW / LOG_PATTERN / METRIC / EVENT_SEQ / QUERY_RESULT) 단언 추출. confidence(HIGH/MEDIUM/LOW) 부여, LOW는 MANUAL_CHECKS로 분리. |
| 6.2 | HIGH/MEDIUM 추출 결과 0개면 phase 스킵 (SCORE 0). |
| 6.3 | 추출된 claim을 메모리 내 임시 디버깅 플랜 텍스트로 조립. |
| 6.4 | Skill tool로 `debug-verify:debug-verify` 호출. plan mode 컨텍스트 헤더를 입력 상단에 삽입하여 read-only 시그널을 전파. |
| 6.5 | debug-verify verdict → SCORE 매핑: CONFIRMED=0, INCONCLUSIVE=5, REFUTED=10. |
| 6.6 | Skill 호출 실패 / 타임아웃 / 응답 없음 → SCORE 5 (best-effort 보강). 다른 Phase 집계를 막지 않음. |

#### 라우팅 규칙

- Phase 6은 **항상 sequential 실행** (메인 세션 직접). 모든 Step 3 분기(3A/3B/3C/3D)에서 sub-agent / team 결과 수집 후 메인 세션에서 호출.
- subagent / team 멤버에서는 호출 금지 (AskUserQuestion · MCP 도구 가용성 점검이 메인 세션 컨텍스트를 요구).

#### Aggregation 영향

- max score 120 → 130. verdict threshold(≤24 / 25~60 / >60)는 절대값 유지.
- Phase 6은 Multi-Iteration deep re-review 대상에서 제외 (debug-verify가 자체 카파시 루프를 가지므로 중복 회피). 첫 패스 SCORE를 마지막 iteration까지 carry.

### 2. debug-verify v1.1: Pre-Advocate Classifier (Step 1.5)

Step 1과 Step 2 사이에 **인라인 경량 단계**를 신설. 별도 에이전트를 디스패치하지 않고 메인 세션이 직접 수행한다.

#### Step 1.5 동작

1. 디버깅 플랜에서 추출된 claim을 7개 도구 카테고리로 분류 (CODE_LOGIC / DB_STATE / LOG_PATTERN / METRIC / PROFILE / DASHBOARD / EXTERNAL_API). 한 claim에 카테고리 1~N개.
2. `CLAIM_TOOL_MAP`을 Markdown 표로 구조화 (Claim ID, Claim 원문, REQUIRED_TOOLS, Status).
3. 환경 가용성 점검 — 미가용 도구는 `UNAVAILABLE_TOOLS` 목록에 별도 기록.
4. Step 2 Advocate dispatch 프롬프트의 `== Advocate Context ==` 블록 앞에 CLAIM_TOOL_MAP과 UNAVAILABLE_TOOLS 블록을 주입.

#### Tool Coverage Audit (aggregation.md Step 1.5)

Step 2 (Verdict Consensus) 이전에 수행한다.

- `REQUIRED_TOOLS`(CLAIM_TOOL_MAP) vs `EVIDENCE_TOOLS_USED`(Advocate 출력) 대조.
- REQUIRED_TOOLS 중 하나라도 EVIDENCE_TOOLS_USED에 없으면 — Advocate가 CONFIRMED를 내렸어도 — 해당 claim 판정을 **INCONCLUSIVE로 강제 변환**한다.
- 변환된 claim은 Final Report의 `Tool Coverage` 섹션에 `tool-not-called` 또는 `env-blocked` 마커로 표시.

#### Advocate / Challenger Calibration Rules 신규 항목

| # | 룰 | 적용 대상 |
|---|----|----------|
| 5 | Tool Compliance — REQUIRED_TOOLS 미호출 claim은 자동 INCONCLUSIVE | Advocate |
| 6 | Unavailable Tool Handling — UNAVAILABLE_TOOLS 등재 claim도 INCONCLUSIVE + MANUAL_CHECKS 명시 | Advocate |
| 7 | Plan Mode Enforcement — `plan_mode: true`면 forbidden_tools 호출 금지 | Advocate, Challenger |

### 3. Plan Mode 시그널 메커니즘

#### 시그널 전파

Phase 6의 6.4 단계에서 임시 디버깅 플랜 본문 상단에 다음 헤더를 삽입한다:

```
== Plan Mode Context ==
plan_mode: {true|false}
allowed_tools: read-only only
forbidden_tools: Edit, Write, Bash(write/network), git commit, recursive Skill
```

#### 시행

debug-verify SKILL.md Step 2 / Step 3 프롬프트 템플릿에 `{plan_mode_context}` placeholder를 추가하여 헤더를 그대로 주입. Advocate / Challenger의 Calibration Rule 7번에 따라 forbidden_tools 호출 시 해당 claim을 INCONCLUSIVE 처리.

#### 양쪽 SKILL.md "Important Rules" 추가

- `plan-review/SKILL.md`: Phase 6 sequential 강제 + plan mode 시그널 전파 한 줄
- `debug-verify/SKILL.md`: plan mode 시그널 시행 + Tool Coverage 강제 한 줄

## 영향 범위

### 호환성

- 기존 PASS 임계(≤24)는 절대값으로 유지하므로 기존 통과 플랜이 silently NEEDS_REVISION으로 떨어지지 않는다. Phase 6 단독으로 PASS→NEEDS_REVISION 경계를 넘기려면 다른 Phase가 이미 14점 이상이어야 한다.
- 기존 FIX_CANDIDATES 단일/다중 분기 게이트(`d4d5eb0` 커밋)는 변경 없음.
- 기존 Advocate→Challenger 카파시 루프(loop_count, INCONCLUSIVE 재루프)는 변경 없음.

### 성능

- Phase 6은 데이터 가정 0개 플랜에 대해 즉시 스킵 — 추가 비용 없음.
- 데이터 가정 ≥1개 플랜은 debug-verify 1회 호출(~1~2분 추가) 발생.

### 환경 의존성

- Grafana MCP / DB MCP가 부재해도 `UNAVAILABLE_TOOLS`로 분류되어 INCONCLUSIVE로 안전하게 처리된다.
- 로컬 로그 파일 Read fallback은 LOG_PATTERN 카테고리에서 사용 가능.

## 검증

자세한 End-to-End / 회귀 / 도구 환경 검증 절차는 플랜 파일 `~/.claude/plans/dapper-jumping-wilkinson.md` §Verification 참조.

핵심:

1. **양성 케이스** — "테이블 users에 deleted_at 컬럼이 있다" 가정 포함 플랜 → Phase 6 추출 → DB_STATE 분류 → DB 도구 미호출 시 Tool Coverage Audit이 INCONCLUSIVE 강제.
2. **음성 케이스** — 순수 리팩토링 플랜 → Phase 6 스킵 (SCORE 0).
3. **재귀 차단** — debug-verify가 다시 plan-review를 호출하지 못하도록 forbidden_tools에 `recursive Skill` 명시.
4. **에러 복구** — Skill 호출 실패 → Phase 6 SCORE 5로 처리, 전체 집계는 진행.

## 향후 작업 (Out of Scope)

- 데이터 가정 추출 정밀도 튜닝 (false positive 패턴 수집).
- Phase 6 SCORE 가중치 재튜닝 (운영 데이터 기반).
- CLAIM_TOOL_MAP을 다른 검증 스킬에서도 재사용할 수 있도록 공통 형식으로 분리.
