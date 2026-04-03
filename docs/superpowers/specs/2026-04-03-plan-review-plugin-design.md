# Plan Review Plugin — Design Spec

## Context

매번 플랜 작성 후 "현재 계획을 기반으로 지시사항과 프로젝트 구성에 부합할지 상세 재검토"를 수동으로 1-2회 반복하는 워크플로우가 있다. 이 반복 작업을 자동화하여 플랜 파일 작성 직후 자동으로 검토가 트리거되도록 하는 Claude Code 플러그인을 만든다.

**목표:** 플랜 작성 → 자동 검토 → 자동 수정/승인 게이트 → ExitPlanMode 까지의 흐름을 하네스 엔지니어링으로 자동화
**배포 형태:** `~/.claude/plugins/`에 로컬 설치, 추후 별도 리포로 오픈소스화

---

## Architecture

**접근 방식: 하이브리드 (PostToolUse 훅 감지 + plan-review 스킬 실행)**

```
Write/Edit → ~/.claude/plans/*
       │
       ▼
[PostToolUse Hook: detect-plan-write.mjs]
  - 경로가 ~/.claude/plans/ 하위인지 확인
  - 세션 상태 확인 (review_count, last_score)
  - 조건 충족 시 → <system-reminder>로 스킬 호출 지시 주입
       │
       ▼
[plan-review Skill: SKILL.md]
  - 플랜 파일 + CLAUDE.md + 프로젝트 구성 수집
  - 4축 검토 (문서 부합, 구성 부합, 완성도, 크리티컬)
  - 점수 산출 (0~100, 높을수록 문제 많음)
  - 자동 수정 (≤5점 항목) + 승인 게이트 (>5점 항목)
  - 세션 상태 업데이트
```

**훅은 감지만, 스킬이 로직 담당** — 관심사 분리로 유지보수 용이. `/plan-review`로 수동 호출도 가능.

---

## Plugin Structure

```
plan-review/
├── .claude-plugin/
│   └── plugin.json              # 플러그인 매니페스트
├── hooks/
│   ├── hooks.json               # PostToolUse 훅 정의
│   └── detect-plan-write.mjs    # 플랜 파일 작성 감지 스크립트
├── skills/
│   └── plan-review/
│       ├── SKILL.md             # 검토 스킬 정의 (트리거 조건, 절차)
│       └── review-prompt.md     # 검토 프롬프트 템플릿
├── README.md
└── LICENSE
```

---

## Component Details

### 1. plugin.json

```json
{
  "name": "plan-review",
  "description": "Automatic plan review plugin — validates plans against project directives and codebase structure",
  "version": "1.0.0",
  "author": { "name": "hyunseung" },
  "license": "MIT",
  "keywords": ["plan", "review", "automation", "harness"]
}
```

### 2. hooks.json

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "node ~/.claude/plugins/plan-review/hooks/detect-plan-write.mjs",
            "timeout": 3
          }
        ]
      }
    ]
  }
}
```

### 3. detect-plan-write.mjs

**입력:** stdin으로 도구 호출 컨텍스트 JSON 수신. Claude Code 훅은 `tool_input` 객체를 stdin으로 전달하며, `file_path` 필드에서 대상 경로를 읽음. 세션 ID는 환경변수 `CLAUDE_SESSION_ID`에서 획득.

**동작:**

```
1. stdin에서 tool_input JSON 파싱 → file_path 추출
2. file_path가 $HOME/.claude/plans/ 하위인지 확인 (~를 $HOME으로 확장)
   - 아니면 → 빈 JSON 반환 (no-op)
3. 세션 상태 파일 로드: ~/.claude/plugins/data/plan-review/sessions/{CLAUDE_SESSION_ID}.json
   - 없으면 → 초기화: { review_count: 0, last_score: 100, plan_path: "" }
4. 디바운스 조건 확인:
   - review_count >= 2 → 스킵
   - last_score <= 20 → 스킵
5. 조건 충족 → additionalContext 반환:
   "[MAGIC KEYWORD: plan-review] 플랜 파일이 작성/수정되었습니다. 
    plan-review 스킬을 호출하여 검토를 진행하세요. 대상: {plan_path}"
```

**세션 상태 파일 스키마:**
```json
{
  "review_count": 0,
  "last_score": 100,
  "plan_path": "~/.claude/plans/buzzing-singing-flurry.md",
  "last_reviewed_at": "2026-04-03T10:30:00Z"
}
```

### 4. SKILL.md (plan-review)

```yaml
---
name: plan-review
description: >
  플랜 파일 작성 후 자동 트리거 또는 수동 호출하여, 플랜을 프로젝트 지시사항(CLAUDE.md 등)과 
  코드베이스 구성에 대해 비판적으로 검토. PostToolUse 훅의 [MAGIC KEYWORD: plan-review]로 
  자동 활성화됨.
---
```

**스킬 절차:**

1. **컨텍스트 수집**
   - 플랜 파일 읽기
   - CLAUDE.md, AGENTS.md, `.claude/rules/*.md` 수집
   - 프로젝트 루트에서 주요 구조 스캔 (Glob)

2. **4축 검토 실행** (review-prompt.md 템플릿 기반)

3. **점수 산출 및 결과 처리**
   - 총점 ≤ 20: "검토 완료, 큰 문제 없음" → 상태 업데이트 후 종료
   - 총점 > 20:
     - 개별 항목 ≤ 5점: 플랜에 자동 수정 반영
     - 개별 항목 > 5점: 사용자에게 제시하고 승인 요청
   - 세션 상태 업데이트 (`review_count++`, `last_score` 갱신)

4. **세션 상태 갱신**
   - `~/.claude/plugins/data/plan-review/sessions/{sessionId}.json` 업데이트

### 5. review-prompt.md (고도화 템플릿)

#### Phase 1: Directive Compliance Check

모든 지시사항 파일을 읽고, 플랜의 각 태스크가 지시사항을 위반하지 않는지 테이블로 검증.

| Directive Source | Directive | Plan Compliance | Violation? |
|-----------------|-----------|-----------------|------------|
| CLAUDE.md:L{n}  | {지시사항} | {플랜 내 대응} | YES/NO     |

**점수:** Critical 위반 = +10, Important = +5, Minor = +2

#### Phase 2: Project Structure Alignment

프로젝트를 Glob/Grep으로 실제 스캔하고 6가지 항목을 검증:

| Check | How to Verify | Example Failure |
|-------|--------------|-----------------|
| 파일 경로 컨벤션 | Glob for similar files | `src/utils/` vs `lib/` |
| 임포트 유효성 | Grep for module name | 존재하지 않는 모듈 참조 |
| 네이밍 컨벤션 | 기존 3+ 파일과 비교 | camelCase vs snake_case |
| 기술 스택 일치 | package.json 등 확인 | axios vs native fetch |
| 기존 유틸 재사용 | Grep for similar functionality | 중복 formatDate() 작성 |
| 테스트 패턴 일치 | 기존 테스트 파일 2-3개 확인 | Jest vs Vitest |

**점수:** 빌드 파괴 = +10, 비일관성 = +5, 선호도 = +2

#### Phase 3: Completeness & Critical Gaps

| Check | What to Look For |
|-------|-----------------|
| 누락 단계 | 태스크 간 암묵적 단계 (마이그레이션 등) |
| 미정의 동작 | 에러, 빈 입력, 동시 접근 처리 |
| 의존성 순서 | Task N이 Task M(M>N)에 의존 |
| 테스트 누락 | 동작 변경에 대응 테스트 없음 |
| 검증 누락 | 구체적 검증 명령어 없음 |
| 롤백 갭 | Task 5 실패 시 1-4 원복 불가 |
| 환경 가정 | 미문서화된 env/서비스/설정 의존 |

**점수:** 크리티컬 누락 = +8, 테스트 누락 = +5, 검증 누락 = +3, 사소한 갭 = +2

#### Phase 4: Risk Assessment

| Risk Type | Severity |
|-----------|----------|
| 보안 (injection, secrets, 권한) | Critical (+15) |
| 데이터 무결성 (마이그레이션, 파괴적 작업) | Critical (+10) |
| Breaking changes (API, 스키마) | Critical (+10) |
| 성능 (N+1, 무한 루프, 페이지네이션) | Important (+5) |
| 호환성 (버전 충돌, 플랫폼 가정) | Important (+5) |

#### Output Format

```
### Summary
- Total Score: {score}/100
- Verdict: PASS (≤20) | NEEDS_REVISION (21-50) | MAJOR_ISSUES (>50)
- Auto-fixable: {count} items
- Requires approval: {count} items

### Issues (by severity)
[CRITICAL|IMPORTANT|MINOR] Category: {1-4} | Score: +{n}
Location: Plan task {N}, line {reference}
Problem: {구체적으로 무엇이 잘못될지}
Evidence: {file:line 또는 grep 결과}
Fix: {플랜에 적용할 정확한 수정}
Auto-fixable: {yes|no}

### Auto-Applied Fixes
{before/after diff}

### Pending Approval
{수정 내용 + 사용자 판단이 필요한 이유}
```

#### Calibration

- 실제로 구현 실패를 유발할 문제만 플래그
- "잠재적으로 문제가 될 수 있다" → 스킵
- "이것 때문에 X가 확실히 실패한다" → 플래그
- 불확실하면 실제 프로젝트 코드를 읽어서 확인
- 플랜 범위 밖의 개선 제안 금지
- 스타일 선호도 플래그 금지 — 구조/정확성 이슈만

---

## Review Loop & Debounce

```
플랜 파일 Write/Edit 감지
        │
        ▼
  세션 상태 확인 (review_count, last_score)
        │
        ├─ review_count >= 2 → 스킵 (최대 2회 자동 검토)
        │
        ├─ last_score <= 20 → 스킵 (이미 충분히 명확)
        │
        └─ 그 외 → plan-review 스킬 트리거
                    │
                    ▼
              검토 수행 → 점수 산출 (0~100)
                    │
                    ├─ 점수 > 20: 자동 수정 + 승인 게이트 → review_count++
                    │
                    └─ 점수 ≤ 20: "검토 완료, 문제 미미" → 루프 종료
```

**디바운스 규칙:**
- 동일 세션에서 최대 2회 자동 검토
- 마지막 검토 점수 ≤ 20이면 추가 검토 불필요로 판단
- 수동 호출(`/plan-review`)은 디바운스 제한 없음

---

## Verification

1. **훅 감지 테스트:** `~/.claude/plans/test.md`에 Write → 훅이 트리거되는지 확인
2. **디바운스 테스트:** 2회 검토 후 3번째는 트리거되지 않는지 확인
3. **스킬 검토 테스트:** 의도적으로 CLAUDE.md 위반하는 플랜 작성 → 검토가 정확히 감지하는지 확인
4. **자동 수정 테스트:** Minor 이슈가 자동 수정되는지, Major는 승인 게이트가 작동하는지 확인
5. **수동 호출 테스트:** `/plan-review`로 디바운스 무관하게 호출 가능한지 확인
6. **e2e 테스트:** 실제 플랜 모드에서 플랜 작성 → 자동 검토 → 수정 → ExitPlanMode 전체 흐름
