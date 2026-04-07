# Debug Verify (Kapasi Loop) Plugin

디버깅 가설을 Advocate + Challenger 이중 에이전트로 실증 검증하는 Claude Code 플러그인.

## Features

- **카파시 루프:** 가설 → 증거 수집 → 반박 시도 → 판정의 반복 검증
- **이중 에이전트:** Advocate(증거 수집) + Challenger(반박 시도)로 확인 편향 방지
- **데이터 소스 비종속:** 코드, 로그(Grafana Loki), 메트릭(Prometheus), DB 등 가용한 도구를 자동 선택
- **자동 트리거:** 디버깅 플랜 작성 시 PostToolUse 훅으로 자동 감지
- **plan-review 연동:** 진단 확정 후 수정 계획 → plan-review 자동 검증

## Usage

### 자동 (Auto-trigger)

`~/.claude/plans/`에 디버깅 키워드(debug, 버그, 원인, 가설 등)가 포함된 플랜 파일을 작성하면 자동 트리거.

### 수동 (Manual)

```
/debug-verify
/kapasi
```

## Workflow

```
디버깅 플랜 작성 → Advocate 증거 수집 → Challenger 반박 시도
→ 판정 합의 → CONFIRMED/REFUTED: 종료 | INCONCLUSIVE: 재루프 (최대 3회)
→ CONFIRMED 시 수정 계획 → plan-review 자동 검증 → 구현
```

## Verdicts

| 판정 | 의미 | 다음 행동 |
|------|------|-----------|
| CONFIRMED | 가설 확인됨 | 수정 계획 작성 → plan-review |
| REFUTED | 가설 기각됨 | 대안 가설로 새 플랜 작성 |
| INCONCLUSIVE | 판정 불가 | 수동 확인 후 재시도 |

## Version

- v1.0.0 — Initial release
