---
name: data-grounding
description: >
  사용자 프롬프트가 디버깅성 신호를 포함하면 자동 트리거(또는 /ground 수동 호출),
  플랜 작성 전에 DB/로그/메트릭을 read-only로 조회해 가설을 좁히고 GROUNDED_FACTS를
  메인 세션에 반환합니다. 후속 plan-review/debug-verify의 사후 검증 부담을 줄입니다.
  UserPromptSubmit 훅의 [MAGIC KEYWORD: data-grounding]로 자동 활성화됩니다.
---

# Data Grounding v1.0.0

플랜 작성 **이전** 단계에서 실 데이터를 read-only로 조회해 가설을 좁히는 스킬.
`plan-review`/`debug-verify`가 사후 검증인 것과 달리, 본 스킬은 **사전 그라운딩** 역할이다.

호출 그래프상 본 스킬은 plan-review/debug-verify를 호출하지 않으며, 단지 사실(facts)을
메인 세션에 반환하여 후속 플랜 작성의 기반 자료로 사용한다.

## When This Activates

- **자동:** UserPromptSubmit 훅이 사용자 프롬프트에서 디버깅 키워드 ≥ 2건을 감지하면 트리거
- **수동:** `/ground` 명령으로 직접 호출 (디바운스 제한 없음)

## Procedure

### Step 1: Context Collection

#### 1.0 호출 모드 판정

다음 우선순위로 입력 소스를 결정합니다:

1. **수동 호출 (`/ground`):** 슬래시 명령 인자 또는 가장 최근 사용자 메시지를 원본 프롬프트로 사용. 동의 게이트(Step 1.5) 스킵.
2. **자동 트리거 (훅 주입):** 훅이 `additionalContext`로 주입한 메시지에 포함된 사용자 프롬프트 정보를 사용. 동의 게이트(Step 1.5) 실행.

#### 1.1 sessionId 결정

- 훅 트리거 시 훅이 전달한 sessionId 사용
- 수동 호출 시 현재 타임스탬프 기반 ID 생성 (예: `manual-2026-04-29T05:36:00Z`)

#### 1.2 세션 상태 로드

`~/.claude/plugins/data/data-grounding/sessions/{sessionId}.json` 읽어 이전 상태 로드:

```json
{
  "grounded": false,
  "declined": false,
  "run_count": 0,
  "last_prompt_at": ""
}
```

파일 없으면 위 기본값 사용. 자동 트리거인데 `grounded || declined || run_count >= 1`이면 즉시 종료 (디바운스 — 훅이 통과시켰더라도 보수적 재확인).

#### 1.3 사용자 원본 프롬프트 보유

이후 단계의 입력으로 사용할 프롬프트 전문을 메모리 변수로 보유.

### Step 1.5: User Confirmation Gate

> **⚠ 메인 세션 전용:** AskUserQuestion은 subagent 컨텍스트에서 동작하지 않는다.

**실행 조건:**
- 자동 트리거 모드 → 실행
- 수동 호출 모드 (`/ground`) → 스킵 (사용자 의도가 이미 명확)

**Pre-condition Checklist:**
1. 현재 세션이 메인 세션? — **false 시 즉시 abort + "이 단계는 메인 세션 전용입니다." 메시지**
2. 자동 트리거 모드? — **false 시 본 단계 스킵**

**AskUserQuestion 호출:**

- `multiSelect: false`
- 질문: `"이 요청은 디버깅성으로 감지되었습니다. 플랜 작성 전 실 데이터(DB/로그/메트릭)를 먼저 read-only로 조회할까요?"`
- 옵션 (3개):
  1. `"수집 진행 (Recommended)"` — description "DB/로그/메트릭 카테고리를 분류하고 가용한 도구로 read-only 조회. 결과를 메인 세션에 반환."
  2. `"건너뛰기 — 일반 플랜 작성"` — description "사전 그라운딩 없이 곧장 플랜 작성으로 진입. 같은 세션에서 자동 트리거 비활성화."
  3. `"취소"` — description "스킬 호출 자체를 취소. 세션 상태에 declined 기록."

**결과 처리:**
- "수집 진행" → Step 2로
- "건너뛰기" / "취소" → 세션 상태에 `declined: true` 기록 후 종료. 메인 세션은 일반 흐름으로 복귀.

### Step 2: Inline Category Classifier

메인 세션이 직접 실행하는 인라인 단계. **별도 에이전트를 디스패치하지 않습니다.**

`skills/data-grounding/classifier-context.md`를 Read로 읽어 그 절차를 따르세요. 출력은 다음 두 산출물:

- **DATA_TARGET_MAP:** Markdown 표 (`Target ID | 원문 발췌 | REQUIRED_TOOLS | Status`)
- **UNAVAILABLE_TOOLS:** 미가용 카테고리 목록 또는 `none`

DATA_TARGET_MAP이 비어있으면 (디버깅 신호가 있어도 구체적 데이터 후보가 없는 경우) Step 3을 스킵하고 Step 5로 진행 — 보고서에 `GROUNDED_FACTS: none`, `OPEN_QUESTIONS:` 섹션에 사용자에게 추가 정보 요청 항목 나열.

### Step 3: Grounder Agent Dispatch

`skills/data-grounding/grounder-context.md`를 Read로 읽어 내용을 확보합니다.

`Agent` tool로 Grounder 에이전트 1개를 디스패치하세요 (Advocate/Challenger 듀얼 루프 아님 — 사실 수집은 확인 편향과 무관):

```
당신은 data-grounding의 Grounder(사실 수집자) 에이전트입니다.
아래 사용자 프롬프트의 디버깅 신호에 대해, read-only 도구로 실 데이터를 수집하세요.

== Plan Mode Context ==
plan_mode: false
allowed_tools: read-only only
forbidden_tools: Edit, Write, Bash(write/network), git commit, recursive Skill

== Query Budget ==
- 카테고리당 최대 3 호출
- 총 12 호출 상한
- 초과 시 추가 호출 중단하고 BUDGET_EXCEEDED: true 표기

== DATA_TARGET_MAP ==
{Step 2에서 생성한 Markdown 표 그대로 삽입}

== UNAVAILABLE_TOOLS ==
{Step 2에서 생성한 미가용 카테고리 목록. 비어있으면 'none'}

== Grounder Context ==
{grounder-context.md의 전체 내용을 여기에 삽입}

== User Prompt ==
{Step 1.3에서 보유한 사용자 원본 프롬프트}

프로젝트 루트: {cwd}

Output Format에 맞춰 결과를 반환하세요.

**범위 제약:** 너의 책임은 사실 수집 결과 반환까지다. 플랜 파일을 만들거나 plan-review/debug-verify를 호출하지 말 것. AskUserQuestion/Edit/Write 호출 금지 — read-only 도구만 사용.
```

Grounder 결과를 수집합니다.

### Step 4: Return to Main Session

`skills/data-grounding/report-template.md`를 Read로 읽고, 해당 템플릿에 따라 결과를 사용자에게 출력하세요.

**중요:** 이 단계에서 플랜 파일을 만들지 않습니다. 메인 세션이 반환된 GROUNDED_FACTS와 NARROWED_HYPOTHESES를 컨텍스트로 후속 플랜을 작성하게 됩니다.

다음 메시지를 출력에 포함하세요:

> **다음 단계:** 위 GROUNDED_FACTS를 컨텍스트로 플랜을 작성해 주세요. 플랜이 `~/.claude/plans/`에 저장되면 plan-review (또는 디버깅 키워드 ≥ 2이면 debug-verify)가 자동 트리거되어 플랜의 데이터 가정을 사후 검증합니다.

### Step 5: Update Session State

세션 상태를 업데이트하세요:

**상태 파일 경로:** `~/.claude/plugins/data/data-grounding/sessions/{sessionId}.json`

```bash
mkdir -p ~/.claude/plugins/data/data-grounding/sessions
cat > ~/.claude/plugins/data/data-grounding/sessions/{sessionId}.json << 'EOF'
{
  "grounded": true,
  "declined": false,
  "run_count": <이전 값 + 1>,
  "last_prompt_at": "<ISO 8601 타임스탬프>",
  "summary": {
    "data_target_count": <DATA_TARGET_MAP 행 수>,
    "facts_collected": <GROUNDED_FACTS 항목 수>,
    "budget_exceeded": <true|false>
  }
}
EOF
```

## Important Rules

- **사후 호출 차단:** 본 스킬은 plan-review/debug-verify를 호출하지 않는다. 호출 그래프가 trivial 트리로 유지된다 (재귀 없음).
- **Read-only 강제:** Grounder 에이전트는 Edit/Write/Bash(write/network)/git commit/recursive Skill을 호출하지 않는다. 강제로 필요한 항목은 INCONCLUSIVE 처리하고 DATA_GAPS에 기록.
- **수동 호출:** `/ground`로 호출 시 디바운스 제한 무시, AskUserQuestion 게이트 스킵, 항상 실행.
- **에이전트 실패 처리:** Grounder 실패 시 Step 4에서 `GROUNDED_FACTS: none`, `DATA_GAPS:`에 사유 기록하고 메인 세션에 반환. 실패가 후속 흐름을 막지 않음 (best-effort).
- **예산 초과 처리:** 카테고리당 3 호출 / 총 12 호출 상한 도달 시 추가 호출 중단. `BUDGET_EXCEEDED: true` 표기 후 수집된 결과까지만 반환.
- **False positive 완화:** 자동 트리거 모드에선 AskUserQuestion 게이트가 1차 필터. 사용자가 건너뛰기 선택 시 같은 세션에서 자동 트리거 비활성화 (declined: true).
