# 백엔드 B 구현 계획 — 여행 생성·조회·기본 수정

작성일: 2026-10-28 · 상태: 구현 계획 초안(A와 계약 합의 전)

범위는 [백엔드 2인 첫 작업 분담안](../../../docs/plan/backend-first-work-split.md) §3 그대로다. 이 문서는 그 범위를 **어떤 순서로, 어떤 구조로 만들지**를 정한다. 기준 문서: [API 명세](../../../docs/api-spec.md) §2·§4·§10, [논리 ERD](../../../docs/erd.dbml), [ADR-0001](../../../docs/decisions/0001-database.md), [백엔드 규칙](../../AGENTS.md).

## 0. 현재 상태와 막힌 지점

2026-10-28 기준 `EodiLog`에는 Swagger·기본 Security 설정만 있다. B가 구현하려면 아래가 먼저 필요하다.

| 필요한 것 | 현재 | Jira | 영향 |
| --- | --- | --- | --- |
| DB 연결·마이그레이션·테스트 DB | 의존성 없음 | EODI-62, 미배정 | 엔티티·저장소·트랜잭션 테스트 전부 불가 |
| `{data}`·목록·오류 응답, 전역 예외 처리 | 없음 | EODI-63, 미배정 | 응답 DTO와 `409 VERSION_CONFLICT` 표현 |
| 인증 정책·토큰 필터·CSRF | `formLogin`/`httpBasic`, CSRF 켜짐 | EODI-64, 미배정 | 테스트에서 POST/PATCH에 `csrf()` 필요 |
| 인증 사용자 `UUID userId` 획득 방식 | 없음 | A 담당 | 컨트롤러 시그니처 |
| `users` 테이블·공개 회원 조회 | 없음 | A 담당 | `trips.owner_user_id`, `chat_participants.user_id` FK와 `Member.user` |

**제안 배분:** 여행 테이블이 가장 많은 B가 **-62(DB 연결)**를 맡고, 인증과 붙어 있는 **-64는 A**가 맡는다. **-63은 B**가 최소 범위로 만든다(여행 API가 `VERSION_CONFLICT`·`TRIP_NOT_FOUND`·멱등 충돌을 먼저 쓰기 때문). A와 합의하면 Jira 담당자를 지정한다.

## 1. A와 먼저 맞출 계약 (B-0)

B가 A를 기다리지 않으려면 **A가 작은 계약 MR을 먼저 올리는 것**이 가장 빠르다. 시그니처·파일 소유·Security 기대 동작·통합 검증 준비물은 [A 참고 — B 작업과 맞물리는 계약](backend-a-b-contract.md)에 자세히 적었다. 계약 MR에 들어갈 것:

| 항목 | 제안 형태 | 비고 |
| --- | --- | --- |
| 인증 주체 | `AuthUser(UUID userId)`를 SecurityContext principal로 사용, 컨트롤러는 `@AuthenticationPrincipal AuthUser` 또는 `@CurrentUserId UUID` | 이름은 A가 정한다. B 테스트는 `authentication(...)` 요청 후처리기로 같은 principal을 넣는다 |
| `users` 마이그레이션 | ERD의 `users` 컬럼 그대로 | B의 `trips` 마이그레이션이 FK로 참조하므로 **번호상 먼저** 와야 한다 |
| 공개 회원 조회 | `UserCardReader.findCards(UUID viewerId, Collection<UUID> userIds): Map<UUID, UserCard>` | 한 번에 조회(N+1 방지). 팔로우 미구현 동안 `followingStatus`·`followedByStatus`는 `NONE`, `profileImageUrl`은 `null` |
| `UserCard` DTO | 명세 §10 필드만. 이메일·연령 미포함 | B가 `Member.user`에 그대로 넣는다 |

운영 코드에 가짜 `UserCardReader`나 사용자 ID 헤더를 두지 않는다. 계약 MR이 늦어지면 B는 테스트 대체 구현으로 진행하되, **여행 API MR은 계약 MR 병합 뒤에 병합**한다.

## 2. 구현 전에 정할 정책 (공유 후 확정)

분담안 §3이 "구현 전에 공유해 맞춘다"고 한 항목과 명세가 비워 둔 값이다. 오른쪽은 B의 제안이다.

| # | 질문 | 제안 | 근거 |
| --- | --- | --- | --- |
| P-1 | 기간을 한쪽만 입력할 수 있나 | 시작·종료 **둘 다 있거나 둘 다 null**. 한쪽만이면 400 | S16 기간은 달력 범위 선택(당일·1박 2일·2박 3일) |
| P-2 | 상태 판정 기준 시각 | `Asia/Seoul` 날짜 기준. 오늘 < 시작 → PLANNING, 시작 ≤ 오늘 ≤ 종료 → ONGOING, 오늘 > 종료 → COMPLETED, 기간 없음 → PLANNING | Q-4 미정. `Clock` 빈으로 주입해 바꾸기 쉽게 둔다 |
| P-3 | UUID 버전 | UUIDv7(앱 생성) | ADR-0001 권장. Hibernate 7.4 지원 여부를 jar에서 확인하고 없으면 직접 생성 |
| P-4 | `Idempotency-Key` | 여행 생성에 필수, 누락 400. 보관 24시간. 같은 키·다른 본문은 `409 IDEMPOTENCY_KEY_REUSED`, 처리 중 재요청은 `409 REQUEST_IN_PROGRESS` | 명세 §2는 "필수 제안", 유효기간 Q-12, 오류 코드 미정 |
| P-5 | 여행지 입력 | 중복 ID·없는 지역 ID는 400 `VALIDATION_ERROR`(fields에 `destinationRegionIds`). 상한은 정해지면 적용 | 명세 미정 |
| P-6 | 제목 | 앞뒤 공백 제거 후 1~200자 | ERD `varchar(200)` |
| P-7 | 목록 정렬 | 명세 기본 `trips.created_at DESC, id DESC`. 참여 시각 기준으로 바꾸려면 명세 변경 필요 | 명세 §2 |
| P-8 | 바뀐 값이 없는 PATCH | `expectedVersion`은 검사하되 version 증가·이벤트 발행 없이 현재 값 반환 | 불필요한 충돌·알림 방지 |
| P-9 | 마이그레이션 도구·파일명 | Flyway, `V<yyyyMMddHHmm>__<설명>.sql`(예: `V202610281400__create_trips.sql`) | 두 사람이 번호를 동시에 잡아도 덜 충돌 |
| P-10 | 비참여자 응답 | 존재 여부와 무관하게 `404 TRIP_NOT_FOUND`(403 쓰지 않음) | 분담안 §3 완료 기준, 명세 §2 404 행 |

## 3. 작업 순서와 MR 단위

각 MR은 `.\gradlew.bat build` 통과 후 `dev`로 올린다. 브랜치는 Jira 키를 받아 `feature/<키>-<작업명>`으로 만든다(키를 임의로 만들지 않는다).

| 단계 | 내용 | 선행 | 산출물 |
| --- | --- | --- | --- |
| B-0 | A와 §1 계약, §2 정책 합의 | — | Jira 댓글 또는 분담안 문서 갱신 |
| B-1 | DB 연결 (EODI-62) | — | §4 |
| B-2 | 공통 응답·예외 최소본 (EODI-63) | — | §5 |
| B-3 | 여행 스키마·엔티티·저장소 | B-1, A의 `users` 마이그레이션 | §6 |
| B-4 | `POST /trips` (원자 생성 + 멱등) | B-2, B-3 | §7.1 |
| B-5 | `GET /me/trips`, `GET /trips/{tripId}`, 멤버 권한 검사 | B-4 | §7.2·7.3 |
| B-6 | `PATCH /trips/{tripId}` (버전 검사 + 변경 이벤트) | B-5 | §7.4 |
| B-7 | Swagger 검증, A와 첫 통합 검증 | A 로그인 완료 | 분담안 §5 절차 결과 |

B-1·B-2는 A와 무관하게 바로 시작할 수 있다. B-4~B-6은 하나의 MR로 묶어도 되지만, 리뷰 부담을 줄이려면 나눈다.

## 4. B-1 DB 연결 (EODI-62)

- 의존성: `spring-boot-starter-data-jpa`, PostgreSQL 드라이버, Flyway(+`flyway-database-postgresql`), 테스트용 Testcontainers PostgreSQL. **Boot 4 스타터·모듈 이름은 BOM과 Gradle 캐시에서 확인한다**(Boot 4는 Flyway·테스트 지원 모듈이 분리됐다). `build.gradle`은 공통 파일이므로 변경 전에 A에게 알린다.
- 로컬 DB: `EodiLog/compose.yaml`에 `postgis/postgis:17-3.5`를 고정했다. `spring-boot-docker-compose`(developmentOnly)가 `bootRun` 때 컨테이너를 띄우고 접속 정보를 연결하므로 `application*.yaml`에 접속 정보를 두지 않는다. 비밀번호는 커밋하지 않는 `.env`에 둔다(`.env.example` 제공). 프로필 구조는 -64에서 정한다.
- 첫 마이그레이션: `CREATE EXTENSION IF NOT EXISTS postgis;`
- JPA: `ddl-auto=validate`(스키마는 Flyway만 변경), `open-in-view=false`, 시각은 UTC(`hibernate.jdbc.time_zone=UTC`).
- 테스트: Testcontainers 공용 설정 클래스 하나(`@ServiceConnection`)를 두고 통합 테스트가 같이 쓴다. **PC에 Docker가 없으면** 로컬 PostgreSQL 프로필로 대체하고 그 사실을 MR에 적는다.
- 완료 기준: 빈 DB에서 앱이 기동하고 Flyway가 적용되며, 기존 `SwaggerConfigTest`를 포함한 `build`가 통과한다.

## 5. B-2 공통 응답·예외 최소본 (EODI-63)

여행 API에 필요한 만큼만 만든다. 클래스 이름은 A와 공유해 한 벌만 둔다.

- `DataResponse<T>(T data)`, `PageResponse<T>(List<T> data, PageInfo page)`, `PageInfo(String nextCursor, boolean hasNext)`. Swagger `@ApiResponse`와 이름이 겹치지 않도록 `ApiResponse` 대신 `DataResponse`로 했다.
- `ErrorResponse`: `{"error":{"code","message","fields":[],"traceId"}}`. `traceId`는 요청마다 생성해 MDC·응답 헤더에 넣는다.
- `ErrorCode` 인터페이스(상태 코드·코드 문자열·기본 문구)와 `BusinessException`. 오류 코드는 도메인별 enum으로 나눠 A와 같은 파일을 동시에 고치지 않는다: `CommonErrorCode`(`VALIDATION_ERROR`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `INTERNAL_ERROR`), `TripErrorCode`(`TRIP_NOT_FOUND`, `VERSION_CONFLICT`), 멱등 코드(P-4), A의 `AuthErrorCode`.
- Security 필터 단계에서도 같은 JSON을 쓰도록 `ErrorResponseWriter`를 두고, A가 -64의 진입점·접근 거부 처리기에서 쓴다.
- `@RestControllerAdvice`: Bean Validation 실패·JSON 파싱 실패·**알 수 없는 필드**를 400 `VALIDATION_ERROR`로 변환한다. 명세 §2 "표에 명시된 필드만 허용"을 위해 요청 역직렬화에서 알 수 없는 필드를 실패로 처리한다(`status`·`currency`를 보내면 400). Boot 4는 **Jackson 3(`tools.jackson`)**이므로 설정 키·클래스 위치를 확인한다.
- 401·403 응답도 같은 형식이 되도록 Security의 진입점·접근 거부 처리기는 -64(A)와 함께 연결한다.
- `AGENTS.md`의 "공통 응답 형식이 정해지기 전까지 DTO 바로 반환" 문구와 공통 실패 문서화 방식을 이 MR에서 갱신한다.

## 6. B-3 스키마·엔티티

### 마이그레이션 (B 소유)

| 테이블 | 주의 |
| --- | --- |
| `regions` | 공통 자료지만 이번엔 B가 관리. 코드 체계 Q-8 미정이므로 **운영 마이그레이션에 시드 자료를 넣지 않고** 테스트·로컬용 자료만 별도 경로에 둔다 |
| `trips` | `current_settlement_id`는 컬럼만 만들고 FK는 `settlements` 생성 때 추가. `version` 기본 1, `expense_version` 기본 0, `currency` 기본 `'KRW'` + `CHECK` |
| `trip_members` | `(trip_id,user_id)`·`(trip_id,join_order)` 고유, `(user_id,status)`·`(trip_id,status,join_order)` 인덱스 |
| `trip_destinations` | PK `(trip_id,region_id)`. `source_candidate_id`는 컬럼만, FK는 투표 작업에서 추가. 입력한 여행지 순서를 응답에서 유지하려고 ERD에 없는 `display_order`를 추가했다(B-3) |
| `chat_rooms` / `chat_participants` | `trip_id` 고유, PK `(room_id,user_id)` |
| `itineraries` | `trip_id` 고유, `updated_by_member_id`는 방장 멤버십 |
| `idempotency_records` | PK `(user_id,request_scope,idempotency_key)`, `expires_at` 인덱스. B-3은 테이블만 만들고, 선점 삽입 방식에 맞춘 접근 코드는 B-4에서 만든다 |

ERD 논리 타입은 `uuid`→`uuid`, `timestamp`→`timestamptz`, `json`→`jsonb`로 옮긴다. FK에 `ON DELETE CASCADE`를 일괄로 걸지 않는다(ERD 메모). "방장은 같은 여행 ACTIVE 멤버" 불변식은 이번엔 서비스에서 보장하고, 복합 FK(지연 제약)는 방장 양도 작업 때 검토한다.

### 패키지

```
com.eodilog
├─ global/common      응답·예외 (B-2)
├─ global/idempotency 멱등 기록 (B-4, 다른 POST도 재사용)
├─ region             Region 엔티티·저장소, RegionValidator(존재 확인)
├─ trip               controller / service / domain / repository / dto
├─ chat               ChatRoom·ChatParticipant 엔티티, ChatRoomInitializer
└─ itinerary          Itinerary 엔티티, ItineraryInitializer
```

`chat`·`itinerary`에는 생성 초기화만 둔다. 메시지·코스 편집은 만들지 않는다. 회원 엔티티는 참조하지 않고 `UUID`만 저장한다(A 패키지를 직접 수정하지 않기 위해).

### 엔티티 메모

- `Trip.version`에 JPA `@Version`을 쓰지 않는다. `@Version`은 `expense_version` 변경 같은 다른 갱신에도 증가해 여행 정보 수정이 거짓 충돌을 낸다. 대신 §7.4처럼 행 잠금 후 직접 비교·증가한다(ERD 불변식 2와도 일치).
- 상태 계산은 `TripStatusPolicy.resolve(startDate, endDate, today)` 순수 함수로 분리하고 단위 테스트한다.

## 7. API별 구현

모든 컨트롤러는 `/api/v1`, `@Tag(name="여행")`, 엔드포인트마다 `@Operation`(권한·제약 포함), DTO 필드마다 `@Schema`를 붙인다.

### 7.1 `POST /trips` — 201 `Trip`

1. 요청 검증: `title` 필수(P-6), 기간 규칙(P-1), 시작 ≤ 종료, 여행지 중복·존재 확인(P-5).
2. **한 트랜잭션** 안에서:
   1. 멱등 기록 선점 — `(userId, "POST /api/v1/trips", key)`로 `IN_PROGRESS` 삽입. 이미 있으면: `COMPLETED`·같은 해시 → 저장한 상태 코드·응답 그대로 반환 / 다른 해시 → 409 / `IN_PROGRESS` → 409(P-4). 같은 키 동시 요청은 PK 충돌에서 뒤 요청이 앞 트랜잭션 종료까지 대기한 뒤 위 분기로 간다.
   2. `trips` 삽입(`owner_user_id`=인증 사용자, 상태는 정책으로 계산, KRW 고정)
   3. `trip_members` 방장 삽입(ACTIVE, `join_order`=1)
   4. `trip_destinations` 삽입
   5. `chat_rooms` + 방장 `chat_participants` 삽입
   6. `itineraries` 삽입(version 1, 빈 코스)
   7. 응답 DTO 생성 후 멱등 기록을 `COMPLETED`·상태 201·응답 JSON으로 갱신
3. 공동 피드는 만들지 않는다.

요청 해시는 정규화한 요청 본문의 SHA-256이다. 멱등 기록이 같은 트랜잭션에 있으므로 생성이 실패하면 기록도 함께 롤백되어 같은 키로 재시도할 수 있다.

### 7.2 `GET /me/trips` — 200 `Trip[]` + `page`

- 조건: 내 `trip_members.status = ACTIVE`, `trips.deleted_at IS NULL`.
- `status` 필터는 저장된 `status` 컬럼이 아니라 **오늘 날짜와 기간 조건**으로 거른다(날짜가 지나도 컬럼이 갱신되지 않을 수 있으므로). 응답의 `status`도 같은 정책으로 계산한다.
- 정렬·커서: `created_at DESC, id DESC`. 커서는 `(createdAt, id)`를 Base64URL로 인코딩하고 `(created_at, id) < (?, ?)` 조건을 쓴다. `limit` 기본 20·최대 100, `limit+1`건 조회로 `hasNext` 판단. 잘못된 커서는 400.
- N+1 방지: 한 페이지의 여행 ID로 멤버·여행지를 `IN` 조회하고, 회원 정보는 `UserCardReader`로 한 번에 조회한다.

### 7.3 `GET /trips/{tripId}` — 200 `Trip`

- `TripAccessChecker.requireActiveMember(tripId, userId)`가 멤버십을 반환하거나 `TRIP_NOT_FOUND`를 던진다(P-10). 삭제된 여행도 404. 이후 투표·코스·채팅 작업이 이 검사기를 재사용한다.
- `Trip` DTO 조립: `members`는 ACTIVE 멤버만 `joinOrder` 순, `role`은 `owner_user_id` 비교로 계산, `ownerMemberId`는 방장 멤버십 ID, `expenseVersion`은 0.

### 7.4 `PATCH /trips/{tripId}` — 200 `Trip`

1. 요청 필드: `expectedVersion` 필수, `title?`, `startDate?|null`, `endDate?|null`, `destinationRegionIds?`. **생략과 명시적 null을 구분**해야 하므로 기간 필드는 `Optional` 등 3상태 표현으로 받고, 생략·null·값 세 경우를 테스트한다. `title`·`destinationRegionIds`는 null 불가(`[]`는 여행지 비우기).
2. 트랜잭션: 여행 행을 `PESSIMISTIC_WRITE`로 잠금 → ACTIVE 멤버 확인 → `version != expectedVersion`이면 `409 VERSION_CONFLICT` → 변경 적용·기간 재검증(기존 값과 합친 결과로 P-1 검사) → 상태 재계산 → `version + 1`.
3. 여행지는 전체 교체한다.
4. 값이 실제로 바뀐 경우에만 `TripInfoChangedEvent(tripId, actorUserId, changedFields, newVersion)`를 `ApplicationEventPublisher`로 발행한다. 이번에는 수신자(알림 저장·전달)를 만들지 않으며, **알림 기능은 미완료로 표시**한다. 이후 `events` outbox 저장 시 `@TransactionalEventListener`로 연결한다.

## 8. 테스트 계획

| 종류 | 대상 |
| --- | --- |
| 단위 | `TripStatusPolicy` 경계(시작일 당일·종료일 당일·다음 날·기간 없음), 커서 인코딩·오류, 기간·제목 검증 |
| 웹(MockMvc) | 인증 없음 401, 알 수 없는 필드·`status`·`currency` 400, `Idempotency-Key` 누락 400, 응답 형식 `{data}`·`page`, 회원 정보에 이메일·연령 없음 |
| 통합(Testcontainers) | 생성 후 방장 멤버십·채팅방/참여자·빈 코스 존재, 공동 피드 없음 / 채팅방 초기화를 `@MockitoSpyBean`으로 실패시켜 **전체 롤백** / 같은 키 재요청 시 여행 1건·같은 응답, 다른 본문 409 / 목록의 ACTIVE 필터·상태 필터·정렬·커서 연속 조회 / 비참여자 상세·수정 404 / 오래된 버전 409 후 다른 사람 수정 내용 유지 / 여행지 교체·비우기 |
| 동시성 | 같은 `expectedVersion` PATCH 2건 동시 → 200 1건·409 1건 / 같은 `Idempotency-Key` POST 2건 동시 → 여행 1건 |
| 문서 | `/v3/api-docs`에 4개 경로·태그·DTO·`Idempotency-Key` 헤더·`409` 응답·자물쇠 표시 검사(기존 `SwaggerConfigTest` 방식) |

테스트의 인증 사용자는 §1의 principal을 요청 후처리기로 넣고, `UserCardReader`는 테스트 대체 구현을 쓴다. 현재 Security 설정은 CSRF가 켜져 있으므로 -64 반영 전까지 POST/PATCH 테스트에 `csrf()`를 붙인다.

## 9. 완료 판단

분담안 §3 완료 기준을 모두 충족하고, 다음을 MR에 기록한다.

- `.\gradlew.bat build` 통과, Testcontainers 실행 여부(또는 대체 방식)
- Swagger UI 확인 또는 `/v3/api-docs` 테스트로 대신했는지
- A의 실제 카카오 토큰으로 분담안 §5 통합 검증을 했는지. **안 했으면 "테스트 대체 인증으로만 검증"이라고 적고 완료로 표시하지 않는다**
- 변경 이벤트 발행까지만 했고 알림 전달은 후속이라는 점

## 10. 위험과 대응

| 위험 | 대응 |
| --- | --- |
| A의 `users` 마이그레이션이 늦음 | `users`만 담은 작은 MR을 먼저 받는다. 그때까지는 B 브랜치에서 진행만 하고 병합은 뒤로 미룬다 |
| Boot 4·Jackson 3·Hibernate 7 API 차이 | 기억한 예제 대신 Gradle 캐시의 jar로 클래스 위치를 확인한다(`AGENTS.md`) |
| 공통 파일(`build.gradle`, `application*.yaml`, `SecurityConfig`) 동시 수정 | 파일별 한 명만 반영(분담안 §4). B는 `build.gradle`·`application*.yaml`의 DB 부분, A는 `SecurityConfig` |
| Docker 미설치로 Testcontainers 불가 | 로컬 PostgreSQL 프로필로 대체하고 MR에 기록 |
| Q-4·Q-12 결정이 바뀜 | 상태 정책은 `Clock`·순수 함수로, 멱등 보관 기간은 설정값으로 분리해 코드 변경을 줄인다 |
