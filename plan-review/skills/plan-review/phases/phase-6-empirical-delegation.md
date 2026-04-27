# Phase 6: Empirical Delegation (0~10 points)

이 Phase는 자체 검증을 수행하지 않습니다. 플랜의 **데이터 가정**을 추출해
debug-verify Skill에 위임 호출하여 실증 검증을 받고, 그 결과를 SCORE로 매핑합니다.

## Procedure

### 6.1 데이터 가정 추출 (LLM 인라인 추출)

플랜 본문을 읽고 다음 5개 카테고리에 해당하는 단언 문장을 추출하세요.

| 카테고리 | 키워드 힌트 | 예시 |
|---------|------------|------|
| `TABLE_ROW` | 테이블, 컬럼, 스키마, row, schema | "users 테이블에 deleted_at 컬럼이 있다" |
| `LOG_PATTERN` | 로그, error, line, trace | "X 로그가 발생한다" |
| `METRIC` | 지표, threshold, p95, latency | "p95 응답시간이 200ms 미만" |
| `EVENT_SEQ` | 이벤트, 순서, 발생, sequence | "A 이후 B 이벤트가 발생" |
| `QUERY_RESULT` | 쿼리, 반환, count, 결과 | "이 쿼리는 N행 반환" |

각 추출 항목에 confidence 부여:

- **HIGH:** 명시적 단언 ("X 테이블에 Y 컬럼이 있다")
- **MEDIUM:** 함축적 단언 ("X 시나리오에서 Y가 발생할 것으로 예상")
- **LOW:** 추측 ("X일 수도 있다")

LOW confidence 항목은 부정확한 위임을 방지하기 위해 제외하고 `MANUAL_CHECKS:` 섹션에 남깁니다.

### 6.2 Skip 조건

HIGH/MEDIUM 추출 결과가 0개면 phase 스킵. SCORE 0, ISSUES: none. EXTRACTED_CLAIMS는 빈 목록으로 출력.

### 6.3 임시 디버깅 플랜 구성 (메모리 내)

추출된 claim 목록을 다음 형식의 **plan_text** 문자열로 조립합니다 (디스크에 저장하지 않음 — 메모리 내 변수로만 보유):

```
# Verification Targets (auto-generated from {원본 플랜 경로})

## Hypotheses to verify
- [TABLE_ROW] {claim1 원문} (source: line N)
- [LOG_PATTERN] {claim2 원문} (source: line M)
...
```

### 6.4 debug-verify Skill 호출 (인라인 args envelope)

Skill tool로 `debug-verify:debug-verify`를 호출하면서 다음 형태의 **JSON envelope**을 `args` 인자로 인라인 전달합니다. 디스크 임시 파일을 사용하지 않습니다.

```json
{
  "from": "plan-review:phase-6",
  "source_plan_path": "{원본 플랜 절대 경로}",
  "sub_session_id": "phase6-{원본 sessionId}-{ISO 8601 타임스탬프}",
  "plan_mode_context": {
    "plan_mode": true,
    "allowed_tools": "read-only only",
    "forbidden_tools": ["Edit", "Write", "Bash(write/network)", "git commit", "recursive Skill"]
  },
  "plan_text": "{6.3에서 조립한 임시 디버깅 플랜 전문}"
}
```

규칙:

- `plan_mode_context.plan_mode`는 호출자가 plan mode인지 여부에 따라 `true`/`false`로 결정. plan mode가 아니면 `forbidden_tools`도 `[]`로 비워서 보냅니다 (Edit/Write 등 정상 사용 가능).
- `sub_session_id`는 plan-review의 현재 sessionId에 `phase6-` 접두사를 붙여 충돌 회피.
- `plan_text`는 6.3 결과만 담습니다. **자체적으로 `== Plan Mode Context ==` 헤더를 본문에 끼워 넣지 마세요** — 헤더는 envelope의 `plan_mode_context` 필드로만 전달됩니다.
- envelope 키가 빠지거나 JSON 파싱이 실패하면 debug-verify는 디스크 fallback(`~/.claude/plans/*.md` 가장 최근 파일)으로 빠집니다. Phase 6 호출자는 그 결과를 ERROR로 간주하고 6.6 에러 복구 절차를 적용합니다.

### 6.4.1 재귀 차단

debug-verify Skill이 다시 plan-review를 호출하지 못하도록 envelope의 `forbidden_tools`에 `"recursive Skill"`을 항상 포함합니다. 또한 plan-review가 직전에 Phase 6을 트리거했음을 알리기 위해 `from` 필드를 검사하여 `plan-review:phase-6`이면 nested Phase 6 진입을 스킵합니다 (Phase 6 자기 참조 방지 — debug-verify의 추후 후처리에서 재호출 시 `from`이 같으면 차단).

### 6.5 결과 매핑

debug-verify의 최종 verdict를 Phase 6 SCORE로 매핑합니다.

| debug-verify verdict | Phase 6 SCORE | ISSUE 발생 여부 |
|---------------------|--------------|----------------|
| `CONFIRMED` | 0 | none |
| `INCONCLUSIVE` | 5 | 1건 ("데이터 가정 미검증 — 도구 환경 부재 또는 증거 부족") |
| `REFUTED` | 10 | 1건 ("플랜의 데이터 가정이 실제 데이터와 모순") |

### 6.6 에러 복구

Phase 6 자체 실패는 다른 Phase 결과 집계를 막지 않습니다 (best-effort 보강).

- Skill 호출이 에러를 반환하거나 결과 파싱 실패 → SCORE 5, ISSUE 1건 ("debug-verify 호출 실패: {에러 요약}").
- Skill 호출 결과가 없거나 타임아웃 → SCORE 5, ISSUE 1건 ("debug-verify 응답 없음").
- 호출 자체가 차단됨 (예: 재귀 차단) → SCORE 0, ISSUES: none, MANUAL_CHECKS에 사유 명시.

## Scoring

최대 10점. CONFIRMED면 0점.

## Output Format (필수)

```
PHASE: 6
SCORE: {0|5|10}
ISSUES:
- [{IMPORTANT|MINOR}] {설명} | Score: +{n} | Location: 추출된 claim 위치 | Evidence: debug-verify 결과 요약
  FIX_CANDIDATES:
    - [recommended] {수정 방향} | Apply: {...} | Trade-off: {...}
EXTRACTED_CLAIMS:
- [{카테고리}] {claim 원문} | confidence: {HIGH|MEDIUM} | source_line: {N}
DELEGATED_VERDICT: {CONFIRMED|REFUTED|INCONCLUSIVE|ERROR}
SOURCE_PLAN_PATH: {원본 플랜 절대 경로 — envelope에 보낸 값}
SUB_SESSION_ID: {debug-verify 세션 ID 또는 'n/a'}
MANUAL_CHECKS:
- {LOW confidence claim 또는 차단 사유}
```

### 규칙

- `PHASE`와 `SCORE`는 반드시 첫 두 줄에 위치
- ISSUES가 없으면 `ISSUES: none` 한 줄로 표기
- EXTRACTED_CLAIMS가 비어있으면 `EXTRACTED_CLAIMS: none` 표기
- DELEGATED_VERDICT는 항상 출력 (스킵 시 `n/a`)
- SOURCE_PLAN_PATH는 envelope `source_plan_path`와 동일하게 기록 — 보고서가 원본 플랜을 역추적하기 위함
- SUB_SESSION_ID는 호출 성공 시 envelope `sub_session_id` 그대로, 실패/스킵 시 `n/a`
- MANUAL_CHECKS가 없으면 생략 가능
