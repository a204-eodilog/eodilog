# 카카오 로그인·회원 통합

현재 구현은 Expo 외부 브라우저의 카카오 인가 코드 흐름이다. 네이버, 네이티브 SDK 토큰 교환, 웹 쿠키, 갱신/로그아웃 endpoint는 후속이다. `Session.refreshToken`은 반환하고 DB에는 SHA-256 해시만 저장한다. 성공은 `{data: ...}`, 오류는 `{error:{code,message,fields,traceId}}`다.

## 로컬 실행

Windows 로컬 실행은 `EodiLog`에서 `.\dev-up`, DB만 실행은 `.\docker-compose-up`, 종료는 `.\dev-down`을 사용한다. DB 볼륨은 보존하며 PID·시작 시각·실행 파일·정확한 jar 명령줄로 소유한 서버만 정지한다. [명령·로그·복구 절차](../../EodiLog/docs/plan/local-development.md)를 따른다.

local 프로필에서는 [카카오 실연동 점검 화면](http://localhost:8080/dev/kakao-login)을 제공한다. Kakao Developers와 `KAKAO_ALLOWED_REDIRECTS`에 `http://localhost:8080/oauth/kakao/callback`을 등록하고 사용자가 직접 로그인·2차 인증·동의를 처리한다. 페이지 준비 상태는 인증 성공이 아니며 기존 PKCE/state 검증과 세션 API 교환 후 `/me` 성공이 확인되어야 성공으로 표시한다. verifier·인가 시도는 sessionStorage에서 교환 전에 정리하며 JWT는 메모리에서 `/me`에만 사용한다. 화면과 callback은 local 프로필에만 존재하고 Expo 앱용 redirect 브리지는 후속이다.

`EodiLog/.env.example`을 참고해 `EodiLog/.env`에 DB 비밀번호, 카카오 REST API 키·클라이언트 시크릿, 허용 redirect 목록, 무작위 JWT 서명키를 채운다. 이미 `.env`가 있으면 덮어쓰지 않고 필요한 키만 추가한다. `.env`는 Java properties 문법이며 값에 따옴표를 붙이지 않는다. JWT_SECRET은 최소 32바이트 이상 무작위 값이다. 실제 `.env`는 저장소에 올리지 않는다.

```powershell
cd EodiLog
.\gradlew.bat bootRun --args="--spring.profiles.active=local"
```

`application-local.yaml`이 작업 디렉터리 `EodiLog` 기준 `./.env`를 읽는다. IDE도 working directory를 `EodiLog`로 지정한다. Docker Compose도 같은 `.env`의 DB 설정을 사용한다. Docker Desktop을 실행해야 한다. 루트 `.env`는 백엔드에서 자동으로 읽지 않으며, 다른 도구가 사용하는 기존 루트 파일은 그대로 둔다.

외부 DB를 사용하면 `SPRING_DOCKER_COMPOSE_ENABLED=false`와 `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, `SPRING_DATASOURCE_PASSWORD`를 설정한다. 기존 `DB_URL/DB_USERNAME/DB_PASSWORD` 키는 사용하지 않는다. Flyway는 `V202610281000__create_postgis_extension.sql`, `V202610281100__create_users.sql`, `V202610301000__create_auth.sql` 순서로 적용한다. 구버전 `1100 create_auth_member`가 로컬 DB에 적용된 이력이 있으면 새 1100의 이름·체크섬이 다르므로 검증 오류가 발생할 수 있다. 이력을 확인하고 폐기 가능한 로컬 DB만 명시적으로 재생성하거나 별도 전환 절차를 검토한다. 자동 repair·baseline은 하지 않는다.

Kakao Developers에서 카카오 로그인과 `profile_nickname` 동의 항목을 설정한다. 서버는 `kakao_account.profile.nickname`을 읽으며 `is_default_nickname=true`는 사용하지 않는다. KAKAO_ALLOWED_REDIRECTS는 정확히 일치하는 URI의 쉼표 구분 목록이다. 예시는 `https://app.example.com/oauth/kakao`이며 실제로 소유·운영하는 HTTPS 주소로 바꿔 카카오 앱에도 동일하게 등록한다. 카카오 REST 웹 redirect 설정은 custom scheme을 허용하지 않는다([카카오 공식 안내](https://devtalk.kakao.com/t/redirect-uri/143619)). Expo에서는 해당 HTTPS 주소의 universal link/app link 수신 설정 또는 별도 HTTPS-to-deep-link 브리지가 필요하다. 브리지는 code/state를 보존하고 로그에 남기지 않아야 한다. local 점검용 callback만 제공하며 Expo용 callback 브리지·앱 링크 설정은 포함하지 않는다. 앱 연결 완료를 주장하지 않는다. Swagger UI 자체를 OAuth callback으로 쓰지 않는다. 공식 API 참고: [카카오 로그인 REST API](https://developers.kakao.com/docs/latest/ko/kakaologin/rest-api).

## Swagger에서 실제 호출

1. `http://localhost:8080/swagger-ui.html`을 연다. 인증 태그의 두 POST는 자물쇠 없이 Try it out 할 수 있다. provider는 `KAKAO`다.
2. 브라우저 개발자 콘솔에서 아래 코드로 verifier/challenge를 만든다. verifier는 로그인 시도마다 새로 만들고 앱에서는 안전한 로컬 메모리에 보관한다. 운영 값은 로그에 남기지 않는다.

```javascript
const base64url = bytes => btoa(String.fromCharCode(...bytes))
  .replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
const challenge = base64url(new Uint8Array(await crypto.subtle.digest(
  'SHA-256', new TextEncoder().encode(verifier))));
({verifier, challenge});
```

3. `POST /api/v1/auth/oauth/KAKAO/authorization-requests`에 `{ "redirectUri": "등록한 URI", "codeChallenge": "생성한 challenge" }`를 보낸다. 응답 `data.authorizationId`, `state`, `expiresAt`을 보관한다.
4. `data.authorizationUrl`을 외부 브라우저에서 열어 카카오 로그인을 마친다. 등록한 HTTPS redirect의 query에서 `code`, `state`를 추출하고 state가 보관한 값과 같은지 확인한다. Expo 앱으로 전달하려면 위의 universal/app link 또는 브리지를 별도 설정해야 한다. Swagger는 외부 로그인이나 앱 redirect를 자동 처리하지 않는다. 수동 점검에서는 HTTPS callback을 수신하는 개발 환경에서 값을 확인해 다음 요청에 넣되 공유 로그에 남기지 않는다.
5. `POST /api/v1/auth/oauth/KAKAO/sessions`에 `authorizationId`, `code`, 처음과 동일한 `redirectUri`, redirect에서 받은 `state`, 보관한 `codeVerifier`를 보낸다. 컨텍스트는 300초 내 한 번만 사용할 수 있다. 카카오 교환 실패도 소비되므로 새 시작 요청을 만든다.
6. 응답 `data.accessToken`만 Swagger의 Authorize → bearerAuth에 붙인다(`Bearer ` 접두사 제외). GET `/api/v1/me`를 호출한다.
7. `profileCompleted=false`이면 `nickname=""`이다. 같은 토큰으로 PATCH `/api/v1/me`에 `{ "nickname": "여행자" }`를 보내 가입을 완료한다. 공백 제거 후 1~50자여야 하며 다른 필드는 400이다. 이후 GET으로 완료 상태를 확인한다. 미완료 상태에서는 GET/PATCH `/me` 이외 요청이 `403 PROFILE_INCOMPLETE`다.

카카오의 유효한 최초 닉네임이면 바로 가입 완료한다. 미제공·빈 값·기본 닉네임·50자 초과는 가입 대기다. 재로그인은 기존 이름을 덮어쓰지 않는다. 2026-10-28 사용자 확정으로 새 토큰·세션의 수명은 access 3600초(1시간), refresh 1209600초(14일)다. 기존 세션의 만료 이력을 일괄 수정하지 않는다. 토큰 갱신 endpoint는 아직 후속이다.

## B 담당 코드 계약

```java
// Spring Security가 principal에 담은 UUID만 사용한다.
public Object create(@AuthenticationPrincipal AuthUser user) {
    UUID userId = user.userId();
    UserCard member = userCardReader.findCards(userId, List.of(userId)).get(userId);
    // 여행 생성자를 userId로 정한다.
    return member;
}
```

`AuthUser`는 `global.security`, `UserCardReader`는 `user.service`, `UserCard`와 enum은 `user.dto` 패키지에 있다. 회원 저장소·컨트롤러도 `user`에 있다. 공개 카드에는 UUID·닉네임·이미지 URL·공개 범위·양방향 팔로우 상태만 있다. 이메일·연령·동의·status는 노출하지 않는다. 이미지 URL은 null, 팔로우 상태는 NONE이다. 여러 ID는 중복 제거 후 한 번의 IN 조회이며 없는 ID는 생략하고 비활성 사용자는 포함한다. 인증 시 비활성 사용자를 401로 거부하는 규칙과 공개 과거 회원 표시용 카드 조회는 역할이 다르다.

B 테스트에서는 `new AuthUser(uuid)`를 principal로 둔 `UsernamePasswordAuthenticationToken`과 대체 `UserCardReader`를 주입할 수 있다. 실제 Bearer 파서나 회원 저장소를 참조할 필요가 없다. 운영용 임의 사용자 헤더는 제공하지 않는다. Bearer 요청마다 DB의 세션/활성 상태/가입 완료 여부를 다시 검사하므로 가입 완료 후 기존 토큰도 즉시 사용할 수 있다. 현재 ID는 UUIDv4이며 UUIDv7은 미정이다.

성공은 B의 `DataResponse`, 오류는 `BusinessException`과 `CommonErrorCode`/`AuthErrorCode`, 필터 오류는 `ErrorResponseWriter`를 사용한다. `ApiFailure`, `ApiErrors`, 자체 Data, 대체 principal과 UserLookup은 제거했다. `TraceIdFilter`의 32자리 hex 값이 `X-Trace-Id`와 오류 본문의 traceId에 동일하게 들어간다. 예상 밖 예외 로그에는 안전한 타입·traceId 메타데이터만 남긴다. A-0 분리 파일과 독립 검증은 [A-0 인수인계](../../EodiLog/docs/plan/backend-a0-handoff.md)를 따른다.

## 검증과 한계

통합 테스트는 원격 dev의 Testcontainers 설정으로 PostgreSQL 17 + PostGIS 3.5를 실행하고 카카오 통신은 대체한다. Docker Desktop 실행이 필요하다. 일회 소비·PKCE·잘못된 state/redirect/만료·제공자 실패·동시 최초 가입·재로그인 동일 UUID·가입 완료·토큰 누락/위조/만료/폐기·비활성 회원·OpenAPI 계약을 검사한다. 카카오 브라우저 로그인/Expo redirect는 별도 실연동 검증 대상이다. 실제 비밀값이 없어도 테스트는 동작하며, 운영 애플리케이션은 실제 설정 없이는 시작하지 않는다.

2026-10-30 추가 검증: 사용자가 PC 로컬 점검 페이지에서 실제 카카오 인증 후 성공 화면을 확인했다. 카카오 코드 교환→서비스 토큰 발급→`/api/v1/me` 성공까지 실제 설정으로 확인된 결과다. 계정 정보·토큰은 기록하지 않았다. Expo redirect 및 B 여행 API와의 계정 2개 통합 검증은 아직 별도다.

배포 분리: Jira EODI-119의 로컬 개발 도구 MR은 로그인 MR !52 위에 쌓인 변경이다. 로그인 브랜치 병합 후 이 MR의 대상을 dev로 변경한다. 실제 .env와 런타임 파일은 포함하지 않는다.
