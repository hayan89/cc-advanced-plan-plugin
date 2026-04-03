# Phase 1: Directive Compliance Check (0~30 points)

이 Phase는 플랜이 프로젝트 지시사항을 위반하는지 검토합니다.

## Procedure

1. 제공된 지시사항 파일 경로를 모두 Read tool로 읽으세요:
   - `~/.claude/CLAUDE.md` (글로벌)
   - 프로젝트 루트의 `CLAUDE.md` (있으면)
   - 프로젝트 루트의 `AGENTS.md` (있으면)
   - `.claude/rules/*.md` (있으면)

2. 각 지시사항에 대해 플랜의 태스크가 위반하는지 확인하고 아래 테이블을 구성하세요:

| Directive Source | Directive | Plan Compliance | Violation? | Severity |
|-----------------|-----------|-----------------|------------|----------|
| {파일}:L{n} | {지시사항 원문} | {플랜이 어떻게 대응하는지, 또는 어떤 태스크가 위반하는지} | YES/NO | Critical/Important/Minor |

## What Counts as a Directive

- 명시적 지시: "always use X", "never do Y", "prefer Z over W"
- 기술 제약: "use TypeScript", "test with Vitest"
- 프로세스 요구: "commit after each task", "run tests before merge"

## What Does NOT Count

- 프로젝트 일반 설명
- 히스토리 노트
- 액션 아이템이 없는 선호도 코멘트

## Scoring

- **Critical violation** (플랜이 지시사항을 직접 모순): **+10**
- **Important violation** (부분 충돌 또는 무시): **+5**
- **Minor violation** (기술적으로 준수하나 정신이 다름): **+2**

최대 30점. 위반이 없으면 0점.
