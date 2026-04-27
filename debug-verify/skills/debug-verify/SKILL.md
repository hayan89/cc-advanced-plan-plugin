---
name: debug-verify
description: >
  디버깅 플랜 작성 후 자동 트리거 또는 수동 호출(/debug-verify, /kapasi)하여, 디버깅 가설을
  Advocate + Challenger 이중 에이전트 카파시 루프로 실증 검증합니다.
  PostToolUse 훅의 [MAGIC KEYWORD: debug-verify]로 자동 활성화됩니다.
---

# Debug Verify (Kapasi Loop) v1.1.1

디버깅 플랜의 가설을 실제 데이터로 검증하는 카파시 루프 스킬.
Advocate 에이전트가 증거를 수집하여 초기 판정을 내리고,
Challenger 에이전트가 반박을 시도하여 확인 편향을 방지합니다.
최종 판정 후 plan-review와 연동하여 수정 계획까지 검증합니다.
v1.1부터 Pre-Advocate Classifier (Step 1.5)와 Tool Coverage Audit이 추가되어,
데이터 종속 claim에 대한 도구 호출이 강제됩니다.
v1.1.1부터 도구 카테고리가 추상화되어 MCP·CLI(sqlcmd/psql/curl 등)·Bash 명령이 카테고리 안에서 등가의 fallback으로 동작합니다.

## When This Activates

- **자동:** PostToolUse 훅이 `~/.claude/plans/`에 디버깅 키워드가 포함된 파일 Write/Edit를 감지
- **수동:** `/debug-verify` 또는 `/kapasi` 명령으로 직접 호출 (디바운스 제한 없음)

## Procedure

### Step 1: Context Collection

#### 1.0 호출 모드 판정

다음 우선순위로 입력 소스를 결정합니다:

1. **인라인 args envelope (최우선):** Skill 호출 args에 다음 형태의 JSON envelope이 있으면 그것을 사용. 파싱 가능하고 `plan_text` 필드가 비어있지 않으면 envelope 모드로 진행.
   ```json
   {
     "from": "{호출자 식별자, 예: plan-review:phase-6}",
     "source_plan_path": "{원본 플랜 절대 경로}",
     "sub_session_id": "{호출자가 만든 세션 ID}",
     "plan_mode_context": {
       "plan_mode": true,
       "allowed_tools": "read-only only",
       "forbidden_tools": ["Edit", "Write", "Bash(write/network)", "git commit", "recursive Skill"]
     },
     "plan_text": "{디버깅 플랜 본문 전문}"
   }
   ```
2. **훅 전달 경로 (디스크):** envelope이 없거나 파싱 실패 → PostToolUse 훅이 전달한 경로의 파일을 Read.
3. **디스크 fallback:** 훅 경로도 없으면 가장 최근 수정된 `~/.claude/plans/*.md` 중 디버깅 키워드가 포함된 파일을 Read.

envelope 모드와 디스크 모드 모두에서 이후 단계의 입력은 동일한 "플랜 본문 텍스트"로 통일됩니다.

#### 1.1 sessionId 결정

- **envelope 모드:** `sub_session_id`를 그대로 사용. 충돌 회피용 접두사가 이미 있다고 가정.
- **훅 모드:** 훅이 전달한 sessionId 사용.
- **수동 호출:** 현재 타임스탬프 기반으로 생성 (예: `manual-2026-04-07T12:00:00Z`).

#### 1.2 Plan Mode Context 결정

- **envelope 모드:** `plan_mode_context` 객체를 그대로 보존하여 Step 1.5/2/3 프롬프트의 `{plan_mode_context}` placeholder에 다음 형식으로 직렬화하여 주입:
  ```
  == Plan Mode Context ==
  plan_mode: {true|false}
  allowed_tools: {문자열}
  forbidden_tools: {배열을 쉼표로 join}
  ```
- **디스크 모드:** 플랜 본문 상단에 `== Plan Mode Context ==` 블록이 있으면 그대로 사용. 없으면 `plan_mode: false`로 가정 후 빈 forbidden_tools로 직렬화.

#### 1.3 재귀 차단 가드

envelope의 `from` 필드가 `plan-review:phase-6`이면, 이후 단계에서 plan-review를 다시 호출하지 않습니다 (Phase 6 자기 참조 방지). `recursive Skill`이 항상 forbidden_tools에 포함되므로 Calibration Rule 7번에 의해 자동 차단됩니다.

#### 1.4 세션 상태 로드

`~/.claude/plugins/data/debug-verify/sessions/{sessionId}.json`을 읽어 이전 검증 상태 로드:
- 파일이 없으면 기본값: `{ verify_count: 0, last_verdict: null, loop_count: 0 }`
- 이 상태의 `loop_count`를 이후 Step 5의 루프 판정에 사용
- envelope 모드의 `sub_session_id`도 동일 디렉토리에 기록되므로, 같은 호출자가 같은 sub_session_id로 재호출하면 이전 상태를 인계.

#### 1.5 (이번 단계 종료) 플랜 본문 보유

확정된 플랜 본문 텍스트를 메모리 내 변수로 보유. 이후 Step 1.5(Pre-Advocate Classifier), Step 2, Step 3에 동일한 본문을 전달합니다.

### Step 1.5: Pre-Advocate Classifier

메인 세션이 직접 실행하는 인라인 경량 단계. **별도 에이전트를 디스패치하지 않습니다.**

#### 1.5.1 Claim 추출 + 도구 카테고리 분류

디버깅 플랜에서 검증 가능한 claim을 추출하고, 각 claim에 도구 카테고리 라벨을 부여하세요.

**카테고리는 "검증 능력의 추상화"입니다.** 같은 카테고리 안에서 MCP 도구·CLI·Bash 명령은 서로 등가의 fallback이며, 환경에서 어느 하나라도 가용하면 해당 카테고리는 `available`로 간주합니다.

| 카테고리 | 검증 능력 | 가용 도구 (MCP / CLI / Bash 무관) |
|---------|----------|----------------------------------|
| `CODE_LOGIC` | 코드 구조·로직 정적 검증 | Grep, Read, Glob, ripgrep / ag CLI |
| `DB_STATE` | DB 스키마·행·쿼리 결과 조회 | DB MCP (D1 등) **또는** Bash CLI: `sqlcmd` / `psql` / `mysql` / `sqlite3` / `mongosh` 등 |
| `LOG_PATTERN` | 로그 라인·패턴 검색 | `mcp__grafana__query_loki_logs` **또는** 로컬 파일 Read+Grep, `tail` / `awk` / `journalctl` Bash |
| `METRIC` | 시계열 지표 조회 | `mcp__grafana__query_prometheus` **또는** Bash: `curl`로 Prometheus HTTP API, `promtool query`, export된 CSV Read |
| `PROFILE` | 프로파일 데이터 분석 | `mcp__grafana__query_pyroscope` **또는** Bash: `perf` / `pprof` CLI, flame graph dump 파일 Read |
| `DASHBOARD` | 대시보드 메타·패널 조회 | `mcp__grafana__search_dashboards` / `get_dashboard_by_uid` **또는** dashboard JSON 파일 Read, `curl`로 Grafana HTTP API |
| `EXTERNAL_API` | HTTP·외부 서비스 호출 | WebFetch **또는** Bash: `curl` / `wget`, 명시된 SDK CLI |

한 claim에 카테고리 1~N개 부여 가능 (다중 검증이 권장되는 케이스).

> **원칙:** "도구 X가 미가용"이라고 단언하기 전에 **MCP·CLI 양쪽** 모두 점검하세요. MCP가 없어도 CLI가 PATH에 있으면 `available`입니다.

#### 1.5.2 CLAIM_TOOL_MAP 구조

다음 Markdown 표 형식으로 결과를 구조화하세요 (현재 SKILL.md 표 스타일과 통일):

```
| Claim ID | Claim 원문 | REQUIRED_TOOLS | Status |
|----------|-----------|----------------|--------|
| C1 | {claim 1 원문} | DB_STATE, LOG_PATTERN | available |
| C2 | {claim 2 원문} | METRIC | unavailable |
```

#### 1.5.3 환경 가용성 점검

각 카테고리에 대해 **MCP 우선 → CLI fallback → 로컬 도구 fallback** 순으로 가용성을 점검하세요. **하나라도 충족되면 그 카테고리는 `available`**입니다.

점검 절차 (카테고리당):

1. **MCP 점검:** 해당 카테고리의 MCP 도구가 사용 가능한 도구 목록에 등재돼 있는지 확인 (예: `mcp__grafana__query_prometheus`).
2. **CLI 점검 (MCP 미가용 시):** Bash로 `command -v {cli명}`을 1회 실행하여 PATH 존재 확인.
   - 예: `command -v sqlcmd`, `command -v psql`, `command -v curl`, `command -v promtool`
   - 한 카테고리의 대안 CLI 후보를 모두 점검할 필요 없음 — **하나라도 발견되면 충족.**
3. **로컬 도구 점검:** Grep / Read / Glob은 항상 available로 간주 (점검 불필요).

판정:

- 카테고리의 MCP·CLI·로컬 도구 중 **하나라도 가용** → `available`. CLAIM_TOOL_MAP의 Status도 `available`.
- 카테고리의 모든 후보가 미가용 → `unavailable`. 카테고리 명을 `UNAVAILABLE_TOOLS` 목록에 한 번만 나열.

기록 시 어떤 도구가 가용 판정에 쓰였는지 CLAIM_TOOL_MAP에 짧게 명시할 수 있습니다 (선택). 예: `DB_STATE (via psql CLI)`.

#### 1.5.4 Step 2 프롬프트 주입

CLAIM_TOOL_MAP과 UNAVAILABLE_TOOLS를 Step 2 Advocate dispatch 프롬프트의 `== Advocate Context ==` 블록 **앞에** 삽입합니다 (Step 2 템플릿의 `{plan_mode_context}` / `{claim_tool_map}` / `{unavailable_tools}` placeholder 위치 참조).

#### 1.5.5 재루프 시 동작

Step 5의 INCONCLUSIVE 재루프에서 Step 2를 다시 호출하기 전에 Step 1.5를 재실행할 필요는 없습니다. 첫 라운드의 CLAIM_TOOL_MAP을 그대로 재사용하되, Challenger가 제안한 ALTERNATIVE_HYPOTHESES에 새 claim이 추가되면 그 claim에 대해서만 분류를 보강합니다.

### Step 2: Advocate Agent Dispatch

`skills/debug-verify/advocate-context.md`를 Read로 읽어 내용을 확보합니다.

Agent tool로 Advocate 에이전트를 디스패치하세요:

```
당신은 debug-verify의 Advocate(옹호자) 에이전트입니다.
아래 디버깅 플랜의 가설을 검증하세요.

{plan_mode_context}

== CLAIM_TOOL_MAP ==
{Step 1.5에서 생성한 Markdown 표 그대로 삽입}

== UNAVAILABLE_TOOLS ==
{Step 1.5에서 생성한 미가용 카테고리 목록. 비어있으면 'none'}

== Advocate Context ==
{advocate-context.md의 전체 내용을 여기에 삽입}

== Debug Plan ==
{디버깅 플랜 파일 전문을 여기에 삽입}

프로젝트 루트: {cwd}

Output Format에 맞춰 결과를 반환하세요.

**범위 제약:** 너의 책임은 가설 검증 결과 반환까지다. Step 4 이후(집계/판정/사용자 선택) 및 수정 계획 작성은 절대 수행하지 말 것. AskUserQuestion/Edit/Write 호출 금지.
```

placeholder 치환 규칙:
- `{plan_mode_context}` — Step 1에서 보존한 `== Plan Mode Context ==` 블록을 그대로 삽입. 없으면 빈 문자열.
- `{claim_tool_map}` 영역 — Step 1.5의 CLAIM_TOOL_MAP 표를 삽입. claim이 없으면 표 본체에 `(no claims extracted)` 한 줄 표기.
- `{unavailable_tools}` 영역 — Step 1.5의 UNAVAILABLE_TOOLS 목록 또는 `none`.

Advocate 결과를 수집합니다.

### Step 3: Challenger Agent Dispatch

`skills/debug-verify/challenger-context.md`를 Read로 읽어 내용을 확보합니다.

Advocate 결과를 받은 후, Agent tool로 Challenger 에이전트를 디스패치하세요:

```
당신은 debug-verify의 Challenger(반박자) 에이전트입니다.
아래 Advocate의 판정을 반박하세요.

{plan_mode_context}

== Challenger Context ==
{challenger-context.md의 전체 내용을 여기에 삽입}

== Debug Plan ==
{디버깅 플랜 파일 전문을 여기에 삽입}

== Advocate Report ==
{Advocate 에이전트의 전체 결과를 여기에 삽입}

프로젝트 루트: {cwd}

Output Format에 맞춰 결과를 반환하세요.

**범위 제약:** 너의 책임은 반박 결과 반환까지다. Step 4 이후(집계/판정/사용자 선택) 및 수정 계획 작성은 절대 수행하지 말 것. AskUserQuestion/Edit/Write 호출 금지.
```

Challenger 결과를 수집합니다.

### Step 4: Verdict Aggregation

`skills/debug-verify/aggregation.md`를 Read로 읽고 그 규칙에 따라 결과를 종합하세요:

1. Advocate와 Challenger 결과 파싱
2. Verdict Consensus 테이블에 따라 최종 판정 결정
3. 증거 병합
4. Action 결정

### Step 5: Loop Decision

**CONFIRMED 또는 REFUTED:**
→ Step 5.5로 이동 (수정 방향 선택)

**INCONCLUSIVE:**
1. 현재 loop_count 확인
2. loop_count < 3 AND 교착 상태 아님 → Step 2로 재루프
   - Advocate에게 이전 라운드 결과 + INCONCLUSIVE claim + Challenger의 MISSED_EVIDENCE 전달
   - Challenger에게 이전 ALTERNATIVE_HYPOTHESES + 새 Advocate 결과 전달
3. loop_count >= 3 OR 교착 상태 → Step 5.5로 이동 (사용자 위임)

### Step 5.5: Fix Direction Selection

**삽입 위치:** Step 5에서 verdict가 확정되어 Step 6으로 진행하기 직전. 재루프 경로에서는 실행하지 않음.

> **⚠ 메인 세션 전용:** 이 단계는 Advocate/Challenger 에이전트 결과 수집이 모두 완료된 후 메인 세션에서만 실행한다. AskUserQuestion은 subagent 컨텍스트에서 동작하지 않는다.

**Pre-condition Checklist (실행 전 확인):**
1. Advocate/Challenger 결과 수집 완료? — **false 시 Step 4로 복귀**
2. 현재 세션이 메인 세션? — **false 시 즉시 abort + "이 단계는 메인 세션 전용입니다. AskUserQuestion은 subagent에서 동작하지 않습니다." 메시지 출력**
3. 후보 수 ≥ 1이면 AskUserQuestion 호출 직전인지? — **정보성 (강제 동작 없음)**

**실행 조건:**
- `verdict == CONFIRMED` AND `len(FIX_CANDIDATES) ≥ 2` → 다중 후보 AskUserQuestion 실행 (아래)
- `verdict == CONFIRMED` AND `len(FIX_CANDIDATES) == 1` → **단일 후보 승인 게이트 AskUserQuestion 실행** (아래)
- `verdict == CONFIRMED` AND `len(FIX_CANDIDATES) == 0` → `selected_fix_direction = "n/a"`, Step 6에서 "후보 없음" 템플릿 사용
- `verdict == REFUTED` OR `INCONCLUSIVE` → `selected_fix_direction = "n/a"`, 바로 Step 6으로

**AskUserQuestion 호출 방식 (후보 == 1, 승인 게이트):**
- `multiSelect: false`
- 질문: `"진단이 확정되었습니다. 다음 수정 방향을 적용할까요?"`
- 옵션 (2개):
  1. `"{후보 설명} 적용 (Recommended)"` — description에 Apply + Trade-off 요약
  2. `"적용 안 함"` — description "사용자가 직접 수정 계획을 작성"
- 결과 매핑: "적용" 선택 시 해당 후보를 `selected_fix_direction`에 저장. "적용 안 함" 선택 시 `selected_fix_direction = "skipped"`.

**AskUserQuestion 호출 방식 (후보 ≥ 2):**
- `multiSelect: false`
- 질문: `"진단이 확정되었습니다. 어떤 수정 방향으로 진행할까요?"`
- 옵션 (최대 4개, 마지막 슬롯은 항상 "모두 건너뛰기"):
  1. `[recommended]` 후보 → label `"{후보 설명} (Recommended)"`, description에 Apply + Trade-off 요약
  2. `[alt]` 후보들 → label `"{후보 설명}"`, description에 Apply + Trade-off 요약
  3. "모두 건너뛰기" → `selected_fix_direction = "skipped"`, 사용자가 직접 수정 계획을 작성
- 후보 5개 이상이면 `[recommended]` 우선 + 원 순서로 상위 3개 + "모두 건너뛰기". 절단된 후보는 질문 description에 `"[alt] 외 N건 생략"` 명시.

**결과 저장:**
- 선택된 후보를 `selected_fix_direction` 변수에 보관 (Step 6에서 report-template의 "Selected Fix Direction" 필드에 주입). 사용자가 미적용/건너뛰기를 선택했으면 `"skipped"` 값.
- Step 7 세션 상태 기록 시 `claims_summary` 내 해당 claim 엔트리에 `selected_fix` 필드로 함께 저장.

**loop_count 상호작용:** Step 5.5는 CONFIRMED/REFUTED/INCONCLUSIVE 확정 후에만 실행되므로 `loop_count` 증가에 영향 없음.

### Step 6: Final Report

`skills/debug-verify/report-template.md`를 Read로 읽고, 해당 템플릿에 따라 최종 리포트를 출력하세요.

루프가 1회였으면 Single Loop Report, 2회 이상이었으면 Multi-Loop Report 사용.
판정에 따른 Recommended Action Template을 적용:
- **CONFIRMED + 후보 0개 (n/a):** "CONFIRMED (후보 1개 또는 0개)" 템플릿
- **CONFIRMED + 후보 1개 + 사용자가 적용 선택:** "CONFIRMED (후보 1개 또는 0개)" 템플릿
- **CONFIRMED + 후보 ≥ 2 + 사용자가 후보 선택 완료:** "CONFIRMED (후보 2개 이상 — 사용자가 방향 선택)" 템플릿. `selected_fix_direction`을 본문 "사용자가 선택한 수정 방향" 섹션에 주입.
- **CONFIRMED + 사용자가 모두 건너뛰기/적용 안 함 선택 (`selected_fix_direction == "skipped"`):** "CONFIRMED (사용자가 모두 건너뛰기)" 템플릿. 검토한 후보 목록을 함께 표시.
- **REFUTED:** REFUTED 템플릿
- **INCONCLUSIVE:** INCONCLUSIVE 템플릿

리포트 상단 메타데이터의 "Selected Fix Direction" 필드에 Step 5.5 결과 반영.

### Step 7: Update Session State

세션 상태를 업데이트하세요:

**상태 파일 경로:** `~/.claude/plugins/data/debug-verify/sessions/{sessionId}.json`

sessionId는 Step 1에서 확보한 값을 사용하세요. 훅 트리거 시 additionalContext에서 제공되며, 수동 호출 시에는 Step 1에서 생성한 타임스탬프 기반 ID를 사용합니다.

```bash
mkdir -p ~/.claude/plugins/data/debug-verify/sessions
cat > ~/.claude/plugins/data/debug-verify/sessions/{sessionId}.json << 'EOF'
{
  "verify_count": <이전 값 + 1>,
  "last_verdict": "<이번 검증 최종 판정>",
  "loop_count": <이번 세션의 총 루프 횟수>,
  "plan_path": "<검증한 플랜 파일 경로>",
  "last_verified_at": "<ISO 8601 타임스탬프>",
  "claims_summary": [<각 claim의 {claim, verdict, selected_fix?} 요약 — selected_fix는 Step 5.5에서 선택된 후보 또는 "n/a">]
}
EOF
```

## Important Rules

- **순차 실행:** Advocate → Challenger 순서 필수 (Challenger는 Advocate 결과 필요)
- **수동 호출:** `/debug-verify` 또는 `/kapasi`로 호출 시 디바운스 제한 무시, 항상 실행
- **도구 유연성:** 사용 가능한 도구에 따라 에이전트가 적절히 대응. 특정 도구에 의존하지 않음.
- **에이전트 실패 처리:** Advocate 실패 시 전체 검증 실패로 사용자 안내. Challenger 실패 시 Advocate 결과만으로 판정 (경고 표시).
- **plan-review 연동:** CONFIRMED 판정 후 수정 계획 작성 시, 디버깅 키워드가 없는 구현 플랜이므로 plan-review가 자동 트리거됨.
- **재루프 효율:** 이전 루프에서 시도한 도구/쿼리를 에이전트에게 전달하여 중복 탐색 방지.
- **Plan mode 시그널 시행:** 입력에 `plan_mode: true` 컨텍스트가 있으면 Advocate/Challenger 모두 read-only 도구만 사용한다. forbidden_tools(Edit, Write, Bash 쓰기/네트워크, git commit, recursive Skill)를 시도해야 검증 가능한 claim은 INCONCLUSIVE 처리하고 MANUAL_CHECKS에 사유를 명시한다.
- **Tool Coverage 강제:** Step 1.5의 CLAIM_TOOL_MAP에 명시된 REQUIRED_TOOLS를 호출하지 않은 claim은 Advocate가 CONFIRMED를 내렸어도 Step 4의 Tool Coverage Audit에서 INCONCLUSIVE로 강제 변환된다.
