# 백엔드 B 후속 작업 — 준비물 체크리스트·멤버 관리·경비·초대·정산·채팅·나가기·투표·코스

작성일: 2026-10-29 · 상태: 체크리스트·멤버 관리 병합 완료(MR !49·!50), 경비·정산 상태 병합 완료(MR !56, 2026-10-30), 초대 링크 병합 완료(MR !58·!62), 정산 계산 병합 완료(MR !69), 채팅 REST 병합 완료(MR !71), 기본 나가기 병합 완료(MR !76), 투표 구현(EODI-161), 나가기 내 채팅 삭제·방문 기록 구현(2026-11-04, §15·§16), 초대 링크 취소 병합 완료(MR !108, §9 I-11), 채팅 실시간 전달 구현(EODI-192, §12-1), 도메인 알림 이벤트 발행 구현(EODI-196, §17)

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
| 도메인 알림 이벤트 발행 | 새 API 없음(`GET /me/notifications`에 투표·초대 수락·코스 알림이 생김), 주기 작업 `PollReminderScheduler` | EODI-196 | 구현(§17) |

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
| C-1 | AI 제안 채택(`sourceJobId`·`suggestionIndex`) | 요청 DTO에는 두되 보내면 `400 VALIDATION_ERROR`(필드 `sourceJobId`). `source_job_id` FK는 `jobs` 테이블이 생길 때 추가 | 검증할 `jobs`·AI 제안 기능이 없다. 명세 필드를 지우지 않아 나중에 계약을 바꾸지 않는다 |
| C-2 | 삭제 방식 | `deleted_at` 논리 삭제. 목록·수정·재삭제에서 제외 | 명세 "AI 재생성 시 삭제한 항목 강제 부활 금지". AI 서버 요청의 `deletedLabels`를 여기서 얻는다 |
| C-3 | 체크한 사람 | 서버가 요청자 멤버십으로 기록, 해제하면 `checkedByMemberId`·`checkedAt` 모두 null. 요청으로 지정 불가 | 명세 "타인 ID 입력 금지". DB CHECK로 체크 여부와 두 값을 묶었다 |
| C-4 | 이미 체크된 항목을 다시 체크 | 처음 체크한 멤버·시각 유지, version 그대로 | 바뀐 값 없음(P-8) |
| C-5 | `modifiedByUser` | 이름을 고쳤을 때만 `true`. 체크는 해당하지 않음 | AI 서버가 "사용자가 고친 항목"을 구분하는 용도 |
| C-6 | 이름 길이 | 앞뒤 공백 제거 후 1~255자 | ERD `varchar(255)` |
| C-7 | 목록 정렬·페이지 | `created_at ASC, id ASC`, 페이지 없이 전체 | 여행당 공동 목록 하나. 명세에 정렬 기준이 없다 |
| C-8 | 항목 없음·다른 여행의 항목 | `404 CHECKLIST_ITEM_NOT_FOUND` | 다른 여행 경로로 항목을 고칠 수 없게 `trip_id`까지 함께 조회 |

AI 준비물 제안(`POST /trips/{tripId}/checklist-suggestions`)은 `jobs`, 날씨 조회, 코스 항목이 생긴 뒤 붙인다. AI가 붙지 않아도 직접 작성 목록은 그대로 동작한다. AI를 빼기로 하면 C-1의 요청 필드를 명세와 함께 지운다.

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

명세 §6 `POST/GET /trips/{tripId}/visits`, `DELETE /trips/{tripId}/visits/{visitId}`를 EODI-183에서 `visit` 패키지로 구현했다(테이블 `V202611041100`). 장소 범위(VS-2)와 중복 처리(VS-1)는 사용자가 정했고 나머지는 기존 경비·준비물 규칙에 맞춰 B가 정했다. 평가(reviews)·사진 방문 후보(visit_candidates)는 범위 밖이다.

| # | 질문 | 결정 | 근거 |
| --- | --- | --- | --- |
| VS-1 | 같은 장소를 여러 번 체크 | 여행·멤버·장소당 지우지 않은 방문은 하나. 다시 POST하면 새로 만들지 않고 기존 방문을 **200**으로 돌려준다(`visitedAt`도 바꾸지 않음). 처음 만들면 201. 그래서 `Idempotency-Key`를 요구하지 않는다. 부분 유일 인덱스 + 여행 행 잠금으로 동시 체크도 하나로 모인다 | 사용자 결정. '다녀옴' 체크박스처럼 동작하고 평가도 장소당 하나가 된다 |
| VS-2 | 체크할 수 있는 장소 | `places`에 있는 아무 장소. 코스에 없어도 된다. 없는 장소는 400(필드 `placeId`) | 사용자 결정. S33 화면은 코스 장소를 보여 주지만 API는 제한하지 않는다. 장소 확인은 A의 `PlaceReader` |
| VS-3 | `visitedAt` | 필수. 서버 시각 + 5분보다 미래면 400. 여행 기간과는 비교하지 않는다 | 날짜 없는 여행이 있고 기간은 날짜(시간대 없음)라 시각과 바로 비교할 수 없다. 5분은 기기 시계 차이 여유 |
| VS-4 | `evidenceType` | 필수, `MANUAL`만. `PHOTO`는 400(사진 후보 확인 기능으로만 생김) | 명세 요청 `evidenceType:MANUAL` |
| VS-5 | 판정 순서 | 생성: 입력 400 → 여행 행 잠금 후 ACTIVE 404 → 없는 장소 400 → 기존 방문 200 → 생성 201. 해제: 여행 행 잠금 후 ACTIVE 404 → 방문 404 `VISIT_NOT_FOUND` → 본인 아니면 403 | 경비(E-*)·준비물과 같은 순서. 장소 존재는 DB를 봐야 해 멤버 확인 뒤 |
| VS-6 | 목록 | `memberId` 생략 시 본인. 같은 여행 멤버십(나간 멤버 포함)만, 아니면 400(필드 `memberId`). `placeId` 필터, 정렬 `createdAt DESC, id DESC` + 공통 커서. 평가 전이라 `reviewStatus=WRITTEN`은 빈 목록, UNWRITTEN은 ALL과 같고 `reviewId`·`reviewScore`는 null | 명세 §6 "기본 본인·ALL, 같은 여행 멤버만". 요청 ID 오류는 400(M-4) |
| VS-7 | 체크 해제 | 방문한 본인만(방장도 남의 것은 403). `deleted_at` 논리 삭제, 되살리지 않고 다시 체크하면 새 행. 평가가 생기면 평가 있는 방문은 409 `REVIEW_EXISTS`(평가 기능 때) | 명세 §6. ERD `deleted_at` |
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
