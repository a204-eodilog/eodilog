# 백엔드 B 후속 작업 — 준비물 체크리스트·멤버 관리·경비·초대·정산·채팅·나가기·투표·코스

작성일: 2026-10-29 · 상태: 체크리스트·멤버 관리 병합 완료(MR !49·!50), 경비·정산 상태 병합 완료(MR !56, 2026-10-30), 초대 링크 병합 완료(MR !58·!62), 정산 계산 병합 완료(MR !69), 채팅 REST 병합 완료(MR !71), 기본 나가기 병합 완료(MR !76), 투표 구현(EODI-161), 나가기 내 채팅 삭제·방문 기록 구현(2026-11-04, §15·§16), 초대 링크 취소 병합 완료(MR !108, §9 I-11), 채팅 실시간 전달 구현(EODI-192, §12-1), 도메인 알림 이벤트 발행 병합(MR !123, §17), 방문 평가 구현(EODI-199, §18), AI 준비물 추천·채택 구현(EODI-218, §19), AI 장소 추출 구현(EODI-224, §20), 날씨 조회·날씨 대안·WEATHER 코스 제안 구현(EODI-247, §22)

[B 첫 작업](backend-b-trip-basic.md)(여행 생성·조회·수정)이 끝난 뒤 A의 카카오 로그인을 기다리는 동안 진행한 B 작업이다. [분담안](../../../docs/plan/backend-first-work-split.md) §6은 이 기능들을 "첫 통합 뒤 배분"으로 두었지만, 로그인 없이 개발할 수 있고 여행 패키지 안에서 끝나는 것부터 B가 먼저 맡았다. A와 겹치는 파일(`user`·`auth` 패키지, `SecurityConfig`)은 건드리지 않는다.

이 문서는 **명세가 비워 둔 값을 구현하면서 정한 정책**을 기록한다. 기준 문서: [API 명세](../../../docs/api-spec.md) §2·§4·§6·§10, [ERD](../../../docs/erd.dbml), [백엔드 규칙](../../AGENTS.md).

## 1. 진행

| 기능 | API | Jira | 상태 |
| --- | --- | --- | --- |
| 준비물 체크리스트 | `GET/POST /trips/{tripId}/checklist`, `PATCH/DELETE /trips/{tripId}/checklist/{itemId}` | EODI-110 | 병합(MR !49) |
| 멤버 관리 | `GET /trips/{tripId}/members`, `POST /trips/{tripId}/owner-transfer`, `DELETE /trips/{tripId}/members/{memberId}` | EODI-111 | 병합(MR !50) |
| 초대 링크 | `POST /trips/{tripId}/invitations`, `GET /invitations/{token}`(공개), `POST /invitations/{token}/accept` | EODI-125, -128 | 병합(MR !58·!62, §9) |
| 초대 링크 취소 | `DELETE /trips/{tripId}/invitations` | EODI-187 | 병합(MR !108, §9 I-11) |
| 경비·정산 상태 | `GET/POST /trips/{tripId}/expenses`, `PATCH/DELETE /trips/{tripId}/expenses/{expenseId}`, `GET /trips/{tripId}/settlement`, `POST /trips/{tripId}/settlements`(409) | EODI-122 | 병합(MR !56, §8) |
| 정산 계산 | `POST /trips/{tripId}/settlements`, `GET /trips/{tripId}/settlements`, `GET /trips/{tripId}/settlements/{settlementId}`, `GET /trips/{tripId}/settlement` | EODI-134 | 병합(MR !69, §10) |
| 채팅 REST | `GET /chat/rooms`, `GET /trips/{tripId}/chat-room`, `GET/POST /chat/rooms/{roomId}/messages` | EODI-136 | 병합(MR !71, §12) |
| 채팅 실시간 전달 | STOMP `GET /ws`, 구독 `/user/queue/chat` | EODI-192 | 구현(§12-1) |
| 기본 나가기 | `POST /trips/{tripId}/leave` | EODI-140 | 병합(MR !76, §11) |
| 투표 | `GET/POST /trips/{tripId}/polls`, `GET /trips/{tripId}/polls/{pollId}`, `PUT .../ballot`, `POST .../candidates` | EODI-161 | 구현(§13) |
| 코스 수동 편집 | `GET/PUT /trips/{tripId}/itinerary` | EODI-164 | 병합(MR !85, §13-3) |
| 여행 삭제·마지막 멤버 나가기 | `DELETE /trips/{tripId}`, `POST /trips/{tripId}/leave`(혼자 남은 사람) | EODI-167 | 구현(§14) |
| 나가기 내 채팅 삭제 | `POST /trips/{tripId}/leave`(`deleteOwnMessages=true`), LEAVE_CLEANUP 작업 | EODI-182 | 구현(§15) |
| 방문 기록 | `POST/GET /trips/{tripId}/visits`, `DELETE /trips/{tripId}/visits/{visitId}` | EODI-183 | 구현(§16) |
| 도메인 알림 이벤트 발행 | 새 API 없음(`GET /me/notifications`에 투표·초대 수락·코스 알림이 생김), 주기 작업 `PollReminderScheduler` | EODI-196 | 병합(MR !123, §17) |
| 방문 평가 | `PUT/DELETE /trips/{tripId}/visits/{visitId}/review`, `GET /trips/{tripId}/reviews`, 방문 목록·해제 보강 | EODI-199 | 구현(§18) |
| AI 준비물 추천·채택 | `POST /trips/{tripId}/checklist-suggestions`, CHECKLIST_SUGGESTIONS 작업, `POST /trips/{tripId}/checklist`의 제안 채택 | EODI-218 | 구현(§19) |
| 날씨 조회·날씨 대안 | `GET /trips/{tripId}/weather`, `POST /trips/{tripId}/weather-alternatives`(WEATHER_ALTERNATIVES), `POST /itinerary/proposals`의 `reason=WEATHER` | EODI-247 | 구현(§22) |

검증은 B 첫 작업과 같이 테스트에서 `AuthUser` principal을 넣어 했다. A 로그인 병합 뒤 실제 카카오 계정 2개로 여행 API 통합 검증(B-7)을 마쳤다([계약 §8](backend-a-b-contract.md)).

## 2. 공통 원칙

B 첫 작업의 규칙을 그대로 따른다.

- 여행 내부 자료는 먼저 `TripAccessChecker`로 ACTIVE 멤버인지 확인한다. 없는·삭제된·비참여·이탈 여행은 모두 `404 TRIP_NOT_FOUND`(P-10).
- 동시 수정은 대상 행을 `PESSIMISTIC_WRITE`로 잠근 뒤 `expectedVersion`을 비교하고, 다르면 `409 VERSION_CONFLICT`로 덮어쓰지 않는다.
- 바뀐 값이 없는 수정은 version을 올리지 않고 현재 값을 반환한다(P-8).
- 입력 오류는 `400 VALIDATION_ERROR`의 `fields`에 한 번에 담고, 권한·버전 검사보다 먼저 한다. 저장된 값과 합쳐야 판단할 수 있는 검사만 잠금·version 확인 뒤에 한다: 여행 정보 수정에서 기간 한쪽만 바꾼 경우(B 첫 작업 §7.4), 방장 양도·내보내기의 대상 검사(M-3), 경비 결제자·분담자의 ACTIVE 검사(E-3). 요청 본문에서 다른 자원을 가리키는 ID가 잘못되면 404가 아니라 400으로 알린다(여행지 ID P-5와 같은 방식). 경로의 ID가 가리키는 자원이 없으면 404다.

## 3. 준비물 체크리스트 정책

| # | 질문 | 결정 | 근거 |
| --- | --- | --- | --- |
| C-1 | AI 제안 채택(`sourceJobId`·`suggestionIndex`) | ~~보내면 400~~ → 2026-11-06 §19로 대체. 채택을 받고 `source_job_id` FK·`suggestion_index`를 추가했다(V202611061000) | AI 준비물 추천(EODI-218)이 붙었다 |
| C-2 | 삭제 방식 | `deleted_at` 논리 삭제. 목록·수정·재삭제에서 제외 | 명세 "AI 재생성 시 삭제한 항목 강제 부활 금지". AI 서버 요청의 `deletedLabels`를 여기서 얻는다 |
| C-3 | 체크한 사람 | 서버가 요청자 멤버십으로 기록, 해제하면 `checkedByMemberId`·`checkedAt` 모두 null. 요청으로 지정 불가 | 명세 "타인 ID 입력 금지". DB CHECK로 체크 여부와 두 값을 묶었다 |
| C-4 | 이미 체크된 항목을 다시 체크 | 처음 체크한 멤버·시각 유지, version 그대로 | 바뀐 값 없음(P-8) |
| C-5 | `modifiedByUser` | 이름을 고쳤을 때만 `true`. 체크는 해당하지 않음 | AI 서버가 "사용자가 고친 항목"을 구분하는 용도 |
| C-6 | 이름 길이 | 앞뒤 공백 제거 후 1~255자 | ERD `varchar(255)` |
| C-7 | 목록 정렬·페이지 | `created_at ASC, id ASC`, 페이지 없이 전체 | 여행당 공동 목록 하나. 명세에 정렬 기준이 없다 |
| C-8 | 항목 없음·다른 여행의 항목 | `404 CHECKLIST_ITEM_NOT_FOUND` | 다른 여행 경로로 항목을 고칠 수 없게 `trip_id`까지 함께 조회 |

AI 준비물 제안(`POST /trips/{tripId}/checklist-suggestions`)은 2026-11-06 §19로 붙였다. 날씨 조회는 아직 없어 AI에 빈 날씨를 보낸다.

## 4. 멤버 관리 정책

| # | 질문 | 결정 | 근거 |
| --- | --- | --- | --- |
| M-1 | 양도·내보내기의 `expectedVersion` | 여행의 `trips.version`. 성공하면 하나 올린다 | 응답 `Trip`의 `ownerMemberId`·`members`가 바뀐다. 명세상 이탈·여행 삭제도 `expectedVersion`을 받으므로 같은 여행 version을 쓰는 것을 제안한다 |
| M-2 | M-1의 영향 | 양도·내보내기 뒤에는 이전 version으로 보낸 여행 정보 수정(`PATCH /trips/{tripId}`)이 409. **프론트는 409를 받으면 다시 조회한다** | 바뀐 멤버 구성을 보지 않은 화면의 요청을 막는다 |
| M-3 | 오류 판정 순서 | 입력 누락 400 → 비참여 404 → 참여자지만 방장 아님 `403 FORBIDDEN` → version 불일치 409 → 대상 검사(M-4~M-6) | 비참여자에게는 존재를 숨기고, 멤버에게는 권한 부족을 알린다. 양도가 먼저 반영되면 이전 방장의 동시 요청은 403이다 |
| M-4 | 양도 대상이 잘못됨(본인·이탈·다른 여행·없는 ID) | `400 VALIDATION_ERROR`(필드 `targetMemberId`) | 요청 본문의 ID라 입력 오류로 본다(§2) |
| M-5 | 내보낼 대상이 없거나 이미 나감 | `404 MEMBER_NOT_FOUND` | 경로의 자원이 없다 |
| M-6 | 방장 본인 내보내기 | `400 VALIDATION_ERROR`(필드 `memberId`). 방장은 나가기로만 빠진다 | 호출자가 방장이므로 명세의 "본인·방장 내보내기 금지"는 같은 경우다 |
| M-7 | 내보낼 때 함께 바꾸는 것 | 멤버십 `REMOVED`·`left_at`, 채팅 참여 `left_at`, 여행 version을 한 트랜잭션으로 | D-11 "채팅 참여는 멤버십과 동기화". 행은 지우지 않는다(경비 FK, 재참여 시 재사용) |
| M-8 | 내보낸 사람의 사진·메시지 | 건드리지 않는다 | 강제 이탈 시 자료 삭제는 Q-11 미정 |
| M-9 | 알림 | 양도·내보내기 모두 만들지 않는다 | 명세 §9 알림 종류에 없음, 결정 F-21(방장 양도 알림 없음) |
| M-10 | 멤버 목록 | 기본 ACTIVE만 참여 순. `includeInactive=true`면 LEFT·REMOVED 포함. 조회는 ACTIVE 멤버만 | 명세 "정산에 남는 이탈 멤버는 별도 includeInactive" |
| M-11 | "방장은 같은 여행 ACTIVE 멤버" 불변식 | 서비스에서 보장하고 복합 FK는 두지 않는다 | `(trip_id, owner_user_id) → trip_members(trip_id, user_id)` FK로는 멤버 여부만 막고 ACTIVE 상태는 막지 못한다. 여행을 방장 멤버십보다 먼저 넣으므로 지연 제약(`DEFERRABLE`)까지 필요해 얻는 것에 비해 복잡하다. 대신 양도·내보내기를 여행 행 잠금 안에서 처리하고 방장은 내보낼 수 없게 막는다. 나가기도 같은 방식으로 만든다 |

채팅 참여 해제는 `chat.service.ChatParticipationService.leaveTripRoom`으로 한다. 내보내기와 나가기(`POST /trips/{tripId}/leave`, §11)가 이 메서드를 쓴다. 이 메서드는 멤버의 채팅 참여 행이 있다고 가정하고 없으면 자료 오류로 500을 낸다. 여행 생성(방장)과 초대 수락(`joinTripRoom`, 재참여면 같은 행의 `left_at`을 지움)이 참여 행을 만들므로 ACTIVE 멤버에게는 항상 행이 있다.

## 5. 명세 반영

구현하면서 채운 빈칸 중 다른 사람이 알아야 하는 동작만 [API 명세](../../../docs/api-spec.md)에 반영했다. 기존 계약을 바꾸지 않는 추가라 멤버 관리 MR에 함께 넣고 A 리뷰로 확인한다. 결정 이유와 세부 규칙은 이 문서에, 필드 설명은 Swagger에 둔다.

| 명세 위치 | 반영 내용 |
| --- | --- |
| §2 404 표 | `MEMBER_NOT_FOUND`, `CHECKLIST_ITEM_NOT_FOUND` |
| §4 멤버 목록·양도·내보내기 행 | 기본 ACTIVE·참여 순, 양도 대상 400·비방장 403·알림 없음, 내보내기 대상 404·채팅 참여 해제 |
| §4 표 아래 | 양도·내보내기 `expectedVersion`은 여행 version, 404→403→409 판정 순서, 성공 후 이전 version의 여행 정보 수정 409(M-1~M-3) |
| §6 준비물 추가·삭제 행 | AI 연동 전 `sourceJobId`·`suggestionIndex` 400(C-1), 논리 삭제(C-2) |
| §2 404 표 | `EXPENSE_NOT_FOUND`(경비, EODI-122) |
| §7 경비 표 아래 | 원금 1원 잔여 배분 순서(E-2), 정산 정책 합의 전 `GET /settlement`의 `current`는 null(E-9) |
| §2 422 표 | `INVALID_ROUTE_LEGS`(코스 구간, EODI-164) |
| §6 코스 행·표 아래 | 항목 200개·검증 범위·판정 순서, 바뀐 게 없으면 version 유지, 경로 연동 전 구간 `UNAVAILABLE`(C-3~C-6) |

새 오류 코드:

| 코드 | 상태 | 쓰는 곳 |
| --- | --- | --- |
| `CHECKLIST_ITEM_NOT_FOUND` | 404 | 준비물 수정·삭제 |
| `MEMBER_NOT_FOUND` | 404 | 동행 내보내기 |
| `EXPENSE_NOT_FOUND` | 404 | 경비 수정·삭제 |
| `INVALID_ROUTE_LEGS` | 422 | 코스 전체 교체(구간이 빠지거나 겹치거나 인접하지 않음) |

`VERSION_CONFLICT`는 도메인별 enum(`TripErrorCode`, `ChecklistErrorCode`, `ExpenseErrorCode`, `PollErrorCode`, `ItineraryErrorCode`)에 같은 코드 이름으로 둔다. 명세에 이미 있던 `CURRENCY_MISMATCH`·`INVALID_PARTICIPANTS`(422)와 정산의 `SETTLEMENT_NOT_FOUND`(404)는 `ExpenseErrorCode`에 둔다. Q-10 전 정산 차단용 `SETTLEMENT_POLICY_PENDING`은 정산 계산을 열면서(EODI-134) 없앴다.

## 6. A에게 알릴 것

- 체크리스트 마이그레이션 `V202610291000__create_checklist_items.sql`이 dev에 들어갔다. A의 로그인 마이그레이션 번호가 이보다 이르면 병합 전에 A 쪽 번호를 늦춘다(AGENTS.md DB 규칙). 빈 DB에서 도는 테스트로는 이 문제가 드러나지 않는다.
- 이 작업들은 분담안 §6의 후속 배분 대상이었다. 다음 배분 때 B가 먼저 가져간 범위로 반영한다.
- §5의 명세 반영 내용을 멤버 관리 MR에서 리뷰한다. 특히 양도·내보내기 뒤 여행 정보 수정이 409가 되는 점(M-2)은 프론트에도 공유한다.

### A 답변 (2026-10-30)

- M-2(양도·내보내기로 여행 version 증가 → 이전 version 수정 409)에 동의하고 프론트에 재조회 처리를 공유한다. **§5 명세 변경과 코드의 대조 리뷰는 아직이며, A가 결과를 주면 위 리뷰 문구를 정리한다.**
- 문자열 제한(여행 이름 1~200자, 준비물 255자, 닉네임 1~50자)에 동의. 새로 만드는 ID는 모두 UUIDv7(기존 v4는 유지). A가 인증 코드의 v4 생성을 바꾸고 명세 §10의 미정 문구를 정리한다.
- A 담당: 인증 UUIDv7 전환, 토큰 갱신·로그아웃, 운영 프로필·Swagger 끄기, CORS(허용 헤더 `Authorization`·`Content-Type`·`Idempotency-Key`, 노출 `X-Trace-Id`, 허용 origin은 프론트 주소 확인 후). 오류 로그는 메시지를 빼고 우리 코드 위치까지의 제한된 스택과 cause 예외 타입을 남기는 방향으로 A가 바꾼다.
- B 담당: 경비·정산 조회(§8)를 먼저 하고, 다음으로 초대 링크를 제안받았다(B 확인 후 확정). 초대를 B가 하면 `SecurityConfig` 공개 경로·`BearerFilter.shouldNotFilter` 수정은 A와 범위를 공유하고 진행한다. 만료·정원 기본값(Q-4)은 구현 전에 합의한다.
- 새 도메인 패키지는 루트 아래에 둔다(`domain.auth` 이동은 별도 작업). 테스트 설정은 `application-test.yaml`+test 프로필로 나누는 방향(별도 변경).

## 7. 다음 후보

| 기능 | 막힌 점 |
| --- | --- |
| 나가기 삭제 옵션 | `deleteOwnMessages`는 §15에서 끝냄. `deleteOwnPhotos`는 사진 기능 뒤(같은 LEAVE_CLEANUP 작업의 execute에 파일 삭제 추가). 혼자 남은 방장의 여행 삭제는 §14에서 끝냄 |

## 8. 경비·정산 정책

명세 §7·§10을 따르고, 명세가 제안으로 남긴 값은 아래처럼 구현했다.

| # | 질문 | 결정 | 근거 |
| --- | --- | --- | --- |
| E-1 | 등록자 | 요청자의 ACTIVE 멤버십으로 서버가 정한다. 요청의 `registeredByMemberId`는 알 수 없는 필드로 400 | 명세 "등록자 서버 지정" |
| E-2 | 균등 분담의 1원 잔여 | 원금을 분담자 수로 나누고, 나머지 1원은 **참여 순(joinOrder)이 빠른 분담자부터** 1원씩. 분담액 합계는 항상 원금과 같다. 금액이 분담자 수보다 작으면 0원 분담자가 생긴다 | D-7 "1원 잔여 배분은 제안". 요청 순서와 무관하게 같은 결과가 나오게 참여 순을 쓴다. 정산 10원 올림은 분담액에 넣지 않는다(Q-10) |
| E-3 | 결제자·분담자 | 이 여행의 ACTIVE 멤버만 **새로** 넣을 수 있다. 수정할 때 이미 들어 있던 나간 멤버는 그대로 둘 수 있다. 어기면 `422 INVALID_PARTICIPANTS`(필드 `payerMemberId`·`participantMemberIds`) | 명세 "신규 분담자 추가는 ACTIVE 멤버만", "이탈자도 과거 분담자로 표시" |
| E-4 | 입력 검증 | 이름 공백 제거 후 1~200자, 원금 1 이상 JSON 안전 정수 이하, 분담자 1명 이상·중복 없음, 통화·결제자·지출 시각 필수 → 400. 통화가 KRW가 아니면 `422 CURRENCY_MISMATCH`. 메모는 공백만이면 null | ERD `varchar(200)`, 명세 §2 정수 상한, §7 "외화 422" |
| E-5 | 수정·삭제 권한과 판정 순서 | 입력 400 → 통화 `422 CURRENCY_MISMATCH`(입력 단계라 비참여자도 422) → 비참여 404 → 경비 없음 `404 EXPENSE_NOT_FOUND` → 등록자 아님 `403 FORBIDDEN` → 경비 version 불일치 409 → 결제자·분담자 `422 INVALID_PARTICIPANTS`(E-3). 등록자가 여행에서 나가면 404 | 명세 "활성 멤버인 등록자", "방장·결제자라도 등록자가 아니면 403". 멤버 관리 M-3과 같은 순서 |
| E-6 | 버전 | 경비마다 `version`(수정 시 `expectedVersion`), 여행에는 `expense_version`. 등록·수정·삭제마다 여행 행을 잠그고 `expense_version`을 1 올린다. 여행 정보 `version`과는 따로 움직인다 | ERD 불변식 5. 경비 변경이 여행 정보 수정을 409로 만들지 않는다(JPA `@Version`을 쓰지 않은 이유, B 첫 작업 §6) |
| E-7 | 수정 방식 | 생략 필드 유지, `memo`만 null로 비움. 원금이나 분담자 집합이 바뀌면 분담액을 다시 계산한다. 바뀐 값이 없으면 version·`expense_version` 그대로(P-8) | 명세 ExpensePatch "분담자 변경은 전체 배열 교체" |
| E-8 | 삭제 방식 | `deleted_at` 논리 삭제, 분담액 행은 남긴다. 목록·수정·재삭제에서 제외(404) | 이전 정산 스냅샷·비용 버전 이력을 깨지 않는다 |
| E-9 | 정산 상태 조회 | `current`는 여행의 현재 계산(`trips.current_settlement_id`), 없으면 null. `recalculationRequired`는 현재 계산이 stale일 때 true. `currentExpenseVersion`은 여행의 `expense_version` | 명세 "GET은 계산 생성 안 함". 세부는 §10 |
| E-10 | 정산 계산 | Q-10 확정(11/02)으로 409 차단을 풀고 계산을 저장한다. 세부는 §10 | A 답변(`to-B-backend-decisions-2026-11-02.md` §3) |
| E-11 | 목록 | `createdAt DESC, id DESC` 커서 페이지(기본 20, 최대 100). 여행 목록과 같은 커서(`global.common.response.CreatedAtCursor`)를 쓴다 | 명세 §2 목록 공통 |
| E-12 | 중복 요청 | 경비 등록은 `Idempotency-Key` 필수. 범위는 실제 요청 경로(`POST /api/v1/trips/{tripId}/expenses`). 판정 순서는 입력 400(키 형식 포함) → 여행 행 잠금 후 ACTIVE 멤버 확인 404 → 멱등 처리. 같은 키 재요청도 지금 ACTIVE 멤버여야 처음 결과를 받는다(이탈·내보내기·여행 삭제 뒤엔 404). 잠금은 항상 여행 행 → 멱등 기록 순서 | 명세 §2 "(사용자, 실제 요청 경로, 키)". 재요청 권한 누락은 A 리뷰(11/02)에서 발견, EODI-133에서 수정 |

## 9. 초대 링크 정책

Q-4 기본값은 2026-10-30에 정했다(만료 7일, 정원 20명). 나머지는 명세 §2·§4와 ERD를 따라 아래처럼 구현했다.

| # | 질문 | 결정 | 근거 |
| --- | --- | --- | --- |
| I-1 | 만료 | 링크를 만든 시각부터 7일. 만료 시각**부터** 미리보기·수락 모두 410 `INVITATION_EXPIRED`(이미 동행인 사람은 I-10) | Q-4 결정. 경계는 `TripInvitationTest`로 확인 |
| I-2 | 정원 | 링크별 사용 횟수가 아니라 **여행의 ACTIVE 멤버 수(방장 포함) 20명**. 수락할 때 20명이면 `409 TRIP_FULL`. 이미 ACTIVE인 사람의 수락은 정원과 상관없이 200 | Q-4 결정. ERD `trip_invitations`에 사용 횟수 열이 없다. 명세 409 목록에 `TRIP_FULL` 추가 |
| I-3 | 링크 만들기 | 여행의 ACTIVE 멤버 누구나. **새로 만들면 같은 여행의 이전 링크를 모두 무효화**(`revoked_at`)해서 쓸 수 있는 링크는 여행당 하나다. 여행 행을 잠가 동시에 발급해도 하나만 남는다. 프론트는 화면을 열 때마다가 아니라 [새 링크 만들기]를 눌렀을 때만 호출한다. `Idempotency-Key` 없음(명세 §2 목록에 없음) | 10/30 사용자 확정(A 인수인계 [to-B-backend-decisions-2026-10-30](to-B-backend-decisions-2026-10-30.md) §4와 같음), EODI-128. 유출되거나 잘못 보낸 링크를 새 발급으로 막을 수 있다. 토큰 원문을 보관하지 않으므로 같은 링크를 다시 보여 주는 조회 API는 없다 |
| I-4 | 토큰 | 32바이트 난수의 base64url(43자). DB에는 SHA-256 해시(16진수)만 저장하고 원문은 생성 응답에서만 준다. `url`은 `app.invitation.link-base-url`(기본 `ieohaeng://invitations/`) + 토큰 | 명세 "토큰 원문 1회 반환". 프론트 초대 화면 경로가 정해지면 설정만 바꾼다 |
| I-5 | 검증 실패 응답 | 형식이 틀린 토큰은 `404 NOT_FOUND`. 형식이 맞으면 새 발급으로 무효가 된 링크만 `410 INVITATION_REVOKED`, 없는 토큰·기간 지남·삭제된 여행·초대한 사람이 나간 링크는 `410 INVITATION_EXPIRED`. 무효화는 만료 전 링크에만 하므로, 무효가 된 링크는 나중에 기간이 지나도 `INVITATION_REVOKED`로 알린다 | 명세 §2. 사용자 흐름의 "이유 안내"에 맞춰 가장 흔한 두 사유(기간 지남·새 링크로 바뀜)만 나누고 나머지는 묶었다(10/30 결정) |
| I-6 | 수락 판정 순서 | 형식 404 → 없는 토큰·삭제된 여행 410(여행 행 잠금) → **이미 ACTIVE면 링크 상태와 상관없이 그대로 200** → 링크 검사 410(잠금 뒤 무효화 여부를 DB에서 다시 확인) → 정원 409 → 참여 | 링크 만료·재발급은 기존 참여자에게 영향이 없다(A 인수인계 §4, 사용자 흐름 "이미 참여 → 여행 상세") |
| I-7 | 재참여 | 나간(LEFT)·내보낸(REMOVED) 사람도 유효 링크로 돌아올 수 있다. 기존 멤버십 행을 ACTIVE로 되돌리고 `joinOrder`는 지금까지의 최댓값 + 1. 채팅 참여 행도 같은 행의 `left_at`을 지운다(과거 대화 범위는 Q-13) | ERD `trip_members` 노트 "재참여는 기존 멤버십 ID 유지, join_order 새로 부여" |
| I-8 | 수락의 부수 효과 | 멤버십·채팅 참여를 한 트랜잭션에서 만들고 여행 `version`을 1 올린다. 참여 알림은 아직 없다 | 응답 `members`가 바뀌므로 M-2와 같은 규칙. 알림 테이블이 없다 |
| I-9 | 미리보기 인증 | 공개 경로(`SecurityConfig`의 `GET /api/v1/invitations/*`). `BearerFilter`는 그대로 거쳐서, 토큰을 보내면 `inviterUser` 회원 카드를 주고 안 보내면 null. 잘못된 토큰을 보내면 401, 가입 대기 토큰은 403 `PROFILE_INCOMPLETE` | 명세 InvitationPreview "익명 inviterUser=null". `shouldNotFilter`에 넣으면 로그인 사용자를 알 수 없다 |
| I-10 | 이미 참여 표시 | 미리보기 응답 `alreadyMember`: 로그인한 사람이 그 여행의 ACTIVE 멤버면 true, 익명·비멤버는 false. true면 링크가 만료·무효여도 410 대신 200으로 미리보기를 준다. 앱은 true일 때 [참여하기] 대신 "이미 참여 중"을 보여 주고 수락 API로 여행을 받아 이동한다 | PRD WD-FR-04 검증 "무효/만료/이미 참여 구분", S04 상태 "이미 참여". 미리보기는 여행 ID를 숨기므로 앱이 스스로 판단할 수 없다 |
| I-11 | 링크 취소 | `DELETE /trips/{tripId}/invitations` → 204. **여행 단위**로 지금 쓸 수 있는 링크(`revoked_at` 없음·만료 전)를 무효화하고 새 링크는 만들지 않는다. ACTIVE 멤버 누구나, 쓸 수 있는 링크가 없으면(이미 취소·만료·발급 이력 없음) 그대로 204. 판정은 경로 형식 400 → 여행 행 잠금 후 ACTIVE 멤버 404 → 무효화. 취소된 링크는 재발급과 같은 410 `INVITATION_REVOKED`(문구를 "더 이상 쓸 수 없는 초대 링크입니다. 동행에게 새 링크를 받아 주세요."로 바꿔 두 경우를 함께 덮는다). 여행 version·멱등키·알림 없음 | A 분담 제안(11/04) B-1, EODI-187. 토큰 원문이 없고 링크 ID는 발급자 응답에만 있어 여행 단위로 정했다. 발급이 멤버 누구나이고 재발급만으로도 이전 링크를 막을 수 있어 권한을 좁히지 않는다. 발급·수락과 같은 여행 행 잠금이라 동시 수락은 취소 전에 끝나거나 410이다 |

남은 것: 참여 알림, 프론트 초대 화면 경로가 정해진 뒤의 `url` 설정, 필요하면 지금 링크가 있는지 보는 조회(토큰 없이 `expiresAt`만).

## 10. 정산 계산 정책

Q-10은 2026-11-02에 확정됐다([A 답변](to-B-backend-decisions-2026-11-02.md) §3). 계산은 `SettlementCalculator`(DB·시간에 의존하지 않는 순수 계산)가 하고, `SettlementService`가 저장·조회한다.

| # | 질문 | 결정 | 근거 |
| --- | --- | --- | --- |
| S-1 | 올림 시점 | 저장된 원금 분담액을 사람별로 여행 전체 합산한 뒤 한 번만 10원 단위로 올린다(`owedMinor`). 지출별 올림은 하지 않고 0원은 0원. 이탈자의 과거 결제·분담도 포함 | Q-10 확정 |
| S-2 | 차액 귀속 | 전체 차액(Σ(owed - base))은 원금 기준 받을 돈(결제 - 원금 부담)이 가장 많은 한 사람의 잔액에 한 번 더한다. 동률은 joinOrder, memberId 순. 모두 0이면 결제 합계가 가장 큰 사람. 경비가 없으면 차액 0, 수령자 없음 | Q-10 확정. 잔액 합 0을 계산마다 확인한다 |
| S-3 | 송금 제안 | 낼 돈이 큰 사람이 받을 돈이 큰 사람에게 보내도록 큰 금액끼리 짝짓는다. 건수는 멤버 수 - 1 이하, 금액은 다시 올리지 않음. 응답은 금액이 큰 순이며 이 순서를 계산할 때 `display_order`로 저장한다 | 명세 "송금액 재올림 없음". 완료·은행 상태 없음 |
| S-4 | 계산 요청 판정 순서 | 본문 400(`expectedExpenseVersion` 누락) → 키 형식 400 → 여행 행 잠금 후 ACTIVE 멤버 404 → 멱등 처리 → 비용 버전 다르면 409 `VERSION_CONFLICT`(저장 안 함) | E-12와 같은 순서·잠금 규칙. 같은 키 재요청도 현재 ACTIVE 멤버만 |
| S-5 | 스냅샷 | 계산할 때의 경비(ID·버전·이름·원금·결제자·분담액)를 `expense_snapshot_json`에 담는다. 이후 경비를 수정·삭제해도 과거 계산은 그대로 | Q-10 "과거 계산 스냅샷을 덮어쓰지 않음" |
| S-6 | 현재 계산과 stale | 새 계산이 `trips.current_settlement_id`가 된다. 비용 버전이 바뀌었거나 현재 계산이 아니면 `stale=true`. 결과는 바뀌지 않아 `version`은 1 | ERD settlements 노트 |
| S-7 | 멤버·경비가 없을 때 | `members`는 경비에 결제자·분담자로 나온 멤버만, 계산할 때의 참여 순으로 `display_order`에 저장한다(이후 재참여로 참여 순이 바뀌어도 과거 계산의 순서는 그대로). 경비가 없어도 계산은 만들고 모든 목록이 비어 있다 | A 답변 "경비가 없으면 차액 0, 수령자 없음" |
| S-8 | 이전 계산 | 목록은 최근 계산 순(calculatedAt DESC, id DESC) 커서 페이지(기본 20, 최대 100). 다른 여행의 계산 ID는 `404 SETTLEMENT_NOT_FOUND`. 여행이 있는 동안 모두 보관 | 명세 §7, Q-10 보관 결정. 물리 삭제 시점은 Q-11. `trips.current_settlement_id`와 `settlements.trip_id`가 서로 참조하므로 여행을 물리 삭제할 때는 포인터를 먼저 비운다 |
| S-9 | 같은 키 재요청 응답 | 처음 저장한 응답을 그대로 준다. 그 사이 경비가 바뀌었어도 응답의 `stale`은 처음 값(false)이므로, 최신 상태는 `GET /settlement`로 확인한다 | 명세 §2 "같은 키/같은 본문은 최초 결과" |

## 11. 나가기 1단계 계약

A 답변(11/02) §5에 따라 사진·메시지를 남기는 **기본 나가기부터** 한다. A가 요청한 "기본 나가기 성공 응답과 미지원 요청 응답"을 2026-11-02에 아래처럼 확정하고 EODI-140에서 구현했다(`TripMemberService.leave`).

| # | 질문 | 결정 | 근거 |
| --- | --- | --- | --- |
| L-1 | 하는 일 | 멤버십 LEFT·`left_at`, 채팅 참여 종료를 한 트랜잭션에서 처리. 경비·사진·메시지는 그대로 둔다. 방장이 나가면 남은 ACTIVE 멤버 중 참여 순이 가장 빠른 사람에게 자동 양도 | A 답변 §5, PRD WD-FR-04 "가장 먼저 가입한 잔여 멤버에게 양도" |
| L-2 | 성공 응답 | **200** + `LeaveResult{tripId, tripDeleted:false, newOwnerMemberId(방장이 나갔을 때만, 아니면 null), cleanupJobId:null, status:LEFT}`. 남은 작업이 없으므로 202가 아니다. 나중에 삭제 옵션을 지원하면 그 요청만 202 + 작업 ID | A 답변 "가짜 작업 ID를 반환하지 않는다". 처리가 끝났는데 202(접수)라고 하지 않는다 |
| L-3 | 삭제 옵션 | `deleteOwnPhotos`·`deleteOwnMessages`는 명세대로 필수. 삭제 기능 전에는 `true`면 **400 `VALIDATION_ERROR`**(해당 필드). 무시하고 성공으로 응답하지 않는다 | A 답변 §5. 기능이 없는 입력을 400으로 거부하는 준비물 C-1과 같은 방식. `?` 없는 필드는 필수(명세 §2). 2026-11-04부터 `deleteOwnMessages`는 지원(§15), `deleteOwnPhotos`만 400 |
| L-4 | 혼자 남은 방장 | ~~여행 삭제 기능 전에는 409 `TRIP_DELETION_PENDING`~~ → 2026-11-03부터 여행 삭제로 접수(§14 D-2). 오류 코드는 없앴다 | A 답변 §5 → Q-11 확정 |
| L-5 | 버전 | `expectedVersion`은 여행 version. 다르면 409 `VERSION_CONFLICT`, 성공하면 members가 바뀌므로 version 1 증가 | 명세 §4 "이탈도 같은 version", M-2 |
| L-6 | 판정 순서 | 입력 400(누락·사진 삭제 옵션 true) → 여행 행 잠금 후 ACTIVE 멤버 404 → version 409 → 처리(혼자 남은 사람은 여행 삭제 §14 D-2, 내 채팅 삭제는 §15) | M-3과 같은 순서. 2026-11-03·04에 혼자 남은 방장 409와 메시지 삭제 옵션 400을 없앴다 |

구현 메모: 방장이 나가면 `transferOwner`로, 아니면 `markMembersChanged`로 version을 한 번만 올린다. 같은 version으로 두 사람이 동시에 나가면 여행 행 잠금 때문에 한 명만 성공하고 다른 한 명은 409다.

프론트에 전달할 것: 성공은 200(나중에 삭제 옵션 요청은 202), 멱등키 대상이 아니라 성공 뒤 재시도는 404이므로 "이미 나감"으로 처리, 나간 사람이 만든 초대 링크는 410이 되므로 남은 멤버가 새로 발급, 새 방장은 멤버 목록의 joinOrder로 미리 표시.

## 12. 채팅 REST 정책

Q-13의 REST 범위는 2026-11-02에 확정됐다([A 답변](to-B-backend-decisions-2026-11-02.md) §4). 실시간 전달은 11/04 A·B 합의로 §12-1에 정했다(보내기는 이 REST 그대로).

| # | 질문 | 결정 | 근거 |
| --- | --- | --- | --- |
| CH-1 | 볼 수 있는 대화 | 신규·재참여 ACTIVE 멤버 모두 처음부터 전체 대화(이탈 기간 포함). `chat_participants.visible_from_sequence`는 항상 1 | Q-13 확정 |
| CH-2 | 방 참여 권한 | 지금의 여행 ACTIVE 멤버십으로 판단(채팅 참여 행은 멤버십과 같은 트랜잭션에서 바뀐다). 삭제된 여행·비참여·LEFT·REMOVED는 모두 `404 CHAT_ROOM_NOT_FOUND`. `GET /trips/{tripId}/chat-room`은 여행 경로라 `404 TRIP_NOT_FOUND` | 여행 404 숨김 원칙(P-10). PRD "현재 여행 멤버십으로 그룹 채팅 접근 검사" |
| CH-3 | 순번 | `chat_rooms` 행을 잠근 뒤 `next_sequence`를 1씩 발급해 방 안에서 빈틈이 없다. 동시 전송도 순서대로 1, 2, 3… | ERD `(room_id, sequence)` 유일 |
| CH-4 | 재전송 판별 | 본문의 `clientMessageId`가 멱등 키다. 같은 보낸 사람·같은 ID·같은 방·같은 본문이면 처음 메시지를 201로, 다른 방이나 본문이면 `409 CLIENT_MESSAGE_ID_REUSED`. `Idempotency-Key` 헤더는 요구하지 않는다(보내도 쓰지 않음, 명세 §2에 예외로 적음). 같은 ID를 서로 다른 방에 동시에 보내도 500이 되지 않도록 (보낸 사람, clientMessageId) advisory 잠금을 방 행 잠금보다 먼저 잡는다 | 명세 §9 "같은 sender/clientMessageId는 최초 응답", ERD `(sender_user_id, client_message_id)` 유일 |
| CH-5 | 판정 순서 | 입력 400 → 방 행 잠금 후 참여 확인 404 → 재전송 판별 → 저장. 재전송도 지금 참여 중이어야 처음 메시지를 받는다 | E-12·S-4와 같은 "재요청도 현재 권한" 원칙 |
| CH-6 | 본문 | 받은 그대로 저장(앞뒤 공백·줄바꿈 유지). 공백만 있거나 NUL 문자(PostgreSQL text가 저장 못 함)가 있으면 400, 최대 1,000자(코드 포인트 기준, A의 닉네임 검사와 같은 방식) | 명세에 길이 상한이 없어 B가 정함. A 확인 필요 |
| CH-7 | 메시지 목록 | sequence 내림차순, `beforeSequence` 미포함, limit 기본 20·최대 100. 응답은 공통 `PageResponse`가 아니라 `{data, page:{nextBeforeSequence, hasNext}}`(nextBeforeSequence는 이 페이지의 최소 sequence, 더 없으면 null). 공통 `cursor`를 함께 보내면 400 | 명세 §9 메시지 페이지 문단 |
| CH-8 | 채팅방 목록·응답 | ACTIVE 멤버인 삭제 안 된 여행의 방만, 방 생성 역순 커서. `participants`는 지금 ACTIVE인 동행(참여 순), `lastMessage`는 가장 큰 sequence | 명세 §9 "현재 접근 가능한 방만" |
| CH-9 | 범위 밖 | 첨부·일반 메시지 편집/삭제·읽음(`eventReadAt`)·시스템 카드(`type=SYSTEM`, `eventId`, `target`)는 만들지 않는다. 응답 필드는 명세대로 두고 값은 null. 이탈 시 본문 제거(D-10)를 할 때는 `ck_messages_text`(TEXT의 text NOT NULL)를 바꾸는 마이그레이션이 필요 | Q-13 "이번 결정으로 추가하지 않음". 시스템 카드는 events 기능과 함께 |

### 12-1. 실시간 전달 (EODI-192)

A 분담 제안(11/04) B-2. 11/04 B 회신 계약안을 A가 확인했고(회신 문서는 저장소 밖), A가 선행 작업 EODI-186(`SecurityConfig`의 `GET /ws` 공개, `Tokens.Claims.expiresAt`)을 병합했다. 프론트는 11/03에 `@stomp/stompjs`로 정했다.

| # | 질문 | 결정 | 근거 |
| --- | --- | --- | --- |
| RT-1 | 전송 방식 | STOMP over WebSocket, `GET /ws`(SockJS 없음). **보내기는 기존 REST**이고 WebSocket은 서버 → 앱 전달만 한다. 저장·sequence·`clientMessageId` 판별·오류 응답이 REST 한 경로에만 있다 | A 제안 "저장·sequence 발급은 REST 한 경로", 프론트 기술 정리(11/03) |
| RT-2 | 인증 | 핸드셰이크는 인증 없이 열고 **CONNECT 프레임의 `Authorization: Bearer`** 로 인증한다. REST의 `BearerFilter`와 같은 순서(`Tokens.verify` → `AuthService.authenticate` → 가입 완료). 잘못된·만료 토큰·폐기된 세션은 `UNAUTHENTICATED`, 가입 대기는 `PROFILE_INCOMPLETE`. URL에 토큰을 싣지 않는다 | `connectHeaders`가 stompjs 표준이고 브라우저 WebSocket은 핸드셰이크 헤더를 못 붙인다. 쿼리 토큰은 접속 로그에 남는다 |
| RT-3 | origin | 막지 않는다(`*`) | 인증이 쿠키가 아니라 CONNECT 헤더 토큰이라 다른 사이트가 대신 연결해도 얻는 것이 없다. 앱은 Origin을 안 보내거나 프록시 뒤에서 서버 주소와 달라질 수 있다 |
| RT-4 | 토큰 만료 | 연결 때 access 토큰 만료 시각을 예약해 그 시각에 ERROR `UNAUTHENTICATED`를 보내고 서버가 닫는다. 앱은 갱신 후 다시 연결하고 RT-10대로 복구. 연결 뒤 로그아웃한 세션도 늦어도 이 시각(최대 1시간)에는 끊긴다 | 연결이 토큰보다 오래 살지 않게 한다 |
| RT-5 | 구독·보내기 제한 | 인증된 세션의 `SUBSCRIBE /user/queue/chat`만 허용. 다른 목적지 구독과 `SEND`는 ERROR `FORBIDDEN` 후 연결 종료. CONNECT 없이 온 프레임은 `UNAUTHENTICATED` | 방별 토픽이 없어 구독 시점의 방 권한 검사가 필요 없다(RT-7) |
| RT-6 | ERROR 프레임 | `message` 헤더에 오류 코드, 본문은 REST와 같은 `{"error":{code,message,fields,traceId}}`. `traceId`는 오류마다 새로 만들어 서버 로그(내부 오류만)와 같게 쓴다. ERROR 뒤에는 Spring이 연결을 닫는다. 하트비트는 서버·앱 10초 | REST 오류 처리 코드를 그대로 쓰게 한다 |
| RT-7 | 받는 사람 | 커밋 뒤 그 방 여행의 **지금 ACTIVE 멤버 전원(보낸 사람 포함)** 의 개인 큐. 삭제된 여행이면 보내지 않는다. 받는 사람을 보낼 때마다 다시 읽으므로 나가기·내보내기·여행 삭제가 커밋되면 다음 메시지부터 받지 않는다 | 구독 중인 연결을 찾아 끊는 처리가 필요 없다. 여행당 최대 20명 |
| RT-8 | 이벤트 | `{"type":"MESSAGE_CREATED","roomId","message":Message}`(REST `Message`와 같은 모양). 같은 `clientMessageId` 재전송(201로 처음 메시지)은 새로 저장한 것이 아니라 보내지 않는다. 보낸 사람은 REST 201과 이벤트를 둘 다 받으므로 앱은 `message.id`로 하나만 남긴다 | 같은 메시지를 두 번 보내지 않는다 |
| RT-9 | 전달 보장 | 최선 노력. 이벤트를 저장하지 않고, 한 사람에게 실패해도 나머지에게 보낸다. 대기열(1,000건)이 차면 버리고 경고 로그 | REST가 기준이다 |
| RT-10 | 재접속 복구(앱) | 연결 → `/user/queue/chat` 구독을 **먼저** → 열려 있던 방마다 최신 메시지 페이지를 다시 받고, 기억하던 마지막 sequence까지 이어지지 않으면 `beforeSequence`로 이어 받는다. 이벤트 sequence가 마지막 + 1보다 크면 같은 방법으로 빈칸을 채운다. 같은 sequence는 덮어쓴다 | 방 안 sequence에 빈틈이 없다(CH-3). 새 REST API 없음 |
| RT-11 | 범위 밖 | WebSocket으로 보내기, 나가기 "내 채팅 삭제"로 지운 본문의 실시간 반영(다시 불러오기 전까지 이미 받은 화면에는 남음), 참여자 변경·입력 중·읽음, 서버 여러 대(외부 브로커 릴레이로 바꾸면 이벤트 형식은 그대로), 즐겨찾기·투표·코스 실시간(Q-15) | 11/04 합의에서 뒤로 미룸 |

구현 메모:

- 코드는 `global.websocket`(엔드포인트·브로커·CONNECT 인증·ERROR 형식·만료 종료)과 `chat.realtime`(커밋 뒤 전달)에 있다. `ChatService.sendMessage`가 새로 저장했을 때만 `ChatMessageCreatedEvent`를 낸다.
- 전달은 `@TransactionalEventListener(AFTER_COMMIT)`에서 **별도 스레드 하나**로 넘긴다. AFTER_COMMIT의 요청 스레드는 끝난 트랜잭션의 DB 연결을 아직 쥐고 있어, 거기서 새 연결로 받는 사람을 읽으면 동시 전송이 커넥션 풀 크기를 넘을 때 서로 연결을 기다리며 멈출 수 있다. 스레드 하나라 메시지는 커밋 순서대로 나간다.
- `spring-security-messaging`(`@EnableWebSocketSecurity`)은 쓰지 않는다. CONNECT에 CSRF 토큰을 요구해 토큰 인증과 맞지 않는다. STOMP 세션 사용자는 `StompUser`(이름 = 사용자 ID)다.
- `@EnableWebSocketMessageBroker`가 만드는 `messageBrokerTaskScheduler`(하트비트·만료 종료에 사용)가 있어 Boot의 기본 `TaskScheduler`가 만들어지지 않는다. 투표 주기 마감(`@Scheduled`)도 이 스케줄러에서 돈다. 같은 이유로 브로커 채널 실행기들 때문에 Boot의 `applicationTaskExecutor`도 만들어지지 않는다(지금 쓰는 곳 없음). 나중에 `@Async`나 MVC 비동기 응답을 쓰면 실행기를 직접 지정한다.
- 테스트는 `ChatRealtimeTest`가 실제 포트에 STOMP로 연결해 확인한다(전달·재전송 미전송·외부인 미수신, 나간 멤버 미수신, CONNECT 거부 5종, 구독·SEND 거부, 토큰 만료 종료).

## 13. 투표·코스 정책 (B-4)

2026-11-02 B 확정, A에게 공유(확인 요청 아님). 투표는 EODI-161에서 구현했고 코스는 같은 정책으로 다음 작업에서 구현한다. 기준: [다음 분담안 B-4](backend-next-work-split-2026-11-02.md), [API 명세](../../../docs/api-spec.md) §6·§10, [ERD](../../../docs/erd.dbml) `polls`~`poll_results`·`itineraries`~`route_legs`, PRD WD-FR-12~14, 결정 D-13·F-12~F-15, [장소·지역 계약](places-regions-contract-to-B-2026-11-02.md).

이미 확정돼 다시 정하지 않는 것: 시각 마감·기본 24시간, 복수 선택, 진행 중 후보 추가, 최다 후보 모두 확정(동률 포함), 0표는 확정 없이 마감, 방장 수동 종료·전원 참여 조기 종료 없음, 단일 공동 코스·확정 단계 없음, 구간별 WALK/CAR/TRANSIT.

### 13-1. 범위

| 이번 B-4 | 이번에 하지 않음(근거) |
| --- | --- |
| 투표 목록·생성·조회·내 선택·후보 추가, 자동 마감·확정(구현) | 투표 삭제·재개·후보 삭제(Q-6 미정) |
| 코스 조회·전체 교체(수동 편집), 버전 충돌(다음 작업) | AI 변경안·적용·되돌리기, 경로 재계산(분담안 B-4 "정책·연동 계약 후 확장") |
| 구간 이동 수단 저장(다음 작업) | 경로 시간·거리·지도선 계산(경로 공급자는 분담안 B-4에서 이후 확장으로 뺌) |
| | 알림 이벤트·전송·묶음(A의 events·notifications 기반이 생긴 뒤 연결, Q-16) |
| | 실시간 공동 편집·접속 표시(Q-15) |

### 13-2. 투표 정책

#### 13-2-1. 공통

| # | 질문 | 결정 | 근거 |
| --- | --- | --- | --- |
| V-1 | 권한 | 여행의 ACTIVE 멤버 누구나 목록·생성·조회·투표·후보 추가. 비참여·이탈·삭제된 여행은 404 `TRIP_NOT_FOUND`, 다른 여행의 투표는 404 `POLL_NOT_FOUND` | 명세 §6 "멤버", 기존 404 숨김 원칙(P-10) |
| V-2 | 후보 참조 | REGION 투표는 `regionId`만, PLACE 투표는 `placeId`만. 지역은 A의 `RegionReader`, 장소는 A의 `PlaceReader`로 존재를 확인하고, 없거나 유형이 틀리면 400 `VALIDATION_ERROR`(필드 `candidates[i]` 또는 `candidate`) | 장소 계약 §4 "B가 판단", 다른 자원을 가리키는 요청 ID는 400(여행지 P-5와 같은 방식) |
| V-3 | 판정 순서 | 입력 400 → 여행 행 잠금 후 ACTIVE 404 → 투표 404 → 마감 여부 409 `POLL_CLOSED` → version 409 → 처리 | 멤버 관리 M-3·경비 E-5와 같은 순서 |

#### 13-2-2. 투표 열기 `POST /trips/{tripId}/polls`

| # | 질문 | 결정 |
| --- | --- | --- |
| V-4 | 입력 | `title` 공백 제거 후 1~200자. 후보 **1개 이상 30개 이하**(진행 중 추가가 있으니 1개도 허용), 같은 후보 중복은 400. `closesAt` 필수·서버 시각보다 미래, **최대 30일 뒤** |
| V-5 | 마감 기본값 | 기본 24시간은 화면이 채운다. 서버는 `closesAt`을 생략하면 400(명세 "서버 임의 생략 허용 없음") |
| V-6 | 중복 요청 | 명세 §2 멱등 목록에 없으므로 `Idempotency-Key`를 받지 않는다. 같은 투표가 두 번 열려도 각각 유효 |

#### 13-2-3. 참여 대상과 집계 (Q-6 참가자 변동, B 결정)

| # | 질문 | 결정 |
| --- | --- | --- |
| V-6a | 누가 투표하나 | **지금 ACTIVE인 멤버 기준.** 투표를 연 뒤 들어온 동행도 마감 전이면 투표할 수 있다 |
| V-6b | 나간 멤버의 표 | 나가거나 내보내진 멤버의 표는 행은 남기고 집계에서 뺀다. 다시 들어오면 다시 셈한다 |
| V-6c | 인원 표시 | `eligibleMemberCount`는 지금 ACTIVE 인원, `votedMemberCount`는 그중 한 표 이상 던진 인원 |
| V-6d | 결과 고정 | 마감할 때 그 시점 기준으로 집계해 `poll_results`에 저장한다. 이후 멤버가 바뀌어도 결과는 바뀌지 않는다 |

24시간 남짓한 투표에서 새 동행 의견이 반영되는 편이 자연스럽고, 집계 규칙이 하나라 단순하다. 그래서 ERD가 제안한 생성 시 스냅샷(`poll_participants`)은 만들지 않는다. ERD `poll_participants`는 만들지 않는다고 고쳤다(EODI-161).

#### 13-2-4. 내 선택 `PUT /trips/{tripId}/polls/{pollId}/ballot`

| # | 질문 | 결정 |
| --- | --- | --- |
| V-7 | 동작 | `candidateIds`로 내 선택 전체 교체. 빈 배열은 취소. 같은 투표의 후보가 아니거나 중복이면 400 |
| V-8 | **version이 오르는 때** | **후보 추가와 마감 때만** 오른다. 다른 사람이 투표했다고 오르지 않는다. 그래서 여러 명이 동시에 투표해도 서로 409를 만들지 않고, `expectedVersion`은 "내가 본 후보 목록이 그대로인가"만 확인한다 |
| V-9 | 마감 경계 | 서버 시각 ≥ `closesAt`이면 409 `POLL_CLOSED`. 이때 아직 OPEN이면 같은 트랜잭션에서 마감 처리(V-12)한 뒤 거부 |

#### 13-2-5. 후보 추가 `POST /trips/{tripId}/polls/{pollId}/candidates`

| # | 질문 | 결정 |
| --- | --- | --- |
| V-10 | 조건 | OPEN·마감 전, 유형 일치, 이미 있는 후보면 400, 후보 30개 상한. `expectedVersion` 다르면 409. 성공하면 version +1, 201 + `Poll` |
| V-11 | 알림 | "이미 투표한 멤버에게 후보 추가 알림"은 A의 알림 기반이 생긴 뒤 연결한다(지금은 남기지 않음) |

#### 13-2-6. 마감과 확정

| # | 질문 | 결정 |
| --- | --- | --- |
| V-12 | 마감 시점 | 두 경로가 같은 규칙으로 한 번만 처리한다. ① **조회·쓰기 때 지연 마감**: 투표 행을 잠근 뒤 OPEN이고 서버 시각 ≥ `closesAt`이면 마감. ② **주기 마감**: 1분마다 지난 OPEN 투표를 같은 방법으로 마감(알림이 제때 나가도록). jobs의 kind 목록에 투표 마감이 없어 Spring 스케줄러를 쓴다 |
| V-13 | 결과 | 표가 있으면 최다 득표 후보 전부 `poll_results`에 저장, `FINALIZED`·`closedReason=DEADLINE`. 0표면 `CLOSED`·`NO_VOTES`·`selectedCandidateIds=[]`. version +1 |
| V-14 | 지역 확정 반영 | 사용자 흐름("확정 지역 → 여행지 반영 → 코스에서 날짜별 나누기")대로, 마감할 때 확정 지역을 **여행지 끝에 자동 추가**(이미 있으면 건너뜀)하고 여행 version +1. 장소 확정은 서버가 코스를 바꾸지 않고, 화면이 결과로 "코스 후보 맨 위"에 표시 |
| V-15 | 마감 1시간 전 알림 | 미투표자에게만 보내는 규칙은 그대로 두고, A의 알림 기반이 생긴 뒤 주기 작업에 연결한다. 마감까지 1시간 미만으로 연 투표의 사전 알림(Q-6 "짧은 마감")은 그때 함께 정한다 |

#### 13-2-7. 조회

- `GET /polls`: 최근 생성 순 커서 페이지(`createdAt DESC, id DESC`, 기본 20·최대 100). 각 투표는 `myCandidateIds`·집계 포함.
- 조회도 V-12 지연 마감을 거치므로, 마감 시각이 지난 투표가 OPEN으로 보이지 않는다.
- 이탈 멤버의 표 처리는 2-3(V-6b)대로 집계에서 뺀다.

#### 13-2-8. 구현 메모(EODI-161)

- 마감 때 집계를 `polls.eligible_member_count`·`voted_member_count`, `poll_candidates.vote_count`에 고정한다(V-6d). OPEN 동안은 null이고 응답 때 지금 ACTIVE 멤버의 표로 센다. 후보 순서는 `poll_candidates.display_order`(입력·추가 순)다.
- 잠금은 항상 여행 행 → 투표 행 순서다. 지역 확정이 여행 행(여행지·version)을 바꾸고, 다른 여행 쓰기도 여행 행을 먼저 잡기 때문이다. 투표 API는 요청 트랜잭션을 열기 전에 마감할 투표를 **따로 커밋해** 마감한다. 요청이 409·400으로 롤백돼도 마감이 남게 하려는 것이다. 그래서 실제 판정 순서는 마감 → 입력·권한·버전 검사이고, 마감은 권한과 관계없이 시각만으로 정해지는 일이라 결과가 같다. 마감할 투표가 없으면 여행 행을 잠그지 않고, 조회 자체는 읽기 전용 트랜잭션이다.
- 나가기·내보내기·초대 수락은 여행 행을 잠근 뒤 멤버십을 바꾸기 직전에 같은 트랜잭션에서 마감한다. 마감 시각 전에 던진 표가 주기 마감 타이밍 때문에 빠지거나, 마감 뒤 들어온 사람이 인원에 들어가지 않게 하려는 것이다.
- 주기 마감은 `PollClosingScheduler`(1분)가 `PollAutoCloser`를 부르고 여행마다 따로 커밋한다. 테스트 프로필은 `app.polls.auto-close-enabled=false`로 끈다.
- 지역 확정으로 추가된 여행지는 `trip_destinations.source_candidate_id`에 후보를 남긴다(이번에 FK 추가). 여행 수정으로 여행지를 전체 교체해도 남는 지역의 기록은 유지한다. 여행 정보 변경 이벤트(`TripInfoChangedEvent`)는 `actorUserId=null`로 낸다.

### 13-3. 코스 정책(EODI-164 구현)

| # | 질문 | 결정 | 근거 |
| --- | --- | --- | --- |
| C-1 | 기본 상태 | 여행 생성 때 이미 version 1의 빈 코스가 있다(`ItineraryInitializer`). 조회는 ACTIVE 멤버 | 명세 Itinerary "새 여행 version=1·빈 items/legs" |
| C-2 | 전체 교체 | `PUT /itinerary`는 요청에 없는 기존 항목을 지우고, 기존 `id`는 이 코스 소유인지 확인(아니면 400), 새 항목 ID는 서버 발급 | 명세 §6 |
| C-3 | 항목 검증 | `placeId`는 `PlaceReader`로 존재 확인(없으면 400). `day`는 1 이상, 여행 기간이 있으면 일수 이하. 날짜별 `order`는 1부터 빈틈없이. `startTime`은 `HH:mm`(00:00~23:59), `stayMinutes`는 1~1440, 생략·null이면 비움. 같은 장소 여러 번 허용. 항목 최대 200개 | ERD itinerary_items 노트, 명세 §6 |
| C-4 | 구간 | `legs`는 같은 날짜의 연속 인접 쌍마다 정확히 하나. 빠지거나 중복·비인접이면 **422**. 하루에 장소가 하나면 구간 없음 | 명세 §6 "비인접/중복 구간은 422" |
| C-5 | 경로 값 | 경로 공급자가 정해지기 전에는 이동 수단만 저장하고 `durationSeconds`·`distanceMeters`·`geometry`는 null, `status=UNAVAILABLE`. 0분·직선 거리로 채우지 않는다 | PRD WD-FR-14 "실패는 0분·직선으로 대체하지 않음" |
| C-6 | 버전 | `expectedVersion` 다르면 409 `VERSION_CONFLICT`. 바뀐 게 없으면 version 그대로(P-8). 성공하면 +1, `updatedByMemberId`·`updatedAt` 기록 | 명세 §6, 기존 P-8 |
| C-7 | 잠금 | 코스 행을 잠근 뒤 버전 비교. 여행 정보·멤버 변경과는 다른 행이라 서로 409를 만들지 않는다 | 경비 `expense_version` 분리와 같은 이유 |
| C-8 | 여행 기간을 줄였을 때 | 이미 저장된 코스의 범위를 벗어나는 `day`는 그대로 두고, 다음 PUT 때 검증한다(여행 수정이 코스를 자동으로 지우지 않음) | 코스를 조용히 잃지 않게 |
| C-9 | 알림 | 코스 변경 알림은 A의 알림 기반이 생긴 뒤 연결한다(묶음 Q-16) | PRD "코스 변경 알림" |

#### 13-3-1. 구현 메모(EODI-164, 2026-11-03)

- 테이블 `itinerary_items`·`route_legs`(`V202611031000`). `(itinerary_id, day, sequence)` 유일 제약은 `DEFERRABLE INITIALLY DEFERRED`다. 전체 교체에서 남는 항목끼리 순서를 맞바꾸면 UPDATE 도중 잠깐 겹치기 때문이다. API의 `order`가 열 `sequence`다.
- 판정 순서는 요청 400 → 구간 422 → 여행 404 → 코스 version 409 → 코스 소유 id·여행 기간 400이다. 뒤의 두 400은 코스를 잠근 뒤에야 알 수 있어 순서가 이렇다. 장소 존재는 `PlaceReader.findAll`로 요청 검증 단계에서 확인한다.
- 잠금은 여행 행(`requireActiveMemberForUpdate`) → 코스 행(`findByTripIdForUpdate`) 순서다. 나가기·내보내기가 멤버십을 바꾸는 사이에 끼지 않게 여행 행도 잡는다. 코스 version은 코스 행에만 있어 여행 정보·멤버 변경과 409를 주고받지 않는다(C-7).
- 교체는 구간 전체 삭제 → 빠진 항목 삭제 → flush → 남는 항목 갱신·새 항목 삽입 → flush → 구간 재생성 순서다. 구간은 매번 새로 만들고 `queried_at`은 저장 시각이다. `route_legs.geometry_json`은 엔티티에 매핑하지 않았다(경로 연동 때 추가).
- "바뀐 게 없다"는 모든 항목이 id로 유지되고 장소·날짜·순서·시간이 같고 구간(출발·도착 항목·수단) 집합이 같을 때다. 새 항목이 하나라도 있으면 변경이다.
- 응답의 `ItineraryItem.place`는 `PlaceView`를 `ItineraryPlaceResponse`(명세 Place와 같은 필드)로 옮긴 것이다. A가 장소 API 응답 DTO를 내놓으면 그것으로 바꾼다.
- 테스트는 `places`에 MANUAL 행을 직접 넣는다(장소 2b 정책 확정 전, A 안내대로). 동시 교체는 한쪽만 200이고 다른 쪽은 409다.

### 13-4. A에게 공유할 것 (투표·코스)

- 투표 참여 대상은 지금 ACTIVE 멤버 기준(V-6a~d)이라 ERD의 `poll_participants`를 만들지 않는다(ERD 노트 수정).
- 지역 투표가 확정되면 여행지에 자동 추가되고 여행 version이 오른다(V-14). 열어 둔 여행 수정 화면은 409를 받을 수 있으니 프론트는 다시 조회한다.
- 새 오류 코드 `POLL_NOT_FOUND`(404). `POLL_CLOSED`(409)는 명세에 이미 있다.
- 알림(후보 추가·마감 1시간 전·마감·코스 변경)은 A의 events·notifications 기반이 생기면 B가 연결한다. 그때 이벤트 이름·필드를 맞춘다.
- 경로 시간·거리 계산은 경로 공급자를 정한 뒤 확장한다(분담안 B-4). 그 전에는 구간 `status=UNAVAILABLE`.
- 지역 존재 확인은 A의 `RegionReader`를 쓴다. `application.yaml`에 `app.polls.auto-close-enabled`, `application-test.yaml`에 끄는 값 한 줄을 추가했다. `TripMemberService`·`InvitationService`가 멤버십을 바꾸기 전에 `PollCloser`를 부른다.
- (코스, 2026-11-03) 새 오류 코드 `INVALID_ROUTE_LEGS`(422). 코스 응답의 `place`는 B가 `PlaceView`를 명세 Place 모양으로 옮긴 `ItineraryPlaceResponse`다. A가 `GET /places` 응답 DTO를 만들면 같은 모양인지 맞추고 B가 그것으로 바꾼다. 장소 2b 저장 정책과 무관하게 코스는 `PlaceReader`와 실제 places UUID만 쓴다.
- (코스) `itinerary_items`의 (코스, 날짜, 순서) 유일 제약은 DEFERRABLE이다. 다른 테이블에 같은 방식을 쓸 때 참고.

## 14. 여행 삭제 정책 (Q-11, 2026-11-03 사용자 확정)

A 부재 중 사용자가 Q-11의 여행 삭제 범위를 정했다. 결정 주체는 기획·B이고 A는 리뷰만 한다(나가기 계약 §3 "삭제·보존 범위를 A가 임의로 정하지 않는다"). EODI-167에서 구현했다(`TripDeletionService`, `TripDeleteJobHandler`, `TripDeleteJobAccessPolicy`).

| # | 질문 | 결정 | 근거 |
| --- | --- | --- | --- |
| D-1 | 삭제 방식 | `DELETE /trips/{tripId}?expectedVersion=`(방장만). 요청 트랜잭션에서 `trips.deleted_at`을 찍어 즉시 모든 조회·쓰기에서 404가 되게 하고, 같은 트랜잭션에 `TRIP_DELETE` 작업을 등록해 202 `JobRef`를 돌려준다. 작업이 투표·코스·경비·정산·채팅·초대·준비물·멤버 행을 물리 삭제하고 여행 행만 tombstone으로 남긴다 | 명세 §4·§9 그대로. 지금은 파일이 없어 보존 기간의 실익이 없고, 복구 화면도 없다. 여행 행을 남겨야 jobs FK와 "삭제된 여행 404"가 유지된다 |
| D-2 | 혼자 남은 사람의 나가기 | 여행 삭제와 같게 처리하고 202 + `LeaveResult{tripDeleted:true,status:TRIP_DELETED,cleanupJobId}`. 409 `TRIP_DELETION_PENDING`은 없앴다. 멤버십은 LEFT로 바꾸고 채팅 참여를 끝낸 뒤 삭제한다(행은 작업이 지운다) | 기획 결정 Q-4 "혼자 남은 방장은 삭제와 같게", 명세 §4 2단계 문구 |
| D-3 | 작업 실행기 | 외부 파일이 없어 `execute`는 할 일이 없고 결과 `{scope:TRIP_DELETE,completedCount:1,failedCount:0}`만 만든다. 물리 삭제는 작업 행을 잠근 `complete`에서 같은 트랜잭션으로 한다(FK 순서: 정산 → 경비 → 여행지 → 투표 → 코스 → 준비물 → 초대 → 채팅 → 멤버). 먼저 `current_settlement_id`를 비운다. 이미 지운 행을 다시 지우는 것뿐이라 멱등하다 | jobs 기반 문서 "complete는 결과 저장과 도메인 반영을 같은 짧은 트랜잭션에서". 사진 파일 삭제는 사진 기능 때 execute에 추가 |
| D-4 | 권한 | 등록은 논리 삭제된 여행의 방장만(`canSubmit`), 실행·완료는 여행이 논리 삭제돼 있으면 계속(되돌리기가 없어 철회 없음), 조회는 공통 기반대로 최초 요청자만 | 명세 §9 정리 작업 권한표 |
| D-5 | 판정 순서 | 입력 400(expectedVersion 누락) → 여행 행 잠금 후 ACTIVE 404 → 방장 403 → version 409 → 처리. 삭제 때 여행 version 1 증가 | 양도·내보내기 M-3과 같은 순서 |
| D-6 | 보존 | 보존 기간·복구 없음. 여행 삭제로 멤버의 경비·정산 기록도 함께 사라진다(여행이 있는 동안만 보관한다는 정산 Q-10 원칙의 끝). 회원 탈퇴(`DELETE /me`)·사진·메시지 옵션 삭제는 이 결정에 포함하지 않는다 | 사용자 결정 2026-11-03 |

### 14-1. A에게 공유할 것

- TRIP_DELETE handler·policy를 `trip.service`에 등록했다. jobs 공통 기반은 손대지 않았다. `complete`에서 DB 삭제를 하는 사용법이 기반 문서의 의도와 맞는지 확인 부탁.
- 작업 `input`은 `{tripId, reason:OWNER_DELETE|LAST_MEMBER_LEAVE}`, `cleanupScope`는 빈 목록 + cutoff. 대상이 여행 전체라 개별 ID 목록을 두지 않았다.
- 여행 삭제·마지막 멤버 나가기 알림은 A의 알림 기반이 생긴 뒤 연결한다(Q-16).
- 주기 투표 마감은 이미 `trips.deleted_at is null`인 여행만 고르므로 논리 삭제된 여행의 투표는 건드리지 않는다.
- 확인 요청: `complete`가 예외를 던지면 공통 기반이 재시도 없이 EXECUTION_FAILED로 끝낸다. 그러면 여행은 404인데 하위 행이 남고 다시 돌릴 API가 없다. 실행기는 멱등하므로 hook 예외를 `TEMPORARY_FAILURE`처럼 최대 시도 횟수 안에서 재시도하는 쪽을 EODI-168로 제안했다(A 승인 전 머지 금지).
- 실행기는 멤버십을 지우기 전에 그 여행 작업들의 `jobs.applied_by_member_id`를 비운다. AI 변경안 적용 기록이 멤버십을 가리키면 FK 때문에 삭제가 영구 실패하기 때문이다. A의 jobs 테이블을 B 실행기가 갱신하는 유일한 지점이다.

### 14-2. 실패한 TRIP_DELETE 복구 절차(운영)

작업이 FAILED면 여행은 404인데 하위 행이 남아 있다. 실행기는 멱등하고 `canExecute`가 논리 삭제된 여행만 허용하므로 작업 행을 다시 QUEUED로 돌리면 worker가 안전하게 재실행한다. 재큐 전에 실패 원인(로그의 traceId·diagnostics)을 먼저 고친다.

```sql
update jobs
set status = 'QUEUED', attempt = 0, execution_id = null, execution_started_at = null, lease_until = null,
    heartbeat_at = null, error_code = null, finished_at = null, next_attempt_at = now()
where id = :jobId and kind = 'TRIP_DELETE' and status = 'FAILED';
```

남은 하위 행이 있는 삭제 여행을 찾는 점검 쿼리: `select t.id from trips t where t.deleted_at is not null and exists (select 1 from trip_members m where m.trip_id = t.id)`.

## 15. 나가기 내 채팅 삭제 (LEAVE_CLEANUP, 2026-11-04 사용자 확정)

D-10 "그룹 이탈 시 채팅 삭제는 여행 채팅방의 본인 메시지 본문 삭제"를 EODI-182에서 구현했다(`LeaveCleanupService`, `LeaveCleanupJobHandler`, `LeaveCleanupJobAccessPolicy`, `chat.service.OwnMessageCleaner`). 처리 방식(작업 202)과 지우는 모양(본문만)은 사용자가 정했다.

| # | 질문 | 결정 | 근거 |
| --- | --- | --- | --- |
| LC-1 | 범위 | `deleteOwnMessages`만 지원. `deleteOwnPhotos=true`는 사진 기능 전까지 계속 400(L-3) | 사진·파일이 아직 없다 |
| LC-2 | 지우는 모양 | 행과 순번은 남기고 본문만 지운다: `text=null`, `deleted_at`. 응답 `Message.text`는 null·`deletedAt`은 값. 채팅방 `lastMessage`도 같은 모양. 다른 사람 메시지·나간 사람의 경비는 그대로 | 사용자 결정. 순번에 빈틈이 없어야 페이지(CH-7)와 답장 맥락이 유지된다. `ck_messages_text`를 바꾸는 마이그레이션 `V202611041000` |
| LC-3 | 처리 방식 | 나가기 트랜잭션에서 이 여행 채팅방의 본인 TEXT 메시지 ID를 `CleanupScope.messageIds`로 고정(cutoff=나간 시각)하고 LEAVE_CLEANUP 작업을 함께 등록해 **202** + `LeaveResult{status:LEFT, cleanupJobId}`. 지울 메시지가 없으면 작업을 만들지 않고 200·`cleanupJobId:null` | 사용자 결정(명세 "삭제 작업이 있으면 202"). 가짜 작업 ID를 반환하지 않는다(L-2). 대상을 고정하므로 재참여 뒤 보낸 메시지는 지우지 않는다. 고르기 전에 채팅방 행을 잠가, 나가는 순간 다른 기기에서 보내던 메시지도 빠뜨리지 않는다(전송은 방 행을 잠근 뒤 멤버십을 확인한다) |
| LC-4 | 실행기 | 외부 I/O가 없어 `execute`는 결과 `{scope:LEAVE_CLEANUP, completedCount:고정한 메시지 수, failedCount:0}`만 만들고, 본문 제거는 작업 행을 잠근 `complete`에서 한다(TRIP_DELETE D-3과 같은 방식). 고정 ID 중 아직 안 지운 본인 TEXT만 갱신하므로 멱등 | 사진 파일 삭제가 생기면 `execute`에 들어간다 |
| LC-5 | 권한 | 등록은 그 여행에서 LEFT인 본인이고 대상이 모두 본인 TEXT 메시지일 때만. 실행·완료는 항상 계속(승인한 정리를 재참여·여행 삭제로 취소하지 않는다. 여행 삭제가 먼저 끝났으면 지울 행이 없어 0건). 조회는 최초 요청자만(나간 뒤에도) | 명세 §9 정리 작업 권한표 |
| LC-6 | 혼자 남은 사람 | 옵션과 관계없이 여행 삭제(§14 D-2)만. 여행 삭제가 메시지까지 지우므로 LEAVE_CLEANUP을 따로 만들지 않는다 | 같은 자료를 두 작업이 지우지 않게 |
| LC-7 | 지운 메시지의 clientMessageId | 재참여 뒤 같은 ID로 다시 보내면 409 `CLIENT_MESSAGE_ID_REUSED`. 지운 메시지를 되살리지 않는다 | CH-4. 본문 비교가 null에서 500이 나던 경로를 막았다 |
| LC-8 | 내보내기(REMOVED) | 삭제 옵션이 없다(명세 `DELETE /members`에 없음). 내보낸 사람의 메시지는 남는다 | 명세 그대로 |

프론트에 전달할 것: 내 채팅 삭제를 고르면 보통 202이고 `cleanupJobId`로 `GET /jobs/{jobId}`를 볼 수 있다(나간 뒤에도 본인만). 지운 메시지는 `text:null`·`deletedAt` 값으로 오므로 "삭제된 메시지"로 표시한다.

### 15-1. A에게 공유할 것

- A의 `JobIntegrationTest` 고정 실행기를 LEAVE_CLEANUP에서 PHOTO_DELETE로 바꿨다. 실제 LEAVE_CLEANUP 실행기가 생기면 같은 kind가 두 번 등록돼 컨텍스트가 시작하지 않기 때문이다(`JobRegistry` 중복 거부). 사진 삭제 실행기를 만들 때 다시 다른 kind로 옮겨야 한다.
- LEAVE_CLEANUP handler·policy를 `trip.service`에 등록했다. 작업 `input`은 `{tripId}`, `cleanupScope`는 메시지 ID 목록 + cutoff, `baseVersion`은 없다.
- 마이그레이션 `V202611041000`이 `messages.ck_messages_text`를 바꾸고 `ck_messages_deleted_body`를 더한다. 실시간 채팅을 붙일 때 지운 메시지 모양(text null)을 같이 다룬다.

### 15-2. 실패한 LEAVE_CLEANUP 복구 절차(운영)

완료 단계 예외는 최대 시도 횟수(기본 3) 안에서 다시 돈다. 같은 여행의 TRIP_DELETE와 동시에 끝나면서 PostgreSQL이 한쪽을 교착으로 끊는 경우도 이 재시도로 넘어간다. 그래도 FAILED가 되면 사용자는 202를 받았는데 본문이 남는다. 실행기는 고정한 ID 중 안 지운 것만 지우므로(멱등) 원인을 고친 뒤 다시 QUEUED로 돌린다.

```sql
update jobs
set status = 'QUEUED', attempt = 0, execution_id = null, execution_started_at = null, lease_until = null,
    heartbeat_at = null, error_code = null, finished_at = null, next_attempt_at = now()
where id = :jobId and kind = 'LEAVE_CLEANUP' and status = 'FAILED';
```

남은 본문을 찾는 점검 쿼리: `select j.id from jobs j where j.kind = 'LEAVE_CLEANUP' and j.status = 'FAILED'`. 대상 ID는 `cleanup_scope_json->'messageIds'`에 있다.

## 16. 방문 기록 정책 (2026-11-04 사용자 확정)

명세 §6 `POST/GET /trips/{tripId}/visits`, `DELETE /trips/{tripId}/visits/{visitId}`를 EODI-183에서 `visit` 패키지로 구현했다(테이블 `V202611041100`). 장소 범위(VS-2)와 중복 처리(VS-1)는 사용자가 정했고 나머지는 기존 경비·준비물 규칙에 맞춰 B가 정했다. 사진 방문 후보(visit_candidates)는 범위 밖이고, 평가(reviews)는 §18에서 붙였다.

| # | 질문 | 결정 | 근거 |
| --- | --- | --- | --- |
| VS-1 | 같은 장소를 여러 번 체크 | 여행·멤버·장소당 지우지 않은 방문은 하나. 다시 POST하면 새로 만들지 않고 기존 방문을 **200**으로 돌려준다(`visitedAt`도 바꾸지 않음). 처음 만들면 201. 그래서 `Idempotency-Key`를 요구하지 않는다. 부분 유일 인덱스 + 여행 행 잠금으로 동시 체크도 하나로 모인다 | 사용자 결정. '다녀옴' 체크박스처럼 동작하고 평가도 장소당 하나가 된다 |
| VS-2 | 체크할 수 있는 장소 | `places`에 있는 아무 장소. 코스에 없어도 된다. 없는 장소는 400(필드 `placeId`) | 사용자 결정. S33 화면은 코스 장소를 보여 주지만 API는 제한하지 않는다. 장소 확인은 A의 `PlaceReader` |
| VS-3 | `visitedAt` | 필수. 서버 시각 + 5분보다 미래면 400. 여행 기간과는 비교하지 않는다 | 날짜 없는 여행이 있고 기간은 날짜(시간대 없음)라 시각과 바로 비교할 수 없다. 5분은 기기 시계 차이 여유 |
| VS-4 | `evidenceType` | 필수, `MANUAL`만. `PHOTO`는 400(사진 후보 확인 기능으로만 생김) | 명세 요청 `evidenceType:MANUAL` |
| VS-5 | 판정 순서 | 생성: 입력 400 → 여행 행 잠금 후 ACTIVE 404 → 없는 장소 400 → 기존 방문 200 → 생성 201. 해제: 여행 행 잠금 후 ACTIVE 404 → 방문 404 `VISIT_NOT_FOUND` → 본인 아니면 403 | 경비(E-*)·준비물과 같은 순서. 장소 존재는 DB를 봐야 해 멤버 확인 뒤 |
| VS-6 | 목록 | `memberId` 생략 시 본인. 같은 여행 멤버십(나간 멤버 포함)만, 아니면 400(필드 `memberId`). `placeId` 필터, 정렬 `createdAt DESC, id DESC` + 공통 커서. 평가 연결(§18 R-8) 뒤로 `reviewStatus`는 평가 유무로 거르고 `reviewId`·`reviewScore`를 채운다 | 명세 §6 "기본 본인·ALL, 같은 여행 멤버만". 요청 ID 오류는 400(M-4) |
| VS-7 | 체크 해제 | 방문한 본인만(방장도 남의 것은 403). `deleted_at` 논리 삭제, 되살리지 않고 다시 체크하면 새 행. 평가가 있는 방문은 409 `REVIEW_EXISTS`(§18 R-8) | 명세 §6. ERD `deleted_at` |
| VS-8 | 이탈·여행 삭제 | 나가거나 내보내져도 방문은 남고 다른 멤버가 `memberId`로 본다. 나간 사람은 404. 여행 삭제 작업(TRIP_DELETE)이 `visits`를 물리 삭제한다. 방문은 여행 version과 무관 | 정산처럼 여행이 있는 동안 기록을 남긴다(D-6) |

## 17. 도메인 알림 이벤트 발행 (EODI-196, 2026-11-05 사용자 확정)

A가 만든 알림 기반(`events`·`notifications`, `GET /me/notifications`)에 B 도메인 이벤트를 연결했다. B는 A 패키지에 리스너를 추가하지 않고, 도메인마다 둔 알리미가 업무 트랜잭션 안에서 A의 `NotificationEventRegistrar.register`(MANDATORY, `deduplicationKey` 멱등)를 직접 부른다. 업무가 409·400으로 롤백되면 알림도 남지 않는다. 새 API는 없다.

| type | 발생 지점 | 수신자 | target | deduplicationKey | 문구 |
| --- | --- | --- | --- | --- | --- |
| `TRIP_MEMBER_JOINED` | `InvitationService.acceptInvitation`에서 멤버십이 새로 생기거나 LEFT→ACTIVE가 된 뒤 | 새 멤버를 뺀 ACTIVE 전원 | `TRIP`/tripId | `TRIP_MEMBER_JOINED:{tripId}:{memberId}:{joinOrder}` | `{닉네임}님이 여행에 참여했어요.` |
| `POLL_OPENED` | `PollService.createPoll` | 연 사람을 뺀 ACTIVE 전원 | `POLL`/pollId | `POLL_OPENED:{pollId}` | `새 투표 "{제목}"이 열렸어요.` |
| `POLL_CANDIDATE_ADDED` | `PollService.addCandidate` | 그 투표에 표를 낸 ACTIVE 멤버(추가한 사람 제외) | `POLL`/pollId | `POLL_CANDIDATE_ADDED:{pollId}:{candidateId}` | `"{제목}" 투표에 후보가 추가됐어요.` |
| `POLL_FINALIZED` | `PollCloser` 확정 마감 | ACTIVE 전원(actor 없음) | `POLL`/pollId | `POLL_CLOSED:{pollId}` | `"{제목}" 투표가 마감됐어요. 결과를 확인해 보세요.` |
| `POLL_CLOSED_NO_VOTES` | `PollCloser` 0표 마감 | ACTIVE 전원(actor 없음) | `POLL`/pollId | `POLL_CLOSED:{pollId}` | `"{제목}" 투표가 아무도 참여하지 않아 마감됐어요.` |
| `POLL_REMINDER` | `PollReminderSender`(1분 주기) | 아직 표를 내지 않은 ACTIVE 멤버 | `POLL`/pollId | `POLL_REMINDER:{pollId}` | `"{제목}" 투표가 1시간 뒤 마감돼요.` |
| `COURSE_CHANGED` | `ItineraryService.replaceItinerary`에서 version이 오른 뒤 | 저장한 사람을 뺀 ACTIVE 전원 | `ITINERARY`/tripId | `COURSE_CHANGED:{tripId}:{version}` | `{닉네임}님이 코스를 수정했어요.` |

| # | 질문 | 결정 | 근거 |
| --- | --- | --- | --- |
| N-1 | 호출 방식 | 알리미(`PollNotifier`·`InvitationNotifier`·`ItineraryNotifier`)가 `register`를 직접 호출. 업무 서비스는 성공 지점에서 한 줄만 부른다 | A 패키지를 건드리지 않는다. Spring 이벤트 + B 리스너는 파일만 늘고 이점이 적다 |
| N-2 | 문구 | 위 표. 닉네임은 `UserCardReader`(탈퇴는 `탈퇴한 사용자`), 읽지 못하면 `동행` | 화면이 `message`를 그대로 쓴다 |
| N-3 | 행동한 본인 | 받지 않는다. 서버가 한 마감·리마인더는 actor가 없어 연 사람도 받는다 | 여행 수정 알림과 같은 규칙 |
| N-4 | 마감 type | 확정 `POLL_FINALIZED`, 0표 `POLL_CLOSED_NO_VOTES`로 나누되 키는 `POLL_CLOSED:{pollId}` 하나 | 명세 이름. 한 투표는 한 번만 마감한다 |
| N-5 | 리마인더 | `polls.reminder_sent_at`(V202611051000) + 부분 인덱스. 1분마다 `closes_at`이 지금~1시간 뒤인 OPEN 투표를 여행별로 따로 커밋해 처리하고, 여행 행 → 투표 행을 잠근 뒤 다시 확인한다. 미투표자가 없으면 이벤트 없이 표식만 남긴다. 1시간이 안 남은 채로 열린 투표도 다음 주기에 보낸다. 표식은 투표 version을 올리지 않는다 | 주기 마감(`PollAutoCloser`)과 같은 틀. `app.polls.reminder-enabled`(테스트 프로필 false) |
| N-6 | 코스 변경 묶음(Q-16) | 1차는 묶지 않는다. 바뀐 게 없는 저장(version 불변)은 알리지 않는다 | 묶음은 별도 상태가 필요해 A와 합의 뒤 |
| N-7 | 이미 ACTIVE인 사람의 재수락 | 알리지 않는다. 재참여는 새 `joinOrder`라 다시 알린다 | 멤버십이 바뀐 경우만 이벤트다 |
| N-8 | 멤버 변동 전 마감 | 초대 수락·나가기·내보내기가 멤버십을 바꾸기 전에 마감하므로 마감 알림은 그 시점 ACTIVE 멤버가 받는다 | 집계 기준(V-6b)과 같다 |

빠진 것: 팔로우·AI 제안·피드 알림은 기능이 없고, 방장 양도·내보내기·초대 발급은 명세가 "알림 없음"이다. 채팅 시스템 카드(`messages.event_id`)와 설정별 수신 차단은 A 몫이다.

### 17-1. A에게 공유할 것

- `NotificationEventRegistrar.register` 호출부가 B 패키지 3곳(알리미 3개, 투표 알림 5종)에 생겼다. 시그니처를 바꿀 때 알려 달라.
- 설정별 차단 매핑 제안: `POLL_*`·`COURSE_CHANGED` → `user_settings.vote_course_enabled`, `TRIP_MEMBER_JOINED` → `trip_changes_enabled`. `register` 안에서 걸러 주면 B는 고칠 것이 없다.
- `polls.reminder_sent_at` 컬럼(V202611051000)과 공통 설정 `app.polls.reminder-enabled`(`application.yaml` true, `application-test.yaml` false)를 추가했다.
- 채팅 시스템 카드를 붙일 때 위 이벤트 행을 그대로 쓰면 된다.

## 18. 방문 평가 정책 (EODI-199, 2026-11-05 사용자 확정)

명세 §7 `PUT/DELETE /trips/{tripId}/visits/{visitId}/review`, `GET /trips/{tripId}/reviews`를 `visit` 패키지 안에 구현했다(테이블 `V202611051100`). 평가는 방문의 부속이라 방문과 같은 잠금·판정 순서를 쓴다. 공동 피드 게시(`feed_reviews`, `PublishedReview`)는 범위 밖이다.

| # | 질문 | 결정 | 근거 |
| --- | --- | --- | --- |
| R-1 | 저장·삭제 | 방문 하나당 평가 하나(`reviews.visit_id` 유일). 삭제는 물리 삭제, 다시 쓰면 새 행(version 1) | 논리 삭제면 유일 제약을 부분 인덱스로 바꾸고 되살릴지 정해야 한다. 평가는 정산처럼 보존할 이유가 없다 |
| R-2 | 본문 | 공백만·NUL 문자 거부, 1,000자(코드 포인트) 이하, 받은 그대로 저장 | 채팅 본문과 같은 규칙 |
| R-3 | 점수 | 1~5 JSON 정수만. `2.5`·`"3"`도 400(필드 `score`). `score` 필드에만 엄격한 변환기(`StrictIntegerDeserializer`)를 붙였다 | 명세 "반 점 거부". Jackson 기본 변환은 2.5→2, "3"→3으로 받는다. 공통 설정은 다른 API에 영향이 있어 바꾸지 않았다 |
| R-4 | PUT 판정 순서 | 입력 400 → 여행 행 잠금 후 ACTIVE 404 → 방문 404 `VISIT_NOT_FOUND`(해제·다른 여행 포함) → 내 방문 아니면 403 → 평가가 있으면 `expectedVersion` 다를 때 409 `VERSION_CONFLICT`, 생략하면 덮어쓰기 / 없으면 `expectedVersion`을 보냈을 때 400 → 저장. 생성·수정 모두 200. 값이 바뀔 때만 version·updatedAt 갱신 | 방문 VS-5와 같은 틀. 명세 `expectedVersion?`. 여행 행 잠금으로 같은 방문의 동시 첫 작성도 한 행으로 모인다 |
| R-5 | DELETE 판정 순서 | 여행 행 잠금 후 ACTIVE 404 → 방문 404 → 평가 404 `REVIEW_NOT_FOUND` → 내 평가 아니면 403 → 삭제 204 | 방장도 남의 평가는 지울 수 없다(명세 "타인 평가 변경 불가") |
| R-6 | 목록 | `memberId` 생략 시 여행 전체(동행 평가 포함), 같은 여행 멤버십(나간 멤버 포함)만 필터, 아니면 400. 정렬 `createdAt DESC, id DESC` + 공통 커서 | 방문 목록은 기본 본인이지만 S33이 동행 후기를 같이 보여 준다 |
| R-7 | 응답 | 명세 `Review`에 `visit{placeId,visitedAt}`·`place{name,address}` 요약을 덧붙인다. 장소는 `PlaceReader.findAll`로 한 페이지 분을 한 번에 읽는다. PUT 응답도 같은 모양 | 화면이 방문 목록과 다시 조합하지 않아도 된다. N+1 방지 |
| R-8 | 방문 API 보강 | `Visit.reviewId`·`reviewScore`를 채우고(같은 장소 재체크 200 응답 포함), `reviewStatus=WRITTEN/UNWRITTEN`을 실제로 거른다. 평가가 있는 방문의 체크 해제는 409 `REVIEW_EXISTS`(방문 404 → 본인 403 → 평가 409 순) | 명세 §6 제안 확정(VS-6·VS-7 갱신) |
| R-9 | 이탈·여행 삭제 | 나가도 평가는 남고 다른 멤버가 목록에서 본다. 나간 사람은 404. TRIP_DELETE 작업이 `visits`보다 먼저 `reviews`를 지운다(FK) | 방문 VS-8과 같은 원칙 |

## 19. AI 준비물 추천·채택 정책 (EODI-218, 2026-11-06 사용자 확정)

명세 §6 `POST /trips/{tripId}/checklist-suggestions`와 준비물 추가의 제안 채택을 구현했다. 실행은 jobs `CHECKLIST_SUGGESTIONS`(실행기·정책은 `checklist.suggestion`), AI 호출은 `global.ai`(`AiServerClient`)다. AI 서버 계약은 [AI 명세](../../../ai/docs/spec.md) §1.0·§7.

| # | 질문 | 결정 | 근거 |
| --- | --- | --- | --- |
| S-1 | 요청 본문 `{date}` | 삭제. 본문은 생략하거나 `{}`. 다른 필드는 400 | 백엔드 날씨 조회가 없고 AI 요청에도 date가 없다. 명세 §2 "명시된 필드만" |
| S-2 | 중복 요청 | `Idempotency-Key` 필수(명세 §2). 같은 키는 처음 JobRef | 비동기 작업 생성 POST 공통 규칙 |
| S-3 | 판정 순서 | 키 400 → 여행 행 잠금 후 비멤버 404 → 요청자 설정 OFF 409 `AI_FEATURE_DISABLED` → 등록. 기간·코스가 비어도 거부하지 않음 | AI가 기본 준비물(신분증·충전기)로 처리한다 |
| S-4 | 입력 스냅샷 | 등록 때 여행 기간, 코스 항목(장소 id·이름·일차·시작 시각·체류 분, category=null), 살아 있는 준비물(label·source·modifiedByUser), 지운 준비물 이름(중복 제거)을 `input_json`에 고정. 실행 때 jobId와 빈 weather를 붙인다. 재시도에서 다시 읽지 않음 | jobs 기반 "허용 입력 스냅샷". 주소·좌표·멤버 정보는 보내지 않는다 |
| S-5 | 실행·완료 권한 | 요청자 활성 + 여행 삭제 안 됨 + 요청자 ACTIVE + 요청자 설정 OFF 아님. 깨지면 CANCELLED(`POLICY_REVOKED`) | 명세 §3 "기능 설정은 자동 작업 시작과 결과 반영 모두에 적용" |
| S-6 | 조회 권한 | 그 여행의 현재 ACTIVE 멤버 누구나. 요청자도 나가면 404. result는 label·reason·sourceJobId만 다시 골라 공개 | 공동 목록 하나(Q-8b). 명세 §9 AI 작업 권한표 |
| S-7 | AI 호출 | `POST {app.ai.base-url}/ai/v1/checklist-suggestions`, `X-Internal-Token`·`X-Trace-Id`(=jobId), 연결 5초·응답 50초 | AI spec §1.0 시간 예산(45 < 50 < jobs 60초) |
| S-8 | 실패 분류 | 5xx·연결 실패·타임아웃 → `TEMPORARY_FAILURE`(최초 포함 3회, 30초 간격). 4xx·응답 형식 오류(items 아님, label 빈값·255자 초과, reason 1,000자 초과, items 50개 초과, sourceJobId≠jobId) → `EXECUTION_FAILED` | AI spec §1.0. 무기한 RUNNING은 jobs 60초 제한이 막는다 |
| S-9 | 채택 요청 | 기존 `POST /checklist`에 `sourceJobId`·`suggestionIndex`를 함께. 하나만 보내면 400(빠진 쪽 필드). label 필수, 제안과 다르면 `modifiedByUser=true`. reason은 제안에서 복사, source=AI | 명세 §6. 정책 C-5와 같은 뜻 |
| S-10 | 채택 검증 | 작업 없음·다른 여행·다른 kind·성공 아님(QUEUED·RUNNING·FAILED·CANCELLED) → 400 `sourceJobId`. 순번 음수·범위 밖 → 400 `suggestionIndex`. 채택자 설정 OFF → 409 `AI_FEATURE_DISABLED` | 요청 본문의 ID라 입력 오류(M-4와 같음) |
| S-11 | 중복 채택 | `(source_job_id, suggestion_index)` 유니크(지운 행 포함). 다시 채택하면 409 `SUGGESTION_ALREADY_ADOPTED`. 채택 후 지운 제안도 409 | 명세 "삭제한 항목 강제 부활 금지" |
| S-12 | AUTO 모드 | CONFIRM과 같게 제안만. 자동 채택 없음 | 명세 §3 "자동 적용 판정 기준 미합의 기능은 AUTO 비활성" |
| S-13 | 동시 채택 | 채택 트랜잭션에서 jobs 행을 `FOR UPDATE`로 잠근 뒤 존재 확인. 그래도 생긴 유니크 위반은 409 | worker는 RUNNING 행만 잠가 성공한 행과 겹치지 않는다 |
| S-14 | 작업 결과 읽기 | 공통 job 패키지를 고치지 않고 `ChecklistSuggestionReader`가 `jobs`를 직접 읽는다 | A 공통 코드 변경 없음 |
| S-15 | 설정 읽기 | `user_settings.checklist_mode`만 읽고 행이 없으면 CONFIRM. `UserSettingsService.get`(첫 조회 때 행 생성)은 쓰지 않는다 | 검사에서 쓰기를 만들지 않는다 |
| S-16 | 설정 키 | `app.ai.base-url`(`AI_BASE_URL`, 기본 `http://localhost:8000`), `app.ai.internal-token`(`AI_INTERNAL_TOKEN`, 기본 빈 값). 토큰이 비면 헤더를 보내지 않아 AI가 401 → 그 작업만 실패 | 키가 없는 개발자의 서버도 뜬다 |
| S-17 | 빈 제안 | `items: []`도 SUCCEEDED | 결과 없음과 실패를 구분(명세 §2 503 원칙과 같은 뜻) |
| S-19~S-21 | 테스트 격리 | `ChecklistSuggestionApiTest`는 끝날 때 AI 준비물·준비물 작업을 지운다(`JobIntegrationTest`의 `DELETE FROM jobs`가 새 FK에 막히지 않게). 테스트 프로필은 AI 주소를 닫힌 포트로 둔다 | 테스트 DB 컨테이너 공유 |
| S-23 | AI HTTP 연결 | JDK HttpClient를 HTTP/1.1로 고정하고 본문은 UTF-8 바이트로 보낸다. 4xx·연결 실패는 경로·traceId·상태·응답 본문(500자)을 WARN으로 남긴다. `app.ai.*`는 yaml이 없어도 기본값(`http://localhost:8000`, 5초, 50초)으로 뜬다 | 실제 연동에서 기본 HTTP/2의 h2c 업그레이드를 uvicorn이 지원하지 않아 400이 났다. mock 테스트로는 드러나지 않았다 |

### 19-0. 실제 AI 서버 연동 확인 (2026-11-06)

- 방법: 로컬 `ai/`(uvicorn, `INTERNAL_API_TOKEN` 지정)를 띄우고 `AI_E2E_BASE_URL`·`AI_E2E_INTERNAL_TOKEN`을 준 뒤 `ChecklistSuggestionRealAiTest`만 실행. 평소 build에서는 환경 변수가 없어 건너뛴다.
- 결과: 요청 → 202 → worker 실행 → SUCCEEDED → 결과 조회 → 첫 제안 채택 201(source=AI). AI가 이미 있는 "충전기"는 빼고 4개(여벌 양말·신분증·세면도구·갈아입을 옷)를 돌려줬다.
- 한계: GMS 키가 없어 AI 서버는 LLM을 건너뛰고 규칙 기반 제안만 냈다(`checklist_llm_skipped`). LLM 경로와 날씨 입력은 확인하지 않았다.
- 첫 실행은 400으로 실패했다. 원인과 조치는 S-23.

### 19-1. A에게 공유할 것

- 명세 §6 `checklist-suggestions`의 `date` 필드를 뺐다(S-1). 프론트는 본문 없이 `Idempotency-Key`만 보내면 된다.
- 공통 설정에 `app.ai`(base-url·internal-token·connect-timeout·read-timeout)와 `global.ai.AiServerClient`를 추가했다. 다른 AI 작업도 이 클라이언트를 쓰면 된다. `.env.example`에 `AI_BASE_URL`·`AI_INTERNAL_TOKEN`을 추가했다(AI 쪽 `INTERNAL_API_TOKEN`과 같은 값).
- `checklist_items`에 `jobs` FK가 생겼다(V202611061000). 테스트에서 `DELETE FROM jobs`를 하면 AI 준비물 행을 먼저 지워야 한다.
- 오류 코드 `AI_FEATURE_DISABLED`는 `ChecklistErrorCode`에 두었다. 다른 AI 기능도 같은 코드 이름을 쓰면 된다.
- 테스트 프로필(`application-test.yaml`)에 Hikari `minimum-idle: 1`, `idle-timeout: 10s`를 넣었다. 캐시된 테스트 컨텍스트(설정이 다른 `@SpringBootTest`마다 하나)가 각자 커넥션 10개를 들고 있어, 컨텍스트가 늘면 공유 PostgreSQL 한도 100을 넘었다(`too many clients already`). 그 뒤 테스트는 연결 대기 30초씩 걸리며 실패한다. 새 `@MockitoBean` 테스트를 더할 때도 이 설정이 있으면 괜찮다.

## 20. AI 장소 추출 정책 (EODI-224, 2026-11-09 사용자 확정)

명세 §5 `POST/GET/DELETE /extractions`를 구현했다. 실행은 jobs `PLACE_EXTRACTION`(패키지 `extraction`), AI 호출은 `global.ai`의 multipart 호출(`AiServerClient.postMultipart`)이다. AI 서버 계약은 [AI 명세](../../../ai/docs/spec.md) §1.0·§2. 분담 문서: `backend-a-b-work-split-2026-11-09`(B).

| # | 질문 | 결정 | 근거 |
| --- | --- | --- | --- |
| E-1 | 요청 본문 | `{url?, captureAssetIds?, memo?}`만. url은 strip 후 빈 값이면 없음. url·캡처 둘 다 없으면 400(`url`·`captureAssetIds`). `regionHint`는 받지 않음 | 명세 §5 |
| E-2 | url·memo 규칙 | url은 2048자 이하, AI `_parse_target`과 같은 규칙(http/https, host 있음, 계정 정보 없음, 포트 생략·80·443, 공백 없음). memo는 strip 후 500자(코드 포인트) 이하, 빈 값은 없음. 지원 사이트 판정은 하지 않음 | AI가 잘못된 url에 422를 주면 캡처가 정상이어도 작업 전체가 실패한다. 사이트 범위는 Q-5 |
| E-3 | 개수 초과 | 캡처 11장 이상 422 `INPUT_LIMIT_EXCEEDED`(`ExtractionErrorCode`). 중복 ID는 400 | 명세 §5. §2 공통 표에도 추가 |
| E-4 | 중복 요청 | `Idempotency-Key` 필수. 범위 `POST /api/v1/extractions`, 같은 키·같은 본문(정규화 후)은 처음 JobRef | 명세 §2 비동기 작업 생성 |
| E-5 | 판정 순서 | 키 400 → 본문 400 → 개수 422 → 설정 OFF 409 `AI_FEATURE_DISABLED` → 캡처 검사 400 → 등록. 설정은 `user_settings.extraction_mode`만 읽고 행이 없으면 CONFIRM | S-15와 같다 |
| E-6 | 캡처 검사 | 캡처 행을 id 순서로 `FOR UPDATE` 잠그고 내 것·CAPTURE·READY·표시본 있음(`display_content_type`)을 확인. 어긋나면 400 `captureAssetIds[i]`(남의·없는 파일도 같은 응답) | 존재 여부를 드러내지 않는다 |
| E-7 | 입력 스냅샷 | `input_json = {url, memo, captureAssetIds}`. 바이트·저장소 키 없음. tripId·baseVersion null | jobs "허용 입력 스냅샷" |
| E-8 | AUTO 모드 | CONFIRM과 같게 후보만. 자동 저장·방문 기록 없음 | 분담 문서. S-12와 같다 |
| E-9 | 권한 | 등록·실행·완료: 요청자 설정이 OFF가 아님(계정 활성은 공통 기반). 깨지면 CANCELLED. 조회: 요청자 본인만 | 명세 §9 권한표 |
| E-10 | 캡처 읽기 | 실행 때 행을 다시 읽어 READY가 아닌 파일은 건너뛰고, **표시본**(`display_key`, EXIF 제거본)을 15MB 한도로 읽는다. 저장소 장애는 TEMPORARY_FAILURE, 객체 없음·한도 초과는 그 장만 건너뜀. 링크도 읽은 캡처도 없으면 AI를 부르지 않고 `{resultStatus:FAILED, candidates:[]}`로 성공 | 원본은 업로드 기한(10분) 뒤 정리된다. AI 장당 한도 15MB |
| E-11 | AI 호출 | `POST /ai/v1/place-extractions` multipart(`url`·`memo`·`captures` 파일 `capture-{n}.jpg/png`), `X-Internal-Token`·`X-Trace-Id=jobId`. 문자열 파트는 `text/plain;charset=UTF-8` 바이트 | S-23과 같은 연결 설정. 한글 깨짐 방지 |
| E-12 | 실패 분류 | 5xx(LLM 장애 503 포함)·연결 실패·타임아웃 → TEMPORARY_FAILURE(최대 3회). 4xx·형식 오류 → EXECUTION_FAILED | AI spec §1.0 |
| E-13 | 응답 검사 | resultStatus 4값·candidates 배열 60개 이하·name/evidence 비지 않음(255자 이하)·confidence null 또는 0~1이 아니면 전체 EXECUTION_FAILED. place만 틀리면(NAVER 아님, 이름·공급자 ID 빈값/255자 초과, 주소 500자 초과, 좌표 범위 밖) 그 후보를 place·confidence null로 | places 제약 |
| E-14 | 장소 연결 | `PlaceResolver.resolve("NAVER", 공급자 ID=AI providerPlaceId, regionCode=null)`을 execute에서 호출(같은 ID는 한 번). DB 오류는 TEMPORARY_FAILURE. category는 버림 | complete는 결과를 바꿀 수 없다. upsert는 멱등. 예외를 던지면 worker가 영구 실패로 본다 |
| E-15 | 결과 | `{resultStatus, candidates:[{candidateId(UUIDv7), name, place:Place\|null, evidence, confidence}]}`. place는 저장 시점 스냅샷. 저장·공개 때 같은 규칙으로 다시 고른다(`StoredExtraction`) | 명세 §10 |
| E-16 | 조회 | `GET /extractions/{jobId}` = `JobService.get` + kind 확인(아니면 404). 성공 전에는 resultStatus null·candidates [] | 명세 §10 |
| E-17 | JobRef | 공통 그대로(`statusUrl=/api/v1/jobs/{id}`) | |
| E-18 | 삭제 | 요청자 아님·이미 지움·다른 kind는 404. 행을 잠그고 `deleted_at`, `input_json='{}'`, `result_json=NULL`. 끝나지 않은 작업은 CANCELLED(`POLICY_REVOKED`). 실행 중 시도는 heartbeat 실패로 멈추고 늦은 결과는 `finish`가 행을 못 찾아 버린다 | 명세 §5 "입력·후보 제거/작업 취소" |
| E-19 | jobs 공통 변경 | `JobService.discard(viewer, jobId, kind)`(MANDATORY, cleanup kind 거부)와 `JobStore.discard` 추가 | 상태 불변식을 공통 안에 둔다 |
| E-20 | 캡처 정리 | 삭제 때 캡처를 같은 순서로 잠근 뒤, 지워지지 않은 다른 추출 작업이 쓰지 않는 내 READY CAPTURE만 `DELETING`. 저장소 삭제·재시도·행 정리는 기존 `AssetCleanup`이 한다 | 캡처를 참조하는 다른 자료는 없다 |
| E-21 | 캡처 보존 | 추출을 지우기 전까지 둔다(같은 캡처로 다시 시도 가능). 장기 보존 한도는 Q-11 | 프론트 "다시 시도"가 같은 캡처를 쓴다 |
| E-22 | 테스트 충돌 | `JobIntegrationTest`의 가짜 PLACE_EXTRACTION 빈을 ROUTE_RECALCULATION으로 바꿨다 | 실제 handler와 중복 등록 |
| E-24 | 진행률 | jobs에 중간 progress 갱신이 없어 0 → 100만 | 프론트 단계 표시는 첫 단계에 머문다 |

마이그레이션 없음. ERD의 `extraction_candidates`는 물리 테이블을 만들지 않고 `jobs.result_json`에 둔다(ERD 주석 갱신).

### 20-0. 검증 (2026-11-09)

- 대체 테스트(가짜 AI·메모리 저장소): `ExtractionApiTest` 9개(링크+메모+캡처·링크만·캡처만, 입력 거부, 읽지 못한 캡처, 일시/영구 실패·형식 오류, 설정 OFF 취소·타인 차단, 삭제와 캡처 정리, 실행 중 삭제 후 늦은 결과 버림, Swagger), `ExtractionInputRulesTest`(url·memo 규칙), `HttpAiServerClientTest`의 multipart 본문(한글 UTF-8·파일 이름·형식)·실패 분류.
- 실제 AI 서버(로컬 `ai/` uvicorn, GMS·네이버 키 없음): `ExtractionRealAiTest`. 11장 multipart → AI 422 `INPUT_LIMIT_EXCEEDED`(captures를 파일 목록으로 읽음) → 재시도 없는 실패. 링크+한글 메모+PNG 캡처 요청 → 202 → worker → AI가 입력 검사를 통과해 LLM 단계에서 503 `PROVIDER_UNAVAILABLE` → `TEMPORARY_FAILURE`로 재시도 대기. 실제 후보 생성·네이버 장소 연결은 키가 없어 확인하지 못했다(대체 테스트로만 확인).
- 전체 build(A의 사진 관리 병합 870db3f 위): 457개 중 실패 1개, 건너뜀 9개(실제 AI·S3 등 환경 변수 조건부). 실패는 A의 `AssetApiTest.tripPhotoIsLimitedToActiveMembers` 하나로, HEIC 변환에 ImageMagick이 필요한데 이 PC에 `magick`이 없어 503 `IMAGE_PROCESSOR_UNAVAILABLE`이 난다(사진 업로드 문서의 설치 조건). 이번 변경과 무관하다.

### 20-1. A·프론트에 공유할 것

- A(MR 본문으로 충분): `JobIntegrationTest.Fixtures`의 가짜 PLACE_EXTRACTION 빈을 ROUTE_RECALCULATION으로 바꿨다. A의 사진 관리(870db3f)는 실제 사진 삭제 빈을 테스트 컨텍스트에서 빼는 방식이라 겹치지 않고, 병합 후 함께 통과했다.
- A(MR 본문으로 충분): jobs 공통에 `JobService.discard`·`JobStore.discard`를 추가했다. 자원별 취소 API가 필요한 다른 AI 작업도 쓸 수 있다.
- 캡처 삭제는 `AssetCleanup`의 `DELETING` 경로를 그대로 쓴다. A의 사진 관리 병합 뒤에도 사진 참조가 없는 파일은 예전과 같이 객체 삭제 → 기한 뒤 행 삭제로 처리된다(따로 알릴 필요 없음).
- 프론트(EODI-216, 꼭 필요): `POST /extractions`에 `Idempotency-Key`가 필요하다(다시 시도마다 새 키). 2026-11-09 dbd2baa 기준 `startExtraction`은 헤더를 보내지 않아 400이 난다.
- 프론트(참고): progress는 0 → 100만이라 진행 단계 표시는 첫 단계에 머문다. 프론트는 60초가 지나면 실패로 보여 주지만, AI 장애(503)일 때 백엔드는 30초 간격 최대 3회 시도해 1~3분 뒤 FAILED가 된다. 취소한 작업의 캡처는 지워지므로 다시 찾을 때는 새로 올린다.
- 선택한 후보 저장 예시: 개인 `PUT /api/v1/me/bookmarks/{place.id}` `{memo?}`, 여행 `PUT /api/v1/trips/{tripId}/saved-places/{place.id}/me` `{memo?}`. `place:null` 후보는 `GET /api/v1/places?query={name}`으로 고르거나 `POST /api/v1/places`로 수동 장소를 만든 뒤 같은 PUT.
- 남은 위험: 캡처 10장 S3(시드니) 읽기 + AI 50초가 worker 60초를 넘을 수 있다. 공급자 ID는 AI의 이름·주소 해시(AS-12)라 -162에서 규칙이 바뀌면 같은 장소가 두 행이 될 수 있다. 새 장소의 regionId는 주소로 채운다(§20-2).

### 20-2. 추출 장소 지역 채우기 (EODI-246, 2026-11-09)

네이버 응답에는 지역 코드가 없어 추출 장소의 `regionId`가 비었다. 지역으로 거르는 장소 검색·북마크에서 빠지고, 여행지 추천(AI가 저장 장소를 `region_id`로 묶음)의 근거가 되지 못한다.

- 규칙: 주소 앞 두 단어 "시·도 시·군·구"가 `regions.name`과 정확히 같으면 그 지역이다. 일반구가 있는 시(수원시 장안구)는 시 단위로 묶인다. 시·도 줄임말·옛 이름(부산, 경남, 강원도, 전라북도, 광주광역시, 전라남도 등)과 관할·이름이 바뀐 곳(경상북도 군위군 → 대구광역시 군위군, 인천광역시 남구 → 미추홀구)은 대응표로 바꾼다. 시·도 이름만으로는 하위 지역이 없는 세종만 맞추고, 다른 시·도로 넓혀 맞추지 않는다(`RegionCodeResolver`와 같은 원칙). 못 찾으면 null이다. 지역 전체 이름은 seed에서 모두 하나뿐이다.
- 위치: DB 함수 `region_code_for_address`(V202611091800). 추출 실행기는 `RegionAddressMatcher`로 이 함수를 불러 `ProviderPlace.regionCode`에 넣는다. `PlaceResolver`는 바꾸지 않았다. 기존 장소에 지역이 있고 새로 못 찾으면 기존 지역을 유지한다(기존 COALESCE).
- 기존 장소: V202611091801이 provider=NAVER이고 region_id가 빈 장소만 같은 함수로 한 번 채운다. 다른 공급자·수동 장소는 건드리지 않는다.
- 근거(공공 장소 덤프 2026-11-05, 280만 건을 임시 PostGIS 컨테이너에 마이그레이션과 함께 복원해 비교): 저장된 지역과 같음 2,802,338건(99.96%), 못 찾음 932건(주소 없음 916건, 오타 16건), 다름 22건(모두 KTO, 원본 주소와 코드가 서로 다른 행). SBDC는 2,753,778건 전부 같았다.
- 테스트: `RegionAddressMatcherTest`(주소 18가지·빈 주소, 1300 → 1801 업그레이드로 네이버 장소만 채움), `ExtractionApiTest`의 추출 장소 regionId(부산 수영구). A의 `PhotoClassificationMigrationUpgradeTest`는 마지막 버전을 1300으로 가정해 깨지므로 `target("202611091300")`으로 고정했다(검사 내용은 그대로).
- 전체 build(dev 2caf8ad 위): 531개 중 실패 0개, 건너뜀 12개(실제 AI·S3 등 환경 변수 조건부).
- 남은 위험: 실제 네이버 주소 표기를 이번에 다시 호출해 보지는 않았다. 네이버가 대응표에 없는 표기(예: 새 통합 지역의 다른 줄임말)를 주면 null로 남는다.

## 21. AI 최초 코스 제안·적용·되돌리기 정책 (EODI-231, 2026-11-09 사용자 확정)

명세 §6 `POST /itinerary/proposals`, `GET /itinerary/proposals/{jobId}`, `POST .../apply`, `POST /itinerary/undo`를 구현했다. 실행은 jobs `ITINERARY_PROPOSAL`(패키지 `itinerary.proposal`), AI 호출은 JSON `POST /ai/v1/itinerary-proposals`([AI 명세](../../../ai/docs/spec.md) §5). 분담 문서: `backend-a-b-ai-work-split-2026-11-09`(B). AI 쪽 코스 제안은 구현 중에 dev에 들어왔다(ef31816, AS-16). 병합 직전 최신 dev(cdee75f) 위에서 실제 AI 서버로도 확인했다(21-0).

| # | 질문 | 결정 | 근거 |
| --- | --- | --- | --- |
| I-1 | 요청 본문 | `{reason, expectedVersion, defaultTransportMode?}`. reason은 INITIAL만, PLACE_REMOVED·WEATHER는 400 `reason`. INITIAL에 `excludedPlaceIds`·`sourceWeatherJobId`·`selectedAlternativeId`가 오면 400 | 다른 사유는 날씨 대안·장소 제외 작업 때 |
| I-2 | 기본 이동 수단 | 생략 시 TRANSIT | AI spec 예시 |
| I-3 | 중복 요청 | `Idempotency-Key` 필수. 범위 `POST /api/v1/trips/{tripId}/itinerary/proposals`, 지문은 (reason, expectedVersion, 수단) | 명세 §2 비동기 작업 생성 |
| I-4 | 판정 순서 | 키·본문 400 → 비멤버 404 → version 409 → 기간·장소 없음 422 → 장소 수 422 → 등록. version·장소 검사는 처음 등록할 때만(같은 키 재요청은 처음 JobRef) | 권한은 `execute` 앞 |
| I-5 | 기간·장소 없음 | 422 `INSUFFICIENT_DATA`, fields `trip.startDate`·`places` | AI spec §0: 사용자에게 보일 사유는 등록 전에 |
| I-6 | 대상 장소 | `trip_place_saves`(저장 순, 나간 멤버의 저장 포함) ∪ 현재 코스 장소. 최대 200곳, 초과 422 `INPUT_LIMIT_EXCEEDED`. 개인 북마크는 넣지 않음 | `GET /saved-places`와 같은 기준 |
| I-7 | 기존 코스 | INITIAL도 허용. 적용하면 코스 전체가 제안으로 바뀐다 | "AI로 다시 짜기" |
| I-8 | 입력 스냅샷 | 여행 행을 잠근 트랜잭션에서 AI 요청 본문 모양 그대로 고정: `{reason, expectedVersion, trip{id,startDate,endDate,destinationRegionIds}, places[Place], current{items,legs}, defaultTransportMode, excludedPlaceIds:[], selectedAlternative:null}`. `base_version=expectedVersion` | 재시도 때 다시 읽지 않는다 |
| I-9 | 설정·동의 | 코스 AI 설정 열이 없어 검사하지 않는다. 설정이 생기면 `ItineraryProposalAccess`에 추가 | 명세 §9 "동의 검사"는 미적용 |
| I-10 | 권한 | 등록·실행·완료: 요청자가 삭제 안 된 여행의 ACTIVE 멤버(깨지면 CANCELLED). 조회: 그 여행의 현재 ACTIVE 멤버 누구나 | 공동 코스, 준비물과 같다 |
| I-11 | 실행 중 코스 변경 | execute·complete에서 막지 않고 apply에서 409 | 명세 |
| I-12 | 실패 분류 | 5xx·연결 실패·타임아웃 TEMPORARY_FAILURE(최대 3회), 4xx·형식 오류 EXECUTION_FAILED | 준비물과 같다 |
| I-13 | 응답 검증 | baseVersion·reason 일치, 항목 1~200개, 장소는 입력 places 안, 항목 id는 null 또는 요청 당시 코스 항목(한 번만), day 1~여행 일수, 날짜별 order 1부터 빈틈없이, startTime HH:mm/null, stayMinutes 1~1440/null, 구간은 같은 날 인접 쌍마다 정확히 하나, AVAILABLE이면 시간 있음·UNAVAILABLE이면 시간 없음, description은 문자열. 하나라도 어긋나면 EXECUTION_FAILED. description이 1000자를 넘으면 자른다(여행 기간 상한이 없어 일차별 문구가 길어질 수 있다) | AI spec T-04-10, PUT 규칙 |
| I-14 | 저장 형태 | `{baseVersion, reason, proposed{items[{id,place,day,order,startTime,stayMinutes}], legs[{fromItemId,toItemId,day,fromOrder,toOrder,transportMode,durationSeconds,distanceMeters:null,geometry:null,status,queriedAt}]}, diff}`. place는 입력 스냅샷 값으로 바꿔 끼우고, 구간 항목 ID는 위치로, diff 목록은 백엔드가 다시 계산(description만 AI). queriedAt이 없으면 응답 받은 시각 | AI 값을 그대로 믿지 않는다 |
| I-15 | 조회 | `JobService.get` + kind·trip 일치(아니면 404). 성공 전 proposed null·빈 diff. appliedAt은 `jobs.applied_at`, canUndo는 조회 시 계산. "변경 전" 필드는 추가하지 않음 | 명세 스키마 |
| I-16 | 알림 | AI_PROPOSAL_READY는 만들지 않는다(수신 대상 미정) | 후속 |
| I-17 | 적용 판정 순서 | 400 → 여행 404 → 작업 404(삭제·다른 kind·다른 여행) → `ALREADY_APPLIED` → `PROPOSAL_NOT_READY` → `VERSION_CONFLICT`(현재≠expected 또는 ≠base) → 여행 기간 축소로 날짜 넘침 `VERSION_CONFLICT`. 잠금은 여행 → 코스 → 작업 행 | worker 완료는 작업 행만 잠가 교착 없음 |
| I-18 | 적용 내용 | 유지 항목 id 그대로, 나머지 기존 항목 삭제, 새 항목 발급. 구간에 AI 이동 시간·상태 저장. 교체 로직은 `CourseWriter`로 PUT과 공유 | |
| I-19 | 원자 처리 | 한 트랜잭션에서 적용 전 코스 보관(upsert) → 교체 → version+1(내용이 같아도) → `jobs.applied_at·applied_by_member_id` → COURSE_CHANGED 알림 | 적용 기록·되돌릴 대상 |
| I-20 | 동시 적용 | 같은 제안 동시 적용은 코스 행 잠금으로 직렬화되어 하나만 성공(나머지 409 `ALREADY_APPLIED`). 다른 제안 둘은 뒤가 409 `VERSION_CONFLICT`. apply에 Idempotency-Key는 받지 않음 | |
| I-21 | undo 조건 | undo 행이 있고 applied_job_id=appliedJobId, 현재 version=applied_version. 바뀐 것 없는 PUT은 쓰기가 아님 | |
| I-22 | undo 판정 순서 | 400 → 404 → expectedVersion 불일치 `VERSION_CONFLICT` → `UNDO_UNAVAILABLE` | |
| I-23 | 복원 | 항목 id·구간 결과(지도선 포함)까지 그대로 SQL로 복원, version+1, undo 행 삭제, 알림. ACTIVE 멤버 누구나. jobs.applied_at은 유지 | |
| I-24 | 시간 제한 | 두지 않음(Q-15 합의 전) | 임의 숫자 금지 |
| I-25 | 마이그레이션 | `V202611091200__create_itinerary_undo_states.sql` | ERD 그대로 |
| I-26 | 여행 삭제 | `TripDeleteJobHandler`가 itinerary_undo_states를 코스보다 먼저 지운다 | FK |
| I-27 | PUT과 undo 행 | 실제로 바꾼 PUT은 undo 행을 지운다 | ERD "다른 쓰기 뒤 토큰 제거" |
| I-28 | route_legs 제약 | `ck_route_legs_result`를 "AVAILABLE이면 시간 필수"로 넓혔다(거리·지도선 NULL 허용). UNAVAILABLE 조건은 그대로 | 기존 제약은 AVAILABLE에 거리를 요구해 AI 이동 시간(거리 없음)을 저장할 수 없었다. 구현 중 발견, I-18을 지키기 위한 변경 |

### 21-0. 검증 (2026-11-09)

- 대체 테스트(가짜 AI): `ItineraryProposalApiTest` 11개(Swagger `/v3/api-docs` 확인, 긴 description 자르기 포함). 요청·같은 키 재요청·AI 입력 스냅샷, 조회(공동 멤버·job 결과), 적용(id 유지·새 id·이동 시간 저장·알림), 재적용 409, undo(원래 id 복원·재undo 409), 요청 검증 400/404/409, 기간·장소 없음·201곳 422, 잘못된 AI 결과 4종 EXECUTION_FAILED와 적용 409, 일시/영구 실패, 실행 중 수동 수정·기간 축소 뒤 적용 409, 바뀐 것 없는 PUT 뒤 undo 가능·실제 PUT 뒤 불가, 요청자 이탈 CANCELLED·다른 여행·다른 kind 404, 동시 적용 하나만 성공, 적용 뒤 여행 삭제.
- 실제 AI(2026-11-09, 로컬 `ai/` uvicorn, dev cdee75f, 카카오 길찾기 키 없음): `ItineraryProposalRealAiTest` 통과. 1박 2일 5곳(그중 1곳은 현재 코스 항목) → 202 → worker → SUCCEEDED, 1일차 2곳·2일차 3곳, 현재 코스 항목 id 유지 → 적용(version 3, id 유지) → 되돌리기(version 4, 원래 항목 1개·id 복원). 키가 없어 구간은 모두 UNAVAILABLE이었고 AI 이동 시간이 있는 구간 저장은 대체 테스트로만 확인했다.
- 전체 build(최신 dev cdee75f 위, ImageMagick 7.1.2-34·`IMAGE_MAGICK` 지정): 469개 중 실패 0개, 건너뜀 7개(실제 AI 4개·실제 S3 3개). 실제 S3 왕복 `AssetRealS3Test`(`-PrealS3=true`, 개발 버킷) 3개도 따로 통과. ImageMagick이 없으면 기존 `AssetApiTest.tripPhotoIsLimitedToActiveMembers`가 503으로 실패한다(이 테스트만 `IMAGE_MAGICK` 조건이 없다). 기존 코스 PUT(`ItineraryApiTest` 11개)·여행 삭제·jobs 공통·준비물·장소 추출 테스트 모두 통과.

### 21-1. A·AI·프론트에 공유할 것

- A: `TripDeleteJobHandler`에 `itinerary_undo_states` 삭제 한 줄을 넣었다. 사진 AI(photo_groups)도 이 파일을 고칠 가능성이 높으니 병합 순서를 맞춘다. 마이그레이션 번호는 `V202611091200`이다.
- A: api-spec §2 409 표에 `PROPOSAL_NOT_READY`·`UNDO_UNAVAILABLE`을 추가했고, §9 운영 실행기 문장에 ITINERARY_PROPOSAL을 넣었다.
- AI(장수철, -150): 구현(ef31816)이 백엔드 계약과 맞는 것을 실제 호출로 확인했다. INITIAL의 `current` id 유지와 지역 모르는 장소 처리는 AS-16에 답이 있다. 알릴 것: 백엔드는 대상 장소를 200곳까지 보낸다. places에 `category`가 없어(places 열 없음) 식당·카페 시간 규칙은 적용되지 않는다. 카카오 키가 있을 때 구간이 많으면 45초 예산 안에 끝나는지는 아직 확인하지 않았다.
- 프론트: 요청 → `GET /itinerary/proposals/{jobId}` 폴링 → 비교(현재 코스는 `GET /itinerary`) → apply(`expectedVersion`) → 필요하면 undo(`expectedVersion`=적용 후 version, `appliedJobId`). 409 VERSION_CONFLICT면 코스를 다시 조회하고 새 제안을 요청한다. 제안 구간은 새 항목 사이라 `day/fromOrder/toOrder`로 가리킨다.
- 남은 위험: 카카오 키가 있을 때 AVAILABLE 구간의 실제 저장과 45초 예산은 확인하지 못했다. 코스 AI 설정이 없어 동의 검사가 없다. AI 이동 시간을 저장한 구간도 이후 PUT으로 바꾸면 UNAVAILABLE로 다시 저장된다(경로 재계산 작업 때 정한다).

## 22. 날씨 조회·AI 날씨 대안·WEATHER 코스 제안 정책 (EODI-247, 2026-11-09)

명세 §6 `GET /trips/{tripId}/weather`, `POST /trips/{tripId}/weather-alternatives`와 `POST /itinerary/proposals`의 `reason=WEATHER`를 구현했다. 날씨는 패키지 `weather`(`WeatherService`, 기상청 클라이언트 `weather.kma`), 대안 작업은 jobs `WEATHER_ALTERNATIVES`(패키지 `weather.alternative`)이다. AI 호출은 JSON `POST /ai/v1/weather-alternatives`(AI 명세 §6)와 기존 `POST /ai/v1/itinerary-proposals`(§5 WEATHER)이다. 분담 문서는 `backend-a-b-preferences-weather-split-2026-11-09`(B)이고, 계획 초안 W-1~W-30을 사용자와 정한 뒤 구현했다. 구현하면서 바뀐 점은 표의 "구현" 열에 적었다.

| # | 항목 | 결정 | 근거·구현 |
| --- | --- | --- | --- |
| W-1 | 공급자 | 기상청 단기예보 `VilageFcstInfoService_2.0/getVilageFcst`와 중기예보 `MidFcstInfoService/getMidLandFcst`·`getMidTa`(data.go.kr). Open-Meteo는 쓰지 않는다 | 사용자 결정(11/09). 국내 공식 예보라 사용자가 보는 날씨와 맞는다 |
| W-2 | 범위 | 오늘~3일 뒤는 단기(1시간 단위), 4~10일 뒤는 중기(4~7일 오전·오후, 8~10일 하루). 지난 날짜·10일 뒤 초과는 422 `WEATHER_NOT_AVAILABLE`. 관측(ASOS)은 붙이지 않는다 | 사용자 결정. 3일 뒤라도 단기 값이 없으면 중기로 넘어간다. 최종 검증: 중기는 06·18시 발표라 00:00~06:10(KST)에는 10일 뒤 값이 아직 없어 422다(기상청 한계, 명세에 적음) |
| W-3 | 좌표 | 위경도를 기상청 격자(LCC, 5km)로 바꾸고, 격자 밖은 422. 중기는 장소에서 가장 가까운 기온 지점 23곳 중 하나와 그 지점의 육상 구역 10곳 중 하나를 쓴다 | 지점·구역 코드는 실제 호출로 모두 확인했다. 울릉도 구역(11E00000)은 NO_DATA라 포항 쪽으로 간다 |
| W-4 | 발표 시각 | 단기: 02·05·…·23시(KST), 중기: 06·18시. 발표 10분 전까지는 직전 발표를 쓴다. NO_DATA(03)이면 한 번 더 이전 발표로 간다 | 발표 직후 API 반영 지연 |
| W-5 | 설정 | `app.weather.service-key`(`KMA_SERVICE_KEY`, 단기·중기 공용), 연결 3초·응답 5초. 키가 없어도 서버는 뜨고 요청만 503이다. 키는 Decoding(원문)·Encoding(`%`) 어느 쪽이든 한 번만 인코딩해 보낸다. 오류 로그에 URI(키 포함)를 남기지 않는다 | 사용자가 로컬 `.env`에 등록했다 |
| W-6 | 캐시 | 메모리 캐시를 (격자 또는 구역·지점) 단위로 두고, 같은 발표면 다시 부르지 않는다 | 서버 한 대. DB 테이블 없음 |
| W-7 | 장애 | 공급자 장애(HTTP 오류·업무 오류·비JSON·키 없음) 때 같은 위치의 직전 성공 값이 6시간 안이면 `stale=true`로 준다(`queriedAt`은 그 시각). 아니면 503 `PROVIDER_UNAVAILABLE` | S25 "날씨 갱신 실패" 화면용. 6시간은 B가 정한 기본값이다(발표 두 번 놓친 정도) |
| W-8 | GET 권한·입력 | ACTIVE 멤버만(아니면 404). `date`·`placeId` 필수. 장소는 그 여행의 현재 코스나 여행 저장 장소(아니면 400 `placeId`). 여행 기간이 있으면 날짜는 그 안(아니면 400 `date`). 날씨 대안 설정이 OFF여도 조회는 된다 | 일반 날씨 조회 통로로 쓰이지 않게 막는다 |
| W-9 | 응답 매핑 | `source` = `KMA_SHORT_TERM_FORECAST`/`KMA_MID_TERM_FORECAST`, `forecastAt` = 발표 시각, `hourly.at` = UTC, 확률은 POP/100. min/max는 TMN/TMX가 없으면 시간별 최소·최대, 일 확률은 시간별 최댓값, `temperatureCelsius`는 오늘만(지금과 가장 가까운 시간). 누락 값(-999·빈 값)은 null. 중기는 hourly=[] | 명세 Weather에 새 필드를 넣지 않았다 |
| W-10 | condition | `CLEAR`·`PARTLY_CLOUDY`·`CLOUDY`·`RAIN`·`RAIN_SNOW`·`SNOW`·`SHOWER`·`UNKNOWN`. 단기는 PTY가 있으면 강수 값, 없으면 SKY. 하루 값은 강수 시간이 있으면 가장 많은 강수 값. 중기는 문구('흐리고 비' 등)를 읽어 오전·오후 중 더 궂은 쪽 | |
| W-11 | 중복 요청 | `Idempotency-Key` 필수. 범위 `POST /api/v1/trips/{tripId}/weather-alternatives`, 지문 (date, placeId, expectedVersion) | 명세 §2 |
| W-12 | 판정 순서 | 키·본문 400 → 404 → (같은 키로 끝난 요청이면 처음 JobRef, 다른 본문이면 409 `IDEMPOTENCY_KEY_REUSED`) → 설정 OFF 409 `AI_FEATURE_DISABLED` → 기간 없음 422 `INSUFFICIENT_DATA`(`trip.startDate`) → 기간 밖 날짜 400 → 날씨 조회(422/503) → [여행 행 잠금] 설정 OFF 409 → version 409 → 그 일차 코스에 없는 장소 422 `INSUFFICIENT_DATA`(`placeId`) → 등록 | 구현: 초안은 version·코스 검사를 날씨보다 앞에 두었다. 같은 키 재요청이 늦은 코스 변경 때문에 실패하지 않도록, 코스 검사를 멱등 실행 안으로 옮겨 날씨 뒤가 됐다. 최종 검증: 같은 키 재요청이 자정·기상청 장애·기간 변경 때 사전 검사에 걸리지 않도록 `IdempotencyService.findCompleted`로 먼저 처음 결과를 돌려준다. 날씨 조회 중 설정을 끄면 404 대신 409가 나도록 잠금 뒤 다시 본다 |
| W-13 | 날씨 고정 | 요청 때 조회한 Weather를 입력에 넣는다. 외부 호출은 트랜잭션 밖에서 하고, 잠금 뒤 다시 검사한다. stale 날씨로도 등록할 수 있다 | 재시도해도 근거 날씨가 같다 |
| W-14 | 입력 스냅샷 | AI §6 그대로: `{date, placeId, expectedVersion, weather, dayItems, alternativePool, defaultTransportMode}`. 장소에 `category`를 싣는다. 수단은 대상 일정의 나가는 구간, 없으면 들어오는 구간, 없으면 TRANSIT. `base_version=expectedVersion` | 멤버 정보는 넣지 않는다 |
| W-15 | 후보 풀 | 여행 저장 장소와 KTO 관광정보 장소 중 대상 반경 2km 안·category 있음·그날 코스에 없는 곳. 저장 장소 먼저, 그다음 가까운 순으로 최대 30곳. SBDC 상가는 뺀다 | 구현: 저장 장소에도 반경을 걸었다(먼 저장 장소가 가장 가까운 후보로 뽑히지 않게) |
| W-16 | 영업 정보 | 모두 `{value:UNKNOWN, checkedAt:null}` | 공급자 없음. KTO 이용 시간 문장을 해석하지 않는다 |
| W-17 | 장소 분류 | `places.category varchar(200)`를 추가했다. SBDC는 `상권업종대>중>소분류명`, KTO는 관광 타입 이름(관광지·문화시설·축제공연행사·여행코스·레포츠·숙박·쇼핑·음식점). 분류가 없는 재수집은 기존 분류를 지우지 않는다. 최종 검증: 링크·캡처 추출로 저장하는 네이버 장소도 AI가 준 분류(예 `여행,명소>해수욕장`)를 `PlaceResolver`로 저장한다(`ProviderPlace.category`). 직접 만든(MANUAL) 장소는 분류가 없다 | 구현: 공개 Place DTO에는 넣지 않고 AI 입력에만 실었다. A·프론트 계약을 바꾸지 않으려고 했다. 기존 행은 재수집해야 채워진다 |
| W-18 | 좌표 인덱스 | `idx_places_location` GiST `geography(ST_MakePoint(longitude, latitude))` 식 인덱스 | 마이그레이션 `V202611091900__add_place_category.sql` |
| W-19 | 권한 | 등록·실행·완료: 요청자가 ACTIVE 멤버이고 날씨 설정이 OFF가 아니어야 한다(깨지면 CANCELLED). 조회: 그 여행의 현재 ACTIVE 멤버 누구나 | 준비물과 같다 |
| W-20 | 실패 분류 | 5xx·연결 실패·타임아웃 TEMPORARY(3회), 4xx·형식 오류 EXECUTION_FAILED | |
| W-21 | 응답 검증 | 대안 0~10개, alternativeId는 UUID이고 중복이 없어야 한다. TIME_SHIFT·PLACE_SWAP의 itemId는 대상 일정. TIME_SHIFT는 `HH:mm`이고 place가 없다. PLACE_SWAP의 place는 입력 풀 안이고 시각이 없다. INFO는 place·itemId·시각이 모두 null. activity 300자, reason 200자 이하. baseVersion은 입력과 같아야 한다 | 길이는 B가 정한 기본값이다(AI 문구 실측 20~30자). 최종 검증: AI가 activity에 장소 이름(최대 255자)을 그대로 넣어 100자에서 300자로 늘렸다 |
| W-22 | 저장 | `{alternatives, weather, baseVersion}`. place는 입력 장소에서 공개 필드만 남긴다(category 제외). weather는 입력에 고정한 값이다. 조회는 `GET /jobs/{jobId}` | |
| W-23 | 대안 없음 | `alternatives: []`도 성공이다 | S26 "대안 없음" |
| W-24 | WEATHER 요청 | `sourceWeatherJobId`·`selectedAlternativeId` 필수(INITIAL에는 금지), `excludedPlaceIds` 금지. 지문에 두 ID를 넣는다. PLACE_REMOVED는 계속 400 | |
| W-25 | WEATHER 판정 순서 | 400 → 404 → 요청자 설정 OFF 409 → 원본 작업(같은 여행·kind·삭제 안 됨, 아니면 404 `JOB_NOT_FOUND`, 성공 전 409 `PROPOSAL_NOT_READY`) → 결과에 없는 대안 400 → INFO 422 `UNSCHEDULABLE_ALTERNATIVE` → expectedVersion과 원본 baseVersion이 모두 현재 version과 같지 않으면 409 → 기간 없음 422 → 원본 날짜가 지금 대상 일정의 일차가 아니면 409 → 등록. 실행 중 요청자 설정이 OFF가 되면 CANCELLED | 다른 여행의 대안, 대안 뒤의 수동 변경·다른 적용은 여기서 걸린다. 최종 검증: 여행 기간 수정은 코스 version을 올리지 않아, 기간을 옮기면 다른 날짜 날씨로 코스가 바뀌던 것을 일차 검사로 막았다 |
| W-26 | WEATHER 입력 | INITIAL과 같은 모양. `places` = 현재 코스 장소 + PLACE_SWAP 장소, `selectedAlternative` = 저장된 대안 객체 | `StoredProposal`의 "입력 places 안" 검사와 diff 재계산을 그대로 쓴다 |
| W-27 | 결과 검증 | 기존 `StoredProposal.fromAi`를 쓰고, reason은 입력과 같아야 한다 | |
| W-28 | 적용·되돌리기 | 기존 apply·undo를 쓴다. WEATHER 제안은 작업 404 다음에 적용하는 사람의 날씨 설정이 OFF면 409 `AI_FEATURE_DISABLED`, 기간 축소 검사 다음에 제안 입력의 여행 시작일이 지금과 다르면 409 `VERSION_CONFLICT` | INITIAL 동작은 그대로. INITIAL 지문 해시는 WEATHER 필드를 null이면 빼서 배포 전과 같다 |
| W-29 | 대안 하나에 제안 여럿 | 허용한다. 하나를 적용하면 version이 올라 나머지는 409 | |
| W-30 | 여행 삭제 | 새 테이블이 없어 `TripDeleteJobHandler`는 바꾸지 않았다. 날씨 작업 행은 tombstone이다 | |

### 22-0. 검증 (2026-11-09)

- 11/10 최종 검증: `.\gradlew.bat clean build` 통과(테스트 543개, 실패 0, 건너뜀 12 = 실제 외부 연동 테스트). 날씨 쪽은 `WeatherServiceTest` 10, `HttpKmaForecastClientTest` 5, `WeatherApiTest` 11(`/v3/api-docs`의 "날씨" 태그·응답 코드, 여행 기간 이동 409, 같은 키 재요청 포함), 수집기·추출 분류 검사(`PublicPlaceImportTest`, `PublicPlaceCatalogIntegrationTest`, `PlaceFoundationTest`, `ExtractionApiTest`)다.
- 11/10 독립 리뷰 지적 8건을 반영했다(W-2·W-12·W-17·W-21·W-25·W-28 "최종 검증"). 실제 AI 코스 제안 INITIAL(`ItineraryProposalRealAiTest`)도 다시 통과해 INITIAL 동작이 그대로임을 확인했다.
- 11/10 -246(MR !175) 병합 뒤 dev(730b92e)를 받아 다시 검증했다: 전체 build 통과(테스트 563개 = -246 테스트 포함, 실패 0, 건너뜀 12). 실제 기상청, 실제 AI 계약, INITIAL 실제 AI도 다시 통과했다. 이번에는 `ai/.env`에 키를 넣어 카카오 길찾기가 실제로 호출됐고, PLACE_SWAP 사유에 실제 이동 시간(도보 8분)이 들어갔다.
- 실제 기상청(`WeatherRealProviderTest`, `KMA_SERVICE_KEY` 필요): 단기·중기 조회가 통과했다.
- 실제 AI(`WeatherAlternativeAiContractTest`, `AI_E2E_BASE_URL` 필요, 로컬 uvicorn): 기상청 응답만 "내일 09~12시 비, 그 뒤 맑음"으로 바꾸고 나머지는 실제로 돌렸다. 10:00 해수욕장 일정에 TIME_SHIFT(13:00)와 PLACE_SWAP(저장한 실내 카페)이 나왔다. TIME_SHIFT 제안 → 적용(version 3) → 되돌리기(4), 같은 대안 작업의 PLACE_SWAP 제안은 409, 다시 받은 PLACE_SWAP 제안 → 적용(5) → 되돌리기(6)를 확인했다. 대안 응답의 place에 category가 없음도 확인했다.
- 실제 기상청 + 실제 AI를 한 번에 잇는 `WeatherAlternativeRealAiTest`는 11/09·11/10 모두 후보 7개 도시에 3일 안 낮 시간 비 예보(강수확률 0.6 이상)가 없어 건너뛰었다. 비 예보가 있는 날 같은 명령으로 다시 돌리면 된다.
- 실행: `ai/`를 `INTERNAL_API_TOKEN=<값> uvicorn app.main:app --port 18765`로 띄우고 `AI_E2E_BASE_URL=http://127.0.0.1:18765`, `AI_E2E_INTERNAL_TOKEN=<값>`, `KMA_SERVICE_KEY`를 환경 변수로 준 뒤 `.\gradlew.bat test --tests "*WeatherRealProviderTest" --tests "*WeatherAlternative*Test"`.

### 22-1. A·AI·프론트에 공유할 것

| 받는 쪽 | 내용 |
| --- | --- |
| A | `places.category` 열·`idx_places_location` 인덱스 추가(공개 PlaceView에는 넣지 않음). 공공 수집기(-193)가 분류를 저장하도록 바꿨다. dev·운영 DB의 기존 행은 다시 수집해야 category가 채워진다(그 전에는 PLACE_SWAP 후보가 없다). `user_settings.weather_mode`는 읽기만 한다. 새 환경 변수 `KMA_SERVICE_KEY`(운영 배포에도 필요) |
| AI | 백엔드가 보내는 `category` 형식(SBDC `대>중>소`, KTO 타입 이름). KTO `문화시설`, SBDC `음식`이 §1.1 실내 낱말과 맞지 않아 "모름"이 된다. AI 쪽 낱말 목록에 넣어 달라고 요청했다. 중기예보(4~10일 뒤)는 `hourly: []`라 대안이 `[]`다 |
| 프론트 | 흐름(날씨 조회 → 대안 작업 → WEATHER 제안 → apply/undo), Weather 값 표, 오류 표, `INFO`에는 변경안 버튼을 두지 않는다는 점 |

남은 위험:

- 기존 places 행에 category가 없다. 재수집 전에는 장소 바꾸기 대안이 나오지 않는다.
- 직접 만든(MANUAL) 장소와 이번 배포 전에 추출된 네이버 장소는 분류가 없어, 그 장소가 대상이면 AI가 실내·실외를 몰라 대안이 `[]`다. 네이버 장소는 같은 장소를 다시 추출하면 채워진다.
- -246(추출 장소 지역 채우기, MR !175)이 먼저 병합됐다. 11/10 dev를 받으면서 -246의 `withRegion`이 지역 코드와 함께 `category`도 넘기도록 고쳤다(`ProviderPlace` 생성자는 하나만 둬서 분류가 빠지면 컴파일 오류가 난다).
- AI 실내 판단 낱말이 공공 분류 이름과 다르다(위 AI 행). 고쳐지기 전에는 KTO 문화시설이 후보에서 빠진다.
- 4~10일 뒤 날씨는 오전·오후 단위라 시간별 대안을 만들 수 없다.
- 날씨 캐시가 서버 메모리라 서버를 여러 대로 늘리면 대당 따로 기상청을 부른다. 재시작하면 stale 대체 값도 사라진다.

## 23. 회원 탈퇴 정책 (Q-11 `DELETE /me`, 2026-11-11 사용자 확정)

분담 v2(2026-11-10)에서 `DELETE /me`는 B가 마지막에 혼자 구현하기로 했다(A 작업이 모두 끝난 뒤). 결정 주체는 기획·B이고 A는 리뷰만 한다(§14와 같다). EODI-310에서 구현했다(`user.account`: `AccountDeletionService`, `AccountDeleteJobHandler`, `AccountDeleteJobAccessPolicy`, `AccountController`). 여행 나가기(§11·§15)·방장 양도·혼자 남은 여행 삭제(§14 D-2)·사진 삭제 작업·내 기록까지 삭제(OWN_RECORDS_DELETE)를 모아 쓰는 쪽으로 정했다.

| # | 질문 | 결정 | 근거 |
| --- | --- | --- | --- |
| A-1 | 언제 지우나 | 즉시. `DELETE /me`를 받으면 같은 트랜잭션에서 계정을 탈퇴 상태로 바꾸고 모든 세션을 폐기해 바로 로그인·API 사용이 막힌다. 202 `{accepted:true}`를 돌려주고 아래 정리는 서버 내부 작업(ACCOUNT_DELETE, 사용자 폴링 없음)이 한다. 유예 기간·복구는 없다 | 명세 §3 행 그대로. 복구 화면이 없고 보존 실익이 없다(§14 D-6과 같은 판단) |
| A-2 | 같은 카카오로 다시 가입 | 새 계정. 예전 계정과 자료는 돌아오지 않는다. 카카오 계정 연결(`oauth_accounts`)을 끊어 같은 카카오 ID로 새로 가입할 수 있게 한다 | 복구 없음(A-1) |
| A-3 | 참여 중인 여행 | 여행마다 나가기와 같게 처리한다. 방장이면 가장 먼저 참여한 동행에게 넘기고, 혼자 남은 여행은 여행 삭제(§14 D-2)로 처리한다 | 나가기·양도·삭제 규칙 재사용 |
| A-4 | 여행 안에 남긴 자료 | 사진과 채팅 본문은 삭제한다(나가기에서 고르던 "사진·채팅 삭제"를 항상 켠 것과 같다). 경비·분담은 정산 때문에 유지한다. 투표·코스·준비물 체크·방문 기록은 여행 기록이라 남긴다. 내 방문 평가는 삭제한다 | 나가기 정책(PRD "경비는 유지") + 개인 평가는 개인 자료(A-6) |
| A-5 | 공동 피드 | 피드는 동행에게 남기고 내 사진·평가만 뺀다 | 공동 자료는 다른 멤버의 기록이다 |
| A-6 | 개인 자료 | 모두 삭제한다: 개인 피드, 즐겨찾기(북마크), 여행 저장 장소 중 내가 저장한 것, 취향·설정, AI 장소 추출 기록·캡처 파일, 알림 | 본인만 쓰는 자료 |
| A-7 | 친구 관계 | 팔로우·팔로워 관계, 좋아요, 추천 숨김 기록을 삭제한다. 좋아요를 지우면 피드 좋아요 수도 줄어든다 | 관계는 상대가 있는 자료지만 탈퇴자와의 관계는 의미가 없다 |
| A-8 | 남은 자료에 보이는 이름 | 남는 자료(경비, 투표·코스 기록, 공동 피드·채팅방 참여 이력 등)의 작성자 표시는 "탈퇴한 사용자"로 가린다(닉네임·프로필 사진 비공개) | 공개 평가의 탈퇴 작성자 마스킹(명세 public-reviews)과 같은 규칙 |
| A-9 | 진행 중 작업 | 탈퇴자가 시작한 AI 작업·업로드는 즉시 취소한다 | 탈퇴 뒤 결과를 반영할 사람이 없다 |
| A-10 | 카카오 앱 연결 해제·법적 보존 | 카카오 쪽 앱 연결 해제(unlink)는 하지 않는다(관리자 키 설정 필요, 시연 범위 밖). 로그인 기록 등 법적 보존 항목도 두지 않는다 | 학교 시연 범위. 실서비스로 가면 다시 정한다 |

### 23-1. 구현 메모

- 정리 순서는 여행별 나가기·양도·삭제 → 여행 안 사진·채팅 → 공동 피드의 내 몫 → 개인 자료 → 관계 → 작성자 마스킹이다. 여행 삭제처럼 실행기를 멱등하게 만들고, 실패하면 §14-2처럼 다시 큐에 넣을 수 있게 한다.
- `users` 행은 tombstone으로 남긴다(경비·여행 기록의 FK와 "탈퇴한 사용자" 표시 때문). 닉네임·프로필 사진 등 개인 정보 열은 비운다.
- 탈퇴자를 가리키는 멤버십·채팅 참여는 나가기 상태(LEFT)로 남는다. 다른 사람 화면의 회원 카드는 기존 `JdbcUserCardReader`가 DEACTIVATED를 "탈퇴한 사용자"로 가린다(고칠 것 없음).
- 접수 트랜잭션에서 여행 나가기(`TripMemberService.leave`, 사진·채팅 옵션은 끄고 탈퇴 작업이 지운다)를 먼저 하고, 남는 여행의 사진을 숨기고(파일 DELETING), 내 채팅·평가 ID와 함께 ACCOUNT_DELETE를 등록한다. 작업 등록은 요청자가 ACTIVE여야 해서 계정 비활성은 마지막에 한다. 혼자 남은 여행은 여행 삭제 작업이 사진까지 지운다.
- 진행 중이던 탈퇴자의 다른 작업은 worker가 POLICY_REVOKED로 끝낸다(정리 작업은 계속). 가입 대기 회원도 탈퇴할 수 있게 `BearerFilter`가 `DELETE /me`를 허용한다.
- 명세 `DELETE /me` 행의 "보존 정책 Q-11 확정 후 활성화"를 이 결정으로 바꾼다.
