# data-grounding

플랜 작성 **전** 단계에서 실 데이터(DB/로그/메트릭)를 read-only로 조회해 가설을 좁히는 Claude Code 플러그인.

## Why

마켓플레이스의 두 형제 플러그인은 모두 **사후 검증** 모델이다:

- `plan-review` — 플랜 작성 **후** 5축 검토 + Phase 6에서 데이터 가정을 `debug-verify`에 위임 검증
- `debug-verify` — 디버깅 플랜 작성 **후** Advocate/Challenger 카파시 루프로 실 데이터 검증

문제: 잘못된 데이터 가정 위에 세워진 플랜을 사후에 뒤집는 구조라, REFUTED 시 플랜 자체를 재작성해야 하므로 비용이 높다.

`data-grounding`은 **사전 그라운딩** 단계를 추가한다 — 디버깅성 사용자 요청을 받으면 플랜 작성 전에 read-only 데이터 조회로 사실을 모으고, 그 위에 플랜을 세우게 한다. 결과적으로 후속 plan-review/debug-verify의 사후 검증 부담이 줄고, REFUTED 비율이 떨어진다.

## When This Activates

- **자동:** UserPromptSubmit 훅이 사용자 프롬프트에서 디버깅 키워드 ≥ 2건을 감지하면 `[MAGIC KEYWORD: data-grounding]` 주입 → 메인 세션이 스킬 호출
- **수동:** `/ground` 명령으로 직접 호출 (디바운스 무시, 동의 게이트 스킵)

## End-to-End Flow

```
사용자 프롬프트 (디버깅성)
        │
        ▼
[UserPromptSubmit 훅] data-grounding 자동 감지 (수동: /ground)
        │
        ▼
data-grounding 스킬 (메인 세션)
  ├─ AskUserQuestion 게이트 (수동 호출 시 skip)
  ├─ Inline Classifier (DB/log/metric 카테고리 분류 + 가용성 점검)
  ├─ Grounder Agent → read-only 쿼리 → GROUNDED_FACTS 반환
  └─ 종료 — 플랜 파일은 만들지 않음
        │
        ▼
메인 세션이 GROUNDED_FACTS를 컨텍스트로 플랜 작성
~/.claude/plans/*.md 에 Write/Edit
        │
        ▼
[PostToolUse 훅 분기 — 디버깅 키워드 카운트로 상호 배타]
        │
        ├─ 키워드 < 2 (일반 플랜)
        │       ▼
        │   plan-review 트리거 (5축 검토)
        │     └─ Phase 6 (Empirical Delegation)
        │            └─ debug-verify Skill 위임 호출
        │
        └─ 키워드 ≥ 2 (디버깅 플랜)
                ▼
            debug-verify 직접 트리거 (Advocate/Challenger 카파시 루프)
```

## Tool Categories

Grounder는 다음 카테고리에서 read-only 도구를 사용한다. 카테고리 안의 MCP·CLI·Bash는 등가의 fallback이며, 환경에서 어느 하나라도 가용하면 `available`이다.

| 카테고리 | 가용 도구 |
|---------|----------|
| `CODE_LOGIC` | Grep / Read / Glob, `ripgrep` / `ag` |
| `DB_STATE` | DB MCP, `psql` / `mysql` / `sqlite3` / `mongosh` / `sqlcmd` |
| `LOG_PATTERN` | `mcp__grafana__query_loki_logs`, 파일 Read+Grep, `tail` / `awk` / `journalctl` |
| `METRIC` | `mcp__grafana__query_prometheus`, `curl` (Prom HTTP API), `promtool` |
| `PROFILE` | `mcp__grafana__query_pyroscope`, `perf` / `pprof` |
| `DASHBOARD` | `mcp__grafana__search_dashboards`, JSON Read, `curl` (Grafana API) |
| `EXTERNAL_API` | WebFetch, `curl` / `wget` |

## Query Budget

무한 탐색을 막기 위해 호출 상한을 둔다:

- 카테고리당 최대 **3 호출**
- 총 **12 호출** 상한
- 초과 시 추가 호출 중단하고 `BUDGET_EXCEEDED: true` 표기

## Read-only 강제

Grounder는 다음 도구를 절대 호출하지 않는다:

- `Edit` / `Write` (파일 수정)
- `Bash`로 쓰기·네트워크 변경 명령 (DDL/DML, HTTP POST/PUT/DELETE 등)
- `git commit`
- recursive Skill 호출 (특히 `plan-review`/`debug-verify` 재호출 차단)

DDL/DML이 필요한 검증은 `DATA_GAPS`에 "쓰기 도구 필요 — 본 스킬 범위 밖"으로 기록되고, 후속 plan-review/debug-verify가 사후 검증 단계에서 다룬다.

## Session State

`~/.claude/plugins/data/data-grounding/sessions/{sessionId}.json`:

```json
{
  "grounded": true,
  "declined": false,
  "run_count": 1,
  "last_prompt_at": "2026-04-29T05:36:00Z",
  "summary": {
    "data_target_count": 4,
    "facts_collected": 7,
    "budget_exceeded": false
  }
}
```

자동 트리거는 `grounded || declined || run_count >= 1`이면 skip. 수동 호출(`/ground`)은 디바운스 무시.

## Relationship with Sibling Plugins

- 본 스킬은 `plan-review`/`debug-verify`를 호출하지 않는다 → 호출 그래프가 trivial 트리로 유지, 재귀 없음.
- 사전 그라운딩 결과가 사용자 메시지/플랜 본문에 반영되므로, 후속 `plan-review` Phase 6의 CONFIRMED 비율이 자연스럽게 높아진다.
- `debug-verify`는 **사후 가설 검증**, 본 스킬은 **사전 사실 수집** — 책임 분리.

## Versioning

- v1.0.0 (2026-04-29) — 초기 릴리스. UserPromptSubmit 훅 + `/ground` 슬래시 명령 + 단일 Grounder 에이전트.
