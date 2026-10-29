# A 참고 — B(여행) 작업과 맞물리는 계약·요청 사항

작성일: 2026-10-28 · 작성: B · 상태: **A 답변 반영(10/28), A-0(EODI-105) dev 병합 완료.** 답변은 §9에 정리했다

B(여행 생성·조회·기본 수정)가 A(카카오 로그인·회원 기본)를 기다리지 않고 진행하려면 A 쪽 코드와 닿는 지점을 먼저 고정해야 한다. 이 문서는 그 지점을 **B가 무엇을 쓰고, A에게 무엇을 요청하며, 누가 어떤 파일을 고치는지** 기준으로 정리한다. 이름·패키지는 제안이며 A가 바꿔도 된다. 바꾸면 이 문서를 같이 고친다.

- B 구현 계획: [backend-b-trip-basic.md](backend-b-trip-basic.md)
- 분담 기준: [백엔드 2인 첫 작업 분담안](../../../docs/plan/backend-first-work-split.md) §4
- 명세: [API 명세](../../../docs/api-spec.md) §2·§3·§10, [ERD](../../../docs/erd.dbml) `users`

## 0. 한눈에 보기

| # | A에게 요청 | B가 쓰는 곳 | 필요한 시점 |
| --- | --- | --- | --- |
| R-1 | 인증 주체 `AuthUser(UUID userId)`와 SecurityContext에 넣는 방식 | 모든 여행 컨트롤러 | B 컨트롤러 작성 전(B-4) |
| R-2 | `users` Flyway 마이그레이션 | `trips.owner_user_id`, `chat_participants.user_id`, `idempotency_records.user_id` FK | B 스키마 MR 병합 전(B-3) |
| R-3 | `UserCardReader` 인터페이스 + `users` 기반 실제 구현 | `Trip.members[].user` | B 여행 API MR 병합 전(B-5) |
| R-4 | `UserCard`·`AccountVisibility`·`FollowStatus` 타입 | 여행 응답 DTO | R-3과 함께 |
| R-5 | -64 Security: Bearer 무상태, CSRF 해제, 401/403 JSON 응답 | 여행 API 테스트·실제 호출 | 첫 통합 검증 전(B-7) |
| R-6 | 통합 검증용 카카오 테스트 계정 2개와 토큰 발급 절차 | 분담안 §5 | B-7 |

**R-1~R-4는 작은 MR 하나(A-0)로 먼저 올려 주기를 요청한다.** 카카오 연동 없이 만들 수 있는 부분이라 A 본 작업과 분리할 수 있다. A-0가 병합되기 전에는 B도 테스트 대체 구현으로 개발만 하고, B의 여행 API MR은 A-0 뒤에 병합한다.

## 1. 인증 주체 (R-1)

### 제안

```java
package com.eodilog.global.security;

// SecurityContext의 principal. 토큰 원문·개인정보를 담지 않는다
public record AuthUser(UUID userId) {
}
```

- A의 토큰 필터가 검증에 성공하면 `Authentication.getPrincipal()`이 `AuthUser`가 되도록 넣는다. 예: `UsernamePasswordAuthenticationToken.authenticated(new AuthUser(userId), null, authorities)`.
- B 컨트롤러는 별도 리졸버 없이 Spring Security 기본 어노테이션으로 받는다.

```java
@PostMapping
public ResponseEntity<DataResponse<TripResponse>> createTrip(
		@AuthenticationPrincipal AuthUser authUser, ...) {
	UUID userId = authUser.userId();
	...
}
```

- 커스텀 `@CurrentUserId` 같은 어노테이션을 원하면 A가 만들고 B가 그대로 쓴다. 둘 중 하나만 둔다.

### A가 정해 줄 것

| 질문 | B의 기대 |
| --- | --- |
| 비활성(`DEACTIVATED`) 사용자의 토큰 | **A 확정(10/28):** 필터에서 `401 UNAUTHENTICATED`로 거부. 여행 쪽은 사용자 상태를 다시 검사하지 않는다 |
| 프로필 미완성(`MyProfile.profileCompleted=false`) 사용자의 여행 생성 | **A 확정(10/28): 허용하지 않는다.** 미완성 토큰은 `GET/PATCH /api/v1/me`만 쓸 수 있고 나머지 보호 API는 A의 인증 필터가 `403 PROFILE_INCOMPLETE`로 막는다. 닉네임 입력을 마치면 같은 토큰으로 접근할 수 있다. 여행 서비스는 다시 검사하지 않는다 |
| `authorities` | 이번에는 역할 구분이 없으므로 빈 목록이어도 된다. 방장/멤버 권한은 Security 역할이 아니라 여행 서비스가 판단한다 |

### B 테스트에서 쓰는 방식

B는 A의 필터를 거치지 않고 아래처럼 같은 principal을 넣는다. 공용 테스트 도우미로 `src/test/.../global/security/AuthUserRequestPostProcessors`를 두는 것을 제안한다. A가 먼저 만들면 B가 재사용하고, 없으면 B가 만든다.

```java
mockMvc.perform(post("/api/v1/trips")
		.with(authentication(UsernamePasswordAuthenticationToken.authenticated(
				new AuthUser(userId), null, List.of())))
		.with(csrf())   // -64에서 CSRF를 끄기 전까지만
		...);
```

운영 코드에는 사용자 ID 헤더·테스트용 로그인 엔드포인트·인증 우회 프로필을 넣지 않는다.

## 2. `users` 마이그레이션 (R-2)

- 컬럼은 ERD `users` 그대로: `id uuid PK`, `nickname`, `account_visibility`, `profile_asset_id`, `age_band`, `age_use_consent`, `inference_consent`, `preference_sharing_scope`, `status`, `created_at`, `updated_at`, `deactivated_at`.
- `profile_asset_id → assets.id` FK는 `assets` 테이블이 생길 때 추가한다(지금은 컬럼만).
- 시각은 `timestamptz`(UTC), ID는 `uuid`.
- `oauth_accounts`·`oauth_attempts`·`sessions`는 A-0에 넣지 않아도 된다. B가 필요한 것은 `users`뿐이다.

### 마이그레이션 파일 규칙 (공동)

| 항목 | 제안 |
| --- | --- |
| 도구 | Flyway. 스키마는 Flyway로만 바꾸고 JPA는 `ddl-auto=validate` |
| 위치 | `src/main/resources/db/migration` |
| 파일명 | `V<yyyyMMddHHmm>__<동사>_<대상>.sql`. 예: `V202610281000__create_users.sql`, `V202610281400__create_trips.sql` |
| 순서 | 참조되는 테이블이 더 이른 번호. B의 여행 마이그레이션은 A의 `users`보다 늦은 번호를 쓴다 |
| 충돌 | 병합 직전 `origin/dev`를 받아, **이미 병합된 마이그레이션보다 내 번호가 이르면 내 파일 번호를 늦춘다.** 병합된 파일은 고치지 않는다. `outOfOrder`는 켜지 않는다 |
| 첫 파일 | B-1(-62)에서 `CREATE EXTENSION IF NOT EXISTS postgis;`를 가장 이른 번호로 넣는다 |

## 3. 공개 회원 조회 (R-3·R-4)

### 제안 인터페이스

```java
package com.eodilog.user.service;

public interface UserCardReader {

	// 존재하는 사용자만 결과에 담는다. 없는 ID는 예외 없이 빠진다. 빈 입력이면 조회하지 않는다
	Map<UUID, UserCard> findCards(UUID viewerId, Collection<UUID> userIds);

}
```

| 규칙 | 이유 |
| --- | --- |
| 여러 ID를 한 번에 조회(`IN` 한 번) | 여행 목록 한 페이지에서 멤버 수만큼 호출하면 N+1 |
| `viewerId`를 받는다 | 지금은 쓰지 않지만 팔로우가 생기면 `followingStatus`·`followedByStatus`를 보는 사람 기준으로 계산해야 한다 |
| 읽기 전용 트랜잭션, 호출한 쪽 트랜잭션 안에서도 동작 | 여행 생성 트랜잭션 끝에서 응답을 만들 때 호출한다 |
| 비활성 사용자도 결과에 포함 | **A 확정:** 탈퇴 회원도 UUID는 포함하고 닉네임은 "탈퇴한 사용자"로 반환한다. DB 원본 이름은 바꾸지 않는다. 과거 채팅처럼 이름을 따로 저장하는 곳도 같은 표시 정책을 따른다 |
| 없는 ID가 빠지면 B는 서버 오류로 처리 | FK가 있으므로 정상 상황에서는 발생하지 않는다 |

### `UserCard` 타입

명세 §10 `UserCard` 필드만 담는다. **이메일·연령·동의 여부·`status`를 넣지 않는다.** B는 이 DTO를 여행 응답 `Member.user`에 그대로 넣어 직렬화한다.

```java
package com.eodilog.user.dto;

public record UserCard(
		@Schema(description = "사용자 ID", example = "...", requiredMode = REQUIRED) UUID id,
		@Schema(description = "닉네임", requiredMode = REQUIRED) String nickname,
		@Schema(description = "프로필 이미지 URL, 없으면 null") String profileImageUrl,
		@Schema(requiredMode = REQUIRED) AccountVisibility accountVisibility,
		@Schema(requiredMode = REQUIRED) FollowStatus followingStatus,
		@Schema(requiredMode = REQUIRED) FollowStatus followedByStatus
) {
}

public enum AccountVisibility { PUBLIC, PRIVATE }
public enum FollowStatus { NONE, REQUESTED, ACCEPTED }
```

- 팔로우 미구현 동안 두 팔로우 상태는 `NONE`, `assets` 미구현 동안 `profileImageUrl`은 `null`.
- `MyProfile`은 "UserCard + 본인 전용 필드"이므로 A가 `UserCard`를 재사용하면 필드 이름이 어긋나지 않는다.
- 패키지 루트 이름은 `user`를 제안한다. `member`는 여행의 `trip_members`와 헷갈린다(여행 쪽 `Member` DTO는 멤버십이다).

### B 테스트의 대체 구현

B는 `src/test`에 `FakeUserCardReader`(메모리 맵)를 두고 테스트 설정에서만 등록한다. 운영 빈은 A의 구현 하나뿐이다.

## 4. Security 설정 -64에서 B가 기대하는 것 (R-5)

`SecurityConfig`는 A만 고친다. B는 아래 동작을 전제로 테스트를 쓴다.

| 항목 | 기대 |
| --- | --- |
| 세션 | `SessionCreationPolicy.STATELESS`, `formLogin`·`httpBasic` 제거 |
| CSRF | Bearer 토큰 API이므로 `/api/**`에서 해제. 해제되면 B 테스트의 `csrf()`를 지운다 |
| 기본 정책 | `/api/v1/**` 인증 필수. 공개 경로만 명시적으로 열기(로그인 시작·세션 교환, 이후 초대 미리보기 `GET /api/v1/invitations/*`) |
| 여행 권한 | `/trips/**`에 경로별 권한 규칙을 넣지 않는다. 멤버·방장 판단과 비참여자 `404`는 여행 서비스가 한다 |
| 401/403 응답 | 명세 공통 오류 형식 `{"error":{"code","message","fields":[],"traceId"}}`. B의 -63 `ErrorResponse`를 `AuthenticationEntryPoint`·`AccessDeniedHandler`에서 써 준다(§5) |
| Swagger | `SWAGGER_PATHS` 유지(AGENTS.md 규칙 7). 운영 프로필 Swagger 끄기도 -64 범위 |
| CORS(설정한다면) | 허용 헤더에 `Authorization`, `Content-Type`, **`Idempotency-Key`**. 노출 헤더에 `X-Trace-Id` |
| 토큰 검증 실패 코드 | 위조·만료·누락 모두 `401 UNAUTHENTICATED`로 둘지, 만료만 별도 코드(예: `TOKEN_EXPIRED`)로 둘지 A가 정한다. 프론트 갱신 흐름에 필요하면 별도 코드 |

## 5. 공통 응답·예외 -63 (B 작성, A 사용)

B가 여행 API에 먼저 필요해서 만들었다(B-2). A는 새로 만들지 말고 아래를 쓴다. 이름·형태에 의견이 있으면 B-2 MR 리뷰에서 바꾼다. 사용 규칙은 [AGENTS.md "응답·예외"](../../AGENTS.md)에 있다.

```
global/common/response   DataResponse<T>, PageResponse<T>, PageInfo
global/common/error      ErrorCode(인터페이스), CommonErrorCode, BusinessException,
                         ErrorResponse, GlobalExceptionHandler, ErrorResponseWriter
global/common/trace      TraceIdFilter
```

성공 응답 타입 이름은 Swagger `@ApiResponse` 어노테이션과 겹치지 않도록 `ApiResponse`가 아니라 `DataResponse`로 했다.

- **오류 코드는 도메인별 enum으로 나눈다.** 한 enum 파일을 둘이 동시에 고치면 충돌이 잦다.

```java
public interface ErrorCode {
	HttpStatus status();
	String code();      // 명세의 error.code 값. 예: "VERSION_CONFLICT"
	String message();   // 사용자에게 보여도 되는 기본 문구
}

public enum CommonErrorCode implements ErrorCode { VALIDATION_ERROR, UNAUTHENTICATED, FORBIDDEN, NOT_FOUND, CONFLICT, RATE_LIMITED, INTERNAL_ERROR ... }
public enum TripErrorCode implements ErrorCode { TRIP_NOT_FOUND, VERSION_CONFLICT ... }   // B
public enum AuthErrorCode implements ErrorCode { ... }                                      // A, 예: OAuth state 불일치
```

- `throw new BusinessException(AuthErrorCode.XXX)`를 던지면 `GlobalExceptionHandler`가 공통 형식으로 바꾼다.
- `ErrorResponseWriter`는 Security 필터 단계(컨트롤러 밖)에서 같은 JSON을 쓰기 위한 도우미다. A의 진입점·접근 거부 처리기와 토큰 필터가 쓴다.
- `traceId`는 요청마다 만들어 MDC와 `X-Trace-Id` 응답 헤더에 넣는다. A의 로그에도 같은 값이 찍힌다.
- 성공 응답은 `DataResponse.of(data)`로 감싼다(`{ "data": ... }`). `Session`·`MyProfile`도 같은 규칙.
- A가 -64에서 할 일: `AuthenticationEntryPoint`는 `errorResponseWriter.write(response, CommonErrorCode.UNAUTHENTICATED)`, `AccessDeniedHandler`는 `CommonErrorCode.FORBIDDEN`으로 연결한다. 토큰 필터에서 만료 등을 따로 알리려면 `AuthErrorCode`를 만들어 같은 메서드에 넘긴다.
- 요청 DTO의 알 수 없는 필드는 400으로 거부한다(명세 §2 "표에 명시된 필드만 허용"). 전역 설정으로 넣으므로 A의 요청 DTO에도 적용된다. Boot 4는 Jackson 3(`tools.jackson`)이다.
- **로그 금지:** 예외 처리기는 요청 본문·`Authorization` 헤더·인가 코드·토큰을 로그에 남기지 않는다. A가 확인해 주길 바라는 부분이다.

## 6. 공통 파일·공통 빈 소유

| 파일·빈 | 반영하는 사람 | 다른 사람이 필요할 때 |
| --- | --- | --- |
| `build.gradle` DB·Flyway·Testcontainers 의존성 | B(-62) | — |
| `build.gradle` JWT·OAuth 관련 의존성 | A | — |
| `application*.yaml` 프로필 구조(local/test/prod) | A(-64) | -62는 프로필 파일을 만들지 않았다. 로컬 DB는 Docker Compose 지원, 그 외 환경은 `SPRING_DATASOURCE_*` 환경 변수로 연결한다. 운영 프로필에서 compose 지원을 끌 필요는 없다(developmentOnly라 bootJar에 포함되지 않음) |
| `application*.yaml`의 `spring.datasource`·`jpa`·`flyway` | B | — |
| `application*.yaml`의 OAuth·토큰 설정 | A | 비밀값은 환경 변수, 커밋 금지 |
| `SecurityConfig` | A | B는 요청만 한다 |
| `global/common/**` | B(-63) | A는 도메인 오류 enum만 따로 추가 |
| `Clock` 빈 | B(`global.config.TimeConfig`, `Clock.systemUTC()`) | A도 토큰 만료 계산에 주입받아 쓰면 테스트에서 시간을 고정할 수 있다 |
| UUID 생성 | 공동 결정: UUIDv7. Hibernate 7.4 기본 기능 `@UuidGenerator(style = UuidGenerator.Style.VERSION_7)`로 통일하고 별도 생성기는 두지 않는다. B 엔티티는 적용 완료, A 회원 엔티티는 v4에서 전환 예정 | — |
| 로컬 DB `compose.yaml` | B(-62) | A도 같은 DB로 실행 |

공통 파일을 바꿀 때는 MR 올리기 전에 상대에게 알리고, 상대 MR이 열려 있으면 병합 순서를 정한다.

## 7. 서로 건드리지 않는 범위

| B가 하지 않는 것 | A가 하지 않는 것 |
| --- | --- |
| `user`·`auth` 패키지, `users`·`oauth_*`·`sessions` 테이블 수정 | `trip`·`chat`·`itinerary`·`region` 패키지와 해당 테이블 생성 |
| `SecurityConfig` 수정 | `/trips/**` 권한 규칙 추가 |
| 회원 엔티티 직접 참조(B는 `UUID`만 저장) | 여행 멤버십 검사 구현(필요하면 B의 `TripAccessChecker`를 쓴다) |
| 인증 토큰 파싱 | `idempotency_records` 별도 구현(필요하면 B의 `global.idempotency`를 쓴다) |

로그인 세션 교환(`POST /auth/oauth/{provider}/sessions`)은 명세상 `Idempotency-Key` 필수 대상이 아니다.

## 8. 첫 통합 검증에 필요한 것 (R-6)

분담안 §5 절차를 실제로 돌리려면 A가 준비해 준다.

1. 카카오 개발 앱에 등록된 **테스트 계정 2개**(여행 만든 사람, 비참여자). 계정 정보는 채팅·저장소에 남기지 않고 각자 로그인한다.
2. 로컬에서 서비스 토큰을 얻는 절차(프론트 없이 인가 코드를 받는 방법 포함). Swagger의 Authorize에 넣어 B API를 호출한다.
3. 두 계정의 `userId` 확인 방법(`GET /me`).

검증 순서와 기대 결과:

| 단계 | 호출 | 기대 |
| --- | --- | --- |
| 1 | 계정 1 로그인 → `GET /me` | `userId` 확인 |
| 2 | 계정 1 토큰으로 `POST /trips`(`Idempotency-Key` 포함) | 201, `members`에 계정 1이 OWNER, `user`에 닉네임만 있고 이메일·연령 없음 |
| 3 | 같은 키로 재요청 | 같은 응답, 여행 1건 |
| 4 | `GET /me/trips`, `GET /trips/{id}` | 생성한 여행 표시 |
| 5 | `PATCH /trips/{id}`(이름·기간) | 200, `version` 2 |
| 6 | 계정 2 토큰으로 상세·수정 | 둘 다 `404 TRIP_NOT_FOUND` |
| 7 | 토큰 없이·만료 토큰으로 여행 API | `401`, 공통 오류 형식 |
| 8 | 닉네임 입력 전(프로필 미완성) 토큰으로 `POST /trips` | `403 PROFILE_INCOMPLETE`. 테스트 계정은 1~7단계 전에 닉네임 입력을 마친다 |

결과는 양쪽 MR이나 Jira에 "실제 카카오 연동으로 확인함 / 테스트 대체로만 확인함"을 구분해 남긴다.

## 9. A에게 받은 답 (2026-10-28)

| # | 질문 | A 답변 |
| --- | --- | --- |
| 1 | 인증 주체 이름·위치, 커스텀 어노테이션 여부 | `global.security.AuthUser(UUID userId)` 그대로. 컨트롤러는 Spring 기본 `@AuthenticationPrincipal AuthUser`, 커스텀 어노테이션 없음 |
| 2 | 회원 패키지 루트 | `user` |
| 3 | `UserCardReader` 시그니처, A-0 일정 | 시그니처 동의. A-0는 EODI-105로 dev 병합 완료. `users`에 ERD에 없던 `profile_completed` 컬럼이 추가됨(가입 완료 회원은 `true`와 1~50자 닉네임 필요) |
| 4 | 비활성 사용자 토큰, 프로필 미완성 사용자의 여행 생성 | 비활성 회원·누락·만료·위조·폐기 토큰은 모두 `401 UNAUTHENTICATED`. **프로필 미완성 사용자는 여행 생성 불가**: 미완성 토큰은 `GET/PATCH /api/v1/me`만 허용하고 나머지는 `403 PROFILE_INCOMPLETE`(§1) |
| 5 | 토큰 만료 전용 코드 | 두지 않음. 만료도 `401 UNAUTHENTICATED`. 토큰 수명은 access 1시간, refresh 14일 |
| 6 | -64 시점과 프로필 구조 | A의 로그인 변경에 포함. Bearer 무상태 인증, formLogin·httpBasic 제거, CSRF 해제 적용. DB·카카오·JWT 설정은 `EodiLog/.env` 하나로 모으고 `--spring.profiles.active=local`로 실행(A의 로그인 MR에서 AGENTS.md 실행 안내도 함께 고친다) |
| 7 | Flyway 파일명 규칙, UUIDv7 | 둘 다 동의. UUIDv7은 §6처럼 Hibernate 어노테이션으로 통일 |

그 밖에 A가 B의 P-1~P-10에 모두 동의했다([B 구현 계획](backend-b-trip-basic.md) §2). 아직 남은 것은 A의 로그인 MR 병합과 그 뒤의 첫 통합 검증(§8)이다.
