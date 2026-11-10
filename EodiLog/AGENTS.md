# 어디로그 백엔드 에이전트 안내

`EodiLog/`는 어디로그 Spring Boot 백엔드다. 작업 전에 이 문서, [API 명세](../docs/api-spec.md), [Git 커밋·브랜치 컨벤션](../docs/convention/git-commit-convention.md)을 읽는다.

## 기술 스택

- Java 25, Spring Boot 4.1.2, Gradle 9.8.2 (Wrapper 사용)
- Spring Security, OAuth2 Client, Validation, Web MVC, WebSocket(STOMP, 내장 simple broker), Lombok
- springdoc-openapi 3.2.0 (Swagger UI)
- PostgreSQL 17 + PostGIS 3.5 ([ADR-0001](../docs/decisions/0001-database.md)), Spring Data JPA(Hibernate 7), Flyway
- 로컬 DB는 Docker Compose(`compose.yaml`, `spring-boot-docker-compose`), 테스트 DB는 Testcontainers 2.x
- 서비스 토큰은 HS256 JWT(`spring-security-oauth2-jose`의 Nimbus), 커버리지는 JaCoCo 0.8.16

## Spring Boot 4는 바뀌었다 — 기억에 의존하지 않는다

Spring Boot 4·Spring Security 7은 3.x와 모듈·패키지 위치가 다르다. 기억하는 import 경로나 설정 이름이 맞지 않을 수 있다.

- `build.gradle`의 실제 버전을 확인하고, 클래스 위치가 의심되면 Gradle 캐시의 jar에서 확인한다.
- 예: `@AutoConfigureMockMvc`는 `org.springframework.boot.webmvc.test.autoconfigure` 패키지에 있다.
- springdoc은 Boot 4용 3.x만 쓴다. 2.x(Boot 3용) 문서나 예제를 따르지 않는다.

## 명령

```powershell
cd EodiLog
.\gradlew.bat build     # 컴파일 + 전체 테스트(끝나면 JaCoCo 리포트도 만든다)
.\dev-up                # 로컬 DB 준비 → 서버 백그라운드 실행 (http://localhost:8080)
.\dev-down              # 로컬 서버와 DB 정지(DB 볼륨은 보존)
```

작업을 완료로 보고하기 전에 `build`를 통과시킨다.

- **Docker Desktop을 먼저 실행한다.** `build`의 스프링 테스트는 Testcontainers로 PostGIS 컨테이너를 띄우고, 서버 실행은 `compose.yaml`의 DB를 쓴다.
- 서버를 띄우기 전에 `.env.example`을 `.env`로 복사해 **모든 키**를 채운다: DB 비밀번호, `KAKAO_CLIENT_ID`·`KAKAO_CLIENT_SECRET`, `KAKAO_ALLOWED_REDIRECTS`, `JWT_SECRET`(32바이트 이상), `STORAGE_BUCKET`·`STORAGE_REGION`·`AWS_ACCESS_KEY_ID`·`AWS_SECRET_ACCESS_KEY`(S3 개발 버킷). 인증·버킷 설정이 비어 있으면 서버가 시작되지 않는다. `KMA_SERVICE_KEY`(기상청 data.go.kr 키)는 비워도 서버가 뜨고 날씨 요청만 503이 된다. `.env`는 커밋하지 않는다.
- 실제 S3 버킷 왕복 테스트(`AssetRealS3Test`)는 기본 빌드에서 건너뛴다. `.env`를 채운 뒤 `.\gradlew.bat test --tests "*AssetRealS3Test" -PrealS3=true`로 돌린다.
- `dev-up` 대신 직접 띄울 때는 `.\gradlew.bat bootRun --args="--spring.profiles.active=local"`을 쓴다. `local` 프로필이 `.env`를 읽는다. 자세한 실행·카카오 로그인 점검은 [로컬 실행 문서](docs/plan/local-development.md)를 본다.
- 커버리지 리포트는 `build/reports/jacoco/test/html/index.html`에 생긴다([커버리지 문서](docs/plan/backend-test-coverage.md)).
- compose 없이 다른 DB에 붙일 때는 `SPRING_DATASOURCE_URL`·`SPRING_DATASOURCE_USERNAME`·`SPRING_DATASOURCE_PASSWORD` 환경 변수를 쓴다. `application*.yaml`에 접속 정보를 적지 않는다.
- 테스트는 실제 `.env` 없이 돈다. Gradle test는 `test` 프로필을 적용하며 `application-test.yaml`의 가짜 인증 값만 본 설정에 덮어쓴다. JPA·Flyway·Jackson·로그·토큰 수명은 본 설정을 상속한다. IDE 직접 실행은 `-Dspring.profiles.active=test`를 지정한다([테스트 프로필](docs/plan/test-profile.md)).

## DB·마이그레이션

- 스키마는 Flyway로만 바꾼다(`ddl-auto=validate`). 파일 위치는 `src/main/resources/db/migration`.
- 파일명은 `V<yyyyMMddHHmm>__<동사>_<대상>.sql`(예: `V202610281400__create_trips.sql`). 참조되는 테이블이 더 이른 번호를 쓴다.
- 병합된 마이그레이션 파일은 고치지 않는다. 병합 직전 `origin/dev`에 내 번호보다 늦은 마이그레이션이 이미 있으면 내 파일 번호를 늦춘다. `outOfOrder`는 켜지 않는다.
- ERD 논리 타입은 `uuid`→`uuid`, `timestamp`→`timestamptz`(UTC), `json`→`jsonb`로 옮긴다. FK에 `ON DELETE CASCADE`를 일괄로 걸지 않는다.
- 스프링 컨텍스트를 띄우는 테스트는 `@Import(TestcontainersConfiguration.class)`를 붙인다.
- 로그인 사용자가 필요한 API 테스트는 `AuthUserRequestPostProcessors.authUser(userId)`로 `AuthUser` principal을 넣는다. 회원은 `users`에 SQL로 넣고 `profile_completed=true`·닉네임·`created_at`·`updated_at`을 함께 채운다. CSRF는 꺼져 있어 `csrf()`는 필요 없다.

## 패키지

- 루트 패키지: `com.eodilog`
- 공통 설정: `global.config` (`SwaggerConfig`, `SecurityConfig`, `TimeConfig`의 `Clock` 빈)
- 공통 코드: `global.common`(응답·예외·traceId), `global.idempotency`(요청 중복 방지), `global.security`(`AuthUser`), `global.websocket`(STOMP `/ws` 연결·CONNECT 인증·ERROR 형식), `global.ai`(내부 AI 서버 호출 `AiServerClient`, 설정 `app.ai`), `global.storage`(S3 파일 저장소 `ObjectStorage`, 설정 `app.storage`. 테스트는 `InMemoryStorageConfiguration`으로 메모리 저장소를 끼운다)
- 도메인: `domain.auth`(카카오 로그인·서비스 토큰·`BearerFilter`), `user`(회원·`/me`·`UserCardReader`), `trip`, `chat`(그룹 채팅방·메시지, `chat.realtime` 커밋 뒤 실시간 전달), `itinerary`(코스, `itinerary.proposal` AI 코스 제안 ITINERARY_PROPOSAL·적용·되돌리기), `checklist`(공동 준비물, `checklist.suggestion` AI 준비물 제안 작업·채택), `expense`(경비·정산), `invitation`(초대 링크), `poll`(지역·장소 투표), `region`, `visit`(실제 방문 기록·방문 평가), `asset`(파일 업로드 요청·확인·취소·다운로드), `extraction`(링크·캡처 AI 장소 추출 PLACE_EXTRACTION 작업·조회·삭제), `weather`(기상청 단기·중기예보 조회 `WeatherService`·설정 `app.weather`, `weather.alternative` AI 날씨 대안 WEATHER_ALTERNATIVES 작업). 새 도메인은 루트 아래에 둔다
- 공통 목록 커서: `global.common.response.CreatedAtCursor`(기본 정렬 `createdAt DESC, id DESC`)

## 백엔드 문서

- 작업 계획과 담당 간 계약은 [docs/plan](docs/plan/)에 둔다. 구현 전에 해당 담당의 계획과 [A·B 계약](docs/plan/backend-a-b-contract.md)을 확인한다.
- 로그인 흐름과 프론트 연결 순서는 [인증 연동 문서](../docs/design/backend-auth-integration.md)에 있다.

## API 문서화 (Swagger)

- Swagger UI: `http://localhost:8080/swagger-ui.html`
- OpenAPI JSON: `http://localhost:8080/v3/api-docs`
- 설정: [SwaggerConfig.java](src/main/java/com/eodilog/global/config/SwaggerConfig.java), [application.yaml](src/main/resources/application.yaml)의 `springdoc`

springdoc은 컨트롤러를 읽어 경로·파라미터·DTO 구조를 자동으로 문서에 넣는다. 설명, 공개 여부, 업무 오류는 자동으로 들어가지 않으므로 **API를 추가·수정할 때 문서화도 같은 작업에 포함한다.** 문서화가 빠진 API는 완료로 보지 않는다.

### 규칙

1. **태그**: 컨트롤러 클래스에 `@Tag(name, description)`을 붙인다. `name`은 API 명세 섹션의 기능 이름을 쓴다(예: `여행`, `장소`, `투표`, `피드`).
2. **요약**: 엔드포인트마다 `@Operation(summary, description)`을 붙인다. `summary`는 한 줄, `description`에는 명세 표의 권한(본인·멤버·방장·공개)과 주요 제약을 적는다.
3. **DTO**: 요청·응답 DTO와 필드에 `@Schema(description, example)`를 붙인다.
   - 필수 필드는 `requiredMode = Schema.RequiredMode.REQUIRED`
   - ID는 UUID 문자열, 날짜시각은 UTC ISO-8601 예시를 쓴다
4. **인증 표시**: 전역 Bearer 인증이 기본으로 걸려 있다. 명세에서 **공개**인 API에만 `@SecurityRequirements`를 붙여 Swagger의 인증 표시를 해제한다.
   - 이것은 문서 표시만 바꾼다. 실제로 토큰 없이 접근을 허용하려면 `SecurityConfig`도 수정해야 한다.
5. **응답 코드**: 성공 코드와 명세 표에 적힌 업무 실패(예: `409 VERSION_CONFLICT`, `410 INVITATION_EXPIRED`)를 `@ApiResponse`로 적는다.
   - 모든 API에 공통인 실패(400·401·403·404·500)는 개별 API에 반복해 적지 않는다. `SwaggerConfig`의 `commonErrorResponsesCustomizer`가 모든 API에 `ErrorResponse` 형식으로 자동 추가한다(공개 API는 401·403 제외). 같은 상태 코드를 업무 오류로 따로 적으면 그 설명이 유지된다.
6. **경로와 이름**: 경로는 `/api/v1`으로 시작하고, 명세 표의 경로·필드 이름을 그대로 쓴다. 명세와 다르게 구현해야 하면 임의로 바꾸지 말고 사용자에게 확인한다.
7. **Swagger 공개 경로 유지**: `SecurityConfig`의 `SWAGGER_PATHS`를 지우거나 좁히지 않는다.

### 예시

```java
@Tag(name = "여행", description = "여행 생성·조회·수정·삭제")
@RestController
@RequestMapping("/api/v1/trips")
public class TripController {

	@Operation(summary = "여행 상세 조회", description = "ACTIVE 멤버만 조회할 수 있다")
	@ApiResponse(responseCode = "200", description = "조회 성공")
	@GetMapping("/{tripId}")
	public ResponseEntity<DataResponse<TripResponse>> getTrip(
			@Parameter(description = "여행 ID(UUID)") @PathVariable String tripId) {
		...
	}

}

@Tag(name = "초대", description = "여행 초대 조회·수락")
@RestController
@RequestMapping("/api/v1/invitations")
public class InvitationController {

	@Operation(summary = "초대 미리보기", description = "토큰 없이 조회한다. 여행명·기간·초대한 사람만 반환한다")
	@SecurityRequirements
	@ApiResponse(responseCode = "200", description = "조회 성공")
	@ApiResponse(responseCode = "410", description = "INVITATION_EXPIRED: 만료된 초대")
	@GetMapping("/{token}")
	public ResponseEntity<DataResponse<InvitationPreviewResponse>> getInvitation(@PathVariable String token) {
		...
	}

}

public record TripResponse(
		@Schema(description = "여행 ID", example = "3f2b8c1e-5d4a-4e7b-9c1f-2a6d8e0b7c45",
				requiredMode = Schema.RequiredMode.REQUIRED)
		String id,

		@Schema(description = "여행 제목", example = "제주 3박 4일")
		String title
) {
}
```

성공 응답은 아래 "응답·예외" 규칙대로 `DataResponse`·`PageResponse`로 감싼다.

### 완료 전 확인

1. `.\gradlew.bat build` 통과
2. `bootRun` 후 Swagger UI에서 새 API의 태그·요약·DTO 설명·자물쇠 표시가 의도대로 나오는지 확인한다. 실행할 수 없는 환경이면 `/v3/api-docs`를 검사하는 테스트로 대신하고, 그렇게 했다고 보고한다.

## 응답·예외

API 명세 §2의 공통 계약을 `global.common`이 구현한다. 같은 역할의 클래스를 새로 만들지 않는다.

| 상황 | 쓰는 것 |
| --- | --- |
| 단건 성공 `{ "data": ... }` | `DataResponse.of(dto)` |
| 목록 성공 `{ "data": [...], "page": {...} }` | `PageResponse.of(items, nextCursor, hasNext)` |
| 업무 실패 | `throw new BusinessException(XxxErrorCode.CODE)`. 문구·필드를 바꿀 때만 다른 생성자를 쓴다 |
| 컨트롤러 밖(Security 필터·진입점·접근 거부 처리기) 실패 | `ErrorResponseWriter.write(response, CommonErrorCode.UNAUTHENTICATED)` |
| `Idempotency-Key`가 필요한 POST(명세 §2) | 서비스의 `@Transactional` 메서드 안에서 `idempotencyService.execute(userId, "POST /api/v1/...", key, request, ResponseType.class, HttpStatus.CREATED, () -> 생성)`. 같은 키·같은 본문은 처음 결과를 돌려주고, 다른 본문은 409 `IDEMPOTENCY_KEY_REUSED`. 처음 결과를 다시 줄 때는 `action`이 실행되지 않으므로, 여행 안 자료 생성은 `validateKey` → `TripAccessChecker.requireActiveMemberForUpdate` → `execute` 순서로 권한 검사를 `execute` 앞에 둔다(`ExpenseService.createExpense`) |

- 실패 응답은 `{"error":{"code","message","fields":[],"traceId"}}`이다. `GlobalExceptionHandler`가 Bean Validation·요청 파라미터 검증·JSON 형식 오류·알 수 없는 필드·404/405/415·권한 거부를 모두 이 형식으로 바꾼다. 컨트롤러에서 `try/catch`로 응답을 직접 만들지 않는다.
- **오류 코드는 도메인별 enum**으로 `ErrorCode`를 구현해 만든다(예: `trip.TripErrorCode`, `auth.AuthErrorCode`). `code()`는 명세의 오류 이름(`TRIP_NOT_FOUND`, `VERSION_CONFLICT`)을 그대로, `message()`는 사용자에게 보여도 되는 문구를 쓴다. 공통 실패는 `CommonErrorCode`에만 둔다.
- 요청 DTO에 없는 필드가 오면 400이다(`spring.jackson.deserialization.fail-on-unknown-properties=true`). 명세 §2 "표에 명시된 필드만 허용" 규칙이다.
- 예상하지 못한 예외는 500 `INTERNAL_ERROR`로 응답하고 내부 문구를 싣지 않는다. 로그에 요청 본문·`Authorization` 헤더·토큰·인가 코드를 남기지 않는다.
- `TraceIdFilter`가 요청마다 `traceId`를 만들어 로그 줄(`[traceId]`)·`X-Trace-Id` 응답 헤더·오류 응답에 같은 값을 쓴다. 문의가 오면 이 값으로 로그를 찾는다.
- 여행 내부 자료(투표·코스·채팅·경비 등) API는 먼저 `TripAccessChecker.requireActiveMember(tripId, userId)`로 ACTIVE 멤버인지 확인한다. 없는·삭제된·비참여·이탈 여행은 모두 `404 TRIP_NOT_FOUND`로 같게 응답한다. 여행 응답은 `TripResponseAssembler`로 만든다. 경로에 tripId가 없는 채팅방 API(`/chat/rooms/{roomId}/**`)는 방의 여행으로 같은 기준(삭제 안 된 여행의 ACTIVE 멤버)을 확인하고 `404 CHAT_ROOM_NOT_FOUND`로 같게 응답한다.

## 기반 작업 현황 (2026-10-30 기준)

- DB 연결(PostgreSQL + PostGIS): EODI-62 완료. 공간 열 매핑(hibernate-spatial)은 실제 공간 열이 생길 때 추가한다.
- 공통 응답·예외 처리: EODI-63 완료.
- 인증·Security: 카카오 로그인(EODI-118)으로 Bearer 무상태 인증, CSRF·formLogin·httpBasic 해제, 401/403 공통 JSON, 프로필 미완성 `403 PROFILE_INCOMPLETE`가 들어갔다. 공개 API를 만들면 `SecurityConfig`의 공개 경로와 `BearerFilter.shouldNotFilter`를 함께 고친다. 로그인 여부에 따라 응답이 달라지는 공개 API(초대 미리보기)는 `SecurityConfig`만 열고 `BearerFilter`는 그대로 거치게 한다.
- 남은 것(EODI-64 등): 운영 프로필과 그 환경의 Swagger 끄기(`springdoc.api-docs.enabled=false`, `springdoc.swagger-ui.enabled=false`), CORS(허용 헤더 `Authorization`·`Content-Type`·`Idempotency-Key`, 노출 헤더 `X-Trace-Id`), 토큰 갱신·로그아웃 API, 회원·세션 ID의 UUIDv7 전환.

## Git

- 작업 브랜치는 최신 `origin/dev`에서 `chore|feature|docs/<Jira 키>-<작업명>`으로 만들고, MR 대상은 `dev`다.
- 커밋 메시지는 `Type : 제목` 형식이며 꼬리말에 `Ref: <Jira 키>`를 적는다.
- **AI 도구는 사용자가 명시적으로 지시한 경우에만 커밋·푸시한다.** 자세한 규칙은 [Git 커밋·브랜치 컨벤션](../docs/convention/git-commit-convention.md)을 따른다.
