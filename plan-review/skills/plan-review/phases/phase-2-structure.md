# Phase 2: Project Structure Alignment (0~30 points)

이 Phase는 플랜이 실제 프로젝트 구조와 일치하는지 검토합니다.
Glob과 Grep을 사용하여 실제 코드베이스를 반드시 확인하세요.

## Procedure

플랜의 각 태스크에 대해 아래 6가지 항목을 검증하세요.

### 2.1 File Path Conventions

```
Glob("src/**/*") 또는 유사 패턴으로 기존 디렉토리 구조 확인
```

- 플랜이 제안하는 파일 경로가 기존 컨벤션을 따르는가?
- 실패 예시: 플랜이 `src/utils/helper.ts`를 생성하지만 프로젝트는 `lib/`을 유틸리티에 사용

### 2.2 Import Validity

```
Grep으로 플랜에서 참조하는 모듈 이름 검색
```

- 플랜의 임포트가 실제 존재하는 모듈을 참조하는가?
- 실패 예시: `@/services/auth`를 임포트하지만 해당 모듈 없음

### 2.3 Naming Conventions

- 동일 디렉토리/스코프의 기존 파일 3개 이상 읽기
- 함수/변수/파일 네이밍 스타일 비교
- 실패 예시: 플랜은 camelCase 함수 사용, 프로젝트는 snake_case

### 2.4 Tech Stack Match

- `package.json`, `go.mod`, `Cargo.toml` 등 확인
- 실패 예시: 플랜이 `axios` 추가하지만 프로젝트는 native `fetch` 사용

### 2.5 Existing Utility Reuse

```
Grep으로 플랜이 새로 만드는 기능과 유사한 기존 코드 검색
```

- 플랜이 이미 존재하는 것을 재발명하는가?
- 실패 예시: 새 `formatDate()` 작성하지만 `lib/utils/date.ts`에 이미 있음

### 2.6 Test Pattern Match

- 기존 테스트 파일 2-3개 읽기
- 테스트 프레임워크, 어설션 스타일, 파일 네이밍 비교
- 실패 예시: Jest 사용하지만 프로젝트는 Vitest

## Scoring

- **Build-breaking misalignment** (잘못된 경로, 누락 의존성): **+10**
- **Inconsistency** (스타일 불일치, 컨벤션 위반): **+5**
- **Preference difference** (동작은 하지만 어색함): **+2**

최대 30점. 문제 없으면 0점.
