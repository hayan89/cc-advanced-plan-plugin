# Phase 5: Security Assessment (0~20 points)

이 Phase는 플랜에서 보안 관련 설계 누락이나 위험 패턴을 체계적으로 검토합니다.
OWASP Top 10에서 영감을 받은 7개 보안 차원으로 평가합니다.

구현에서 발생할 수 있는 추측적 보안 문제는 플래그하지 않습니다. 플랜 텍스트에서 직접 확인 가능한 것만.

## Procedure

플랜의 각 태스크를 읽으며 아래 7개 보안 차원에 해당하는지 확인하세요.
각 차원에 대해, 해당 차원이 플랜과 관련 있는지 먼저 판단하고, 관련 있다면 누락 여부를 검증하세요.

## Security Dimensions

| Dimension | What to Check | Score |
|-----------|--------------|-------|
| **Auth/AuthZ Design** | 엔드포인트/API 추가 시 인증 모델, 역할 체크, 세션 핸들링 미기술 | **+6** (Critical) |
| **Input Validation** | 외부 입력(API params, form, file upload, webhook) 수용 시 검증/새니타이즈 미언급 | **+4** (Important) |
| **Secrets Management** | 자격증명/API키/토큰 참조 시 env vars/vault/.gitignore 미기술 | **+4** (Critical) |
| **Data Exposure** | 새 엔드포인트/로그에서 PII, 내부ID, 스택트레이스 노출 가능성 | **+4** (Important) |
| **Dependency Security** | 새 패키지 추가 시 버전 피닝, 라이선스, 취약점 고려 미언급 | **+2** (Minor) |
| **Security Testing** | 인증/입력/접근제어 변경 시 보안 테스트 미포함 | **+3** (Important) |
| **OWASP Pattern Scan** | 아래 OWASP 패턴 감지 (catch-all) | **+5** (Critical) |

## Dimension Details

### 5.1 Auth/AuthZ Design

- 플랜 태스크 중 엔드포인트, API, 사용자 대면 기능을 추가/변경하는 것이 있는가?
- 있다면: 인증 모델(JWT, 세션, OAuth 등), 역할/권한 체크, 세션 관리 방식이 기술되어 있는가?
- Evidence: 기존 코드베이스에서 인증 패턴(middleware, guard, decorator) Grep으로 확인
- 해당 없음: 사용자 대면이 아닌 내부 유틸리티, 빌드 도구, 문서 수정 등

### 5.2 Input Validation

- 외부 입력을 수용하는 태스크가 있는가? (API 파라미터, 폼 데이터, 파일 업로드, URL 파라미터, 웹훅 페이로드)
- 있다면: 검증, 새니타이즈, 스키마 밸리데이션(zod, joi 등)이 언급되어 있는가?
- Evidence: 기존 밸리데이션 패턴 Grep으로 확인하여 플랜이 동일 패턴을 따르는지 비교

### 5.3 Secrets Management

- 자격증명, API 키, 토큰, 연결 문자열, 인증서를 참조하는 태스크가 있는가?
- 있다면: 환경변수, vault, .gitignore를 통한 안전한 저장이 명시되어 있는가?
- 실제 자격증명처럼 보이는 예시 값이 하드코딩되어 있는가?
- Evidence: .env.example, 기존 시크릿 관리 패턴 확인

### 5.4 Data Exposure

- 새 엔드포인트, API 응답, 로그 출력, 에러 메시지를 생성하는 태스크가 있는가?
- 있다면: 응답에 사용자 PII, 내부 ID, 스택 트레이스, DB 스키마가 노출되지 않도록 접근 제어나 데이터 필터링이 언급되어 있는가?
- Evidence: 기존 응답 직렬화 패턴 확인

### 5.5 Dependency Security

- 새 패키지, 라이브러리, 외부 서비스를 추가하는 태스크가 있는가?
- 있다면: 버전 피닝, 라이선스 확인, 알려진 취약점 고려가 언급되어 있는가?
- Evidence: 기존 package.json/go.mod/Cargo.toml의 버전 피닝 패턴 확인

### 5.6 Security Testing

- 인증, 입력 처리, 접근 제어를 변경하는 태스크가 있는가?
- 있다면: 테스트 태스크에 보안 관련 테스트(인증 우회, 인젝션, 비인가 접근)가 포함되어 있는가?
- Evidence: 기존 테스트 파일에서 보안 테스트 패턴 Grep

### 5.7 OWASP Pattern Scan

위 6개 차원에서 포착되지 않는 OWASP Top 10 패턴을 catch-all로 검색:

- **A01 Broken Access Control:** 역할/권한 체크 없는 엔드포인트
- **A02 Cryptographic Failures:** 커스텀 암호화, 평문 저장 언급
- **A03 Injection:** 사용자 입력으로 SQL 구성, 명령 실행, 템플릿 렌더링
- **A05 Security Misconfiguration:** CORS *, 디버그 모드, 기본 자격증명
- **A07 Auth Failures:** 만료/로테이션 없는 세션 관리
- **A08 Software Integrity:** 무결성 검증 없는 의존성 추가
- **A09 Logging Failures:** 보안 이벤트에 대한 감사 로깅 없음

## Important

플랜에서 **명백히 드러나는** 보안 이슈만 플래그하세요.
"구현 시 이런 보안 문제가 생길 수도 있다"는 플래그 대상이 아닙니다.

차원이 플랜과 **관련 없으면** (예: 플랜이 문서만 수정하는데 Auth/AuthZ를 체크) 스킵하세요.

## Scoring

각 발견된 이슈에 위 테이블의 점수를 적용.
최대 20점. 보안 이슈가 없으면 0점.
