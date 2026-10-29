# 백엔드 B 후속 작업 — 준비물 체크리스트·멤버 관리

작성일: 2026-10-29 · 상태: 체크리스트·멤버 관리 병합 완료(MR !49·!50)

[B 첫 작업](backend-b-trip-basic.md)(여행 생성·조회·수정)이 끝난 뒤 A의 카카오 로그인을 기다리는 동안 진행한 B 작업이다. [분담안](../../../docs/plan/backend-first-work-split.md) §6은 이 기능들을 "첫 통합 뒤 배분"으로 두었지만, 로그인 없이 개발할 수 있고 여행 패키지 안에서 끝나는 것부터 B가 먼저 맡았다. A와 겹치는 파일(`user`·`auth` 패키지, `SecurityConfig`)은 건드리지 않는다.

이 문서는 **명세가 비워 둔 값을 구현하면서 정한 정책**을 기록한다. 기준 문서: [API 명세](../../../docs/api-spec.md) §2·§4·§6·§10, [ERD](../../../docs/erd.dbml), [백엔드 규칙](../../AGENTS.md).

## 1. 진행

| 기능 | API | Jira | 상태 |
| --- | --- | --- | --- |
| 준비물 체크리스트 | `GET/POST /trips/{tripId}/checklist`, `PATCH/DELETE /trips/{tripId}/checklist/{itemId}` | EODI-110 | 병합(MR !49) |
| 멤버 관리 | `GET /trips/{tripId}/members`, `POST /trips/{tripId}/owner-transfer`, `DELETE /trips/{tripId}/members/{memberId}` | EODI-111 | 병합(MR !50) |

검증은 B 첫 작업과 같이 테스트에서 `AuthUser` principal을 넣어 했다. 실제 카카오 토큰으로 호출하는 확인은 A 로그인 병합 뒤 통합 검증에 포함한다.

## 2. 공통 원칙

B 첫 작업의 규칙을 그대로 따른다.

- 여행 내부 자료는 먼저 `TripAccessChecker`로 ACTIVE 멤버인지 확인한다. 없는·삭제된·비참여·이탈 여행은 모두 `404 TRIP_NOT_FOUND`(P-10).
- 동시 수정은 대상 행을 `PESSIMISTIC_WRITE`로 잠근 뒤 `expectedVersion`을 비교하고, 다르면 `409 VERSION_CONFLICT`로 덮어쓰지 않는다.
- 바뀐 값이 없는 수정은 version을 올리지 않고 현재 값을 반환한다(P-8).
- 입력 오류는 `400 VALIDATION_ERROR`의 `fields`에 한 번에 담고, 권한·버전 검사보다 먼저 한다. 저장된 값과 합쳐야 판단할 수 있는 검사(여행 정보 수정에서 기간 한쪽만 바꾼 경우)만 잠금·version 확인 뒤에 한다(B 첫 작업 §7.4). 요청 본문에서 다른 자원을 가리키는 ID가 잘못되면 404가 아니라 400으로 알린다(여행지 ID P-5와 같은 방식). 경로의 ID가 가리키는 자원이 없으면 404다.

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

채팅 참여 해제는 `chat.service.ChatParticipationService.leaveTripRoom`으로 했다. 나가기(`POST /trips/{tripId}/leave`)도 이 메서드를 쓰면 된다. 이 메서드는 멤버의 채팅 참여 행이 있다고 가정하고, 없으면 자료 오류로 500을 낸다. 지금은 여행 생성(방장)만 멤버를 만들므로 문제가 없지만, **초대 수락을 만들 때 채팅 참여 행 생성(재참여면 `left_at` 해제)을 같은 트랜잭션에 넣어야 한다.**

## 5. 명세 반영

구현하면서 채운 빈칸 중 다른 사람이 알아야 하는 동작만 [API 명세](../../../docs/api-spec.md)에 반영했다. 기존 계약을 바꾸지 않는 추가라 멤버 관리 MR에 함께 넣고 A 리뷰로 확인한다. 결정 이유와 세부 규칙은 이 문서에, 필드 설명은 Swagger에 둔다.

| 명세 위치 | 반영 내용 |
| --- | --- |
| §2 404 표 | `MEMBER_NOT_FOUND`, `CHECKLIST_ITEM_NOT_FOUND` |
| §4 멤버 목록·양도·내보내기 행 | 기본 ACTIVE·참여 순, 양도 대상 400·비방장 403·알림 없음, 내보내기 대상 404·채팅 참여 해제 |
| §4 표 아래 | 양도·내보내기 `expectedVersion`은 여행 version, 404→403→409 판정 순서, 성공 후 이전 version의 여행 정보 수정 409(M-1~M-3) |
| §6 준비물 추가·삭제 행 | AI 연동 전 `sourceJobId`·`suggestionIndex` 400(C-1), 논리 삭제(C-2) |

새 오류 코드:

| 코드 | 상태 | 쓰는 곳 |
| --- | --- | --- |
| `CHECKLIST_ITEM_NOT_FOUND` | 404 | 준비물 수정·삭제 |
| `MEMBER_NOT_FOUND` | 404 | 동행 내보내기 |

`VERSION_CONFLICT`는 도메인별 enum(`TripErrorCode`, `ChecklistErrorCode`)에 같은 코드 이름으로 둔다.

## 6. A에게 알릴 것

- 체크리스트 마이그레이션 `V202610291000__create_checklist_items.sql`이 dev에 들어갔다. A의 로그인 마이그레이션 번호가 이보다 이르면 병합 전에 A 쪽 번호를 늦춘다(AGENTS.md DB 규칙). 빈 DB에서 도는 테스트로는 이 문제가 드러나지 않는다.
- 이 작업들은 분담안 §6의 후속 배분 대상이었다. 다음 배분 때 B가 먼저 가져간 범위로 반영한다.
- §5의 명세 반영 내용을 멤버 관리 MR에서 리뷰한다. 특히 양도·내보내기 뒤 여행 정보 수정이 409가 되는 점(M-2)은 프론트에도 공유한다.

## 7. 다음 후보

| 기능 | 막힌 점 |
| --- | --- |
| 경비 CRUD·정산 상태 조회 | 없음. 정산 계산 `POST /settlements`는 Q-10 전까지 `409 SETTLEMENT_POLICY_PENDING` |
| 채팅 메시지 조회·전송(REST) | `messages` 테이블 필요. 실시간 전송은 Q-13 |
| 초대 링크 | 만료·정원 Q-4 기본값 합의, 미리보기 공개 경로는 A의 `SecurityConfig` 변경 필요. 수락 시 채팅 참여도 함께 만든다(§4 끝) |
| 나가기 | 일반 이탈·방장 자동 양도는 가능. 자료 삭제 선택과 마지막 방장 이탈(여행 삭제)은 `jobs`·Q-11 필요 |
