# 테스트 프로필 분리

Jira: EODI-132

Gradle `test` 작업은 `spring.profiles.active=test`를 테스트 JVM에 전달한다. `build`도 같은 테스트 작업을 사용한다. IDE에서 JUnit을 직접 실행할 때는 VM 옵션 `-Dspring.profiles.active=test`를 지정한다.

일반 통합 테스트는 본 `src/main/resources/application.yaml`을 읽고 `src/test/resources/application-test.yaml`의 가짜 카카오 자격 증명·redirect·JWT 키·issuer만 덮어쓴다. JPA 검증, Flyway 위치, 알 수 없는 JSON 필드 거부, 로그 설정, 토큰 수명은 본 설정에서 상속한다. 테스트 DB 접속은 기존 `TestcontainersConfiguration`이 제공하며 실제 `.env`는 읽지 않는다.

`LocalKakaoIntegrationTest`는 예외다. 기존 `spring.config.name=local-kakao-test`와 `@ActiveProfiles("local")`을 유지해 독립 `local-kakao-test.yaml`만 읽는다. 실제 `application-local.yaml`의 `.env` import는 적용되지 않는다. IDE에서도 이 테스트의 `@ActiveProfiles`를 유지한다.

확인은 `EodiLog`에서 `.\gradlew.bat build --console=plain`으로 한다. `EodiLogApplicationTests`는 본 설정 상속·테스트 인증 값·`.env` import 부재를 확인하고, 기존 API 테스트가 실제 JPA·Flyway·Jackson 동작을 검증한다.
