---
name: plan-review
description: >
  플랜 파일 작성 후 자동 트리거 또는 수동 호출(/plan-review)하여, 플랜을 프로젝트 지시사항(CLAUDE.md 등)과
  코드베이스 구성에 대해 비판적으로 검토합니다. PostToolUse 훅의 [MAGIC KEYWORD: plan-review]로
  자동 활성화됩니다.
---

# Plan Review

플랜 파일을 프로젝트 지시사항과 코드베이스 구성에 대해 4축으로 비판적 검토하는 스킬.

## When This Activates

- **자동:** PostToolUse 훅이 `~/.claude/plans/` 파일 Write/Edit를 감지하면 트리거
- **수동:** `/plan-review` 명령으로 직접 호출 (디바운스 제한 없음)

## Procedure

### Step 1: Context Collection

다음 파일들을 수집하세요:

1. **플랜 파일:** 훅이 전달한 경로, 없으면 가장 최근 수정된 `~/.claude/plans/*.md`
2. **지시사항 문서:**
   - `~/.claude/CLAUDE.md` (글로벌)
   - 프로젝트 루트의 `CLAUDE.md` (있으면)
   - 프로젝트 루트의 `AGENTS.md` (있으면)
   - `.claude/rules/*.md` (있으면)
3. **프로젝트 구조:**
   - `Glob("**/*")` 또는 `ls` 로 주요 디렉토리 구조 파악
   - `package.json`, `go.mod`, `Cargo.toml` 등 기술 스택 파일 확인

### Step 2: Read Review Template

검토 프롬프트 템플릿을 읽으세요:

```
Read skills/plan-review/review-prompt.md
```

이 템플릿의 4개 Phase를 순서대로 실행합니다.

### Step 3: Execute 4-Axis Review

review-prompt.md의 지시에 따라 검토를 수행하세요:

- **Phase 1:** Directive Compliance Check — 지시사항 위반 여부
- **Phase 2:** Project Structure Alignment — 코드베이스 구성 부합
- **Phase 3:** Completeness & Critical Gaps — 누락/불완전 사항
- **Phase 4:** Risk Assessment — 보안/성능/호환성 위험

각 Phase에서 이슈를 발견하면 점수를 부여합니다.

### Step 4: Score & Decide

총점을 산출하고 결과를 처리합니다:

**총점 ≤ 20 (PASS):**
- "플랜 검토 완료. 큰 문제 없음." 보고
- 세션 상태 업데이트 후 종료

**총점 21~50 (NEEDS_REVISION):**
- 개별 항목 점수 ≤ 5: 플랜 파일에 자동 수정 반영
- 개별 항목 점수 > 5: AskUserQuestion으로 사용자 승인 요청
- 수정 사항을 before/after diff로 제시

**총점 > 50 (MAJOR_ISSUES):**
- 모든 이슈를 severity 순으로 나열
- Critical 이슈는 반드시 사용자 확인 후 수정
- 플랜의 근본적 재작성이 필요할 수 있음을 안내

### Step 5: Update Session State

검토 완료 후 세션 상태를 업데이트하세요:

**상태 파일 경로:** `~/.claude/plugins/data/plan-review/sessions/{sessionId}.json`

```json
{
  "review_count": <이전 값 + 1>,
  "last_score": <이번 검토 총점>,
  "plan_path": "<검토한 플랜 파일 경로>",
  "last_reviewed_at": "<ISO 8601 타임스탬프>"
}
```

Bash를 사용하여 JSON 파일을 작성하세요:
```bash
mkdir -p ~/.claude/plugins/data/plan-review/sessions
cat > ~/.claude/plugins/data/plan-review/sessions/{sessionId}.json << 'EOF'
{ ... }
EOF
```

## Important Rules

- **Plan mode 제약:** plan mode에서는 플랜 파일만 수정 가능. 다른 파일 수정 금지.
- **수동 호출:** `/plan-review`로 호출 시 디바운스 제한을 무시하고 항상 실행.
- **Calibration:** 실제 구현 실패를 유발할 문제만 플래그. 스타일 선호도나 이론적 문제 무시.
- **Evidence 필수:** 모든 이슈에 file:line 참조 또는 grep 결과 등 근거 포함.
- **범위 준수:** 플랜 범위 밖의 개선 제안 금지.
