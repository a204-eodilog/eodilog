# Windows 로컬 실행과 카카오 점검

Java 25와 Docker Desktop을 실행하고 기존 `EodiLog/.env`를 준비한다. 값은 `.env.example`의 키를 참고하며 기존 키를 덮어쓰지 않는다. `.env`는 따옴표·보간·escape 없는 단순 `KEY=value` 형식으로 사용한다. DB 비밀번호에는 `$`, 따옴표, 역슬래시를 사용하지 않는다. 이 문서는 실제 비밀값을 포함하지 않는다.

```powershell
cd EodiLog
.\docker-compose-up  # DB만 기동하고 준비 확인
.\dev-up             # DB 준비 → bootJar → local 서버 백그라운드 시작 → HTTP 준비 확인
.\dev-down           # 소유 검증된 서버와 Compose postgres만 정지; 볼륨 보존
```

`.cmd`가 Windows PowerShell 5.1 스크립트를 호출하므로 다른 디렉터리에서 절대 경로로 wrapper를 호출해도 backend 작업 디렉터리를 사용한다. Compose 프로젝트명은 `eodilog`, 서비스는 `postgres`로 고정한다. 다른 Docker 프로젝트를 정지하지 않으며 `down -v`나 볼륨 삭제를 수행하지 않는다. 같은 프로젝트명을 임의의 다른 개발 스택에 사용하지 않는다.

서버 상태는 `.local-dev/server.json`, 빌드 로그는 `.local-dev/build.log`, 서버 로그는 `.local-dev/server.out.log`, `.local-dev/server.err.log`에 둔다. `.local-dev/`는 Git에서 제외한다. 로그를 공유하기 전 민감정보 여부를 확인한다. 명령은 설정이나 Compose 출력을 출력하지 않는다. 스크립트 내부에서 DB 연결 설정을 자식 Java 환경 변수로 전달하고 부모 환경은 `finally`에서 복원한다. 실제 `.env` 값은 수정하지 않는다.

동일 서버의 중복 시작은 기존 URL을 안내한다. 명령은 잠금 파일로 동시에 실행되지 않는다. PID·UTC 시작 시각·실행 파일·정확한 jar 경로와 전체 명령줄이 모두 일치할 때만 서버를 소유한 것으로 판단한다. 오래된 상태나 PID 재사용은 다른 프로세스 종료로 이어지지 않는다. 소유하지 않은 8080 리스너가 있으면 오류로 중단한다. 서버 준비 실패 시 상태·로그를 남기므로 원인을 해결한 뒤 `dev-down`하고 다시 시작한다. `.local-dev` 상태를 직접 지우면 실행 중인 서버의 소유 증거가 사라지므로 서버 종료 전에 삭제하지 않는다.

## 실제 카카오 로그인 확인

1. Kakao Developers redirect URI와 `.env`의 `KAKAO_ALLOWED_REDIRECTS`에 `http://localhost:8080/oauth/kakao/callback`을 정확히 등록한다. 기존 등록값은 필요에 따라 쉼표로 유지한다. 브라우저 주소도 `127.0.0.1` 대신 `localhost`를 쓴다.
2. `dev-up` 후 [로컬 점검 화면](http://localhost:8080/dev/kakao-login)을 연다. 이때는 **준비 완료 / 사용자 인증 대기**이며 로그인 성공이 아니다.
3. 카카오 로그인 시작을 누른다. 새 PKCE verifier와 S256 challenge를 만들고 기존 `authorization-requests` API가 반환하는 실제 카카오 URL로 이동한다. 비밀번호·2차 인증·동의는 사용자가 직접 처리한다.
4. callback은 code/state가 포함된 URL을 즉시 `history.replaceState`로 정리한다. sessionStorage의 시도를 먼저 지우고 state·만료를 검사한 뒤 기존 `sessions` API를 호출한다. 취소·잘못된 state·시도 없음은 교환하지 않는다.
5. JWT는 저장하거나 화면에 표시하지 않고 메모리에서 `/api/v1/me` 조회에만 사용한다. `/me` 성공 후에만 실제 로그인 확인 성공, 닉네임, 가입 완료 여부를 표시한다. 가입 완료가 아니면 기존 닉네임 정책에 따른 가입 대기다. 이 화면은 가입 정보를 변경하지 않는다.

화면과 callback은 `local` 프로필에서만 공개한다. HTML은 `/static` 등에 두지 않아 비local 프로필에서 자동 서빙되지 않는다. 이 점검은 Expo 앱 연결·refresh/logout API를 구현하거나 검증하지 않는다. 인가 코드·state·verifier·토큰·비밀번호를 채팅이나 공유 로그로 복사하지 않는다.

## 자동 검증

```powershell
.\gradlew.bat build --console=plain
node --test scripts/kakao-page.test.cjs
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File scripts/local-dev.test.ps1
```

통합 테스트는 가짜 설정과 Testcontainers를 사용한다. local 전용 테스트는 별도 `spring.config.name=local-kakao-test`를 지정하므로 실제 `.env`를 불러오지 않는다. 자동 테스트 통과는 실제 카카오 계정 인증 성공과 구분한다.

## 2026-10-30 검증 기록

Java 전체 테스트 50개(실패·오류·건너뜀 0), 브라우저 로직 7개, PowerShell 격리 회귀 검증을 통과했다. 실제 PC에서도 DB-only 기동, 서버 시작, 중복 시작의 동일 PID 유지, 소유 서버 종료, DB stop 및 동일 볼륨 보존, DB만 재기동했을 때 서버 미기동을 확인했다.

실제 설정으로 인가 시작 201 및 공식 카카오 로그인 화면 200을 확인했다. 이후 사용자가 직접 카카오 계정 인증을 진행하고 로그인 성공 화면을 확인했다고 응답했다. 이 화면은 서비스 토큰 발급과 `/me` 조회 성공 후에만 표시하므로 PC 로컬 실제 로그인 검증은 완료했다. Expo 앱 및 계정 2개로 B 여행 API 통합 검증은 별도다.

이 문서와 명령은 Jira EODI-119 범위이며 로그인 MR !52에 의존한다. 이 MR에는 JaCoCo 설정이 없다. 일반 build는 가능하고 jacocoTestReport는 별도 커버리지 MR 병합 이후 사용할 수 있다.

최신 dev + 로그인 MR !52 위 분리 검증: 전체 build 124개 테스트, 실패·오류·건너뜀 0. Node 7개 및 PowerShell 격리 회귀 검증 통과. 실제 .env나 런타임 로그는 이 체크아웃에 복사하지 않았다.
