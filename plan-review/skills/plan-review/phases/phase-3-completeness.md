# Phase 3: Completeness & Critical Gaps (0~25 points)

이 Phase는 플랜의 완전성을 검토합니다.
플랜을 순차적으로 시뮬레이션하며 누락된 단계나 정의되지 않은 동작을 찾습니다.

## Procedure

플랜의 각 태스크를 순서대로 읽으며 아래 체크리스트를 적용하세요.

각 단계에서 자문하세요:
- "이 단계를 실행하려면 어떤 정보가 아직 제공되지 않았는가?"
- "여기서 무엇이 잘못될 수 있고, 그것이 처리되지 않았는가?"

## Checklist

| Check | What to Look For | Score if Missing |
|-------|-----------------|-----------------|
| **Missing steps** | 태스크 간 암묵적 단계 (마이그레이션 필요하지만 미기재, 의존성 설치 누락 등) | **+8** |
| **Undefined behavior** | 에러 시 동작? 빈 입력? 동시 접근? 처리 정의 없음 | **+5** |
| **Dependency order** | Task N이 Task M(M > N)의 출력에 의존 — 순서 역전 | **+8** |
| **Missing tests** | 동작 변경에 대응하는 테스트 단계 없음 | **+5** |
| **Missing verification** | 태스크가 구체적 검증 명령어 + 예상 출력 없이 끝남 | **+3** |
| **Rollback gap** | Task 5 실패 시 Task 1-4를 안전하게 되돌릴 수 없음 | **+3** |
| **Environment assumptions** | 문서화되지 않은 환경변수, 서비스, 설정에 의존 | **+2** |

## Scoring

각 발견된 이슈에 위 테이블의 점수를 적용.
최대 25점. 문제 없으면 0점.
