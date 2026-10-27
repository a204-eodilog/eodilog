# 어디로그 백엔드 에이전트 안내

`EodiLog/`는 어디로그 Spring Boot 백엔드다. 작업 전에 이 문서, [API 명세](../docs/api-spec.md), [Git 커밋·브랜치 컨벤션](../docs/convention/git-commit-convention.md)을 읽는다.

## 기술 스택

- Java 25, Spring Boot 4.1.2, Gradle 9.8.2 (Wrapper 사용)
- Spring Security, OAuth2 Client, Validation, Web MVC, Lombok
- springdoc-openapi 3.2.0 (Swagger UI)

## Spring Boot 4는 바뀌었다 — 기억에 의존하지 않는다

Spring Boot 4·Spring Security 7은 3.x와 모듈·패키지 위치가 다르다. 기억하는 import 경로나 설정 이름이 맞지 않을 수 있다.

- `build.gradle`의 실제 버전을 확인하고, 클래스 위치가 의심되면 Gradle 캐시의 jar에서 확인한다.
- 예: `@AutoConfigureMockMvc`는 `org.springframework.boot.webmvc.test.autoconfigure` 패키지에 있다.
- springdoc은 Boot 4용 3.x만 쓴다. 2.x(Boot 3용) 문서나 예제를 따르지 않는다.

## 명령

```powershell
cd EodiLog
.\gradlew.bat build     # 컴파일 + 전체 테스트
.\gradlew.bat bootRun   # 로컬 실행 (http://localhost:8080)
```

작업을 완료로 보고하기 전에 `build`를 통과시킨다.

## 패키지

- 루트 패키지: `com.eodilog`
- 공통 설정: `global.config` (`SwaggerConfig`, `SecurityConfig`)

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
   - 모든 API에 공통인 실패(400·401·403·404·500)는 개별 API에 반복해 적지 않는다. 공통 응답·예외 처리(EODI-63)가 정해지면 공통 방식으로 문서화한다.
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
	public ResponseEntity<TripResponse> getTrip(
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
	public ResponseEntity<InvitationPreviewResponse> getInvitation(@PathVariable String token) {
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

공통 응답 형식(`{ "data": ... }`)이 정해지기 전까지는 위처럼 DTO를 바로 반환한다. 정해지면 이 문서를 함께 갱신한다.

### 완료 전 확인

1. `.\gradlew.bat build` 통과
2. `bootRun` 후 Swagger UI에서 새 API의 태그·요약·DTO 설명·자물쇠 표시가 의도대로 나오는지 확인한다. 실행할 수 없는 환경이면 `/v3/api-docs`를 검사하는 테스트로 대신하고, 그렇게 했다고 보고한다.

## 진행 중인 기반 작업 (2026-10-27 기준)

- 공통 응답·예외 처리: EODI-63
- 환경별 설정 분리·Security 기본 설정: EODI-64. 운영 환경에서 Swagger를 끄는 설정(`springdoc.api-docs.enabled=false`, `springdoc.swagger-ui.enabled=false`)도 여기서 다룬다.

## Git

- 작업 브랜치는 최신 `origin/dev`에서 `chore|feature|docs/<Jira 키>-<작업명>`으로 만들고, MR 대상은 `dev`다.
- 커밋 메시지는 `Type : 제목` 형식이며 꼬리말에 `Ref: <Jira 키>`를 적는다.
- **AI 도구는 사용자가 명시적으로 지시한 경우에만 커밋·푸시한다.** 자세한 규칙은 [Git 커밋·브랜치 컨벤션](../docs/convention/git-commit-convention.md)을 따른다.
