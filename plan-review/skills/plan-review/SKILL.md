---
name: plan-review
description: >
  플랜 파일 작성 후 자동 트리거 또는 수동 호출(/plan-review)하여, 플랜을 프로젝트 지시사항(CLAUDE.md 등)과
  코드베이스 구성에 대해 비판적으로 검토합니다. Phase 1~5를 각각 단독 leaf로 5개 병렬 디스패치(Team mode 우선)합니다.
  PostToolUse 훅의 [MAGIC KEYWORD: plan-review]로 자동 활성화됩니다.
---

# Plan Review v2.4

플랜 파일을 프로젝트 지시사항과 코드베이스 구성에 대해 5축으로 비판적 검토하는 스킬.
Phase 1~5를 각각 단독 leaf로 5개 병렬 디스패치하며, Team mode가 사용 가능한 경우 우선 사용합니다.
첫 번째 리뷰에서 이슈 발견 시, iterative deep re-review로 false positive을 제거하고 이슈 검증 정확도를 높입니다.
v2.3부터 Phase 6 (Empirical Delegation)을 모든 분기 끝에 추가하여, 플랜의 데이터 가정을 debug-verify로 위임 검증합니다.
v2.4부터 복잡도 기반 라우팅을 폐기하고 Phase별 단독 leaf 5개 병렬로 통일한다.

## When This Activates

- **자동:** PostToolUse 훅이 `~/.claude/plans/` 파일 Write/Edit를 감지하면 트리거
- **수동:** `/plan-review` 명령으로 직접 호출 (디바운스 제한 없음)

## Procedure

### Step 1: Context Collection

다음을 수집하세요:

1. **플랜 파일:** 훅이 전달한 경로, 없으면 가장 최근 수정된 `~/.claude/plans/*.md`
2. **지시사항 문서 경로 목록:**
   - `~/.claude/CLAUDE.md` (글로벌)
   - 프로젝트 루트의 `CLAUDE.md` (있으면)
   - 프로젝트 루트의 `AGENTS.md` (있으면)
   - `.claude/rules/*.md` (있으면)
3. **프로젝트 루트:** 현재 작업 디렉토리

플랜 파일의 전체 내용을 Read로 읽어 두세요 — 이후 단계에서 에이전트에게 전달합니다.

### Step 2: Phase-Functional Leaf Parallel Dispatch

`skills/plan-review/phases/common-context.md`, `phase-1-directive.md`, `phase-2-structure.md`, `phase-3-completeness.md`, `phase-4-risk.md`, `phase-5-security.md`를 Read로 모두 읽어 내용을 확보합니다.

각 Phase를 **단독 leaf**로 디스패치합니다 (Phase 1, 2, 3, 4, 5 각각 1 leaf — 총 5 leaf).

**전략 선택 (위에서부터 평가):**

1. TeamCreate 도구가 사용 가능하면 → **A. Team mode** (5명)
2. TeamCreate가 사용 불가하거나 호출이 실패하면 → **B. Subagent 5x 병렬** 폴백

#### A. Team mode (우선 시도)

1. **TeamCreate로 팀 생성:**
   ```
   TeamCreate: name="plan-review-team"
   ```

2. **5명 멤버에게 SendMessage로 태스크 할당:**
   각 멤버에게 아래 공통 프롬프트 템플릿을 SendMessage로 전달.
   멤버 이름: `reviewer-phase-1`, `reviewer-phase-2`, `reviewer-phase-3`, `reviewer-phase-4`, `reviewer-phase-5`

3. **결과 수집:** 5명의 결과를 모두 수신할 때까지 대기.

#### B. Subagent 5x 병렬 (폴백)

하나의 메시지에서 **5개 Agent tool call을 동시에** 디스패치하세요. 각 Agent는 아래 공통 프롬프트 템플릿으로 단독 Phase를 검토합니다.

#### 공통 프롬프트 템플릿 (모든 leaf 공통)

```
당신은 plan-review 검토 에이전트입니다.
아래 플랜을 Phase {N} ({Phase 이름})에 대해 검토하세요.

== Common Context ==
{common-context.md의 전체 내용을 여기에 삽입}

== Phase {N} Instructions ==
{phase-N-*.md의 전체 내용을 여기에 삽입}

== Plan File ==
{플랜 파일 전문을 여기에 삽입}

== Directive File Paths ==
다음 경로의 지시사항 파일을 Read tool로 읽어 검토에 활용하세요:
{지시사항 파일 경로 목록}

프로젝트 루트: {cwd}

Output Format에 맞춰 결과를 반환하세요.

**범위 제약:** 너의 책임은 위 Phase 검토 결과 반환까지다. Step 3 이후(집계/판정/사용자 선택/플랜 파일 수정)는 절대 수행하지 말 것. AskUserQuestion/Edit/Write 호출 금지 — Read/Glob/Grep만 사용.
```

5개 leaf 결과 수집 후, **Phase 6 실행 (메인 세션 직접):** `skills/plan-review/phases/phase-6-empirical-delegation.md`를 읽고 실행. Skill tool로 debug-verify를 호출하므로 subagent/팀 멤버에서 호출 금지 — debug-verify Skill 호출이 메인 세션 컨텍스트(AskUserQuestion, MCP 도구 가용성 점검)를 요구한다.
→ Phase 1~6 결과를 모아 Step 3으로 이동.

### Step 3: Aggregate Results

`skills/plan-review/aggregation.md`를 Read로 읽고 그 규칙에 따라 결과를 집계하세요:

1. 각 에이전트/멤버의 결과에서 PHASE, SCORE, ISSUES를 파싱
2. 총점 합산
3. 이슈 목록 병합 (severity 순 정렬, 중복 제거)
4. 판정 결정 (PASS / NEEDS_REVISION / MAJOR_ISSUES)
5. aggregation.md의 Final Output Format으로 결과 표시

### Step 4: Iterative Deep Review

이 단계는 첫 번째 리뷰에서 이슈가 발견된 경우에만 실행됩니다.
동일 실행 내에서 2~3회 추가 deep re-review를 수행하여 false positive을 제거하고 이슈 검증 정확도를 높입니다.

#### 4.1 진입 조건 확인

다음 조건을 **모두** 만족하면 deep re-review 루프에 진입:
- 이번 세션의 review_count가 이 리뷰 시작 시 0이었음 (첫 번째 리뷰)
- Step 3의 총점이 > 0

하나라도 불충족 시 → Step 5로 이동.

#### 4.2 Re-Review 루프 (최대 2회 반복)

iteration = 1로 시작. 아래를 반복:

**1. 종료 조건 확인 (하나라도 충족 시 루프 탈출):**
- 직전 iteration 총점이 ≤ 24 → 루프 종료
- iteration > 2 → 루프 종료
- 직전 iteration 대비 점수 감소가 < 3 AND iteration > 1 → 루프 종료

**2. Phase 선별:**
- 직전 iteration에서 SCORE > 5인 Phase → `full_review_phases` (Template A 사용)
- 직전 iteration에서 SCORE 1~5인 Phase → `lightweight_phases` (Template B 사용)
- 직전 iteration에서 SCORE = 0인 Phase → `skipped_phases` (0점 유지, 디스패치 안 함)

**3. Re-Review 디스패치 전략:**

초기 Step 2와 동일하게 Phase 단위 단독 leaf로 디스패치한다.
- TeamCreate 가용 시 → Team mode 사용 (필요한 leaf 수만큼 SendMessage)
- 미가용/실패 시 → Agent tool 병렬 (필요한 leaf 수만큼)
- `full_review_phases`와 `lightweight_phases`를 각각 별도 leaf로 디스패치 (한 leaf = 한 Phase의 Template A 또는 Template B)
- 디스패치할 leaf 합계가 0개면 Re-Review 자체 skip

**4. Re-Review 디스패치:**

`skills/plan-review/phases/deep-review-context.md`를 Read로 읽습니다.

각 `full_review_phases`에 대해:
- deep-review-context.md의 **Template A** (Full Re-Review) 사용
- `{previous_findings}`에 직전 iteration의 해당 Phase ISSUES 삽입
- `{previous_score}`에 직전 iteration의 해당 Phase SCORE 삽입
- `{phase_scores_summary}`에 전체 Phase 스코어 요약 삽입
- 해당 Phase의 phase-N-*.md 지시사항 포함

각 `lightweight_phases`에 대해:
- deep-review-context.md의 **Template B** (Lightweight Confirmation) 사용
- `{issues_list}`에 직전 iteration의 해당 Phase ISSUES 삽입

`skipped_phases`는 디스패치하지 않음 (SCORE: 0 유지).

**5. 결과 집계:**

aggregation.md의 **Multi-Iteration Aggregation Rules**에 따라 결과 처리:
- 확인된 이슈 / 제거된 false positive / 새 이슈 분류
- 총점 재계산
- iteration 결과를 pass_history에 추가

iteration++, 루프 상단으로 복귀.

#### 4.3 최종 보고서 생성

루프 종료 후, aggregation.md의 **Deep Review Final Output Format**에 따라 통합 보고서 생성.
pass_history를 Score Progression으로 표시.
→ Step 5로 이동 (최종 통합 결과를 사용).

### Step 5: Act on Verdict

> **⚠ 메인 세션 전용:** 이 단계는 모든 하위 에이전트/팀 멤버 결과 수집이 완료된 후 메인 세션에서만 실행한다. AskUserQuestion은 subagent 컨텍스트에서 동작하지 않는다.

**Pre-condition Checklist (실행 전 확인):**
1. 모든 subagent/팀 멤버 결과 수집 완료? — **false 시 Step 3으로 복귀**
2. 현재 세션이 메인 세션? — **false 시 즉시 abort + "이 단계는 메인 세션 전용입니다. AskUserQuestion은 subagent에서 동작하지 않습니다." 메시지 출력**
3. 후보 수 ≥ 1인 이슈가 있는 경우 AskUserQuestion 호출 직전인지? — **정보성 (강제 동작 없음)**

**PASS (총점 ≤ 24):**
- "플랜 검토 완료. 큰 문제 없음." 보고
- Step 6으로 이동

**NEEDS_REVISION (총점 25~60) / MAJOR_ISSUES (총점 > 60):**

각 이슈를 `len(FIX_CANDIDATES)` 기준 **2-way 분기**로 처리합니다 (aggregation.md Step 5 규칙):

- **단일 후보 (severity/Score 무관):** AskUserQuestion(multiSelect: false)으로 `["적용 (Recommended)", "적용 안 함"]` 승인 게이트. 하위호환 폴백 후보(`(legacy)` 마커)도 동일 경로.
- **후보 ≥ 2 (severity 무관):** AskUserQuestion(multiSelect: false)으로 후보 중 하나를 선택. 옵션 최대 4개 (상위 3개 + "모두 건너뛰기"), `[recommended]` 우선 + 원 순서. 절단된 후보는 질문 description에 `"[alt] 외 N건 생략"`으로 명시.
- **후보 0개 (수정 제안 없음):** 자동 적용 금지. `Pending (no fix proposed)`로 보고서에 별도 나열.

MAJOR_ISSUES의 경우 추가로:
- 모든 이슈를 severity 순으로 나열하여 사용자에게 조감 제공
- 플랜의 근본적 재작성이 필요할 수 있음을 안내

수정/선택 완료 후 Step 6으로 이동.

### Step 6: Update Session State

세션 상태를 업데이트하세요:

**상태 파일 경로:** `~/.claude/plugins/data/plan-review/sessions/{sessionId}.json`

```bash
mkdir -p ~/.claude/plugins/data/plan-review/sessions
cat > ~/.claude/plugins/data/plan-review/sessions/{sessionId}.json << 'EOF'
{
  "review_count": <이전 값 + 1>,
  "last_score": <이번 검토 총점>,
  "plan_path": "<검토한 플랜 파일 경로>",
  "last_reviewed_at": "<ISO 8601 타임스탬프>"
}
EOF
```

## Important Rules

- **Plan mode 제약:** plan mode에서는 플랜 파일만 수정 가능. 다른 파일 수정 금지. AskUserQuestion은 plan mode에서도 정상 호출 가능 (read-only UI 도구).
- **수동 호출:** `/plan-review`로 호출 시 디바운스 제한을 무시하고 항상 실행.
- **Calibration:** 실제 구현 실패를 유발할 문제만 플래그. 스타일 선호도나 이론적 문제 무시.
- **Evidence 필수:** 모든 이슈에 file:line 참조 또는 grep 결과 등 근거 포함.
- **범위 준수:** 플랜 범위 밖의 개선 제안 금지.
- **에이전트 실패 처리:** 에이전트가 실패하거나 결과를 반환하지 않으면, 해당 Phase 점수 = 0으로 처리하고 나머지 결과로 부분 집계. 실패한 Phase를 경고로 표시.
- **Phase 6 sequential 강제:** Phase 6은 항상 메인 세션에서 직접 실행한다. subagent/팀 멤버에서 호출 금지 — debug-verify Skill 호출이 메인 세션 컨텍스트(AskUserQuestion, MCP 도구 가용성 점검)를 요구한다.
- **Plan mode 시그널 전파:** plan mode에서 Phase 6은 임시 디버깅 플랜 상단에 `plan_mode: true` 헤더를 삽입해 read-only 시그널을 debug-verify에 전파한다. debug-verify가 forbidden 도구를 시도하면 호출자가 INCONCLUSIVE로 처리한다.
