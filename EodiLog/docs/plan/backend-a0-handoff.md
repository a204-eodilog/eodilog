# A-0 회원 공통 기반

Jira: https://jira.example.com/browse/EODI-105

B 여행 스키마가 users FK와 공개 회원 카드를 사용하도록 카카오 로그인보다 먼저 병합하는 기반이다. 이 변경은 카카오·JWT·Security 설정·/me API·인증 테이블·환경 파일·JaCoCo 설정을 포함하지 않는다.

## 제공 계약

- `com.eodilog.global.security.AuthUser(UUID userId)`를 Spring 기본 `@AuthenticationPrincipal`로 받는다. 실제 Bearer 필터 연결은 후속 로그인 변경이다.
- `com.eodilog.user.service.UserCardReader.findCards(UUID viewerId, Collection<UUID> userIds)`는 `Map<UUID, UserCard>`를 반환한다.
- 카드 DTO와 enum은 `user.dto.UserCard`, `AccountVisibility`, `FollowStatus`다.
- 중복 제거 후 한 번의 IN 조회, 빈 입력은 SQL 없음. 없는 ID는 생략한다.
- 탈퇴 회원도 UUID를 반환하지만 nickname은 `탈퇴한 사용자`로 표시한다. 활성 이름과 DB 원본은 유지한다.
- 공개 필드는 id, nickname, profileImageUrl, accountVisibility, followingStatus, followedByStatus 6개다. 이메일·연령·동의·회원 엔티티는 노출하지 않는다. 이미지 null·팔로우 NONE은 후속 기능 구현 전 임시 값이다.
- 읽기 전용 REQUIRED 트랜잭션으로 호출자 트랜잭션에 참여한다. 방금 생성한 users도 조회한다.

## DB와 병합 순서

`V202610281100__create_users.sql`은 dev의 PostGIS 1000 마이그레이션 다음에 실행한다. profile_asset_id FK는 assets가 생길 때 추가한다. nickname이 있는 가입 완료 테스트 회원을 만들 때는 `profile_completed=true`를 함께 지정한다. 가입 대기 회원은 nickname이 빈 문자열이고 profile_completed=false다.

B 여행 마이그레이션은 users 뒤 번호를 사용한다. 병합 직전 최신 dev에 더 늦은 번호가 들어갔다면 아직 병합하지 않은 파일 번호를 재조정한다. 이미 병합한 SQL은 수정하거나 outOfOrder로 우회하지 않는다. 구버전 1100 create_auth_member를 개인 DB에 적용했다면 체크섬이 다르므로 별도 전환이 필요하다. 공유 DB 초기화·repair·baseline은 하지 않는다.

회원·여행 ID 타입은 UUID다. UUIDv7 사용 정책은 동의했지만 공통 생성기 도입은 후속이며 이 변경은 ID를 생성하지 않는다.

## 검증

Java 25와 Docker Desktop 환경에서 실행한다. 실제 카카오·JWT 키나 .env 파일은 필요하지 않다.

```powershell
cd EodiLog
.\gradlew.bat build --console=plain
```

`UserCardReaderTest`는 PostgreSQL 17과 임시 users-only Flyway 경로, 독립 Spring context를 사용한다. 활성/탈퇴·PUBLIC/PRIVATE·없는 ID·중복 ID, query 1회, 빈 입력 무호출, 공개 필드, 원본 이름 유지, 호출자 트랜잭션 참여/롤백을 검증한다. public 테이블이 users와 flyway_schema_history뿐인 것도 확인한다.

전체 build는 기존 dev 공통 오류·Swagger·PostGIS 테스트도 함께 실행한다. 실제 인증은 아직 dev의 기본 Security 동작이며 B 웹 테스트는 AuthUser principal을 테스트 인증으로 넣어 개발한다. 카카오·Expo 실연동은 이 A-0 검증에 포함하지 않는다.

분리 체크아웃 검증 결과(2026-10-28): build 성공, 전체 22개 테스트, 실패·오류·건너뜀 0. 그중 users-only 독립 테스트 3개 포함. 실제 .env 및 카카오·JWT 설정은 복사하지 않았다.
