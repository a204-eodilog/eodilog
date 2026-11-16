# 어디로그 API 명세 초안

- 상태: **설계 제안 v0.4**, 2026-10-27. PRD v0.6 및 사용자 변경 요청 요약을 반영한 계약 초안이며 구현 완료 명세가 아니다.
- 기준: [PRD v0.6](../_bmad-output/planning-artifacts/prds/prd-EODI-2026-10-22/prd.md) §1.1, [2026-10-27 결정 기록](design/open-decisions-2026-10-27.md), 최신 사용자 흐름과 사용자 변경 요약. 결정 충돌의 우선순위는 PRD §1.1을 따른다. C-1~C-51 원문은 미확보로 전체 대조를 주장하지 않는다.
- 데이터 모델: [erd.dbml](erd.dbml). 이 두 파일만 이번 API·ERD 산출물로 관리한다.
- **확정**은 PRD 정책, **제안 D-N**은 초안을 구체화하기 위한 선택, **미정 Q-N**은 PRD에서 남은 결정이다. 제안은 팀 합의 전 확정 요구사항으로 취급하지 않는다.

## 1. 설계 전제

| ID | 제안 | 관련 미정 |
| --- | --- | --- |
| D-1 | `/api/v1`, JSON REST, Bearer 인증, UUID 문자열 ID, UTC 날짜시각. DB는 PostgreSQL + PostGIS, 필요하면 Redis([ADR-0001](decisions/0001-database.md)) | Q-12 |
| D-2 | 계정 생성·소셜 연결은 provider 사용자 ID 기준. 이메일만 같다고 자동 병합하지 않음. OAuth 교환 방식은 별도 확정 | Q-1 |
| D-3 | 여행이 그룹의 경계다. 별도 재사용 그룹 테이블 없이 `trips`·`trip_members` 사용 | 여행별 그룹 확정 |
| D-4 | 공동 피드는 멤버 게시 시 여행당 하나 생성. 모든 멤버 게시/삭제 확정, 공동 제목/본문 편집은 ACTIVE 멤버 제안. 본인 경로의 특정 친구 숨김은 viewer ID별로 저장 | Q-3 |
| D-5 | 게시 후 공동 피드 기본 전체 공개. 특정 친구 숨김은 설정자 프로필/피드/지도 경로에만 적용하고 직접 공동 피드·다른 경로는 차단하지 않음. 비공개 계정과 결합은 미정 | Q-3 |
| D-6 | 장소는 공급자 ID로 우선 식별. 이름/좌표만 같은 후보를 자동 병합하지 않음 | Q-5 |
| D-7 | KRW 정수만, 1인 부담액 10원 올림. 여행 합산 후 1회 올림·차액은 원금 기준 받을 돈이 가장 많은 사람(Q-10, 2026-11-02 확정). 원금 분담의 1원 잔여 배분은 제안이며 올림과 구분 | Q-10 |
| D-8 | AI는 제안만, 멤버가 적용. 기준 버전 검사는 타인 편집 보존을 위한 서버 제안이며 별도의 오래된 변경안 확인 화면을 만들지 않음. 경합 처리/재계산 흐름 합의 필요 | Q-15 |
| D-9 | 여행 이름/기간/여행지와 공동 준비물은 모든 멤버 편집 확정. 준비물 체크한 멤버 기록. 그룹 저장 메모는 등록자만 편집 제안 | Q-4·15 |
| D-10 | 그룹 이탈 시 채팅 삭제는 여행 채팅방의 본인 메시지 본문 삭제, 사진 삭제는 본인 사진·파일의 삭제 작업 요청으로 해석. 구체 보존은 미정 | Q-11·13 |
| D-11 | 여행당 그룹 채팅만. 1:1 생성 API·데이터 모델 제외. 채팅 참여는 현재 여행 멤버십과 동기화 | Q-13 |
| D-12 | 좋아요 대상은 공동 피드 제안. 평가는 확인한 방문당 작성자 1개 제안, 별점 1~5 정수·타인 평가 변경 금지는 확정 | Q-5·7 |
| D-13 | 시각 마감 기본 24시간·동률 최다 모두 확정·0표는 확정 없이 마감·진행 중 후보 추가. 단일 코스·구간별 자동차/대중교통/도보·누구나 AI 적용·직후 1단계 되돌리기 | Q-6·15 |
| D-14 | 공개 항목은 서버의 공통 콘텐츠 정책으로 직렬화하며 사용자가 항목별 공개를 고르지 않음. 원금 총액/KRW·같은 여행 사진/평가·현재 코스 게시 시 스냅샷은 제안, 최종 공개 내용 미정 | Q-3 |
| D-15 | 정산 완료/미완료 상태와 완료 이벤트 제거. 계산 결과·이전 계산·재계산 필요만 제공 | 완료 표시 제외 확정 |
| D-16 | 사진 일괄 변경은 업로더 본인 자료만 한 트랜잭션으로 처리한다(2026-11-10 구현, EODI-263). 1~50장, 검증 실패 시 전체 변경 없음. 여행 이동은 양쪽 ACTIVE 멤버십 필요. 타인 편집은 제공하지 않는다 | Q-7 |
| D-17 | 사용자 전역 취향 기본 범위와 여행별 override를 분리하는 제안. 미설정은 NONE, 여행 override가 전역보다 우선 | Q-5 |
| D-18 | 별도 사진 공개 동의 절차·scope hash·동의 API 제거. 업로드/외부 분석 동의와 원본 파일 접근·삭제 검사는 유지 | 사진 동의 절차 제외 확정 |
| D-19 | S45의 AI/알림 설정을 지원. 세부 모드·기본값은 기존 API를 유지한 제안이며 PRD WD-FR-35와 Q-11·14에서 확정. 코스 적용/접근 권한 검사를 우회하지 않음 | Q-11·14 |

기술 스택·사진 용량·초대 정원·토큰 수명·추천 점수·읽음/첨부 등 미정 정책을 임의로 확정하지 않는다. 본문에서 D-N을 다시 표기하지 않아도 해당 제안은 유지된다.


## 2. 공통 계약

- 표의 URL은 `/api/v1` 이후 경로다. `id`·`userId`·`tripId` 등은 UUID 문자열이다.
- 인증은 기본 필수. **공개**는 토큰 없이 허용하는 제안 경로다. 인증된 사용자는 서버 토큰에서 식별하며 요청의 작성자 ID를 신뢰하지 않는다.
- `본인`은 자기 자료, `멤버`는 `ACTIVE` 여행 멤버, `방장`은 `trips.owner_user_id`와 일치하는 ACTIVE 멤버다.
- `작성자` 권한은 경비에서는 **등록자**이며 실제 돈을 낸 사람과 다를 수 있다. 방장에게 타인 경비 편집 권한을 주지 않는다.
- 요청은 표에 명시된 필드만 허용한다. `?`는 선택, `\|null`은 명시적 비우기 가능, `[]`는 배열이다. PATCH 생략 필드는 유지한다.
- 성공 응답은 `{ "data": ... }`, 목록은 `{ "data": [...], "page": { "nextCursor": null, "hasNext": false } }`. DELETE 성공은 `204` 본문 없음.
- 목록 공통 `cursor?:string`, `limit?:integer`(제안 기본 20, 최대 100). 정렬은 기본 `createdAt DESC,id DESC`로 고정하고 커서에 정렬 키를 포함한다. 메시지 목록은 §9의 sequence 전용 규칙, 타임라인은 시작일 DESC NULLS LAST·tripId DESC를 쓰며 커서도 해당 키를 포함한다. 지도·집계·계산 결과는 배열 필드를 가진 단일 객체다.
- `bbox`는 `minLongitude,minLatitude,maxLongitude,maxLatitude`. 위도는 -90~90, 경도는 -180~180이며 최소 경도<최대 경도·최소 위도<최대 위도를 검사한다. 여행 시작일≤종료일, `day/order` 양수, 지출 양수·분담자 중복 없는 1명 이상을 검증한다. JSON 정수는 프론트 손실을 막도록 절댓값 `9,007,199,254,740,991` 이하로 제한하는 제안이다.
- 공통 실패는 아래 구조. 모든 경로에 `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `409 CONFLICT`, `429 RATE_LIMITED`, `500 INTERNAL_ERROR`가 적용될 수 있다. 표는 업무상 주요 실패만 추가 기재한다.

```json
{"error":{"code":"VERSION_CONFLICT","message":"일정이 변경되었습니다. 다시 조회해 주세요.","fields":[],"traceId":"request-id"}}
```

| 상태 | 대표 업무 오류 |
| --- | --- |
| 400 | 입력 오류는 `VALIDATION_ERROR`. 업무 규칙 위반은 `CANNOT_FOLLOW_SELF`(자기 자신 팔로우), `INVALID_PROFILE_IMAGE`(없거나 남의·PROFILE 용도가 아닌·업로드 확인 전 파일을 프로필 사진으로 지정) |
| 404 | `TRIP_NOT_FOUND`, `FEED_NOT_FOUND`, `JOB_NOT_FOUND` — 존재를 공개할 수 없는 자료도 같은 응답. 회원은 `USER_NOT_FOUND`(없거나 탈퇴·가입 대기 회원), 팔로우 요청은 `FOLLOW_REQUEST_NOT_FOUND`(없거나 이미 처리됐거나 당사자가 아닌 요청). 여행 안의 하위 자료는 `MEMBER_NOT_FOUND`(없거나 이탈한 멤버십), `CHECKLIST_ITEM_NOT_FOUND`(없거나 삭제된 준비물), `EXPENSE_NOT_FOUND`(없거나 삭제된 경비), `SETTLEMENT_NOT_FOUND`(없거나 다른 여행의 정산 계산), `CHAT_ROOM_NOT_FOUND`(없거나 삭제된 여행·참여하지 않았거나 나간 채팅방), `POLL_NOT_FOUND`(없거나 다른 여행의 투표), `VISIT_NOT_FOUND`(없거나 체크 해제한·다른 여행의 방문), `REVIEW_NOT_FOUND`(평가를 쓰지 않았거나 지운 방문), `ASSET_NOT_FOUND`(없거나 남의·볼 수 없는 파일) |
| 409 | `VERSION_CONFLICT`, `POLL_CLOSED`, `ALREADY_MEMBER`, `ALREADY_APPLIED`(이미 적용한 AI 코스 제안 등), `PROPOSAL_NOT_READY`(진행 중·실패·취소된 AI 코스 제안 적용), `UNDO_UNAVAILABLE`(직전 AI 적용이 아니거나 그 뒤 코스가 바뀌어 되돌릴 수 없음), `TRIP_FULL`(여행 ACTIVE 멤버 정원 초과), `CLIENT_MESSAGE_ID_REUSED`(같은 clientMessageId를 다른 방·본문에 재사용), `REVIEW_EXISTS`(평가가 있는 방문의 체크 해제), `AI_FEATURE_DISABLED`(내 AI 기능 설정이 OFF인데 명시적 요청·채택), `SUGGESTION_ALREADY_ADOPTED`(이미 채택한 준비물 제안), `ASSET_NOT_PENDING`(이미 확인했거나 취소한 파일의 complete·취소), `UPLOAD_NOT_FOUND`(complete 때 저장소에 아직 파일이 없음) |
| 410 | `INVITATION_EXPIRED`·`INVITATION_REVOKED` — 사용자가 제시한 유효 형식의 초대 토큰 검증 결과. 새 링크 발급이나 취소로 무효가 된 링크만 `INVITATION_REVOKED`, 없는 토큰·기간 지남·삭제된 여행·초대자 이탈은 `INVITATION_EXPIRED` |
| 422 | `INSUFFICIENT_DATA`, `CURRENCY_MISMATCH`, `INVALID_PARTICIPANTS`, `UNSUPPORTED_INPUT`, `INVALID_ROUTE_LEGS`(코스 구간이 빠지거나 겹치거나 인접하지 않음), `INPUT_LIMIT_EXCEEDED`(캡처 11장 이상·사진 51장 이상), `UPLOAD_MISMATCH`(올린 파일의 크기·실제 형식이 업로드 요청과 다름), `WEATHER_NOT_AVAILABLE`(지난 날짜·10일 뒤를 넘는 날짜·국내 예보 범위 밖 장소의 날씨), `UNSCHEDULABLE_ALTERNATIVE`(INFO 날씨 대안으로 코스 제안 요청) |
| 503 | `PROVIDER_UNAVAILABLE` — 지도·날씨·장소 공급자 장애. 결과 없음과 구분 |

동시 편집 대상인 일정·투표·경비·정산·설정·피드 편집에는 `expectedVersion:integer`를 사용한다. 다른 버전을 덮어쓰지 않고 `409`를 반환한다. 공동 피드 편집과 개인 숨김 변경에도 버전 조건을 적용한다. 여행 생성·경비 생성·비동기 작업 생성·정산 계산·사진 업로드 배치 생성 POST에는 `Idempotency-Key` 헤더가 필수라는 제안이며 `(사용자, 실제 요청 경로, 키)`를 묶는다. 채팅 메시지 전송은 본문의 `clientMessageId`가 이 역할을 하므로 헤더를 요구하지 않는다(보내도 쓰지 않음, §9, 2026-11-02). 같은 키/같은 본문은 최초 결과, 다른 본문은 409. 여행 안 자료를 만드는 POST(경비 등록 등)는 최초 결과를 다시 줄 때도 현재 멤버 권한을 다시 검사한다(등록 뒤 이탈·내보내기·여행 삭제면 404). 다른 POST에는 이 헤더를 필수로 요구하지 않는다. 유효기간은 Q-12에서 확정한다.

## 3. 인증·프로필·팔로우·설정

근거: WD-FR-01~03·08·35. 인증 세부는 공급자 공식 흐름에 맞춰 별도 확정하며 URL에 제공자 토큰을 싣지 않는다.

2026-10-28 카카오·Expo 구현 결정: 최초의 유효 카카오 닉네임으로 가입 완료한다. 미제공·빈 값·기본 닉네임·50자 초과는 `nickname=""`, `profileCompleted=false`로 저장한다. 대기 토큰은 GET/PATCH `/me`와 갱신·현재 세션 로그아웃을 허용하고 다른 서비스 요청은 `403 PROFILE_INCOMPLETE`다. PATCH 완료 뒤에는 같은 토큰에서도 DB의 현재 상태로 접근을 판단한다. 재로그인은 이름을 덮어쓰지 않는다. 웹 쿠키와 NAVER는 후속이다. [환경 설정·Swagger 수동 호출 가이드](design/backend-auth-integration.md)를 따른다. 갱신·현재 세션 로그아웃은 구현했다. 프로필 수정·회원 검색·팔로우·친구 추천은 2026-11-10 구현했다(아래 표와 「회원·팔로우 구현 결정」).

| Method | URL | 권한 | 요청 | 성공 data / 상태 | 주요 규칙 |
| --- | --- | --- | --- | --- | --- |
| POST | `/auth/oauth/{provider}/authorization-requests` | 공개 | `{redirectUri:string,codeChallenge:string}` | `OAuthAuthorization` / 201 | 현재 KAKAO만 구현. Expo 외부 브라우저 흐름, S256 challenge 필수. 허용된 redirect만 사용, verifier 소유에 바인딩된 state 발급 |
| POST | `/auth/oauth/{provider}/sessions` | 공개 | `OAuthExchange` | `Session` / 200 | 현재 KAKAO만 구현(NAVER 거부). 코드·state·redirect·만료·verifier 검증, 인가 컨텍스트 일회 소비. 제공자 오류는 503 PROVIDER_UNAVAILABLE |
| POST | `/auth/sessions/refresh` | 갱신 토큰 | `{refreshToken:string}` | `Session` / 200 | Bearer 불필요(만료 헤더도 무시). 이전 access·refresh 즉시 폐기, 새 refresh는 갱신 시점부터 14일. 재사용은 해당 로그인 후속 세션까지 폐기 후 401, 다른 기기 유지. 앱 갱신 직렬화, isNewUser=false, 원문 DB 저장 금지 |
| DELETE | `/auth/session` | 로그인 | 없음 | 204 | 유효 Bearer의 현재 세션 폐기. 다른 기기 유지, 가입 대기 허용 |
| GET | `/me` | 본인 | 없음 | `MyProfile` / 200 | 비공개 연령·동의 정보는 본인에게만 |
| PATCH | `/me` | 본인·가입 대기 허용 | `ProfilePatch` | `MyProfile` / 200 | 보낸 필드만 바꾼다. nickname은 공백 제거 후 1~50자이며 저장하면 가입 완료. 가입 대기 사용자는 nickname 필수. 빈 본문·표에 없는 필드·profileImageAssetId·ageBand 외의 null은 400. 쓸 수 없는 사진은 400 `INVALID_PROFILE_IMAGE`. 한 필드라도 실패하면 아무것도 저장하지 않는다. 공개 범위 전환은 아래 결정 |
| DELETE | `/me` | 본인 | 없음 | `{accepted:true}` / 202 | 접수 후 계정 비활성화·세션 폐기, 별도 작업 폴링 없음. **Q-11 2026-11-11 확정·구현(EODI-310)**: 가입 대기 회원도 탈퇴할 수 있다. 즉시 탈퇴·복구 없음(같은 카카오로 재가입하면 새 계정), 참여 여행은 나가기와 같게(방장 양도, 혼자면 여행 삭제), 여행 안 사진·채팅 본문 삭제·경비 유지·투표·코스 기록 유지, 공동 피드는 내 사진·평가만 제외, 개인 피드·즐겨찾기·취향·설정·추출 기록·알림·팔로우·좋아요 삭제, 남는 자료의 작성자는 "탈퇴한 사용자"로 가림, 진행 중 작업 취소. 상세는 백엔드 계획 §23 |
| GET | `/users` | 로그인 | `query:string`(공백 제거 후 1~50자) + 페이지(limit 1~50, 기본 20) | `UserCard[]` / 200 | 닉네임 부분 일치만(대소문자 무시, `%`·`_`는 문자 그대로), 프로필 링크/ID 검색은 제공하지 않음. 완전 일치 먼저, 그다음 닉네임·id 순 전용 커서. 본인·탈퇴·가입 대기 회원 제외, PRIVATE 계정도 카드는 노출(콘텐츠 열람 허용과 별개) |
| GET | `/users/{userId}` | 로그인 | 없음 | `PublicProfile` / 200 | 연령·동의·이메일 반환 금지. 본인 조회 가능. 없는·탈퇴·가입 대기 회원은 404 `USER_NOT_FOUND` |
| GET | `/me/following` | 본인 | 페이지(limit 1~100, 기본 20) | `Follow[]` / 200 | 내가 팔로우한 ACCEPTED 방향만, acceptedAt DESC·id DESC. 탈퇴·가입 대기 상대 제외 |
| GET | `/me/followers` | 본인 | 페이지(limit 1~100, 기본 20) | `Follow[]` / 200 | 나를 팔로우한 ACCEPTED 방향만, acceptedAt DESC·id DESC. 탈퇴·가입 대기 상대 제외 |
| GET | `/me/follow-requests` | 본인 | `direction:RECEIVED\|SENT`(필수) + 페이지(limit 1~100, 기본 20) | `Follow[]` / 200 | REQUESTED만, requestedAt DESC·id DESC. RECEIVED는 받은 요청, SENT는 보낸 요청. 탈퇴·가입 대기 상대 제외 |
| POST | `/users/{userId}/follow` | 로그인 | 없음 | `Follow` / 200 | 대상 PUBLIC이면 ACCEPTED, PRIVATE면 REQUESTED(대상에게 FOLLOW_REQUESTED). 같은 방향이 있으면 그 관계를 그대로 반환(방향별 멱등, 동시 요청도 한 건). 자기 자신 400 `CANNOT_FOLLOW_SELF`, 없는·탈퇴·가입 대기 대상 404 `USER_NOT_FOUND` |
| POST | `/me/follow-requests/{requestId}/accept` | 대상 계정 본인 | 없음 | `Follow` / 200 | REQUESTED→ACCEPTED(요청자에게 FOLLOW_ACCEPTED), 이미 수락한 요청은 그대로 반환. 반대 방향 생성 없음. 없는 요청·내가 받은 요청이 아님·요청자 탈퇴는 404 `FOLLOW_REQUEST_NOT_FOUND` |
| DELETE | `/me/follow-requests/{requestId}` | 당사자 | 없음 | 204 | 발신자 취소·수신자 거절. REQUESTED만 지우며 ACCEPTED·당사자 아님·없음은 404 `FOLLOW_REQUEST_NOT_FOUND` |
| DELETE | `/users/{userId}/follow` | 팔로우 발신자 | 없음 | 204 | 해당 방향 언팔로우(대기 요청 취소 포함), 공동 여행 유지. 관계가 없어도 204 |
| DELETE | `/me/followers/{userId}` | 대상 계정 본인 | 없음 | 204 | 본인 팔로워(ACCEPTED) 제거, 반대 방향 유지. 관계가 없어도 204 |
| GET | `/me/follow-suggestions` | 본인 | 페이지(limit 1~50, 기본 20) | `FollowSuggestion[]` / 200 | 공개 가능한 추천 이유만. 후보·정렬은 아래 결정 |
| PUT | `/me/follow-suggestion-dismissals/{userId}` | 본인 | 없음 | 204 | 추천 숨김은 영구 재추천 제외, 만료 없음. 다시 숨겨도 204. 검색·팔로우·기존 관계는 막지 않음. 자기 자신 400, 없는·탈퇴·가입 대기 회원 404 `USER_NOT_FOUND` |
| GET | `/me/preferences` | 본인 | 없음 | `Preferences` / 200 | 직접 입력·추론 분리 |
| PUT | `/me/preferences` | 본인 | `PreferencesWrite` | `Preferences` / 200 | 직접 입력 전체 교체, 추론 허용과 공유 범위 별도 |
| PUT | `/trips/{tripId}/members/me/preference-consent` | 멤버 | `{scope:EXPLICIT_ONLY\|EXPLICIT_AND_INFERRED\|NONE\|INHERIT}` | `{scope:string,effectiveScope:string}` / 200 | D-17. 나만 보기는 NONE, 추론 허용을 대신하지 않음 |
| DELETE | `/me/preferences/inferred/{key}` | 본인 | 없음 | 204 | 추론 항목 개별 제거·재추론 거부 표식. 재추론 기간 Q-5 |
| GET | `/me/settings` | 본인 | 없음 | `UserSettings` / 200 | 가입 완료 사용자만 접근. 첫 조회에서 기본 설정 행을 생성하고 version 1 반환 |
| PATCH | `/me/settings` | 본인 | `SettingsPatch` | `UserSettings` / 200 | 가입 완료 사용자만 접근. expectedVersion 불일치 시 409 VERSION_CONFLICT 및 전체 이전 설정 유지. 제공한 필드만 원자적으로 저장하고 값이 실제 바뀔 때만 version 증가 |

### 회원·팔로우 구현 결정 (2026-11-10)

- **계정 공개 범위(Q-2 확정)**: PRIVATE→PUBLIC 전환 시 받은 REQUESTED를 같은 트랜잭션에서 모두 ACCEPTED로 바꾸고 알림은 보내지 않는다. PUBLIC→PRIVATE 전환은 기존 ACCEPTED·REQUESTED를 그대로 둔다. 회원 행 잠금으로 전환과 새 팔로우 요청의 순서를 맞춘다. 차단 기능은 제공하지 않는다(미정).
- **연령대(Q-1 확정)**: `AgeBand` = TEENS/TWENTIES/THIRTIES/FORTIES/FIFTIES/SIXTIES_PLUS 영문 코드. 화면 문구는 앱이 붙이고 본인 응답(MyProfile)에만 나간다.
- **프로필 사진**: `profileImageAssetId`는 본인이 올린 READY 상태 PROFILE 파일만 받는다. 응답 `profileImageUrl`은 `/assets/{assetId}/download`(`/api/v1` 뒤 경로, READY PROFILE은 로그인 사용자 누구나 다운로드)이며 탈퇴 회원 카드는 null이다. 가입 대기 토큰은 `/assets`를 쓸 수 없으므로 첫 가입은 닉네임 저장 → 업로드 → 사진 PATCH 순서다.
- **알림**: 비공개 계정에 요청하면 대상에게 `FOLLOW_REQUESTED`, 수락하면 요청자에게 `FOLLOW_ACCEPTED`. 받는 사람의 `notifications.followRequests`가 false면 둘 다 만들지 않는다. 공개 계정 즉시 팔로우와 공개 전환 일괄 수락은 알리지 않는다.
- **친구 추천**: 점수 모델 없이 두 이유만 쓴다. `CO_TRAVELER`는 같은 여행을 함께한 사람(양쪽 ACTIVE·LEFT 멤버십, 삭제된 여행·REMOVED 제외, count=함께한 여행 수), `FOLLOWS_YOU`는 나를 ACCEPTED로 팔로우하는데 내가 팔로우하지 않은 사람이다. 둘 다 해당하면 CO_TRAVELER로 한 번만 나온다. 본인·탈퇴·가입 대기·내가 팔로우하거나 요청 중인 사람·숨긴 사람은 제외한다. 정렬은 CO_TRAVELER(여행 수 많은 순) → FOLLOWS_YOU → id이며 전용 커서를 쓴다. 공개 취향 일치·지인의 지인 추천은 제공하지 않는다(비공개 관계 노출 방지).
- **다른 도메인의 열람 판정**: 회원 콘텐츠 경로(프로필 피드·지도·타임라인)는 본인, ACTIVE·가입 완료 PUBLIC 회원, PRIVATE 회원 중 viewer→member가 ACCEPTED인 경우만 허용한다(내부 `FollowAccess`). REQUESTED와 반대 방향 팔로우는 허용 근거가 아니다. 최소 UserCard 노출은 이 판정과 별개다.

기능 설정은 자동 작업 시작과 결과 반영 모두에 적용한다. OFF면 새 자동 작업을 시작하지 않고, 명시적 사용자 재시도는 409 AI_FEATURE_DISABLED 제안으로 구분한다. AUTO는 허용된 범위의 결과만 반영하고, CONFIRM은 저장 전 사용자의 적용/확인 동작을 요구한다. 추출 후보 저장은 일반 장소/북마크 API, 준비물 채택은 sourceJobId·suggestionIndex를 담은 POST, 사진 분류는 apply, 방문은 후보 confirm으로 연결한다. 자동 적용할 판정 기준이 미합의인 기능은 기준 확정 전 AUTO 실행을 비활성화한다. 날씨는 항상 제안만이며 코스 변경안은 사용자 적용 시 서버가 기준 버전을 검사한다. 진행 중 설정 변경의 취소/유지 세부는 Q-11이다. 구체 모드/기본값은 D-19 제안이다.

## 4. 여행·멤버·초대

근거: WD-FR-04·32. 그룹과 여행을 이중 생성하지 않는다.

2026-10-28 사용자 확정: 여행지 개수는 서비스 정책상 상한 없이 추가할 수 있다. 중복·없는 지역 ID는 거부한다. 탈퇴한 회원의 공개 `UserCard.nickname`은 `탈퇴한 사용자`로 표시하며 원본 개인정보 삭제·보관 정책과 구분한다. 로그인 토큰 수명은 access 1시간·refresh 14일이며 새 세션에 적용한다.

| Method | URL | 권한 | 요청 | 성공 data / 상태 | 주요 규칙 |
| --- | --- | --- | --- | --- | --- |
| GET | `/me/trips` | 본인 | `status?:PLANNING\|ONGOING\|COMPLETED` + 페이지 | `Trip[]` / 200 | 활성 멤버십 기준 |
| POST | `/trips` | 로그인 | `{title:string,startDate?:date,endDate?:date,destinationRegionIds?:id[]}` | `Trip` / 201 | 이름 필수·KRW 고정. 여행·방장·그룹 채팅방·빈 단일 코스 원자 생성. 피드는 여기서 만들지 않음 |
| GET | `/trips/{tripId}` | 멤버 | 없음 | `Trip` / 200 | 공개 피드와 별도 내부 조회 |
| PATCH | `/trips/{tripId}` | 멤버 | `{expectedVersion:integer,title?:string,startDate?:date\|null,endDate?:date\|null,destinationRegionIds?:id[]}` | `Trip` / 200 | 모든 멤버 수정·변경 알림, 직접 목적지로 지역 투표 생략. status/currency 쓰기 없음 |
| DELETE | `/trips/{tripId}` | 방장 | `expectedVersion:integer`(query) | `JobRef` / 202 | **Q-11 2026-11-03 확정**: 요청 트랜잭션에서 논리 삭제(`deleted_at`)해 모든 멤버에게 즉시 404(내 여행·채팅방 목록에서도 제외)가 되고, 같은 트랜잭션에 등록한 `TRIP_DELETE` 작업이 투표·코스·경비·정산·채팅·초대·준비물·멤버 행을 물리 삭제한다. 여행 행만 tombstone으로 남긴다(jobs FK·404 유지). 되돌리기·보존 기간 없음. 방장 아니면 403, version 다르면 409, 누락 400. 멱등키 대상 아님(재요청은 404). 작업 조회는 요청한 방장만. 사진 파일 삭제는 사진 기능 때 같은 작업의 execute에 추가 |
| GET | `/trips/{tripId}/members` | 멤버 | `includeInactive?:boolean`(query, 기본 false) | `{members:Member[]}` / 200 | 기본 ACTIVE만 joinOrder 순. `includeInactive=true`면 정산에 남는 이탈(LEFT·REMOVED) 멤버도 포함 |
| POST | `/trips/{tripId}/invitations` | 멤버 | 없음 | `InvitationSecret` / 201 | 만료는 생성 후 7일(Q-4, 2026-10-30 결정). 링크별 사용 횟수 없음. 새로 만들면 같은 여행의 이전 링크는 모두 무효(여행당 쓸 수 있는 링크 하나), 화면 진입마다 호출하지 않음. 토큰 원문 1회 반환, 서버는 해시만 보관 |
| DELETE | `/trips/{tripId}/invitations` | 멤버 | 없음 | 204 | 새 링크 없이 이 여행에서 지금 쓸 수 있는 링크를 무효화(여행 단위, 링크 ID 없음). 쓸 수 있는 링크가 없으면(이미 취소·만료·발급 이력 없음) 바뀌는 것 없이 204. 취소된 링크는 410 `INVITATION_REVOKED`(이미 ACTIVE 멤버는 미리보기·수락 200 유지). 여행 version 변화·멱등키·알림 없음 |
| GET | `/invitations/{token}` | 공개(D-1) | 없음 | `InvitationPreview` / 200 | 여행명·기간·초대한 사람만, 내부 명단/경비 반환 안 함. 형식이 틀린 토큰 404, 링크가 쓸 수 없으면 410(사유는 §2). 로그인한 사람이 이미 ACTIVE 멤버면 링크가 만료·무효여도 200, `alreadyMember=true`. Authorization 헤더를 보내면 검증(잘못된 토큰 401, 가입 대기 403) |
| POST | `/invitations/{token}/accept` | 로그인 | 없음 | `Trip` / 200 | 유효 링크로 관계 없이 참여. 이미 ACTIVE 멤버면 링크가 만료·무효여도 바뀌는 것 없이 같은 여행 반환. 그 밖에는 새 발급·취소로 무효(410 `INVITATION_REVOKED`)·만료·초대자 이탈(410 `INVITATION_EXPIRED`) 검사 후, 정원은 여행당 ACTIVE 멤버 20명(방장 포함, Q-4)으로 넘으면 409 `TRIP_FULL`. 이탈 멤버는 기존 멤버십으로 재참여하고 joinOrder를 새로 받음. 채팅 참여와 함께 처리하고 여행 version 증가 |
| POST | `/trips/{tripId}/owner-transfer` | 방장 | `{targetMemberId:id,expectedVersion:integer}` | `Trip` / 200 | 같은 여행의 다른 ACTIVE 멤버만, 아니면 400. 방장 아닌 멤버 403. 알림 없음 |
| POST | `/trips/{tripId}/leave` | 멤버 | `{deleteOwnPhotos:boolean,deleteOwnMessages:boolean,expectedVersion:integer}` | `LeaveResult` / 200(삭제 작업이 있으면 202) | 일반 이탈은 경비 유지·방장 자동 양도. **1단계(2026-11-02 확정)**: 경비·사진·메시지를 남기는 기본 나가기. 성공은 200 + `LeaveResult{tripId,tripDeleted:false,newOwnerMemberId(방장이 나갔을 때만, 아니면 null),cleanupJobId:null,status:LEFT}`. **내 채팅 삭제(2026-11-04 확정)**: `deleteOwnMessages=true`면 나가는 순간 이 여행 채팅방의 본인 TEXT 메시지 ID를 고정해 LEAVE_CLEANUP 작업을 등록하고 202 + `LeaveResult{tripDeleted:false,status:LEFT,cleanupJobId}`. 작업은 본문만 지운다(`text:null`·`deletedAt`, 순번 유지). 지울 메시지가 없으면 작업 없이 200. `deleteOwnPhotos=true`는 사진 기능 전까지 400 `VALIDATION_ERROR`(필드 deleteOwnPhotos). **혼자 남은 사람의 나가기(2026-11-03 확정)**: 여행 삭제와 같게 처리(위 DELETE 행)하고 202 + `LeaveResult{tripDeleted:true,newOwnerMemberId:null,cleanupJobId:TRIP_DELETE 작업 ID,status:TRIP_DELETED}`. 멤버십은 LEFT로 남겼다가 작업이 지운다. 여행 version 다르면 409, 성공 시 version 1 증가. 멱등키 대상이 아니므로 성공 뒤 재시도는 404 |
| DELETE | `/trips/{tripId}/members/{memberId}` | 방장 | `expectedVersion:integer`(query) | 204 | 본인·방장 내보내기 금지(400). 없거나 이탈한 대상 404 `MEMBER_NOT_FOUND`. 멤버십 REMOVED·채팅 참여 해제를 한 트랜잭션으로. 강제 이탈 시 타인 자료 삭제 여부는 Q-11 |

2026-10-30 사용자 확정: 여행 정원은 방장 포함 ACTIVE 멤버 최대 20명이다. 이탈·내보내기로 빈자리가 생기면 다시 참여할 수 있다. 초대 링크는 발급 시각부터 7일(168시간) 유효하며, 만료 시각부터 참여할 수 없다. ACTIVE 멤버 누구나 재발급할 수 있고 재발급하면 이전 링크는 즉시 무효화한다. 링크 만료·재발급은 기존 참여자에게 영향을 주지 않는다. 수락 시 정원 확인과 참여 반영을 원자적으로 처리해 동시 수락으로 20명을 초과하지 않게 한다. 만료는 410 INVITATION_EXPIRED, 정원 초과는 409 TRIP_FULL이다. 재발급 시 이전 링크 무효화는 EODI-128에서 반영했다(여행 행 잠금으로 동시 발급에도 쓸 수 있는 링크는 하나, 무효가 된 링크는 410 INVITATION_REVOKED). 새 링크 없이 링크만 끊는 취소(`DELETE /trips/{tripId}/invitations`)는 EODI-187에서 추가했다. 기존 ACTIVE 멤버는 만료·무효 링크로 열어도 미리보기 `alreadyMember=true`, 수락은 같은 여행을 받는다.

방장 양도·멤버 내보내기의 `expectedVersion`은 여행의 `version`(`Trip.version`)이다(이탈·여행 삭제도 같은 version을 쓰는 제안). 입력 형식 400을 먼저 검사한 뒤 비참여자 404, 방장 전용 동작을 멤버가 요청하면 403, 버전이 다르면 409, 끝으로 대상(양도 대상이 동행이 아니거나 이미 방장이면 400, 내보낼 멤버가 없거나 이탈했으면 404 `MEMBER_NOT_FOUND`, 방장 자신이면 400) 순으로 판정한다. 양도·내보내기가 성공하면 `Trip`의 `ownerMemberId`·`members`가 바뀌므로 여행 version을 올리고, 그 전 version으로 보낸 여행 정보 수정(PATCH)은 409가 된다.

`leave`에서 방장 다음 순서는 ACTIVE 멤버의 joinOrder 오름차순이다. 양도·멤버 비활성화·본인 노출 경로 제외·채팅 참여 해제를 한 트랜잭션으로 처리한다. 마지막 방장의 이탈은 여행 삭제와 같은 처리이며 삭제 확인 안내 후 같은 TRIP_DELETE 작업을 생성한다. 일반 이탈의 경비 유지 규칙을 전체 여행 삭제의 영구 보존 규칙으로 해석하지 않는다. 이탈자의 공동 피드 표시 경로만 제거하고 공동 피드·그룹 저장·경비는 유지한다. 사진 삭제 선택은 공동 피드의 사진·표지·파일 접근에 즉시 반영한다.

이탈 트랜잭션 안에서 삭제를 선택한 **당시 사진 ID·메시지 ID와 이탈 시각을 고정**해 정리 작업에 저장한다. worker가 실행 시점의 `memberId`만으로 삭제 대상을 다시 검색하면 안 된다. 재가입 후 생성한 자료는 대상에 포함하지 않는다. 삭제 대상은 승인 당시 범위를 확대하지 않으며 작업 재시도는 같은 대상에 대해 멱등이다. 일반 AI 작업은 현재 멤버십·동의를 재검사하지만, 승인된 삭제 작업은 고정된 대상에 대한 정리를 계속한다.

## 5. 장소·저장·추출·추천

근거: WD-FR-05~11·31. AI 서버의 내부 API는 별도 담당 범위이며 여기에는 앱→서비스 API만 정의한다.

| Method | URL | 권한 | 요청 | 성공 data / 상태 | 주요 규칙 |
| --- | --- | --- | --- | --- | --- |
| GET | `/places` | 로그인 | `query:string`(strip 후 1~200자),`near?:string`(`위도,경도`),`regionId?:id` + 페이지 | `Place[]` / 200 | 공급자 결과를 provider/공급자 ID로 로컬 upsert한 뒤 로컬 UUID만 반환. 이름 부분 일치, 정렬·커서는 아래 「장소 검색 정렬」 |
| GET | `/places/{placeId}` | 로그인 | 없음 | `Place` / 200 | 일반 장소 정보, 원본 비공개 자료 제외 |
| POST | `/places` | 로그인 | `{name:string,address?:string,latitude:number,longitude:number,regionId?:id}` | `Place` / 201 | 수동 보정 장소, 공급자 장소로 임의 확정하지 않음 |
| GET | `/regions` | 로그인·가입 완료 | `query:string` 필수(strip 후1~200자), `cursor`, `limit` 기본20/1~100 | `Region[]` + page / 200 | 전체 지역명 문자 그대로 부분 검색(%/_ 포함). code ASC,id ASC 전용 Base64URL 커서(query 바인딩); 잘못된 입력/커서400 VALIDATION_ERROR |
| GET | `/me/bookmarks` | 본인 | `regionId?:id` + 페이지 | `Bookmark[]` / 200 | 원본 피드 소실/권한 상실 시 이름·위치·내 메모만, sourceFeedId=null·원본 본문/사진/평가 미반환 |
| PUT | `/me/bookmarks/{placeId}` | 본인 | `{memo?:string,sourceFeedId?:id}` | `Bookmark` / 200 | 사용자·장소 유일, 원본 피드 열람 가능 여부 확인 |
| PATCH | `/me/bookmarks/{placeId}` | 본인 | `{memo:string}` | `Bookmark` / 200 | 장소 원본 수정 아님 |
| DELETE | `/me/bookmarks/{placeId}` | 본인 | 없음 | 204 | 그룹 저장은 독립 유지 |
| GET | `/trips/{tripId}/saved-places` | 멤버 | `filter?:ALL\|OVERLAP,memberId?:id,bbox?:string` + 페이지 | `SavedPlacePage` / 200 | 필터 전역 총계·멤버별 저장자 반환. 일반 페이지 형식 대신 DTO 사용 |
| PUT | `/trips/{tripId}/saved-places/{placeId}/me` | 멤버 | `{memo?:string}` | `SavedPlace` / 200 | 개인 보관함 전체를 자동 복사하지 않음 |
| PATCH | `/trips/{tripId}/saved-places/{placeId}/me` | 본인 저장자 | `{memo:string}` | `SavedPlace` / 200 | 타인 메모 변경 권한 Q-4 |
| DELETE | `/trips/{tripId}/saved-places/{placeId}/me` | 본인 저장자 | 없음 | 204 | 내 저장 기여만 삭제, 타인 저장 보존 |
| POST | `/extractions` | 본인 | `{url?:string,captureAssetIds?:id[],memo?:string}` | `JobRef` / 202 | `Idempotency-Key` 필수. URL/캡처 하나 이상(없으면 400 `url`·`captureAssetIds`), 캡처 최대 10장(11장 이상 422 INPUT_LIMIT_EXCEEDED)·중복 불가, 내가 올려 complete한 READY CAPTURE(JPG/PNG)만(남의·없는·PENDING·다른 용도 파일은 400 `captureAssetIds[i]`). url은 http(s)·계정 정보 없음·포트 생략/80/443·2048자 이하, memo 500자 이하(2026-11-09). 설정 OFF면 409 `AI_FEATURE_DISABLED`. 지원 사이트 판정은 하지 않음(Q-5) |
| GET | `/extractions/{jobId}` | 작업 소유자 | 없음 | `ExtractionResult` / 200 | 후보는 아직 저장·방문 아님. 진행 중·실패·취소면 resultStatus=null·candidates=[](사유는 job.error). 남의·지운·다른 kind 작업은 404 `JOB_NOT_FOUND` |
| DELETE | `/extractions/{jobId}` | 작업 소유자 | 없음 | 204 | 입력·후보 제거/작업 취소(진행 중이면 CANCELLED, 늦게 온 결과 저장 안 함). 다른 살아 있는 추출이 쓰지 않는 캡처 파일은 삭제. 저장한 일반 장소·북마크와 분리. 다시 보내면 404 |
| POST | `/trips/{tripId}/recommendations` | 멤버 | `{regionId?:id}` + `Idempotency-Key` | `JobRef` / 202 | 허용한 그룹 저장·취향만 스냅샷. 2026-11-11 구현(EODI-284): 판정 순서 키·본문 400 → 404 → 없는 regionId 400(`regionId`) → 등록. 등록 때 여행(기간·여행지), ACTIVE 멤버별로 이 여행에서 쓸 수 있는 취향(여행 범위 INHERIT면 전역 범위, 추론 불허면 추론 제외, NONE이면 제외), 그룹 즐겨찾기(나간 멤버 저장 포함, 담은 사람 많은 순 최대 200곳, 메모 제외), 관련 지역을 고정한다. 작업이 실행될 때 후보 장소를 골라 더해 AI 서버 `POST /ai/v1/trip-recommendations`(AI spec §4)로 보낸다(전국 장소 조회가 등록 요청을 붙잡지 않게). 후보 장소는 regionId 또는 여행지(없으면 즐겨찾기 장소의 지역)의 하위 지역까지에서 분류가 있고 이름·분류에 멤버 취향 낱말이 들어간 곳을 취향마다 최대 20곳, 합쳐 최대 100곳(관광공사 자료 먼저, 즐겨찾기 장소 제외). 자료 부족(즐겨찾기 3곳·취향 멤버 2명 미만)은 막지 않고 결과의 insufficientData로 알린다 |
| GET | `/trips/{tripId}/recommendations/{jobId}` | 멤버 | 없음 | `RecommendationResult` / 200 | 요청 여행과 작업 귀속 일치. 2026-11-11 구현: 현재 ACTIVE 멤버 누구나. 다른 여행·다른 종류·볼 수 없는 작업은 404 `JOB_NOT_FOUND`. 끝나기 전·실패·취소면 items=[]·basis 0·insufficientData=false(사유는 job.error). 장소·지역은 보낸 후보·지역 안의 것만 받고 공개 Place·Region으로 다시 읽어 준다(AI가 준 category 등은 내보내지 않음) |
| GET | `/me/discovery-recommendations` | 본인 | 페이지(`cursor?`,`limit` 1~100 기본 20) | `DiscoveryItem[]` / 200 | 2026-11-10 구현(EODI-265). 요청자에게 허용된(멤버 경로 판정: 본인·PUBLIC·ACCEPTED PRIVATE, 해당 멤버 숨김 제외) 최근 30일(Asia/Seoul 오늘 포함) 게시 피드를 좋아요 수 DESC·게시시각 DESC·id DESC로, 장소는 그 피드들의 게시 스냅샷에 등장한 피드 수 DESC로. 요청자가 ACTIVE 멤버인 여행의 피드 제외. FEED·PLACE를 순위대로 번갈아 반환하고 한쪽이 끝나면 나머지만. 커서는 첫 페이지의 30일 기간을 고정(좋아요 변화로 순서는 바뀔 수 있음). reason: "좋아요 N개"/"최근 30일 새 여행"/"최근 30일 여행 N개에 등장" |
| GET | `/trends/regions` | 로그인 | `from:date,to:date`(포함, 최대 366일, 연도 1900~9999) + 페이지(`limit` 1~100 기본 20) | `TrendRegion[]` / 200 | 2026-11-10 구현(EODI-262). 요청자에게 허용된 게시 피드만 집계(멤버 경로 판정 동일). 피드 기간은 스냅샷 시작·종료일, 날짜 미정은 게시일(Asia/Seoul)로 겹침 판정. 게시 스냅샷 지역별 게시 여행 수 DESC(동점 공동 순위, 지역 코드 ASC), 직전 같은 길이 기간 순위와 비교(previousRank 없으면 isNew). followingCount는 요청자가 ACCEPTED 팔로우한 멤버 경로가 있는 피드 수. sampleSize<5면 insufficientData. updatedAt은 요청 시 계산 시각(배치 없음) |
| PUT | `/feeds/{feedId}/like` | 피드 열람자 | 없음 | `{liked:true,count:integer}` / 200 | 사용자·피드 1개, 대상 D-12 |
| DELETE | `/feeds/{feedId}/like` | 본인 반응 | 없음 | 204 | 방문/평가로 집계하지 않음 |

장소 ID 계약: `/places`와 추출 결과의 `place.id`는 모두 `places.id`다. 공급자 ID를 UUID 대신 반환하지 않는다. 동시에 같은 공급자 결과를 저장하면 unique 충돌 후 기존 행을 재조회한다. 추출 후보를 실제 장소에 연결할 때도 같은 resolver를 사용한다. 수동 POST는 별도 MANUAL 장소이며 공급자 결과를 수동 장소로 우회 복제하지 않는다. 공급자 자료 저장 가능 범위는 Q-12 확인 후 적용한다.

장소 검색 정렬(2026-11-10, EODI-264·-270, 2026-11-11 -300 near 순서 변경): 검색어는 앞뒤 공백을 빼고 대소문자를 무시해 이름에 포함된 장소를 찾는다(`%`·`_`도 글자 그대로). `near`는 `위도,경도` 문자열이다(예: `near=37.5547,126.9707`, 쉼표 앞뒤 공백 허용, 위도 -90~90·경도 -180~180, 소수 10자리까지). 형식이 틀리면 400 `VALIDATION_ERROR`(`near`)다. `near`가 있으면 ① `near`에서 30km 안의 이름 완전 일치(가까운 순) → ② 30km 안의 나머지(가까운 순) → ③ 30km 밖의 이름 완전 일치(가까운 순) → ④ 30km 밖의 나머지(id 순)다. 먼 곳의 완전 일치가 가까운 곳보다 앞서지 않는다(예: 강릉에서 `CU`를 찾으면 강릉의 CU 지점들 뒤에 서울의 `CU`). `near`가 없으면 ① 완전 일치(id 순) → ② 앞부분 일치(이름순) → ③ 그 밖의 포함(id 순)이다. 완전·앞부분 일치는 이름의 앞뒤 공백을 무시하고, 이름순은 소문자 이름의 글자 코드 순서다(한글은 가나다순, 공백이 글자보다 앞). 거리는 구 기준 직선 거리이고 응답에 싣지 않는다(`Place` 모양은 그대로다). 이 장소 선택 검색은 이름을 아는 장소를 고르는 용도라 먼 곳끼리의 거리 순서는 매기지 않는다. 커서는 정렬 위치와 query·near·regionId에 묶인 Base64URL 문자열이다. 조건이 다르거나 예전 UUID 커서를 보내면 400 `VALIDATION_ERROR`(`cursor`)다.

주변 편의시설(2026-11-11 Q-8 결정, EODI-304): 종류는 `EV_CHARGER`(전기차 충전소)·`GAS_STATION`(주유소)·`TOILET`(화장실)·`PHARMACY`(약국)·`CONVENIENCE_STORE`(편의점)이고, 반경은 기본 2km·500m~5km, 순서는 기준 장소에서 가까운 순(직선거리, 같으면 providerId 순)이다. 필터는 종류만 둔다. 출처: 충전소는 한국환경공단 전기자동차 충전소 정보(data.go.kr)를 서버가 미리 넣고 5분마다 최근 상태 변경(기본 6분, 마지막 갱신 뒤 지난 시간만큼 최대 10분까지 늘림)을, 하루 한 번(04시) 전국을 다시 받는다. 포털이 잠깐 오류를 주면 30초 뒤 두 번까지 다시 시도한다. 갱신이 10분 넘게 끊기면 전국을 다시 받고(하루 4번까지), 메우지 못하면 다음 전국 수신까지 상태를 숨긴다. 갱신이 20분 넘게 멈춰도 상태를 숨긴다(위치는 보인다). 약국·편의점·주유소는 공공데이터 장소(places)의 상권업종 소분류 또는 이름(약국으로 끝남, 편의점 상호, 주유소 포함)으로 찾고 기준 장소 자신은 뺀다. 화장실은 공중화장실 표준데이터 파일을 운영자가 넣는다(`app.place-import.toilet-path`). 충전소 첫 적재 전·화장실 자료가 없으면 503 `FACILITY_UNAVAILABLE`이고, 프론트는 조회 실패로 보인다. 커서는 기준 장소·type·radiusMeters에 묶인 Base64URL 문자열이다.

| Method | URL | 권한 | 요청 | 성공 data / 상태 | 주요 규칙 |
| --- | --- | --- | --- | --- | --- |
| GET | `/regions/{regionId}` | 로그인·가입 완료 | UUID 지역 ID | `RegionDetail` / 200 | introduction:null, partialErrors:[]. representativePlaces(2026-11-10 구현, EODI-266)는 이 지역과 하위 지역의 게시 스냅샷 장소 중 요청자에게 허용된 게시 피드 수 DESC·장소 ID ASC 최대 5개. 없는 지역404 REGION_NOT_FOUND, 잘못된 UUID400 |
| GET | `/places/{placeId}/social-summary` | 로그인 | 없음 | `PlaceSocialSummary` / 200 | 2026-11-10 구현(EODI-261). 요청자에게 허용된 게시 피드만(멤버 경로 판정, PUBLIC은 팔로우 없이 포함). 방문자는 게시 시점까지의 살아 있는 방문 중 요청자에게 열린 멤버만(본인 제외, 목록 최대 20·visitorCount는 전체). 평점·평가 수는 허용된 피드의 게시 평가(원본 평가·방문이 살아 있는 것)로만. 외부 호출 없어 partialErrors=[]. 없는 장소 404 |
| GET | `/places/{placeId}/public-reviews` | 로그인 | 페이지(`cursor?`,`limit` 1~100) | `PublishedReview[]` / 200 | 2026-11-10 구현(EODI-261). 허용된 피드의 게시 평가는 피드 단위로 모두 노출(피드 상세와 같은 규칙), 비공개 원본 reviews 직접 노출 금지. writtenAt DESC·id DESC 커서. author는 요청자 기준 UserCard, 탈퇴 작성자는 마스킹 |

## 6. 투표·일정·여행 중 정보

근거: WD-FR-12~18. 마감시각에 최다 후보 자동 확정, 동률 최다 모두 확정한다. 전원 참여 조기 종료·방장 수동 종료/선택 확정은 제공하지 않는다. 코스는 단일 공동 코스이며 모든 ACTIVE 멤버가 편집·AI 변경안 적용을 할 수 있다.

| Method | URL | 권한 | 요청 | 성공 data / 상태 | 주요 규칙 |
| --- | --- | --- | --- | --- | --- |
| GET | `/trips/{tripId}/polls` | 멤버 | 페이지 | `Poll[]` / 200 | 유형·상태·내 선택 |
| POST | `/trips/{tripId}/polls` | 멤버 | `{type:REGION\|PLACE,title:string,candidates:CandidateInput[],closesAt:datetime}` | `Poll` / 201 | 후보 체크 후 열기. 마감 필수, 화면 기본 now+24시간(서버 임의 생략 허용 없음). 제목 1~200자, 후보 1~30개, 미래·30일 이내 마감, 유형·중복·존재 검증. 참여 대상은 그때그때의 ACTIVE 멤버(생성 시 스냅샷 없음, 2026-11-02) |
| GET | `/trips/{tripId}/polls/{pollId}` | 멤버 | 없음 | `Poll` / 200 | 집계와 확정 결과 분리 |
| PUT | `/trips/{tripId}/polls/{pollId}/ballot` | 멤버 | `{candidateIds:id[],expectedVersion:integer}` | `Poll` / 200 | 참여 대상의 내 선택 교체. 빈 배열=취소, 서버 시각이 마감 이상이면 409 `POLL_CLOSED`. 투표 version은 후보 추가·마감 때만 올라 다른 멤버의 투표로는 409가 나지 않음 |
| POST | `/trips/{tripId}/polls/{pollId}/candidates` | 멤버 | `{candidate:CandidateInput,expectedVersion:integer}` | `Poll` / 201 | OPEN·마감 전만. 중복/유형/버전 검사, 후보 30개까지. 성공하면 version 증가. 이미 투표한 멤버에게 후보 추가 알림(알림 기능 뒤 연결) |
| GET | `/trips/{tripId}/itinerary` | 멤버 | 없음 | `Itinerary` / 200 | 현재 단일 코스·버전 반환. 항목은 day·order 순, 구간은 출발 항목의 day·order 순 |
| PUT | `/trips/{tripId}/itinerary` | 멤버 | `ItineraryWrite` | `Itinerary` / 200 | 현재 코스 전체 교체, 실제 바뀐 게 있을 때만 version 증가(없으면 그대로 반환). 충돌 409 후 최신 조회. 승인 단계 없음. 항목 최대 200개, 구간이 안 맞으면 422 `INVALID_ROUTE_LEGS`. 경로 공급자 연동 전에는 구간 결과가 null·`UNAVAILABLE`(2026-11-03) |
| POST | `/trips/{tripId}/itinerary/proposals` | 멤버 | `ProposalWrite` | `JobRef` / 202 | 최초 생성에도 GET에서 얻은 version 사용, 기존 일정 자동 덮어쓰기 없음. 2026-11-09 구현: `Idempotency-Key` 필수, reason은 INITIAL만(다른 값 400 `reason`, INITIAL에 다른 사유용 필드 400), defaultTransportMode 생략 시 TRANSIT. 대상 장소는 여행 저장 장소(나간 멤버 저장 포함)+현재 코스 장소, 최대 200곳(초과 422 `INPUT_LIMIT_EXCEEDED`). 기간·장소 없음은 등록 전 422 `INSUFFICIENT_DATA`(fields `trip.startDate`·`places`). 판정 순서 키·본문 400 → 404 → version 409 → 422. 코스가 있어도 요청 가능하며 적용하면 코스 전체가 바뀐다. 설정·동의 열이 없어 동의 검사 없음. 2026-11-09 WEATHER 구현(EODI-247): `sourceWeatherJobId`·`selectedAlternativeId` 필수(INITIAL에는 금지), `excludedPlaceIds` 금지, PLACE_REMOVED는 계속 400. 판정 순서 키·본문 400 → 404 → 요청자 날씨 대안 설정 OFF 409 `AI_FEATURE_DISABLED` → 원본 작업(같은 여행·WEATHER_ALTERNATIVES, 아니면 404 `JOB_NOT_FOUND`, 성공 전 409 `PROPOSAL_NOT_READY`) → 결과에 없는 대안 400 `selectedAlternativeId` → INFO 422 `UNSCHEDULABLE_ALTERNATIVE` → expectedVersion·원본 baseVersion이 현재 코스 version과 다르면 409 `VERSION_CONFLICT` → 기간 없음 422 → 대안 뒤 여행 기간을 옮겨 대안 날짜가 대상 일정의 일차와 달라졌으면 409 `VERSION_CONFLICT`. AI에는 현재 코스 장소+바꿀 장소와 고른 대안을 보낸다. 고른 대안의 그날만 바뀐다 |
| GET | `/trips/{tripId}/itinerary/proposals/{jobId}` | 멤버 | 없음 | `ItineraryProposal` / 200 | 변경 전후 비교, 기준 버전 표시. 여행의 현재 ACTIVE 멤버 누구나. 다른 여행·다른 kind·볼 수 없는 작업은 404 `JOB_NOT_FOUND`. 성공 전에는 proposed=null·빈 diff(사유는 job.error). 변경 전 코스는 GET itinerary(version=baseVersion일 때만 적용 가능) |
| POST | `/trips/{tripId}/itinerary/proposals/{jobId}/apply` | 멤버 | `{expectedVersion:integer}` | `Itinerary` / 200 | 성공한 변경안·기준 버전·현재 멤버십 검증 후 단일 코스 원자 교체. 방장 승인 불필요. 2026-11-09 구현: 판정 순서 400 → 여행 404 → 작업 404 → 409 `ALREADY_APPLIED` → 409 `PROPOSAL_NOT_READY` → 409 `VERSION_CONFLICT`(현재 version≠expectedVersion 또는 ≠baseVersion, 제안 뒤 여행 기간이 줄어 날짜가 넘침). 유지 항목 id 그대로·새 항목 id 발급, 구간에 AI 이동 시간 저장(거리·지도선 null), 내용이 같아도 version 증가, 적용 전 코스 보관. WEATHER 제안은 작업 404 다음에 적용하는 사람의 날씨 대안 설정 OFF면 409 `AI_FEATURE_DISABLED`, 제안 뒤 여행 시작일이 바뀌었으면 409 `VERSION_CONFLICT`(2026-11-09) |
| POST | `/trips/{tripId}/itinerary/undo` | 멤버 | `{expectedVersion:integer,appliedJobId:id}` | `Itinerary` / 200 | 직전 AI 적용 1회만 되돌림. 적용 후 다른 쓰기면 409 UNDO_UNAVAILABLE 제안, 복원도 새 version. 시간 제한은 Q-15. 2026-11-09 구현: ACTIVE 멤버 누구나, expectedVersion 불일치 409 `VERSION_CONFLICT` → 직전 적용이 아니거나 적용 뒤 version이 바뀌었으면 409 `UNDO_UNAVAILABLE`(바뀐 것 없는 PUT은 쓰기가 아님). 항목 id·구간 결과까지 적용 전 그대로 복원, 한 번 되돌리면 다시 불가. 시간 제한은 두지 않음(Q-15 합의 전) |
| POST | `/trips/{tripId}/itinerary/routes/recalculate` | 멤버 | `{expectedVersion:integer}` + `Idempotency-Key?` | `JobRef` / 202 | 실패 구간 재조회, 변경된 코스에는 자동 반영하지 않음. 2026-11-10 구현(EODI-275): `Idempotency-Key`는 §2 공통 규칙의 예외로 선택이다(작업이 두 번 돌아도 같은 구간을 같은 값으로 채운다). 보내면 같은 키·같은 본문에 처음 JobRef를 돌려준다. 판정 순서 보낸 키 형식·본문 400 → 404 → version 409 → 시간 없는(UNAVAILABLE) 구간이 없으면 422 `INSUFFICIENT_DATA`(fields `legs`) → 등록. 등록 때 시간 없는 구간과 양 끝 장소 좌표를 고정해 AI 서버 `POST /ai/v1/route-legs`(AI spec §5.1)로 보낸다. 끝났을 때 코스 version이 expectedVersion과 같으면 그 구간만 갱신하고 version은 올리지 않는다(이동 시간은 계산 결과라 코스 변경 알림도 보내지 않는다). 다르면 반영하지 않는다. 가까운 구간은 TRANSIT 대신 WALK로 구해 저장할 수 있고(그 밖의 수단 변경은 작업 실패), 거리는 AI가 주면 저장하고 없으면 null, 지도선은 null이다. 결과는 GET /jobs/{jobId}(현재 ACTIVE 멤버 누구나) |
| POST | `/trips/{tripId}/visits` | 멤버 | `{placeId:id,visitedAt:datetime,evidenceType:MANUAL}` | `Visit` / 201(이미 체크한 장소는 기존 `Visit` / 200) | 실제 방문 수동 기록. 자동 위치 수집 추가 안 함. 존재하는 장소면 코스 밖도 허용(없으면 400 필드 placeId), `visitedAt`이 서버 시각+5분보다 미래면 400, `evidenceType`은 MANUAL만. 여행·멤버·장소당 체크 하나라 재요청은 기존 방문을 그대로 반환하며 `Idempotency-Key` 불필요(2026-11-04) |
| GET | `/trips/{tripId}/visits` | 멤버 | `memberId?:id,placeId?:id,reviewStatus?:ALL\|WRITTEN\|UNWRITTEN` + 페이지 | `Visit[]` / 200 | 기본 본인·ALL. 같은 여행 멤버(나간 멤버 포함)만 필터 가능, 다른 여행·없는 memberId는 400. 정렬 createdAt DESC. 평가할 visitId 복원. WRITTEN은 평가를 쓴 방문, UNWRITTEN은 아직 안 쓴 방문. 평가가 없으면 `reviewId`·`reviewScore` null |
| DELETE | `/trips/{tripId}/visits/{visitId}` | 본인 방문 작성자 | 없음 | 204 | 방문 체크 되돌리기(논리 삭제, 다시 체크하면 새 방문). 남의 방문 403, 없거나 해제한 방문 404 `VISIT_NOT_FOUND`. 평가가 있으면 409 `REVIEW_EXISTS`(평가를 먼저 지운다) |
| POST | `/trips/{tripId}/visit-detections` | 멤버 | `{photoIds:id[]}` + `Idempotency-Key` | `JobRef` / 202 | 2026-11-10 구현(EODI-267). 요청자가 이 여행에 올린 삭제 안 된 READY 사진 1~50장·중복 불가(51장 422 INPUT_LIMIT_EXCEEDED, 아니면 404 PHOTO_NOT_FOUND). 설정 OFF 409 AI_FEATURE_DISABLED. 여행 시작일이 없으면 422 INSUFFICIENT_DATA(trip.startDate). 위치·시각 있는 요청자 본인 사진과 현재 코스 장소만 AI 서버 `POST /ai/v1/visit-detections`(AI 명세 §8.2: 같은 날 코스 우선, 300m 안 가장 가까운 코스 장소)로 보내 판정하고 후보만 만든다. AI 결과는 요청자 멤버·보낸 장소·보낸 사진만 받아들인다. 이미 체크한 장소 제외. 결과는 요청자만 GET /jobs. 증거 사진을 다른 장소로 연결·이동·삭제하면 미확정 후보 무효 |
| POST | `/trips/{tripId}/visit-candidates/{candidateId}/confirm` | 후보 본인 | `{expectedVersion:integer}` | `Visit` / 201 | 판정 순서 400 → 404 TRIP_NOT_FOUND → 404 VISIT_CANDIDATE_NOT_FOUND(남의 후보) → 이미 확정이면 기존 visit 201 → 409 AI_FEATURE_DISABLED → 409 VISIT_CANDIDATE_INVALIDATED(증거 사진 이동·삭제, 같은 장소 다른 후보 확정) → 409 VERSION_CONFLICT. 이미 직접 체크한 장소면 그 visit에 연결(evidenceType MANUAL 유지). 확정 시 같은 장소 다른 미확정 후보 무효. 사진 속 타인을 자동 방문자로 지정하지 않음 |
| GET | `/trips/{tripId}/weather` | 멤버 | `date:date,placeId:id` | `Weather` / 200 | 관측/예보 구분, 조회 시점·유효성. 2026-11-09 구현(EODI-247): 기상청 예보만(관측 없음). 오늘~3일 뒤는 단기예보(`source=KMA_SHORT_TERM_FORECAST`, 1시간 단위 hourly), 4~10일 뒤는 중기예보(`KMA_MID_TERM_FORECAST`, 오전·오후 값을 하루로 합쳐 hourly=[]). 지난 날짜·10일 뒤 초과·국내 격자 밖은 422 `WEATHER_NOT_AVAILABLE`. 중기예보는 06·18시 발표라 00:00~06:10(KST)에는 10일 뒤가 아직 없어 422다. placeId는 그 여행의 코스나 저장 장소(아니면 400 `placeId`), 여행 기간이 있으면 date는 그 안(아니면 400 `date`). 날짜는 한국 시각. 기상청 장애 때 6시간 안에 받은 값이 있으면 그 값을 `stale=true`(queriedAt은 그때 시각), 없으면 503 `PROVIDER_UNAVAILABLE`. 같은 발표는 서버 메모리에 캐시. 날씨 대안 설정 OFF여도 조회는 됨 |
| POST | `/trips/{tripId}/weather-alternatives` | 멤버 | `{date:date,placeId:id,expectedVersion:integer}` | `JobRef` / 202 | 실제 공급자 날씨 데이터로 생성. 2026-11-09 구현: `Idempotency-Key` 필수. 판정 순서 키·본문 400 → 404 → (같은 키·같은 본문으로 끝난 요청이면 날씨를 다시 부르지 않고 처음 JobRef 202, 다른 본문이면 409 `IDEMPOTENCY_KEY_REUSED`) → 요청자 날씨 대안 설정 OFF 409 `AI_FEATURE_DISABLED` → 여행 기간 없음 422 `INSUFFICIENT_DATA`(`trip.startDate`) → 기간 밖 날짜 400 `date` → 날씨 조회(422 `WEATHER_NOT_AVAILABLE`/503, 작업 미등록) → version 409 → 그 날짜(일차) 코스에 없는 장소 422 `INSUFFICIENT_DATA`(`placeId`) → 등록. 요청 때 조회한 Weather·그날 코스·실내 후보를 고정해 AI에 보낸다. 후보는 여행 저장 장소와 한국관광공사 관광정보 장소 중 대상 반경 2km 안·분류 있음·그날 코스에 없는 곳, 저장 장소 먼저 가까운 순 30곳. 영업 정보 공급자가 없어 openStatus는 모두 UNKNOWN. 결과는 GET /jobs/{jobId}(현재 ACTIVE 멤버 누구나), 대안이 없으면 `alternatives:[]`. 요청자가 실행 전 이탈·설정 OFF면 CANCELLED. 코스는 바꾸지 않음 |
| GET | `/places/{placeId}/facilities` | 로그인 | `type:EV_CHARGER\|GAS_STATION\|TOILET\|PHARMACY\|CONVENIENCE_STORE`(필수),`radiusMeters?:integer`(500~5000, 기본 2000) + 페이지 | `Facility[]` / 200 | 2026-11-11 구현(EODI-304, Q-8 결정은 아래 「주변 편의시설」). 기준 장소 반경 안 가까운 순, 결과 없음은 빈 목록, 자료를 받지 못했으면 503 `FACILITY_UNAVAILABLE`. 없는 장소 404, type·반경·limit·커서 오류 400 |
| GET | `/trips/{tripId}/checklist` | 멤버 | 없음 | `{items:ChecklistItem[]}` / 200 | 여행 공동 목록 하나, checkedByMemberId 포함. 페이지 없이 추가한 순(createdAt ASC, id ASC) |
| POST | `/trips/{tripId}/checklist` | 멤버 | `{label:string,sourceJobId?:id,suggestionIndex?:integer}` | `ChecklistItem` / 201 | 둘 다 없으면 직접 작성. 둘 다 있으면 AI 제안 채택: 같은 여행의 성공한 `CHECKLIST_SUGGESTIONS` 결과 items 순번(0부터)만 받고(아니면 400, 하나만 보내도 400) 이유 보존·source=AI. label을 제안과 다르게 보내면 modifiedByUser=true. 같은 제안은 한 번만 채택하며 채택 후 지운 제안도 409 `SUGGESTION_ALREADY_ADOPTED`. 채택자 준비물 추천 설정 OFF면 409 `AI_FEATURE_DISABLED` |
| PATCH | `/trips/{tripId}/checklist/{itemId}` | 멤버 | `{label?:string,checked?:boolean,expectedVersion:integer}` | `ChecklistItem` / 200 | 체크 시 서버가 checkedByMemberId/checkedAt 기록, 해제 시 둘 다 null. 타인 ID 입력 금지 |
| DELETE | `/trips/{tripId}/checklist/{itemId}` | 멤버 | 없음 | 204 | 행을 남기는 논리 삭제. AI 재생성 시 삭제한 항목 강제 부활 금지 |
| POST | `/trips/{tripId}/checklist-suggestions` | 멤버 | 없음(본문 생략 또는 `{}`) + `Idempotency-Key` | `JobRef` / 202 | 제안만 생성. 수동 편집·체크 목록을 덮어쓰지 않음. 요청 시점의 여행 기간·코스 장소·현재/지운 준비물 이름을 고정해 AI에 보냄(지운 항목 재제안 없음, 날씨는 조회 기능 전까지 빈 값). 요청자 준비물 추천 설정 OFF면 409 `AI_FEATURE_DISABLED`, AUTO도 자동 반영 기준 확정 전이라 제안만. 요청자가 실행 전 이탈·설정 OFF면 작업 CANCELLED. 2026-11-06 `date` 필드 삭제(쓰는 곳 없음) |

경로는 구간별 수단을 가진 Itinerary.legs로 반환하며 순서/장소/수단 변경 시 영향 구간을 재계산한다. 실패는 durationSeconds=null/status=UNAVAILABLE이다. 코스 저장·AI 적용·되돌리기·경로 반영은 현재 version을 검사하고 원자적으로 증가시키는 서버 제안이다. AI 결과 baseVersion이 다르면 409 VERSION_CONFLICT로 거부하되 별도의 오래된 변경안 확인 화면을 요구하지 않는다. 실시간 중 자동 재계산/재시도·복귀 충돌 UX는 Q-15 합의 대상이며 REST만으로 실시간 구현을 완료했다고 취급하지 않는다. 코스 변경 알림 묶음은 Q-16이다. 투표 마감은 타이머·조회·쓰기에서 같은 규칙으로 한 번만 처리한다. 최다 후보 전부를 FINALIZED, 0표는 CLOSED/NO_VOTES·selectedCandidateIds=[]로 마감한다. 0표를 결정권자 대기 상태로 해석하지 않는다. 지역 투표가 확정되면 확정 지역을 여행지 끝에 추가(이미 있으면 건너뜀)하고 여행 version을 올린다. 장소 확정은 코스를 바꾸지 않는다(2026-11-02).

일정 전체 교체에서 빠진 기존 항목은 제거한다. 기존 ID는 해당 코스 소유인지 검사하고 신규 항목 ID는 서버가 발급한다. startTime/stayMinutes는 생략/null이면 비운다. 구간은 `{day,fromOrder,toOrder,transportMode}`로 쓰고 서버가 결과 item ID에 연결한다. 같은 날짜의 연속 인접 구간을 빠짐없이 하나씩 지정하고 빠진/비인접/중복 구간은 422 `INVALID_ROUTE_LEGS`다(하루에 항목이 하나면 그 날은 구간 없음). 여행 전체 transportMode 필드는 제공하지 않는다. 2026-11-03 구현: 항목은 최대 200개, `day`는 1 이상이며 여행 기간이 정해져 있으면 일수 이하, 날짜별 `order`는 1부터 빈틈없이, `startTime`은 `HH:mm`, `stayMinutes`는 1~1440. 요청 자체의 오류는 400, 구간 구조 오류는 422, 그다음 여행 404 → version 409 → 코스 소유·여행 기간 400 순으로 판정한다. 바뀐 게 없으면 version을 올리지 않는다(여행 수정과 같은 규칙). 여행 기간을 줄여도 저장된 코스는 지우지 않고 다음 교체 때 검증한다. 경로 공급자 연동 전에는 구간을 `durationSeconds`·`distanceMeters`·`geometry` null, `status=UNAVAILABLE`로 저장한다.

날씨 대안은 `alternativeId`를 포함한다. WEATHER 제안 요청은 `sourceWeatherJobId`·`selectedAlternativeId`를 받아 같은 여행의 성공한 결과와 선택 항목을 검증하고 기준 일정 버전도 일치해야 한다. 대안 유형은 PLACE_SWAP/TIME_SHIFT/INFO다. TIME_SHIFT는 기존 itemId·목표 시각으로 같은 장소를 이동하므로 새 장소가 없어도 적용 가능하다. INFO만 있는 대안의 적용은 `422 UNSCHEDULABLE_ALTERNATIVE`로 거부한다. 선택한 대안을 무시하고 임의의 새 장소로 대체하지 않는다.

## 7. 사진·평가·경비

근거: WD-FR-19~23. 파일 업로드와 여행 사진 등록을 분리해 업로드 일부 실패를 처리한다.

2026-11-06 dev 통합(EODI-214/220): PROFILE·CAPTURE는 JPG/PNG, TRIP_PHOTO는 JPG/PNG/HEIC(HEIF)를 지원한다. 파일 업로드 intent·완료·PENDING 취소·인증 다운로드와 여행 사진 배치·등록·목록을 제공한다. 기본 최대 15MiB, PUT URL 10분은 공개된 dev 정책을 유지하며 STORAGE_* 설정이 기존 S3_*/ASSET_* 별칭보다 우선한다. 배치와 미완료 파일은 기본 24시간이다. 기존 배치 없는 여행 파일 업로드/다운로드도 유지하며 사진 등록은 같은 여행·본인 배치에 속한 파일만 받는다. 실제 전체 디코딩 후 메타데이터가 없는 별도 표시 이미지를 제공하고 HEIC는 JPEG로 변환한다. 기존 READY도 최초 이용 시 실제 검증·변환하며 원본과 상태/ID를 마이그레이션에서 지우지 않는다. PROFILE은 로그인 사용자, CAPTURE는 본인, 여행 사진은 업로더도 현재 ACTIVE 멤버만 접근한다. 배치 파일은 사진 등록 뒤 다운로드한다. 같은 사진 등록 재요청은 배치 만료 후에도 기존 결과를 반환한다. 사진 편집·개별 삭제와 AI 분류·그룹의 후속 구현 계약은 아래 표를 따른다. 피드 경유는 후속이다. [설정·검증 기록](../EodiLog/docs/plan/photo-upload.md).

| Method | URL | 권한 | 요청 | 성공 data / 상태 | 주요 규칙 |
| --- | --- | --- | --- | --- | --- |
| POST | `/assets/upload-intents` | 로그인/여행 사진은 멤버 | `{purpose:PROFILE\|CAPTURE\|TRIP_PHOTO,tripId?:id,contentType:string,byteSize:integer,batchId?:id}` | `UploadIntent` / 201 | PROFILE·CAPTURE는 JPG/PNG, TRIP_PHOTO는 JPG/PNG/HEIC(`image/jpeg`·`image/png`·`image/heic`·`image/heif`). 파일 1개 1바이트~15MB(Q-7, 2026-11-06). tripId는 TRIP_PHOTO만 필수이고 다른 용도는 보내면 400. 여행이 없거나 ACTIVE 멤버가 아니면 404 TRIP_NOT_FOUND. batchId는 같은 사용자/여행의 PhotoUploadBatch다. 기존 배치 없는 업로드도 허용하지만 사진 등록에는 배치가 필수다. 2026-11-06 구현 |
| DELETE | `/assets/{assetId}` | 업로더 | 없음 | 204 | PENDING 업로드 취소만, 서버 객체 정리·이후 complete 거부(409 ASSET_NOT_PENDING). 이미 취소한 파일은 다시 204, READY는 409 ASSET_NOT_PENDING. 등록된 사진은 사진 삭제 API 사용. 없거나 남의 파일은 404 ASSET_NOT_FOUND |
| POST | `/assets/{assetId}/complete` | 업로더 | 없음 | `Asset` / 200 | 객체 존재·크기·형식 검증, 본인 파일만. 이미 READY면 그대로 200. 객체가 없으면 409 UPLOAD_NOT_FOUND, 크기·실제 형식·전체 픽셀 디코딩이 요청과 다르거나 실패하면 객체를 지우고 422 UPLOAD_MISMATCH(PENDING 유지). 허용된 EXIF 위치/촬영시각은 비공개 메타데이터로 추출, 표시 파일은 위치·촬영시각 메타데이터를 제거한다. HEIC 표시 변환은 JPEG이며 미완료 기한 초과는 410 UPLOAD_EXPIRED, 처리 슬롯 사용 중은 503 IMAGE_PROCESSOR_UNAVAILABLE |
| GET | `/assets/{assetId}/download` | 실제 자료 접근권자 | `feedId?:id` | 파일 바이트 / 200 | 인증 게이트웨이 스트리밍 제안. READY만. PROFILE은 로그인 사용자, CAPTURE는 업로더만, TRIP_PHOTO는 업로더를 포함해 현재 ACTIVE 멤버만. 배치 파일은 사진 등록 후, 기존 배치 없는 여행 파일도 멤버 접근을 유지한다. HEIC는 메타데이터 없는 JPEG 표시 파일로 반환한다. 볼 수 없으면 404 ASSET_NOT_FOUND. 피드 경유면 매 요청 직접 공동 피드 공개 정책·포함 사진·삭제/이동 상태를 재검사(feedId는 피드 구현 때 추가). 개인 경로 숨김을 직접 파일 접근 차단으로 확대하지 않음, private/no-store |
| GET | `/trips/{tripId}/photos` | 멤버 | `topic?:string,groupId?:id` + 페이지 | `Photo[]` / 200 | 부분 업로드 실패는 기존 성공 사진과 독립. 삭제 사진 제외. topic은 LANDSCAPE/FOOD/PEOPLE/OTHER만(그 외 400). groupId는 같은 여행의 적용된 AI 묶음에 속한 사진을 필터링하며 topic과 함께 지정하면 교집합 |
| POST | `/trips/{tripId}/photos` | 멤버 | `{batchId:id,assetId:id,placeId?:id,capturedAt?:datetime}` | `Photo` / 201 | READY·본인·같은 여행/배치·지원 형식 확인. 배치 한도 예약/소비는 원자적, 부분 성공 유지 |
| POST | `/trips/{tripId}/photo-upload-batches` | 멤버 | `{fileCount:integer}` | `PhotoUploadBatch` / 201 | Idempotency-Key 필수 제안. 한 번의 업로드 1~50장. 51장 이상 422 INPUT_LIMIT_EXCEEDED. 형식/파일 크기는 각 intent에서 검사 |
| PATCH | `/trips/{tripId}/photos/{photoId}` | ACTIVE 멤버인 업로더 | `{placeId?:id\|null,topics?:string[],expectedVersion:integer}` | `Photo` / 200 | 2026-11-09 구현. 생략 유지, 장소 null 해제, 존재하는 장소만. topics는 LANDSCAPE/FOOD/PEOPLE/OTHER 중 중복 없는 0~4개, [] 해제, null 거부. 빈 수정·누락/잘못된 version·groupId(명시 null 포함)는 400. 타인/없는/삭제된 사진 404 PHOTO_NOT_FOUND, 여행 접근 실패 404 TRIP_NOT_FOUND. 버전 불일치 409 VERSION_CONFLICT, 성공 시 version 증가. 장소·주제 각각 수동 보정/해제 표시를 영구 보존해 후속 AI 덮어쓰기 방지 |
| DELETE | `/trips/{tripId}/photos/{photoId}` | ACTIVE 멤버인 업로더 | 없음 | `JobRef` / 202 | 2026-11-09 구현. 승인 트랜잭션에서 사진 숨김·asset DELETING 전환·고정 대상 PHOTO_DELETE 등록. 원본/표시 객체만 정리, 일시 실패는 jobs 재시도. 요청자 이탈·여행 전체 삭제 후에도 승인 범위를 처리. 같은 사진 재요청은 완료 후에도 같은 jobId/현재 status 반환(현재 ACTIVE 여행 권한 재확인). 없거나 타인 사진 404 PHOTO_NOT_FOUND. 승인 이후 새 다운로드는 404, 이미 열린 스트림은 회수하지 않음. signed PUT 회수 불가로 키를 남겨 PUT 만료 후 유예기간 동안 반복 정리 |
| POST | `/trips/{tripId}/photo-classifications` | 멤버 | `{photoIds:id[]}` + `Idempotency-Key` | `JobRef` / 202 | EODI-229: 1~50개, 중복 금지. 현재 여행의 삭제되지 않은 READY 사진만. 요청 사진·asset·version·표시 파일을 고정하고 PHOTO_CLASSIFICATION 등록. 51장 이상 422 INPUT_LIMIT_EXCEEDED, 설정 OFF는 409 AI_FEATURE_DISABLED. 동일 키·본문 재요청은 동일 작업. 결과는 GET /jobs/{jobId}. 사진별 성공/실패, 원본 자동 삭제 없음 |
| GET | `/trips/{tripId}/photo-summary` | 멤버 | 없음 | `PhotoSummary` / 200 | 목록 필터와 독립적으로 삭제되지 않은 전체·주제/장소별 건수·장소 미지정 수. 주제/장소는 사진이 있는 항목만 이름/ID 순, 복수 주제로 주제 합계는 전체 수와 다를 수 있음. groups는 현재 사진이 있는 적용된 AI 묶음별 건수 |
| POST | `/trips/{tripId}/photos/batch` | 업로더(D-16) | `PhotoBatchWrite` | `{photos:Photo[],deletedPhotoIds:id[]}` / 200 | 2026-11-10 구현(EODI-263). photos 1~50장(51장 이상 422 INPUT_LIMIT_EXCEEDED), 빈 목록·중복 photoId·잘못된 expectedVersion 400. 판정 순서 본문 400/422 → 여행 404 TRIP_NOT_FOUND(MOVE는 양쪽 모두) → 한 장이라도 없거나 타인·다른 여행·삭제된 사진이면 404 PHOTO_NOT_FOUND → 없는 장소 400 → 버전 불일치 409 VERSION_CONFLICT. 실패하면 아무것도 바꾸지 않음. 잠금 여행(MOVE는 UUID 순) → 사진 id 순 → asset. UNGROUP은 묶음 있던 사진만 version 증가. DELETE는 사진마다 단건 삭제와 같은 승인(응답에 jobId 없음, 이미 삭제한 사진 재요청은 404). MOVE는 묶음 해제·uploaderMemberId와 파일 귀속을 대상 여행으로·원래 여행 공동 피드에서 제외, batchId 유지. 응답 photos는 요청 순서(DELETE는 []). Idempotency-Key 불필요 |
| POST | `/trips/{tripId}/photo-classifications/{jobId}/apply` | 멤버 | `{expectedPhotoVersions:{photoId:id,version:integer}[]}` | `{photos:Photo[]}` / 200 | EODI-229: 성공한 해당 여행 작업의 사진 중 선택한 결과만 원자 적용. 중복 ID 금지, snapshot/expected/current version 일치 필수. 수동 주제 보정·[] 해제 이력은 409로 보호. 적용 시 source=AI, 사진 version 증가. 선택한 성공 사진 2장 이상인 묶음만 그룹 연결. 같은 작업·같은 본문 재요청은 최초 응답, 다른 본문 재사용은 409. 재요청도 현재 사진·권한·설정 검사, 삭제·후속 수정 후 과거 응답 재노출 금지 |
| GET | `/trips/{tripId}/reviews` | 멤버 | `memberId?:id` + 페이지 | `Review[]` / 200 | 실제 방문 기록 참조. 기본은 여행 전체(동행 평가 포함), memberId는 같은 여행 멤버십(나간 멤버 포함)만, 아니면 400. 정렬 createdAt DESC. 항목마다 `visit`·`place` 요약 포함. 나간 멤버의 평가도 남는다 |
| PUT | `/trips/{tripId}/visits/{visitId}/review` | 방문 기록 작성자 | `{score:integer,body:string,expectedVersion?:integer}` | `Review` / 200 | 1~5 정수 필수, 반 점·문자열 거부·확인한 본인 방문만 작성(남의 방문 403, 없거나 해제한 방문 404 `VISIT_NOT_FOUND`). 방문 하나에 평가 하나, 처음이면 생성·있으면 수정(모두 200). body는 공백만 불가·1,000자(코드 포인트) 이하, 받은 그대로 저장. expectedVersion은 다르면 409 `VERSION_CONFLICT`, 생략하면 덮어쓰기, 평가가 없는데 보내면 400. 값이 바뀔 때만 version 증가 |
| DELETE | `/trips/{tripId}/visits/{visitId}/review` | 평가 작성자 | 없음 | 204 | 타인 평가 변경 불가(403). 물리 삭제, 다시 쓰면 새 평가(version 1). 없는 평가 404 `REVIEW_NOT_FOUND` |
| GET | `/trips/{tripId}/expenses` | 멤버 | 페이지 | `Expense[]` / 200 | 원본 내역, 이탈자도 과거 분담자로 표시 |
| POST | `/trips/{tripId}/expenses` | 멤버 | `ExpenseWrite` | `Expense` / 201 | 등록자 서버 지정, 같은 여행 결제자/분담자·KRW 정수 검증, 외화 422 |
| PATCH | `/trips/{tripId}/expenses/{expenseId}` | 활성 멤버인 등록자 | `ExpensePatch` | `Expense` / 200 | 방장·결제자라도 등록자가 아니면 403 |
| DELETE | `/trips/{tripId}/expenses/{expenseId}` | 활성 멤버인 등록자 | `expectedVersion:integer`(query) | 204 | 전체 비용 버전 증가, 이전 정산 무효화 |
| GET | `/trips/{tripId}/settlement` | 멤버 | 없음 | `SettlementState` / 200 | current 계산(없으면 null)·현재 비용 버전·재계산 필요 반환. GET은 계산 생성 안 함. 계산한 적이 없으면 current=null(경비가 없어도 계산하면 빈 결과가 current가 됨) |

비용 원금 10,001원의 3인 균등 분담은 원금 보존 표현과 올림 부담액을 구분한다. 1인 부담액이 3,333.67원이면 10원 올림 결과는 3,340원이다. 2026-11-02 Q-10 확정: 사람별 원금 분담 합계를 여행 전체로 더한 뒤 한 번만 10원 단위로 올리고(지출별 올림 없음, 0원은 0원), 올림 차액은 원금 기준 받을 돈(결제 합계 - 원금 부담 합계)이 가장 많은 한 사람에게 귀속한다(동률은 joinOrder·memberId 순, 모두 0이면 결제 합계가 가장 큰 사람, 경비가 없으면 차액 0·수령자 없음). 모든 멤버의 balanceMinor 합은 0이고, 최종 송금액을 다시 10원으로 올리는 규칙·완료 상태는 추가하지 않는다. 예: 10,001원 경비 3건을 세 사람이 균등 분담하면 원금 합계 10,002/10,002/9,999원 → 1인 부담액 10,010/10,010/10,000원, 전체 차액 17원. 원금 잔액 합=0과 올림 차액을 분리해 검증한다. 이탈자의 과거 경비는 보존하며 신규 분담자 추가는 ACTIVE 멤버만 허용하는 제안이다. 구현: 원금의 1원 잔여는 참여 순이 빠른 분담자부터 1원씩 배분한다. `GET /settlement`의 `current`는 여행의 현재 계산이며 계산한 적이 없으면 null이다.

| Method | URL | 권한 | 요청 | 성공 data / 상태 | 주요 규칙 |
| --- | --- | --- | --- | --- | --- |
| POST | `/trips/{tripId}/settlements` | 멤버 | `{expectedExpenseVersion:integer}` | `Settlement` / 201 | KRW·비용 스냅샷·원금/올림 금액/차액·송금 제안 저장 및 current 포인터 교체(여행 행 잠금). Idempotency-Key 필수, 오래된 비용 버전 409 `VERSION_CONFLICT`. 같은 키 재요청도 현재 ACTIVE 멤버만. 경비가 없어도 빈 결과로 계산 |
| GET | `/trips/{tripId}/settlements` | 멤버 | 페이지 | `Settlement[]` / 200 | 이전 계산 결과, 최근 계산 순(calculatedAt DESC, id DESC) 커서. 완료 상태 없음. 여행이 있는 동안 모두 보관(물리 삭제 시점은 Q-11) |
| GET | `/trips/{tripId}/settlements/{settlementId}` | 멤버 | 없음 | `Settlement` / 200 | 원래 계산시각·버전·포함 지출 확인 |

### 사진 AI 처리 계약

- 분류에는 원본 대신 메타데이터를 제거한 표시 파일을 사용한다. 파일별 최대 15MiB이며 전체 50장을 메모리 배열로 모으지 않고 임시 파일로 전송한다. 임시 디스크 사용 상한은 작업당 최대 750MiB이며 worker 동시 실행 수에 맞춰 용량을 확보한다.
- 누락된 표시 파일은 해당 사진의 FAILED/FILE_UNAVAILABLE, 과대 파일은 FAILED/INPUT_LIMIT_EXCEEDED로 표시한다. AI의 UNSUPPORTED_INPUT·IMAGE_DECODE_FAILED도 사진별 실패다. 일시적인 저장소/로컬 I/O·AI 5xx/연결 오류는 작업 TEMPORARY_FAILURE로 재시도한다.
- OFF는 요청·실행·완료·조회·적용에서 검사한다. AUTO도 자동 반영하지 않고 명시적 apply를 사용한다. 요청자 권한/설정과 조회·적용자의 현재 권한/설정을 검사하며 삭제 사진은 작업 공개 결과에서 제외한다.
- 주제 수동 보정은 [] 해제까지 보호한다. 장소는 분류가 변경하지 않는다. 사진 삭제 후 한 장이 남은 그룹은 유지하며 빈 그룹은 요약에서 제외한다.

## 8. 공동 피드·특정 친구 숨김·지도·타임라인

근거: WD-FR-24~30, 결정 Q-3/F-19/F-20. 게시 전 피드 없음, 멤버가 게시 버튼을 눌러야 여행당 하나 생성하고 게시 후 기본 전체 공개다. 멤버 누구나 게시/삭제한다. 항목별 공개 선택·사진 동의·개인별 게시물은 제공하지 않는다. 공동 편집/공개 내용/비공개 계정 결합의 상세는 Q-3과 D-14 제안이다.

| Method | URL | 권한 | 요청 | 성공 data / 상태 | 주요 규칙 |
| --- | --- | --- | --- | --- | --- |
| GET | `/home/map` | 로그인 | `bbox:string,from?:date,to?:date` | `MapResult` / 200 | 팔로우한 멤버 경로별 공개 범위/숨긴 viewer 검사 후 feedId로 중복 제거. 2026-11-10 구현(EODI-258): 후보는 요청자의 ACCEPTED 팔로잉(본인 제외), criteria.regionGrouping="FEED_REGION"(게시 스냅샷 지역 그대로, Q-8 미정), bbox `minLng,minLat,maxLng,maxLat` 필수·좌표 없는 지역은 항상 포함 |
| GET | `/home/regions/{regionId}/feeds` | 로그인 | 페이지 | `FeedCard[]` / 200 | 지도와 같은 경로별 판정 |
| GET | `/users/{userId}/feed-map` | 로그인 | `bbox:string,from?:date,to?:date` | `MapResult` / 200 | 해당 멤버 경로의 특정 친구 숨김 적용, 직접 공동 피드 권한과 분리 |
| GET | `/users/{userId}/feeds` | 로그인 | 페이지 | `FeedCard[]` / 200 | 계정 공개 범위·해당 경로 숨김 필터 후 페이지 분할. 비공개 계정 미승인은 200 빈 결과, 없는·탈퇴·가입 대기 회원 404 USER_NOT_FOUND |
| GET | `/users/{userId}/timeline` | 로그인 | 페이지 | `TimelineItem[]` / 200 | 해당 경로 허용된 게시 피드만, 시작일 최신·미정 마지막 |
| GET | `/me/travel-map` | 본인 | `bbox:string,viewerId?:id,from?:date,to?:date` | `OwnMapResult` / 200 | 본인 관리/특정 친구 시점 미리보기, 숨김 수·이유는 본인만 |
| GET | `/me/timeline` | 본인 | 페이지 | `TimelineItem[]` / 200 | 활성 여행·게시 전/날짜 미정 포함, 시작일 최신·미정 마지막 |
| GET | `/trips/{tripId}/timeline` | 멤버 | 없음 | `{items:PlaceTimelineItem[]}` / 200 | 내부 계획/방문·시간·사진 수 |
| GET | `/trips/{tripId}/summary` | 멤버 | 없음 | `TripSummary` / 200 | 내부 요약, 공개 DTO와 분리 |
| GET | `/me/feeds` | 본인 | 페이지 | `OwnFeed[]` / 200 | 본인 여행의 현재 게시된 공동 피드·본인 viewer별 숨김 설정 |
| GET | `/trips/{tripId}/feed` | 멤버 | 없음 | `OwnFeed\|null` / 200 | 미게시/삭제 후 null, 조회가 자동 생성하지 않음 |
| POST | `/trips/{tripId}/feed` | 멤버 | `FeedWrite` | `OwnFeed` / 201 또는 200 | 명시적 공동 게시. trip별 직렬화/유일성, 이미 게시됐으면 기존 200, 게시 알림 없음 |
| PATCH | `/feeds/{feedId}` | 멤버(제안) | `FeedPatch` | `OwnFeed` / 200 | 공동 제목/본문 수정. 항목별 공개 선택·타인 숨김 변경 없음 |
| DELETE | `/feeds/{feedId}` | 멤버 | `expectedVersion:integer`(query) | 204 | 공동 게시 표현 삭제, 모든 멤버 경로에서 제외·다른 멤버 삭제 알림, 원본 여행/경비 유지 |
| POST | `/feeds/{feedId}/delete-own-records` | 멤버 | `{expectedVersion:integer}` | `JobRef` / 202 | 2026-11-10 구현(EODI-257). 공동 피드를 일반 삭제와 같이 내리고(동행 삭제 알림) 요청자 본인의 사진·방문·평가 ID를 승인 시점에 고정해 즉시 숨긴 뒤 OWN_RECORDS_DELETE 작업이 평가→방문→사진·파일 순으로 삭제. 동행 자료·공동 경비·정산·여행 멤버십 유지. 승인 후 만든 자료·재게시된 새 피드는 영향 없음. 버전 불일치 409 VERSION_CONFLICT, 없는·이미 내린 피드·비참여·이탈 404 FEED_NOT_FOUND. 작업은 요청자만 조회 |
| PUT | `/feeds/{feedId}/visibility/me` | 멤버 | `{hiddenViewerUserIds:id[],expectedVersion:integer}` | `FeedVisibility` / 200 | 본인 경로의 숨길 친구 전체 교체, 독립 설정 버전 검사 |
| GET | `/feeds/{feedId}` | 로그인(제안) | 없음 | `Feed` / 200 | 게시된 공동 피드는 기본 전체 공개. 특정 멤버 숨김은 이 직접 경로를 막지 않음, 삭제 404 |
| GET | `/feeds/{feedId}/summary` | 공동 피드 열람자 | 없음 | `FeedSummary` / 200 | 서버 공통 공개 콘텐츠만, 내부 정산/명단 미노출 |
| GET | `/feeds/{feedId}/preview` | 멤버 | `viewerId:id,viaMemberUserId:id` | `{visible:boolean,feed:Feed\|null}` / 200 | 2026-11-10 구현(EODI-258). viaMemberUserId는 요청자 본인만(아니면 404 FEED_NOT_FOUND, 다른 동행의 숨김 목록 추정 방지). viewer의 계정 판정과 본인 숨김을 따로 검사. 직접 접근과 혼동 금지 |

승기가 수철을 숨기면 수철이 보는 승기의 프로필/피드/지도에서만 제외한다. 세은의 경로나 직접 공동 피드 링크는 계속 볼 수 있다. 경로별 계정 공개/비공개 결합은 Q-3이며 D-5는 공동 기본 공개를 유지하고 개인 프로필 경로는 PUBLIC 또는 ACCEPTED 팔로워만 허용하는 제안이다. 비공개 멤버가 섞인 경우의 최종 정책은 아직 확정하지 않았다.

공개 내용은 서버의 공통 정책으로 결정하고 사용자별 photos/route/reviews/expenses 공개 플래그를 받지 않는다. D-14의 공개 스냅샷은 제안이며 사진·평가·코스가 같은 여행인지와 현재 원본 삭제/이동 여부를 매 조회/파일 경로에서 확인한다. 게시 시점을 기준으로 공통 표현을 만들되 제목/본문 외 편집 범위와 갱신 시점은 Q-3이다. EXIF 위치는 공개 파일에서 제거한다.

삭제는 feeds 행을 tombstone으로 보존하는 제안이며 여행당 유일성을 유지한다. 재게시 허용/ID 재사용은 Q-3 합의 전 POST가 409 FEED_REPUBLICATION_PENDING을 반환한다. 게시와 삭제의 경합은 trip 잠금·피드 version으로 직렬화하고 삭제 시 모든 노출·지도·파일·요약·추천 참조에서 즉시 제외한다. 개인 저장은 이름·위치·내 메모만 유지한다. 삭제 알림은 결정 Q-3을 우선하고 흐름 문서의 ‘삭제해도 알림 없음’은 승계하지 않는다. 게시 알림은 없다.

사진 이동 후 batchId는 업로드 당시 출처로 유지하고 등록 때의 여행/배치 일치 검사를 이동 후 현재 여행 불변식으로 확대하지 않는다. 사진 이동은 양쪽 멤버십·버전 검사 뒤 원본 공동 피드 사진·표지·방문 후보를 제외/무효화하고 자산 귀속·분류를 함께 갱신한다. 실제 방문 기록은 자동 이동하지 않는다. 본인 자료 일괄 삭제는 피드 경유 `POST /feeds/{feedId}/delete-own-records`로 사진·방문·평가만 지우고 공동 정산은 보존한다. 이동한 사진은 원래 배치를 계속 가리키므로 원래 여행을 삭제해도 그 배치는 출처로 남고(생성 멤버 참조만 비움) 이동한 사진·파일이 모두 사라지면 정리한다. 같은 사진 등록 재요청은 사진의 현재 여행 경로로만 기존 결과를 돌려주고 원래 여행 경로는 404 ASSET_NOT_FOUND. 이동과 동시에 원래 여행 권한으로 시작한 다운로드는 404.

## 9. 채팅·알림·작업 조회

근거: WD-FR-33~34, WD-NFR-02. 여행 그룹 채팅만 제공한다. 아래 REST는 조회/전송 계약이고, 새 메시지의 실시간 전달은 아래 「채팅 실시간 전달」(2026-11-04 A·B 합의, 보내기는 REST 그대로)을 따른다. 코스 공동 편집 프로토콜은 Q-15에서 합의한다. 2026-11-02 Q-13 확정(REST 범위): 신규·재참여 ACTIVE 멤버 모두 여행 채팅의 처음부터 전체 대화를 보고(이탈 기간 포함), LEFT·REMOVED는 조회·전송할 수 없다. 첨부·일반 메시지 편집/삭제·대화 읽음 규격은 추가하지 않는다. 방 참여 권한은 현재 여행 ACTIVE 멤버십이며, `/chat/rooms/{roomId}/**`에서 삭제된 여행·비참여·이탈한 방은 모두 404 `CHAT_ROOM_NOT_FOUND`(여행 경로인 `GET /trips/{tripId}/chat-room`은 404 `TRIP_NOT_FOUND`).

| Method | URL | 권한 | 요청 | 성공 data / 상태 | 주요 규칙 |
| --- | --- | --- | --- | --- | --- |
| GET | `/chat/rooms` | 본인 | 페이지 | `ChatRoom[]` / 200 | 현재 접근 가능한 방만(ACTIVE 멤버인 삭제 안 된 여행). 방 생성 역순(createdAt DESC, id DESC) 커서 |
| GET | `/trips/{tripId}/chat-room` | 멤버 | 없음 | `ChatRoom` / 200 | 여행당 그룹 채팅방 하나 |
| GET | `/chat/rooms/{roomId}/messages` | 방 참여자 | `beforeSequence?:integer,limit?:integer` | `Message[]` / 200 | 공통 cursor 미사용. sequence 내림차순·경계값 미포함, limit 기본 20·최대 100. 응답 page는 `nextBeforeSequence`·`hasNext`(아래 문단), `cursor`와 혼용하면 400 |
| POST | `/chat/rooms/{roomId}/messages` | 방 참여자 | `{clientMessageId:id,text:string}` | `Message` / 201 | 같은 sender/clientMessageId·같은 방·같은 본문은 최초 응답(201). 다른 방·본문 재사용 409 `CLIENT_MESSAGE_ID_REUSED`. 본문은 받은 그대로 저장, 공백만·NUL 문자 포함은 400, 최대 1,000자(코드 포인트). 방 행 잠금으로 sequence를 빈틈없이 발급 |
| GET | `/me/notifications` | 본인 | `unreadOnly?:boolean` + 페이지 | `Notification[]` / 200 | 실행/복귀 팝업도 동일 목록 사용 |
| PATCH | `/me/notifications/{notificationId}` | 수신자 | `{read:true}` | `Notification` / 200 | 읽음 멱등 |
| DELETE | `/me/notifications/{notificationId}` | 수신자 | 없음 | 204 | 본인 목록에서 숨김 |
| POST | `/me/notifications/read-all` | 본인 | `{through:datetime}` | `{updatedCount:integer}` / 200 | 서버 반환 시각 이하만 읽음 처리, 이후 도착 알림 유지 |
| POST | `/me/events/{eventId}/read` | 이벤트 수신자 | 없음 | `{eventId:id,readAt:datetime}` / 200 | 동일 이벤트의 알림·채팅 시스템 카드 읽음 동기화 |
| GET | `/me/notification-summary` | 본인 | 없음 | `{unreadCount:integer,asOf:datetime}` / 200 | 숨김·권한 필터 적용한 배지 |
| GET | `/jobs/{jobId}` | kind별 권한 | 없음 | `Job` / 200 | AI는 현재 권한, 정리는 요청자 전용 결과. 아래 권한표 적용 |

메시지 페이지 응답은 `{data:Message[],page:{nextBeforeSequence:integer\|null,hasNext:boolean}}`이다. 최초 요청은 최신부터 반환하고, 다음 요청은 직전 페이지의 최소 sequence보다 작은 메시지를 반환한다. `cursor`와 혼용하면 400이다. 일반 목록의 createdAt 정렬과 섞지 않는다.

| 작업 kind | 실행·결과 조회 권한 |
| --- | --- |
| PLACE_EXTRACTION | 활성 계정인 요청자만. 여행 멤버에게 개인 캡처/추출 결과를 자동 공유하지 않음 |
| TRIP_RECOMMENDATION / ITINERARY_PROPOSAL / WEATHER_ALTERNATIVES / CHECKLIST_SUGGESTIONS / PHOTO_CLASSIFICATION / VISIT_DETECTION / ROUTE_RECALCULATION | 활성 계정 + 현재 ACTIVE 멤버십 + 동의 검사. 요청자라는 이유로 이탈 후 계속 조회할 수 없음 |
| LEAVE_CLEANUP / PHOTO_DELETE / TRIP_DELETE | 승인 시 고정한 scope로 실행. 활성 계정인 최초 요청자는 그룹 이탈·여행 삭제 뒤에도 본인 요청의 최소 진행 상태만 조회. 다른 멤버는 조회 불가 |
| ACCOUNT_DELETE | 202 접수와 계정 비활성화를 한 트랜잭션으로 처리하고 모든 세션 폐기. 접수 이후 별도 폴링은 제공하지 않으며 응답은 `{accepted:true}`. 작업은 서버가 계속 수행 |

삭제 작업 응답에는 사진·메시지 내용이나 다른 사람의 자료를 포함하지 않는다. 재시도는 최초 승인된 대상 ID만 처리하며 신규 멤버십/동의가 없다고 기존 삭제 작업을 중단하지 않는다.

jobs 공통 기반은 PostgreSQL 등록·실행·조회만 제공한다. kind별 실행기와 등록·실행·완료·조회 정책이 모두 등록된 기능만 활성화하며, 현재 운영 실행기는 정리 작업 TRIP_DELETE·LEAVE_CLEANUP·PHOTO_DELETE와 AI 준비물 제안 CHECKLIST_SUGGESTIONS, AI 장소 추출 PLACE_EXTRACTION(2026-11-09), AI 코스 제안 ITINERARY_PROPOSAL(2026-11-09, reason INITIAL만), 사진 분류 PHOTO_CLASSIFICATION이다. 공통 생성·재시도·취소 API는 제공하지 않는다(작업 취소는 `DELETE /extractions/{jobId}`처럼 자원별 API만). 조회 불가·없는 작업은 모두 404 `JOB_NOT_FOUND`다. 정리 result는 `{scope:LEAVE_CLEANUP|PHOTO_DELETE|TRIP_DELETE,completedCount:integer,failedCount:integer}`만 공개한다. `scope`는 작업 종류이며 대상 ID·본문·파일은 반환하지 않는다. PHOTO_DELETE의 completedCount는 최초 승인 사진 수(1)이며 전체 여행 정리가 먼저 제거한 경우도 완료로 센다. 내부 SPI와 재시도·임대 보장은 [jobs 기반 문서](../EodiLog/docs/plan/jobs-foundation.md)를 따른다.

PHOTO_DELETE가 재시도 한도(기본 3회)를 소진해 FAILED가 되어도 삭제 승인은 유지된다. 예약 cleaner(기본 1시간 간격, `app.assets.cleanup-delay`)는 signed PUT 만료 후 다음 실행부터 DELETING 파일의 원본/표시 객체 삭제를 계속 시도한다. 사진 참조가 모두 논리 삭제된 경우에도 파일 정리는 가능하며, 살아 있는 사진이 참조하면 해당 파일 쌍을 지우지 않는다. 참조 중인 사진 tombstone과 asset 행/FK는 보존하므로 실패한 작업의 상태는 계속 FAILED이고 중복 DELETE도 같은 FAILED 작업을 반환한다. fallback 객체 정리 성공을 job 성공으로 바꾸지 않으며, 참조가 남아 있는 동안 늦은 PUT 객체도 반복 정리한다.

사용자가 임의 알림·시스템 메시지를 만드는 API는 없다. 서버 이벤트로 알림과 시스템 메시지를 생성하고 `eventId`로 중복을 막는다. 전송 시점과 링크 진입 시점에 모두 권한을 검사한다. 팔로우 요청/수락·투표 마감/자동 결과·여행 참여·코스 변경 이벤트를 포함한다. 정산 완료·사진 동의·코스 승인 이벤트는 제거한다. 코스 연속 변경의 묶음 키/시간창·최종 상태·시스템 카드 연동은 Q-16 합의 전 확정하지 않는다. 실제 송금 확인·푸시·채팅 첨부·일반 메시지 수정/삭제·대화 전체 읽음 규격은 추가하지 않았다. 시스템 카드 읽음은 event_receipts를 통해 알림과 연결한다. 그룹 이탈 시 삭제 선택은 §4 이탈 API로 제공한다.

2026-11-04 A의 알림 기반 단계에서는 `events`·`notifications`·`event_receipts`, 위 조회·읽음 API, 업무 트랜잭션 안에서 호출하는 `NotificationEventRegistrar.register(EventCommand, recipientUserIds)`를 제공한다. 등록은 동일 `deduplicationKey`에 멱등이며 여행 수신자는 등록 시와 조회 시 현재 ACTIVE 멤버십을 검사한다. 기존 `TripInfoChangedEvent`만 동기 리스너로 연결했다. 나머지 이벤트 생산자, 설정별 수신 차단, 푸시·채팅 시스템 카드는 각 기능 연동 단계에서 붙인다. 알림 목록은 `createdAt DESC, id DESC` 커서, 기본 20·최대 100개다. 미래 `through`는 400이다.

### 채팅 실시간 전달

STOMP over WebSocket으로 서버 → 앱 전달만 한다. 메시지 보내기는 위 `POST /chat/rooms/{roomId}/messages`이고 WebSocket `SEND`는 받지 않는다.

| 항목 | 규칙 |
| --- | --- |
| 연결 | `GET /ws`(`/api/v1` 밖, SockJS 없음). 핸드셰이크는 인증 없이 열린다 |
| 인증 | STOMP `CONNECT` 프레임 헤더 `Authorization: Bearer <access>`. REST와 같은 검사로 잘못된·만료 토큰·폐기된 세션은 `UNAUTHENTICATED`, 가입 대기는 `PROFILE_INCOMPLETE`. URL에 토큰을 싣지 않는다 |
| 구독 | `/user/queue/chat` 하나만. 다른 목적지 구독·`SEND`는 `FORBIDDEN` |
| 오류 | STOMP `ERROR` 프레임. `message` 헤더에 오류 코드, 본문은 §2 실패 형식(`{"error":{code,message,fields,traceId}}`). ERROR 뒤 서버가 연결을 닫는다 |
| 토큰 만료 | 연결에 쓴 access 토큰의 만료 시각에 `ERROR UNAUTHENTICATED`로 닫는다. 앱은 갱신 API로 새 토큰을 받아 다시 연결한다 |
| 하트비트 | 서버·앱 10초(`10000,10000`) |
| 이벤트 | `{"type":"MESSAGE_CREATED","roomId":id,"message":Message}`. 메시지 저장이 커밋된 뒤 그 방 여행의 지금 ACTIVE 멤버 전원(보낸 사람 포함)에게 보낸다. 이탈·내보내기·여행 삭제 뒤에는 받지 않는다. 같은 `clientMessageId` 재전송은 다시 보내지 않는다. 보낸 사람은 REST 201과 이벤트를 둘 다 받으므로 `message.id`로 하나만 남긴다 |
| 전달 보장 | 최선 노력. REST가 기준이다 |
| 재접속 복구 | 연결 → `/user/queue/chat` 구독을 먼저 → 열린 방마다 최신 메시지 페이지를 다시 받고 기억하던 마지막 sequence까지 `beforeSequence`로 이어 받는다. 이벤트 sequence가 마지막+1보다 크면 같은 방법으로 빈칸을 채우고, 같은 sequence는 덮어쓴다 |

나가기 "내 채팅 삭제"로 지운 본문, 참여자 변경, 입력 중·읽음은 실시간으로 보내지 않는다. 다시 불러오면 반영된다.

### 실시간 공동 편집·기간·알림의 공통 동작

- 그룹 즐겨찾기/코스의 현재 버전·접속/편집 중 멤버·성공한 변경을 실시간 전달해야 한다. REST 조회/저장은 복구용 계약이고 WebSocket/SSE 등 전송·메시지 스키마·presence TTL·저장 단위/버튼 결합·재접속 재동기화는 Q-15다. 구현 전 전송 규격을 추가해야 한다. 연결 중 변경을 조용히 유실하지 않고 연결 단절 복귀 때 충돌 안내를 제공한다.
- 여행 상태는 기간에 따라 자동 전환한다. 날짜 미정은 PLANNING, 시작/종료 경계의 현지 시간대·서버 작업 시점은 Q-4에서 합의한다. status 직접 쓰기를 받지 않으며 날짜 수정 시 파생 상태를 다시 계산한다.
- 투표 기본 마감은 화면에서 서버 시각 기준 +24시간으로 제안하고 명시적 closesAt을 제출한다. 마감 1시간 전 현재 미투표자만 알린다. 짧은 마감/마감 변경·재개 정책은 Q-6이다. 결과는 여러 지역을 날짜별 배분 가능하게 반환하고 확정 장소는 후보 상단에 표시한다.
- 알림 종류는 FOLLOW_REQUESTED/ACCEPTED, TRIP_MEMBER_JOINED, TRIP_INFO_CHANGED, POLL_OPENED/CANDIDATE_ADDED/REMINDER/FINALIZED/CLOSED_NO_VOTES, AI_PROPOSAL_READY, COURSE_CHANGED, FEED_DELETED 제안이다. 후보 추가는 현재 투표한 멤버, reminder는 미투표자에게만. 게시·방장 양도·승인 요청·사진 동의·정산 완료 이벤트는 생성하지 않는다.
- 현재 서버가 남기는 알림(2026-11-05): `TRIP_INFO_CHANGED`(여행 수정·지역 투표 확정), `TRIP_MEMBER_JOINED`(초대 수락으로 멤버십이 새로 생기거나 재참여, 이미 참여 중인 재수락은 제외), `POLL_OPENED`, `POLL_CANDIDATE_ADDED`(그 투표에 표를 낸 멤버만), `POLL_FINALIZED`·`POLL_CLOSED_NO_VOTES`(투표당 한 번, 서버 마감이라 행동한 사람 없음), `POLL_REMINDER`(마감까지 1시간 이하로 남은 OPEN 투표의 미투표 멤버에게 투표당 한 번, 1분 주기), `COURSE_CHANGED`(코스 version이 오른 저장마다 1건, 묶음은 Q-16). 수신자는 그 여행의 지금 ACTIVE 멤버이며 행동한 본인은 받지 않는다. `target`은 투표 알림이 `POLL`/pollId, 참여 알림이 `TRIP`/tripId, 코스 알림이 `ITINERARY`/tripId다. 2026-11-10부터 `FOLLOW_REQUESTED`(비공개 계정에 요청, 대상에게)·`FOLLOW_ACCEPTED`(수락, 요청자에게)도 남긴다. 여행에 묶이지 않고(tripId 없음) `target`은 `USER`/상대 userId이며, 받는 사람의 팔로우 요청 알림 설정이 꺼져 있으면 만들지 않는다.
- 팝업은 POLL_OPENED/REMINDER, FOLLOW_REQUESTED, AI_PROPOSAL_READY처럼 내 행동이 필요한 이벤트만, 나머지는 목록으로 제공한다. 여행 이벤트는 해당 여행 그룹 시스템 카드에 연결하고 팔로우 이벤트는 여행 채팅에 넣지 않는다. 코스 변경 묶음 키/시간창·건수/최종 상태·읽음/카드 갱신은 Q-16이며 임의 수치를 확정하지 않는다.

## 10. 요청·응답 DTO

아래 DTO는 `data` 내부의 실제 반환 필드다. 나열하지 않은 `id`·시각·버전 필드를 자동으로 덧붙이지 않는다. DB에 존재해도 공개 DTO에 없으면 반환하지 않는다. 별도 선택 표기가 없는 반환 필드는 필수이며 값이 없을 때는 명시한 null을 사용한다. 모든 날짜시각은 ISO 8601 문자열, date는 `YYYY-MM-DD`, 금액·카운트·버전은 정수다. `TripStatus`는 PLANNING/ONGOING/COMPLETED다. 신규 영속 ID는 UUIDv7로 생성하며 기존 UUIDv4 ID도 유효하다. 문자열 길이 상한은 각 API의 명시된 제약을 따르고, 미기재 항목은 구현 전 확정한다.

| DTO | 필드와 의미 |
| --- | --- |
| OAuthAuthorization | `authorizationId:id,authorizationUrl:string,state:string,expiresAt:datetime`. 앱이 보관한 verifier의 S256 challenge에 바인딩. 기본 만료 300초(환경 설정). 외부 브라우저에서 authorizationUrl을 열고 앱 redirect의 code/state를 수신 |
| OAuthExchange | `authorizationId:id,code:string,redirectUri:string,state:string,codeVerifier:string`. verifier는 RFC 7636의 43~128자. provider·state·만료·redirect·S256 challenge 일치 후 컨텍스트 원자적 일회 소비. 제공자 실패도 재사용 불가, 인가 시작부터 재시도 |
| Session | `accessToken:string,refreshToken:string,expiresIn:integer,user:MyProfile,isNewUser:boolean` |
| UserCard | `id,nickname:string,profileImageUrl:string\|null,accountVisibility:PUBLIC\|PRIVATE,followingStatus:NONE\|REQUESTED\|ACCEPTED,followedByStatus:NONE\|REQUESTED\|ACCEPTED`. followingStatus는 보는 사람→카드 주인, followedByStatus는 카드 주인→보는 사람이며 양방향 독립. profileImageUrl은 `/assets/{assetId}/download`, 탈퇴 회원은 null. 연령·이메일 미반환 |
| Follow | `id,follower:UserCard,followee:UserCard,status:REQUESTED\|ACCEPTED,requestedAt:datetime,acceptedAt:datetime\|null` |
| FeedVisibility | `feedId:id,hiddenViewerUserIds:id[],version:integer,updatedAt:datetime`. 본인 경로의 특정 친구별 숨김, 피드와 독립 버전 |
| MyProfile | UserCard + `ageBand:AgeBand\|null,ageUseConsent:boolean,profileCompleted:boolean,profileUrl:string`. AgeBand=TEENS/TWENTIES/THIRTIES/FORTIES/FIFTIES/SIXTIES_PLUS. 본인 응답의 followingStatus·followedByStatus는 NONE |
| ProfilePatch | 모두 선택 `nickname?:string,accountVisibility?:PUBLIC\|PRIVATE,profileImageAssetId?:id\|null,ageBand?:AgeBand\|null,ageUseConsent?:boolean`. 보낸 필드만 바꾸며 null은 profileImageAssetId(사진 지우기)·ageBand(지우기)에만 허용. 빈 본문 400 |
| PublicProfile | UserCard 필드 + `followerCount:integer,followingCount:integer`. 수는 상대가 활동 중·가입 완료인 ACCEPTED 관계만, PRIVATE 계정도 공개. 공동 피드 수·연령·동의·이메일 미반환 |
| FollowSuggestion | `user:UserCard,reason:{kind:CO_TRAVELER\|FOLLOWS_YOU,count?:integer}`. count는 CO_TRAVELER의 함께한 여행 수이고 FOLLOWS_YOU에는 필드가 없다. 2026-11-10 `reason:string`에서 변경, 문구는 앱이 붙인다 |
| PreferencesWrite | `explicitItems:{key:string,value:string}[],allowInference:boolean,sharingScope:EXPLICIT_ONLY\|EXPLICIT_AND_INFERRED\|NONE`. 직접 입력만 교체, 추론 생성과 공유를 구분 |
| Preferences | `explicitItems:{key:string,value:string}[],inferredItems:{key:string,value:string}[],allowInference:boolean,sharingScope:string,updatedAt:datetime`. 추론 거부 시 이후 생성/활용 중단, 삭제·보존 Q-11 |
| Trip | `id,title,startDate:date\|null,endDate:date\|null,destinationRegionIds:id[],status:TripStatus,currency:KRW,ownerMemberId:id,members:Member[],version:integer,expenseVersion:integer` |
| Member | `id,user:UserCard,role:OWNER\|MEMBER,status:ACTIVE\|LEFT\|REMOVED,joinOrder:integer,joinedAt:datetime,leftAt:datetime\|null` — role은 owner FK로 계산 |
| InvitationSecret | `id,token:string,url:string,expiresAt:datetime`. 원문 토큰은 생성 시만 반환, 코드 없음 |
| InvitationPreview | `tripTitle:string,startDate:date\|null,endDate:date\|null,inviter:{nickname:string},inviterUser:UserCard\|null,expiresAt:datetime,alreadyMember:boolean`. 익명 inviterUser=null, 로그인 시만 본인 기준 관계 상태 포함. alreadyMember는 로그인한 사람이 이미 ACTIVE 멤버일 때만 true |
| LeaveResult | `tripId:id,tripDeleted:boolean,newOwnerMemberId:id\|null,cleanupJobId:id\|null,status:LEFT\|TRIP_DELETED`. 일반 이탈은 LEFT·cleanupJobId null(200), 내 채팅 삭제로 지울 메시지가 있으면 LEFT·LEAVE_CLEANUP 작업 ID(202), 혼자 남은 사람의 이탈은 TRIP_DELETED·TRIP_DELETE 작업 ID(202) |
| Region | `id,code:string,name:string,parentId:id\|null,latitude:number\|null,longitude:number\|null` |
| Place | `id,name,address:string\|null,latitude:number,longitude:number,regionId:id\|null,provider:string\|null,providerPlaceId:string\|null,source:PROVIDER\|MANUAL,category:string\|null,imageUrl:string\|null`. category는 공급자 분류 문자열(예: `음식>커피점/카페>카페`, `카페,디저트>카페`), 모르면 null. 앱이 사진 없는 장소에 업종 아이콘을 그릴 때 쓴다. imageUrl은 대표 사진 원본 주소(한국관광공사 firstimage, https로 바꿔 저장. 공공누리 제1유형이라 앱이 출처를 적는다), 네이버·소상공인 장소는 null(2026-11-14) |
| Bookmark | `place:Place\|null,retainedPlace:{name:string,latitude:number,longitude:number},memo:string\|null,sourceFeedId:id\|null,sourceUnavailable:boolean,createdAt:datetime`. 소실 시 place=null/sourceFeedId=null·retainedPlace/내 메모만 유지, 내부 원본 필드 미포함 |
| SavedPlace | `place:Place,savedBy:{memberId:id,memo:string\|null}[],savedCount:integer` |
| JobRef | `jobId:id,status:QUEUED,statusUrl:string` |
| Job | `id,kind:string,status:QUEUED\|RUNNING\|SUCCEEDED\|FAILED\|CANCELLED,progress:integer,result:object\|null,error:{code:string,message:string}\|null(FAILED·CANCELLED에서만),createdAt:datetime,finishedAt:datetime\|null` |
| ExtractionResult | `job:Job,resultStatus:SUCCESS\|MULTIPLE_CANDIDATES\|NOT_FOUND\|FAILED\|null,candidates:{candidateId:id,name:string,place:Place\|null,evidence:string,confidence:number\|null}[],regionHint:string\|null`. regionHint는 자료에 글자로 보인 지역 단서(인스타 위치 태그·본문·주소, 30자 이하). 장소를 못 찾았을 때 앱이 그 지역에서 검색하게 한다(2026-11-16). 식별 불가는 처리 성공과 별개. 작업이 SUCCEEDED가 아니면 resultStatus=null·candidates=[]. place는 AI가 찾은 네이버 장소를 공급자 ID로 upsert한 로컬 장소(regionId는 주소의 시·도·시군구로 찾고, 못 찾으면 null), 못 찾으면 null·confidence null. 같은 name의 후보는 한 언급의 여러 지점. FAILED는 모든 자료를 읽지 못함(2026-11-09) |
| RecommendationResult | `job:Job,items:{type:REGION\|PLACE,region:Region\|null,place:Place\|null,reason:string}[],basis:{sharedPlaceCount:integer,usedMemberCount:integer},insufficientData:boolean` |
| DiscoveryItem | `type:FEED\|PLACE,feed:FeedCard\|null,place:Place\|null,reason:string` |
| TrendRegion | `region:Region,rank:integer,previousRank:integer\|null,rankChange:integer\|null,isNew:boolean,publishedTripCount:integer,followingCount:integer,from:date,to:date,sampleSize:integer,updatedAt:datetime,insufficientData:boolean`. 권한 필터 후 집계, 기간/집계 정의 Q-9 |
| CandidateInput | `regionId?:id,placeId?:id` — 유형에 맞는 하나만 필수 |
| Poll | `id,tripId,type:REGION\|PLACE,title,status:OPEN\|CLOSED\|FINALIZED,version:integer,closesAt:datetime,closedReason:DEADLINE\|NO_VOTES\|null,eligibleMemberCount:integer,votedMemberCount:integer,candidates:{id,regionId:id\|null,placeId:id\|null,voteCount:integer,addedAt:datetime}[],myCandidateIds:id[],selectedCandidateIds:id[]`. 0표 CLOSED·결과 [], 공동 최다 전부 FINALIZED. 진행 중에는 지금 ACTIVE 멤버의 표로 집계(나간 멤버의 표 제외, 재참여하면 다시 셈)하고 마감 때 인원·득표를 고정한다. 후보는 입력·추가 순 |
| ItineraryWrite | `expectedVersion:integer,items:{id?:id,placeId:id,day:integer,order:integer,startTime?:string\|null,stayMinutes?:integer\|null}[],legs:{day:integer,fromOrder:integer,toOrder:integer,transportMode:WALK\|CAR\|TRANSIT}[]`. 전체 교체, 시간 생략=null. WALK/CAR/TRANSIT 확정 |
| Itinerary | `tripId,version:integer,items:ItineraryItem[],legs:RouteLeg[],updatedByMemberId:id,updatedAt:datetime`. 현재 단일 코스, 새 여행 version=1·빈 items/legs. confirmed·승인 capabilities 없음 |
| ItineraryItem | `id,place:Place,day:integer,order:integer,startTime:string\|null,stayMinutes:integer\|null` |
| RouteLeg | `fromItemId:id,toItemId:id,transportMode:string,durationSeconds:integer\|null,distanceMeters:integer\|null,geometry:{type:LineString,coordinates:number[][]}\|null,status:AVAILABLE\|UNAVAILABLE,queriedAt:datetime`. 좌표 순서는 경도·위도, 경로 조회 실패 시 geometry도 null. AVAILABLE은 이동 시간이 있다는 뜻이며 AI 코스 제안을 적용한 구간은 거리·지도선이 null일 수 있다(2026-11-09) |
| ItineraryProposal | `job:Job,baseVersion:integer,reason:string,proposed:CourseContent\|null,diff:{removedPlaceIds:id[],addedPlaceIds:id[],description:string},appliedAt:datetime\|null,canUndo:boolean`. 2026-11-09 구현: proposed.items[].id는 유지되는 기존 항목이면 그 ID, 새 항목이면 null. proposed.legs[]는 RouteLeg에 `day,fromOrder,toOrder`를 더해 새 항목 사이 구간도 가리키며 fromItemId·toItemId는 새 항목이면 null, distanceMeters·geometry는 null. 장소는 요청 당시 고정한 Place, diff의 두 목록은 백엔드가 요청 당시 코스와 비교해 계산하고 description만 AI 문구 |
| ProposalWrite | `reason:INITIAL\|PLACE_REMOVED\|WEATHER,expectedVersion:integer,defaultTransportMode?:WALK\|CAR\|TRANSIT,excludedPlaceIds?:id[],sourceWeatherJobId?:id,selectedAlternativeId?:id`. INITIAL의 default는 새 구간 생성용 힌트이며 결과는 구간별 수단. PLACE_REMOVED는 제외 장소 필수, WEATHER는 원본 작업·선택 대안 필수 |
| Visit | `id,tripId,memberId:id,placeId:id,visitedAt:datetime,evidenceType:MANUAL\|PHOTO,reviewId:id\|null,reviewScore:integer\|null`. 본인 방문 확인 후만 평가 가능 |
| Weather | `placeId:id,date:date,queriedAt:datetime,forecastAt:datetime,source:string,condition:string,temperatureCelsius:number\|null,minCelsius:number\|null,maxCelsius:number\|null,precipitationProbability:number\|null,hourly:{at:datetime,condition:string,temperatureCelsius:number\|null,precipitationProbability:number\|null}[],stale:boolean`. 확률 0~1 제안, 미확인은 null. 2026-11-09: source는 `KMA_SHORT_TERM_FORECAST`·`KMA_MID_TERM_FORECAST`, condition은 `CLEAR`·`PARTLY_CLOUDY`·`CLOUDY`·`RAIN`·`RAIN_SNOW`·`SNOW`·`SHOWER`·`UNKNOWN`(강수가 있으면 강수 값). forecastAt은 기상청 발표 시각, temperatureCelsius는 오늘만(지금과 가장 가까운 시간), 일 강수확률은 그날 최댓값 |
| Facility | `providerId:string,name:string,type:string,latitude:number,longitude:number,walkingSeconds:integer\|null,availability:string\|null,queriedAt:datetime`. 실시간 상태 미확인은 null. 2026-11-11(EODI-304): providerId는 충전소면 공급자 충전소 ID, 그 밖은 우리 UUID이고 한 목록에서 겹치지 않는다. walkingSeconds는 직선거리×1.3을 시속 4.5km로 어림한 값. availability는 충전소만 사용자에게 보일 문장(`급속 2대·완속 1대 사용 가능`, `모두 충전 중`, `운영 중지·점검 중`). queriedAt은 충전소면 마지막 상태 갱신 시각, 그 밖은 응답 시각 |
| ChecklistItem | `id,label:string,checked:boolean,checkedByMemberId:id\|null,checkedAt:datetime\|null,source:MANUAL\|AI,sourceJobId:id\|null,reason:string\|null,modifiedByUser:boolean,version:integer` |
| UploadIntent | `assetId:id,uploadUrl:string,method:PUT,headers:object,expiresAt:datetime` — 업로드 URL 사용에는 API 인증 헤더를 자동 전달하지 않음 |
| Asset | `id,purpose:string,status:PENDING\|READY\|DELETING\|DELETED\|CANCELLED,contentType:string,byteSize:integer,tripId:id\|null` |
| PhotoUploadBatch | `id,tripId:id,fileCount:integer,registeredCount:integer,createdAt:datetime`. fileCount 1~50, 소유자/여행별 등록 예약 상한으로 중복 재시도 방지 |
| Photo | `id,assetId,tripId,batchId:id,uploaderMemberId:id,placeId:id\|null,capturedAt:datetime\|null,topics:string[],groupId:id\|null,version:integer` |
| Review | `id,visitId,authorMemberId:id,score:integer,body:string,version:integer,createdAt:datetime,updatedAt:datetime,visit:{placeId:id,visitedAt:datetime},place:{name:string,address:string\|null}\|null`. visit·place는 평가 목록 화면용 요약(2026-11-05) |
| ExpenseWrite | `title:string,memo?:string\|null,amountMinor:integer,currency:KRW,payerMemberId:id,participantMemberIds:id[],spentAt:datetime`. 양수 원화 정수, 균등 원금 분담. 정산 올림과 구분. 빈 memo는 null로 저장하고 응답 memo도 null일 수 있다 |
| ExpensePatch | ExpenseWrite의 변경 필드 + 필수 `expectedVersion:integer`. 분담자 변경은 전체 배열 교체. `memo:null`은 메모 삭제, 생략은 유지 |
| Expense | ExpenseWrite + `id,registeredByMemberId:id,shares:{memberId:id,amountMinor:integer}[],version:integer` |
| Settlement | `id,tripId,currency:KRW,expenseVersion:integer,version:integer,stale:boolean,totalAmountMinor:integer,includedExpenses:{expenseId:id,expenseVersion:integer,title:string,amountMinor:integer,payerMemberId:id,shares:{memberId:id,amountMinor:integer}[]}[],members:{memberId:id,paidMinor:integer,baseOwedMinor:integer,owedMinor:integer,roundingAdjustmentMinor:integer,balanceMinor:integer}[],transfers:{id,fromMemberId:id,toMemberId:id,amountMinor:integer}[],roundingPolicy:string,roundingAdjustmentMinor:integer,calculatedAt:datetime`. owedMinor=1인 올림 부담액·10원 배수, base 원금/차액 구분. 송금액 재올림 없음, 완료 상태 없음. members는 경비에 결제자·분담자로 나온 멤버(이탈 포함)를 참여 순으로, roundingAdjustmentMinor(멤버)=owed-base, balance=paid-owed(+차액 수령자는 전체 차액). stale은 비용 버전이 바뀌었거나 현재 계산이 아닐 때 true. 계산 결과는 바뀌지 않아 version은 1 |
| FeedCard | `id,tripId,title:string,coverPhotoId:id\|null,regions:Region[],startDate:date\|null,endDate:date\|null,publishedAt:datetime,likedByMe:boolean,likeCount:integer`. 여행당 하나·단일 author 없음 |
| Feed | `id,tripId,title:string,body:string,publishedAt:datetime,coverPhotoId:id\|null,regions:Region[],startDate:date\|null,endDate:date\|null,photos:PublicPhoto[],places:Place[],publicItinerary:CourseContent\|null,publicReviews:PublishedReview[],expenseSummary:PublicExpenseSummary\|null,likedByMe:boolean,likeCount:integer,version:integer`. 서버 공통 공개 표현, include 선택 필드 없음 |
| FeedWrite | `title:string,body:string`. 공개 범위는 공통 정책, 항목별 플래그 없음 |
| FeedPatch | 필수 `expectedVersion:integer` + `title?:string,body?:string`. 공동 편집 세부는 D-4/Q-3 제안. 항목별 공개/친구 ACL/개인 작성자 ID는 받지 않음 |
| PublicPhoto | `id,placeId:id\|null,imageUrl:string,caption:string\|null`. imageUrl은 인증되는 `/assets/{assetId}/download?feedId=...` 경로이며 외부 저장소 영구 URL 아님 |
| FeedSummary | `feedId:id,photoCount:integer,visitedPlaceCount:integer,visitedRegionCount:integer,plannedDistanceMeters:integer\|null,actualDistanceMeters:integer\|null,expenseSummary:PublicExpenseSummary\|null`. 허용된 게시 표현만 집계 |
| MapResult | `markers:{region:Region,feedIds:id[],visibleMemberUserIds:id[],visitCount:integer}[],criteria:{from:date\|null,to:date\|null,regionGrouping:string},updatedAt:datetime`. 비허용 피드 수·위치 미노출 |
| TimelineItem | `tripId:id,feedId:id\|null,date:date\|null,dateBasis:TRIP\|UNKNOWN,status:string`. 여행 시작일 DESC NULLS LAST·동률 tripId DESC 제안, 날짜 미정 묶음은 맨 아래 |
| ChatRoom | `id,type:TRIP,tripId:id,participants:UserCard[],lastMessage:Message\|null` |
| Message | `id,roomId,sequence:integer,senderId:id\|null,type:TEXT\|SYSTEM,text:string\|null,clientMessageId:id\|null,eventId:id\|null,target:{type:string,id:id}\|null,eventReadAt:datetime\|null,createdAt:datetime,deletedAt:datetime\|null` |
| Notification | `id,eventId,kind:string,message:string,target:{type:string,id:id},readAt:datetime\|null,createdAt:datetime` — 임의 이동 URL 대신 대상 타입·ID 반환 |
| UserSettings | `version:integer,ai:{photoClassification:AiMode,visitDetection:AiMode,placeExtraction:AiMode,checklist:AiMode,weather:SUGGEST_ONLY\|OFF},notifications:{followRequests:boolean,voteCourse:boolean,tripChanges:boolean}`. AiMode=AUTO/CONFIRM/OFF. 첫 조회 시 version 1, AI 네 필드 CONFIRM·날씨 SUGGEST_ONLY·알림 세 필드 true로 저장 |
| SettingsPatch | `expectedVersion:integer,ai?:UserSettings.ai의 부분 필드,notifications?:UserSettings.notifications의 부분 필드`. 생략은 유지, null·알 수 없는 필드/모드는 400 VALIDATION_ERROR. 현재 version 일치 시 원자 저장하고 실제 값 변경 때만 version 증가; 불일치는 409 VERSION_CONFLICT |
| SavedPlacePage | `{items:SavedPlace[],totals:{allPlaceCount:integer,overlapPlaceCount:integer,filteredCount:integer},page:{nextCursor:string\|null,hasNext:boolean}}` |
| RegionDetail | `region:Region,introduction:string\|null,representativePlaces:Place[],partialErrors:string[]`. representativePlaces는 최대 5개, 허용된 게시 피드 수 순 |
| PlaceSocialSummary | `place:Place,visitorCount:integer,visitors:UserCard[],averageScore:number\|null,reviewCount:integer,partialErrors:string[]`. 평균·표본은 허용된 게시 평가로만 계산 |
| CourseContent | `items:ItineraryItem[],legs:RouteLeg[]`. 구간마다 transportMode, 코스 전체 수단 없음 |
| PhotoSummary | `totalCount:integer,unplacedCount:integer,topics:{topic:string,count:integer}[],places:{placeId:id,count:integer}[],groups:{groupId:id,count:integer}[]` |
| PhotoBatchWrite | `action:UPDATE\|MOVE\|UNGROUP\|DELETE,photos:{photoId:id,expectedVersion:integer}[],placeId?:id\|null,topics?:string[],targetTripId?:id`. 중복 ID 금지, 해당 action 필드만 허용. MOVE targetTripId 필수, UPDATE 필드 하나 이상 |
| VisitCandidate | `id,memberId:id,place:Place,visitedAt:datetime,evidencePhotoIds:id[],status:PENDING\|CONFIRMED\|INVALIDATED,version:integer,visitId:id\|null`. 후보는 실제 방문으로 집계하지 않음 |
| SettlementState | `current:Settlement\|null,currentExpenseVersion:integer,recalculationRequired:boolean` |
| OwnFeed | Feed + `visibility:FeedVisibility`. 본인 경로 숨김 설정만, 타 멤버 설정 미포함 |
| PublishedReview | `id,placeId:id,author:UserCard,score:integer,body:string,writtenAt:datetime,feedId:id`. 같은 여행의 공통 공개 정책에 따른 평가 게시 스냅샷 |
| PublicExpenseSummary | `{totalAmountMinor:integer,currency:KRW,asOfExpenseVersion:integer}`. 개별 지출·분담/정산 상대 미포함 제안 D-14 |
| OwnMapResult | `markers:{region:Region,tripIds:id[],feedIds:id[]}[],unlocatedTripCount:integer,hiddenTripCount:integer\|null,updatedAt:datetime`. viewerId 없는 hiddenTripCount=null |
| PlaceTimelineItem | `place:Place,plannedAt:datetime\|null,visitedAt:datetime\|null,status:PLANNED\|VISITED,photoCount:integer,plannedDistanceMeters:integer\|null` |
| TripSummary | `tripId:id,photoCount:integer,visitedPlaceCount:integer,visitedRegionCount:integer,plannedDistanceMeters:integer\|null,actualDistanceMeters:integer\|null,totalAmountMinor:integer\|null,currency:KRW` |

### 비동기 작업 kind별 result

| kind | `/jobs/{jobId}`의 result |
| --- | --- |
| PLACE_EXTRACTION | ExtractionResult의 `resultStatus,candidates,regionHint` |
| TRIP_RECOMMENDATION | RecommendationResult의 `items,basis,insufficientData` |
| ITINERARY_PROPOSAL | ItineraryProposal의 `baseVersion,reason,proposed,diff,appliedAt,canUndo` |
| VISIT_DETECTION | `{candidates:VisitCandidate[]}`. 조회 시점의 후보 상태(확정·무효 반영)를 돌려주고 위치·입력 스냅샷은 노출하지 않음. 후보만 만들며 자동 확정은 하지 않음(AUTO도 CONFIRM과 같음) |
| ROUTE_RECALCULATION | `{baseVersion:integer,legs:RouteLeg[]}`. 버전 일치 시 현재 코스 경로만 갱신. legs는 다시 구한 구간만이며 못 구한 구간은 UNAVAILABLE·시간 null로 온다. 반영 여부는 baseVersion과 현재 코스 version을 비교해 안다(2026-11-10) |
| WEATHER_ALTERNATIVES | `{alternatives:{alternativeId:id,type:PLACE_SWAP\|TIME_SHIFT\|INFO,place:Place\|null,itemId:id\|null,targetStartTime:string\|null,activity:string,reason:string}[],weather:Weather,baseVersion:integer}`. 해당 ID를 선택해 proposal 생성 후 적용. 2026-11-09: TIME_SHIFT·PLACE_SWAP의 itemId는 대상 일정, PLACE_SWAP의 place는 요청 때 고정한 후보 중 하나(공개 Place 필드만), weather는 요청 때 고정한 값 |
| CHECKLIST_SUGGESTIONS | `{items:{label:string,reason:string,sourceJobId:id}[]}`. 제안 선택 후 일반 checklist POST로 추가(`suggestionIndex`=items 순번). 공동 목록 제안이라 그 여행의 현재 ACTIVE 멤버 누구나 조회. 빈 items도 성공 |
| PHOTO_CLASSIFICATION | `{photos:{photoId:id,status:SUCCEEDED\|FAILED,topics:string[],groupId:id\|null,errorCode:string\|null}[]}` |
| LEAVE_CLEANUP / PHOTO_DELETE / TRIP_DELETE / OWN_RECORDS_DELETE | `{scope:string,completedCount:integer,failedCount:integer}`. 실제 보존 범위 Q-11. ACCOUNT_DELETE는 서버 내부 작업이며 사용자 폴링 결과 없음 |

작업 result에는 Job을 다시 포함하지 않는다. 자원별 조회 API는 동일 결과에 Job 메타데이터를 덧붙인 표현이다. 일반 AI 작업은 이탈·동의 철회 시 입력 사용과 열람 권한을 재검사한다. 삭제 작업의 실행·최소 진행 상태 조회는 §9의 예외 권한표를 따른다.

### 클라이언트 호출 연결 예시

| 사용자 동작 | 호출 순서 | 유지해야 할 값 |
| --- | --- | --- |
| 첫 일정 만들기 | 여행 생성 → itinerary GET → PUT 또는 INITIAL proposal → 결과 조회 → apply | 현재 version·구간별 수단·작업 baseVersion, 모든 ACTIVE 멤버 가능 |
| 재접속 후 평가 쓰기 | visits GET(memberId=본인,reviewStatus=UNWRITTEN) → 선택한 visitId로 review PUT | 기존 visitId, 평가 작성 때문에 방문을 다시 생성하지 않음 |
| 좋아요 표시 | feed GET → likedByMe/likeCount 표시 → like PUT/DELETE → 필요 시 feed 재조회 | 로그인·열람 권한 검사 후 새로고침에도 상태 복원 |
| 공개 코스 갱신 | 코스 저장 → 서버 공통 공개 콘텐츠 갱신 정책(Q-3) 적용 | 사용자별 항목 공개 토글이나 확정 revision 선택 없음 |
| 날씨 대안 반영 | weather-alternatives 생성/조회 → alternativeId 선택 → WEATHER proposal → apply | 원본 작업·선택 대안·기준 코스 버전, 승인 요청 없음 |

## 11. ERD 연결과 구현 전 확인

| 범위 | PRD | 주요 테이블 |
| --- | --- | --- |
| 가입·관계·그룹 | WD-FR-01~04 | users, oauth_accounts, oauth_attempts, sessions, follows, suggestion_dismissals, trips, trip_members, trip_invitations |
| 장소 수집·저장·취향 | WD-FR-05~08 | assets, jobs(추출 후보는 result_json), places, regions, personal_bookmarks, trip_place_saves, user_preferences, preference_rejections, trip_members |
| 추천·반응·트렌드 | WD-FR-09~11·31 | jobs, feed_likes, visits 및 원본 집계 |
| 투표·일정·여행 중 | WD-FR-12~18 | polls, poll_candidates, poll_votes, poll_results, trip_destinations, itineraries, itinerary_items, itinerary_undo_states, poll_participants(만들지 않음), route_legs, jobs, checklist_items |
| 사진·평가·정산 | WD-FR-19~23 | photos, photo_upload_batches, photo_topics, photo_groups, visits, reviews, expenses, expense_shares, visit_candidates, settlements, settlement_members, settlement_transfers |
| 피드·지도·타임라인 | WD-FR-24~30 | feeds, feed_photos, feed_places, feed_member_visibilities, feed_hidden_viewers, feed_reviews 및 방문·일정 집계 |
| 관리·채팅·알림 | WD-FR-32~35 | 전 자료의 생명주기, chat_rooms, chat_participants, messages, events, notifications, event_receipts, user_settings, idempotency_records |

이 초안에서 다음 항목은 구현 전 합의가 필요하다.

1. **Q-3:** 공통 공개 콘텐츠·비공개 계정 결합·공동 제목/본문 편집·삭제 후 재게시. 수동 게시 생성·기본 전체 공개·특정 친구 본인 경로 숨김·항목별 토글/사진 동의 없음·멤버 누구나 삭제는 적용했다.
2. **Q-6:** 참가자 변동·후보 삭제·재개/짧은 마감 알림. 0표 확정 없이 마감·24시간 기본·동률 모두·1시간 전 미투표자 알림·직후 1단계 되돌리기는 적용했다.
3. **Q-10:** 2026-11-02 확정(여행 합산 후 1회 10원 올림, 차액은 원금 기준 받을 돈이 가장 많은 사람, 이전 계산은 여행이 있는 동안 보관). 최종 송금액 재올림·완료 상태는 추가하지 않는다.
4. **Q-15·16:** 실시간 전송·presence/편집 저장·재접속·AI/undo 경합 및 코스 변경 알림 묶음. 추가 오래된 변경안 확인 화면 없이 서버 검증/재계산을 정해야 한다.
5. **Q-1·2·4·5·7~9·11~14:** 인증/프로필·공개 전환·기간 경계/시간대·추천/사진 판정/집계·용량/보존·채팅 이력 등. 검색/추천 숨김·이미 정한 한도/별점/정렬/준비물은 다시 미정으로 돌리지 않는다. 2026-11-10 연령대 형식(Q-1)·공개 전환 시 기존 관계(Q-2)·친구 추천 후보 규칙은 §3 「회원·팔로우 구현 결정」으로 확정했고, 차단은 미정이다.
6. 사용자 지정 C-1~C-51 원문은 여전히 없어 전체 항목 대조는 미완료이며 팀 전체 합의/구현 완료를 선언하지 않는다. 소스 간 폐기된 종료/확정 팝업·삭제 알림 충돌은 PRD §1.1의 우선순위를 따른다.

검증 사례: 닉네임 검색·영구 추천 숨김, 관계 없는 링크 참여·마지막 이탈=삭제, 수동 게시 유일성·특정 친구 경로 숨김/직접 경로 유지·전체 삭제 알림, 마감 경합·동률 모두·0표 미확정·후보 추가 알림, 10/11캡처·50/51사진·HEIC·정수 별점, 구간 수단·단일 코스·AI 1단계 undo·경합, 공동 준비물 체크 멤버, 시작일 정렬·날짜 미정 마지막, 원금/1인 올림 차액 분리·완료 상태 없음, 그룹 채팅만·이탈자 접근 차단.

문서·DBML 검증은 구현/API 실행 검증을 대체하지 않는다.
