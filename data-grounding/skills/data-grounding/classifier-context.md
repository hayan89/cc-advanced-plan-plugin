# Inline Category Classifier

메인 세션이 직접 실행하는 인라인 단계. **별도 에이전트를 디스패치하지 않습니다.**

## 입력

- 사용자 원본 프롬프트 (Step 1.3에서 보유)
- 프로젝트 루트 경로

## 절차

### 2.1 Data Target 추출 + 도구 카테고리 분류

사용자 프롬프트에서 **조회 가능한 데이터 후보**(DATA_TARGETS)를 추출하세요. 가설 자체가 아니라 "어떤 종류의 사실을 어디서 보면 가설을 좁힐 수 있는가"의 후보입니다.

각 후보에 도구 카테고리 라벨을 부여하세요. **카테고리는 "검증 능력의 추상화"입니다.** 같은 카테고리 안에서 MCP 도구·CLI·Bash 명령은 서로 등가의 fallback이며, 환경에서 어느 하나라도 가용하면 해당 카테고리는 `available`로 간주합니다.

| 카테고리 | 검증 능력 | 가용 도구 (MCP / CLI / Bash 무관) |
|---------|----------|----------------------------------|
| `CODE_LOGIC` | 코드 구조·로직 정적 검증 | Grep, Read, Glob, ripgrep / ag CLI |
| `DB_STATE` | DB 스키마·행·쿼리 결과 조회 | DB MCP (D1 등) **또는** Bash CLI: `sqlcmd` / `psql` / `mysql` / `sqlite3` / `mongosh` 등 |
| `LOG_PATTERN` | 로그 라인·패턴 검색 | `mcp__grafana__query_loki_logs` **또는** 로컬 파일 Read+Grep, `tail` / `awk` / `journalctl` Bash |
| `METRIC` | 시계열 지표 조회 | `mcp__grafana__query_prometheus` **또는** Bash: `curl`로 Prometheus HTTP API, `promtool query`, export된 CSV Read |
| `PROFILE` | 프로파일 데이터 분석 | `mcp__grafana__query_pyroscope` **또는** Bash: `perf` / `pprof` CLI, flame graph dump 파일 Read |
| `DASHBOARD` | 대시보드 메타·패널 조회 | `mcp__grafana__search_dashboards` / `get_dashboard_by_uid` **또는** dashboard JSON 파일 Read, `curl`로 Grafana HTTP API |
| `EXTERNAL_API` | HTTP·외부 서비스 호출 | WebFetch **또는** Bash: `curl` / `wget`, 명시된 SDK CLI |

한 후보에 카테고리 1~N개 부여 가능 (다중 검증이 권장되는 케이스).

> **원칙:** "도구 X가 미가용"이라고 단언하기 전에 **MCP·CLI 양쪽** 모두 점검하세요. MCP가 없어도 CLI가 PATH에 있으면 `available`입니다.

추출 가이드:

- 사용자가 `"users 테이블 조회가 느림"` → `DB_STATE` (스키마/인덱스), `METRIC` (latency 지표)
- 사용자가 `"500 에러가 간헐적으로 발생"` → `LOG_PATTERN` (에러 로그 추출), `METRIC` (에러율)
- 사용자가 `"foo() 함수가 잘못된 값 반환"` → `CODE_LOGIC` (함수 정의/호출), `LOG_PATTERN` (런타임 로그)
- 사용자가 `"외부 API 응답이 이상함"` → `EXTERNAL_API` (직접 호출), `LOG_PATTERN` (응답 로그)

### 2.2 DATA_TARGET_MAP 구조

다음 Markdown 표 형식으로 결과를 구조화하세요:

```
| Target ID | 원문 발췌 | REQUIRED_TOOLS | Status |
|-----------|----------|----------------|--------|
| T1 | {프롬프트에서 발췌한 데이터 후보 묘사} | DB_STATE, LOG_PATTERN | available |
| T2 | {다른 후보} | METRIC | unavailable |
```

후보가 0개면 표 본체에 `(no data targets extracted)` 한 줄 표기.

### 2.3 환경 가용성 점검

각 카테고리에 대해 **MCP 우선 → CLI fallback → 로컬 도구 fallback** 순으로 가용성을 점검하세요. **하나라도 충족되면 그 카테고리는 `available`**입니다.

점검 절차 (카테고리당):

1. **MCP 점검:** 해당 카테고리의 MCP 도구가 사용 가능한 도구 목록에 등재돼 있는지 확인 (예: `mcp__grafana__query_prometheus`).
2. **CLI 점검 (MCP 미가용 시):** Bash로 `command -v {cli명}`을 1회 실행하여 PATH 존재 확인.
   - 예: `command -v sqlcmd`, `command -v psql`, `command -v curl`, `command -v promtool`
   - 한 카테고리의 대안 CLI 후보를 모두 점검할 필요 없음 — **하나라도 발견되면 충족.**
3. **로컬 도구 점검:** Grep / Read / Glob은 항상 available로 간주 (점검 불필요).

판정:

- 카테고리의 MCP·CLI·로컬 도구 중 **하나라도 가용** → `available`. DATA_TARGET_MAP의 Status도 `available`.
- 카테고리의 모든 후보가 미가용 → `unavailable`. 카테고리 명을 `UNAVAILABLE_TOOLS` 목록에 한 번만 나열.

기록 시 어떤 도구가 가용 판정에 쓰였는지 DATA_TARGET_MAP에 짧게 명시할 수 있습니다 (선택). 예: `DB_STATE (via psql CLI)`.

### 2.4 산출물 보관

DATA_TARGET_MAP과 UNAVAILABLE_TOOLS를 메모리 변수로 보관. Step 3 Grounder 디스패치 프롬프트의 `== DATA_TARGET_MAP ==` / `== UNAVAILABLE_TOOLS ==` 블록에 그대로 삽입.

DATA_TARGET_MAP이 비어있으면 (모든 추출 결과가 0개) Step 3을 스킵하고 Step 4로 진입 — `GROUNDED_FACTS: none`, `OPEN_QUESTIONS:` 섹션에 "프롬프트만으론 조회 후보를 특정할 수 없음" 사유 명시 후 사용자에게 추가 정보 요청.
