# Phase 4: Risk Assessment (0~15 points)

이 Phase는 플랜에서 명백히 드러나는 위험을 평가합니다.
구현에서 발생할 수 있는 추측적 위험은 플래그하지 않습니다. 플랜 텍스트에서 직접 확인 가능한 것만.

## Procedure

플랜의 각 태스크를 읽으며 아래 위험 유형에 해당하는지 확인하세요.

## Risk Types

| Risk Type | What to Check | Score |
|-----------|--------------|-------|
| **Security** | SQL injection, XSS, 하드코딩된 시크릿, 과도하게 넓은 권한, 안전하지 않은 역직렬화 | **+15** (Critical) |
| **Data integrity** | 롤백 없는 마이그레이션, 백업 없는 파괴적 작업, 레이스 컨디션 | **+10** (Critical) |
| **Breaking changes** | 마이그레이션 경로 없는 퍼블릭 API 변경, 버전닝 없는 스키마 변경 | **+10** (Critical) |
| **Performance** | N+1 쿼리, 무한 루프, 페이지네이션 누락, 대용량 파일 메모리 로드 | **+5** (Important) |
| **Compatibility** | 버전 충돌, 플랫폼 가정, 디프리케이트된 API 사용 | **+5** (Important) |

## Important

플랜에서 **명백히 드러나는** 위험만 플래그하세요.
"구현 시 이런 문제가 생길 수도 있다"는 플래그 대상이 아닙니다.

## Scoring

각 발견된 위험에 위 테이블의 점수를 적용.
최대 15점. 위험 없으면 0점.
