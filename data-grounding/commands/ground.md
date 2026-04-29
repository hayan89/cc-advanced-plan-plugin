---
description: data-grounding 스킬을 수동 호출하여 플랜 작성 전 실 데이터(DB/로그/메트릭)를 read-only로 조회합니다.
disable-model-invocation: false
---

`data-grounding:data-grounding` 스킬을 즉시 호출하세요.

호출 모드는 **수동(`/ground`)**이므로 다음 규칙을 따릅니다:

- AskUserQuestion 사용자 동의 게이트(Step 1.5)는 **스킵** — 사용자가 명시적으로 호출했으므로 의도가 분명함.
- 디바운스(`grounded`/`declined`/`run_count >= 1`) 검사는 **무시** — 같은 세션에서 재호출 허용.
- 스킬 절차의 Step 1.0에서 호출 모드를 "manual (/ground)"로 기록.

명령 인자(`$ARGUMENTS`)가 있으면 그것을 사용자 원본 프롬프트로 사용. 없으면 가장 최근 사용자 메시지를 입력으로 사용.

스킬 호출 외 다른 행동(플랜 파일 작성, plan-review/debug-verify 호출 등)은 절대 하지 마세요. 스킬이 결과를 반환하면 메인 세션이 그 결과를 컨텍스트로 후속 흐름을 결정합니다.
