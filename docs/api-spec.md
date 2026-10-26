# 어디로그 API 명세 초안

- 상태: **설계 제안 v0.3**, 2026-10-26. PRD v0.5·화면 기준으로 동기화한 앱→백엔드 계약 초안이며 구현 완료 명세가 아니다.
- 기준: [현행 PRD v0.5](../_bmad-output/planning-artifacts/prds/prd-EODI-2026-10-22/prd.md) 및 `hwang/screens` S00~S50·N 화면. 같은 여행에서도 각자 피드를 게시하고 공개 친구를 선택한다는 후속 확정을 포함한다.
- 데이터 모델: [erd.dbml](erd.dbml). 이 두 파일만 이번 API·ERD 산출물로 관리한다.
- **확정**은 PRD 정책, **제안 D-N**은 초안을 구체화하기 위한 선택, **미정 Q-N**은 PRD에서 남은 결정이다. 제안은 팀 합의 전 확정 요구사항으로 취급하지 않는다.

## 1. 설계 전제

| ID | 제안 | 관련 미정 |
| --- | --- | --- |
| D-1 | `/api/v1`, JSON REST, Bearer 인증, UUID 문자열 ID, UTC 날짜시각. DB 엔진은 미선정 | Q-12 |
| D-2 | 계정 생성·소셜 연결은 provider 사용자 ID 기준. 이메일만 같다고 자동 병합하지 않음. OAuth 교환 방식은 별도 확정 | Q-1 |
| D-3 | 여행이 그룹의 경계다. 별도 재사용 그룹 테이블 없이 `trips`·`trip_members` 사용 | 여행별 그룹 확정 |
| D-4 | 피드는 `(tripId,authorUserId)`당 한 개를 재사용하는 제안. 멤버별 별도 게시·친구별 허용은 확정이며 게시 철회는 본인 게시물에만 적용 | Q-3 |
| D-5 | 계정 PUBLIC/PRIVATE·팔로우 모델 제거. 상호 친구 수락과 게시물별 허용 목록으로 접근 판단. 미게시·허용 목록 비어 있음은 본인만 열람 | 화면·피드 확정 |
| D-6 | 장소는 공급자 ID로 우선 식별. 이름/좌표만 같은 후보를 자동 병합하지 않음 | Q-5 |
| D-7 | 통화는 여행별 하나, 금액은 최소 통화 단위 정수. 나머지 금액은 참여 멤버 ID 오름차순으로 1단위씩 배분 | Q-10 |
| D-8 | 장시간 AI 처리는 비동기 작업으로 조회. 변경안에는 기준 데이터 버전을 기록해 오래된 결과 적용을 거부 | Q-6·12 |
| D-9 | 일반 여행 정보·준비물은 모든 멤버 편집, 그룹 저장 메모는 등록자만 편집, 사진·평가는 작성자만 수정/삭제 | Q-4·7·8 |
| D-10 | 그룹 이탈 시 채팅 삭제는 여행 채팅방의 본인 메시지 본문 삭제, 사진 삭제는 본인 사진·파일의 삭제 작업 요청으로 해석. 구체 보존은 미정 | Q-11·13 |
| D-11 | 1:1 채팅 시작은 상호 친구에게 허용하는 제안. 텍스트 메시지와 시스템 이벤트의 읽음 연결을 우선 계약 | Q-13·14 |
| D-12 | 좋아요 대상은 개인별 게시 피드로 제안. 평가는 방문 기록당 작성자 1개, 점수는 1~5 정수로 제안 | Q-5·7 |
| D-13 | 확정·적용·승인자는 현재 방장, 투표 참여자는 생성 시 ACTIVE 멤버 스냅샷으로 제안. 실제 역할·전원 기준은 미정이므로 서버가 capabilities로 반환 | Q-6 |
| D-14 | 공개 경비는 총액·통화만 제안. 개별 지출·정산 상대는 미공개. 본인 평가·공개 코스·경비는 게시 시 선택한 스냅샷 | Q-3·10 |
| D-15 | 수동 정산은 계산별 송금 항목 완료 및 계산 전체 완료를 별도 저장. 현재 방장이 표시하는 제안이며 실제 송금 증빙이 아님 | Q-10 |
| D-16 | 사진 일괄 변경은 업로더 본인 자료만 한 트랜잭션으로 처리하는 제안. 여행 이동은 양쪽 ACTIVE 멤버십 필요. 타인 편집·원자성 최종 합의 대기 | Q-7 |
| D-17 | 사용자 전역 취향 기본 범위와 여행별 override를 분리하는 제안. 미설정은 NONE, 여행 override가 전역보다 우선 | Q-5 |
| D-18 | 동의는 게시 내용·선택 사진/버전·허용 친구 범위에 한정. 범위 변경 시 기존 동의 무효화·타인 사진 제외. 기한/철회/재동의 세부는 제안 | Q-3 |

기술 스택·사진 한도·초대 정원·토큰 수명·추천 점수·읽음/첨부 등 미정 정책을 임의로 확정하지 않는다. 본문에서 D-N을 다시 표기하지 않아도 해당 제안은 유지된다.

## 2. 공통 계약

- 표의 URL은 `/api/v1` 이후 경로다. `id`·`userId`·`tripId` 등은 UUID 문자열이다.
- 인증은 기본 필수. **공개**는 토큰 없이 허용하는 제안 경로다. 인증된 사용자는 서버 토큰에서 식별하며 요청의 작성자 ID를 신뢰하지 않는다.
- `본인`은 자기 자료, `멤버`는 `ACTIVE` 여행 멤버, `방장`은 `trips.owner_user_id`와 일치하는 ACTIVE 멤버다.
- `작성자` 권한은 경비에서는 **등록자**이며 실제 돈을 낸 사람과 다를 수 있다. 방장에게 타인 경비 편집 권한을 주지 않는다.
- 요청은 표에 명시된 필드만 허용한다. `?`는 선택, `\|null`은 명시적 비우기 가능, `[]`는 배열이다. PATCH 생략 필드는 유지한다.
- 성공 응답은 `{ "data": ... }`, 목록은 `{ "data": [...], "page": { "nextCursor": null, "hasNext": false } }`. DELETE 성공은 `204` 본문 없음.
- 목록 공통 `cursor?:string`, `limit?:integer`(제안 기본 20, 최대 100). 정렬은 기본 `createdAt DESC,id DESC`로 고정하고 커서에 정렬 키를 포함한다. 메시지 목록은 §9의 sequence 전용 규칙을 사용한다. 지도·집계·계산 결과는 배열 필드를 가진 단일 객체다.
- `bbox`는 `minLongitude,minLatitude,maxLongitude,maxLatitude`. 위도는 -90~90, 경도는 -180~180이며 최소 경도<최대 경도·최소 위도<최대 위도를 검사한다. 여행 시작일≤종료일, `day/order` 양수, 지출 양수·분담자 중복 없는 1명 이상을 검증한다. JSON 정수는 프론트 손실을 막도록 절댓값 `9,007,199,254,740,991` 이하로 제한하는 제안이다.
- 공통 실패는 아래 구조. 모든 경로에 `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `409 CONFLICT`, `429 RATE_LIMITED`, `500 INTERNAL_ERROR`가 적용될 수 있다. 표는 업무상 주요 실패만 추가 기재한다.

```json
{"error":{"code":"VERSION_CONFLICT","message":"일정이 변경되었습니다. 다시 조회해 주세요.","fields":[],"traceId":"request-id"}}
```

| 상태 | 대표 업무 오류 |
| --- | --- |
| 404 | `TRIP_NOT_FOUND`, `FEED_NOT_FOUND`, `JOB_NOT_FOUND` — 존재를 공개할 수 없는 자료도 같은 응답 |
| 409 | `VERSION_CONFLICT`, `POLL_CLOSED`, `ALREADY_MEMBER`, `ALREADY_APPLIED`, `LAST_MEMBER_ACTION_REQUIRED` |
| 410 | `INVITATION_EXPIRED` — 사용자가 제시한 유효 형식의 초대 토큰 검증 결과 |
| 422 | `INSUFFICIENT_DATA`, `CURRENCY_MISMATCH`, `INVALID_PARTICIPANTS`, `UNSUPPORTED_INPUT` |
| 503 | `PROVIDER_UNAVAILABLE` — 지도·날씨·장소 공급자 장애. 결과 없음과 구분 |

동시 편집 대상인 일정·투표·경비·정산·설정·피드 편집에는 `expectedVersion:integer`를 사용한다. 다른 버전을 덮어쓰지 않고 `409`를 반환한다. 피드 삭제에도 버전 조건을 적용한다. 여행 생성·경비 생성·비동기 작업 생성·정산 계산·메시지 전송 POST에는 `Idempotency-Key` 헤더가 필수라는 제안이며 `(사용자, 실제 요청 경로, 키)`를 묶는다. 같은 키/같은 본문은 최초 결과, 다른 본문은 409. 다른 POST에는 이 헤더를 필수로 요구하지 않는다. 유효기간은 Q-12에서 확정한다.

## 3. 인증·프로필·친구·설정

근거: WD-FR-01~03·08·35. 인증 세부는 공급자 공식 흐름에 맞춰 별도 확정하며 URL에 제공자 토큰을 싣지 않는다.

| Method | URL | 권한 | 요청 | 성공 data / 상태 | 주요 규칙 |
| --- | --- | --- | --- | --- | --- |
| POST | `/auth/oauth/{provider}/authorization-requests` | 공개 | `{redirectUri:string,codeChallenge?:string}` | `OAuthAuthorization` / 201 | 허용된 redirect만 사용, 로그인 시작 컨텍스트에 바인딩된 state 발급 |
| POST | `/auth/oauth/{provider}/sessions` | 공개 | `OAuthExchange` | `Session` / 200 | provider는 KAKAO 또는 GOOGLE. 코드 교환·state·redirect 검증 필수 |
| POST | `/auth/sessions/refresh` | 갱신 토큰 | `{refreshToken:string}` | `Session` / 200 | 회전·재사용 감지 제안. 원문 토큰 DB 저장 금지 |
| DELETE | `/auth/session` | 로그인 | 없음 | 204 | 현재 세션 폐기 |
| GET | `/me` | 본인 | 없음 | `MyProfile` / 200 | 비공개 연령·동의 정보는 본인에게만 |
| PATCH | `/me` | 본인 | `{nickname?:string,profileAssetId?:id\|null,ageBand?:string\|null,ageUseConsent?:boolean}` | `MyProfile` / 200 | 닉네임 필수, 사진·연령대 선택. 연령 공개 금지 |
| DELETE | `/me` | 본인 | 없음 | `{accepted:true}` / 202 | 접수 후 계정 비활성화·세션 폐기, 별도 작업 폴링 없음. 보존 정책 Q-11 확정 후 활성화 |
| GET | `/users` | 로그인 | `query:string` + 페이지 | `UserCard[]` / 200 | 닉네임 또는 프로필 링크의 식별자로 검색, 노출 범위 Q-2 |
| GET | `/users/{userId}` | 로그인 | 없음 | `UserCard` / 200 | 연령·이메일 반환 금지 |
| GET | `/me/friends` | 본인 | 페이지 | `Friendship[]` / 200 | ACCEPTED인 상호 친구만 |
| GET | `/me/friend-requests` | 본인 | `direction:RECEIVED\|SENT` + 페이지 | `Friendship[]` / 200 | REQUESTED 목록 |
| POST | `/me/friend-requests` | 본인 | `{userId:id}` | `Friendship` / 201 | 상대에게 요청. 같은 요청 멱등, 반대 방향 대기 요청은 자동 수락하지 않고 409 |
| POST | `/me/friend-requests/{requestId}/accept` | 수신자 | 없음 | `Friendship` / 200 | 현재 REQUESTED 검사 후 상호 관계 성립 |
| DELETE | `/me/friend-requests/{requestId}` | 당사자 | 없음 | 204 | 발신자 취소·수신자 거절 |
| DELETE | `/me/friends/{userId}` | 관계 당사자 | 없음 | 204 | 상호 해제. 서로의 feed_audiences 삭제·사진 동의 무효화, 공동 여행 유지 |
| GET | `/me/friend-suggestions` | 본인 | 페이지 | `{user:UserCard,reason:string}[]` / 200 | 공개 가능한 근거만 제공 |
| PUT | `/me/friend-suggestion-dismissals/{userId}` | 본인 | 없음 | 204 | 추천 숨김, 해제 기간 Q-2 |
| GET | `/me/preferences` | 본인 | 없음 | `Preferences` / 200 | 직접 입력·추론 분리 |
| PUT | `/me/preferences` | 본인 | `PreferencesWrite` | `Preferences` / 200 | 직접 입력 전체 교체, 추론 허용과 공유 범위 별도 |
| PUT | `/trips/{tripId}/members/me/preference-consent` | 멤버 | `{scope:EXPLICIT_ONLY\|EXPLICIT_AND_INFERRED\|NONE\|INHERIT}` | `{scope:string,effectiveScope:string}` / 200 | D-17. 나만 보기는 NONE, 추론 허용을 대신하지 않음 |
| DELETE | `/me/preferences/inferred/{key}` | 본인 | 없음 | 204 | 추론 항목 개별 제거·재추론 거부 표식. 재추론 기간 Q-5 |
| GET | `/me/settings` | 본인 | 없음 | `UserSettings` / 200 | AI 기능·종류별 알림 설정 |
| PATCH | `/me/settings` | 본인 | `SettingsPatch` | `UserSettings` / 200 | expectedVersion 검사, 실패 시 전체 이전 설정 유지 |

기능 설정은 자동 작업 시작과 결과 반영 모두에 적용한다. OFF면 새 자동 작업을 시작하지 않고, 명시적 사용자 재시도는 409 AI_FEATURE_DISABLED 제안으로 구분한다. AUTO는 허용된 범위의 결과만 반영하고, CONFIRM은 저장 전 사용자의 적용/확인 동작을 요구한다. 추출 후보 저장은 일반 장소/북마크 API, 준비물 채택은 sourceJobId·suggestionIndex를 담은 POST, 사진 분류는 apply, 방문은 후보 confirm으로 연결한다. 자동 적용할 판정 기준이 미합의인 기능은 기준 확정 전 AUTO 실행을 비활성화한다. 날씨는 항상 제안만이며 코스는 확정/승인 절차를 거친다. 진행 중 설정 변경의 취소/유지 세부는 Q-11이다.

## 4. 여행·멤버·초대

근거: WD-FR-04·32. 그룹과 여행을 이중 생성하지 않는다.

| Method | URL | 권한 | 요청 | 성공 data / 상태 | 주요 규칙 |
| --- | --- | --- | --- | --- | --- |
| GET | `/me/trips` | 본인 | `status?:PLANNING\|ONGOING\|COMPLETED` + 페이지 | `Trip[]` / 200 | 활성 멤버십 기준 |
| POST | `/trips` | 로그인 | `{title:string,startDate?:date,endDate?:date,destinationRegionIds?:id[],currency?:string}` | `Trip` / 201 | 이름만 필수. currency 미지정이면 null, 첫 경비 등록 때 해당 통화로 원자 설정 제안. 여행·방장·채팅방·빈 편집안 원자 생성 |
| GET | `/trips/{tripId}` | 멤버 | 없음 | `Trip` / 200 | 공개 피드와 별도 내부 조회 |
| PATCH | `/trips/{tripId}` | 멤버(D-9) | `{expectedVersion:integer,title?:string,startDate?:date\|null,endDate?:date\|null,destinationRegionIds?:id[],status?:TripStatus,currency?:string}` | `Trip` / 200 | 여행지 직접 선택 시 투표 생략 가능. 경비 등록 이력이 있으면 통화 변경 409 |
| DELETE | `/trips/{tripId}` | 방장 | `expectedVersion:integer`(query) | `JobRef` / 202 | 전체 삭제 범위 Q-11, 즉시 접근 차단·후속 정리 작업 제안 |
| GET | `/trips/{tripId}/members` | 멤버 | 없음 | `{members:Member[]}` / 200 | 정산에 남는 이탈 멤버는 별도 `includeInactive?:boolean` |
| POST | `/trips/{tripId}/invitations` | 멤버 | 없음 | `InvitationSecret` / 201 | 서버 생성 만료·정원 정책 Q-4. 토큰 원문 1회 반환 |
| GET | `/invitations/{token}` | 공개(D-1) | 없음 | `InvitationPreview` / 200 | 여행명·기간·초대한 사람만, 내부 명단/경비 반환 안 함 |
| POST | `/invitations/{token}/accept` | 로그인 | 없음 | `Trip` / 200 | 기존 ACTIVE 멤버는 바로 반환. 신규 참여는 현재 ACTIVE 초대자와 상호 친구 필수, 아니면 403 FRIENDSHIP_REQUIRED·같은 초대 복귀 |
| POST | `/invitations/resolve` | 로그인 | `{code:string}` | `{token:string,preview:InvitationPreview}` / 200 | 코드로 같은 초대를 찾음, 만료·형식 검증·시도 제한, 비공개 멤버 목록 미노출 |
| POST | `/trips/{tripId}/owner-transfer` | 방장 | `{targetMemberId:id,expectedVersion:integer}` | `Trip` / 200 | 같은 여행 ACTIVE 멤버만 |
| POST | `/trips/{tripId}/leave` | 멤버 | `{deleteOwnPhotos:boolean,deleteOwnMessages:boolean,expectedVersion:integer}` | `LeaveResult` / 202 | 사진·채팅 각각 명시. 경비 유지. 방장 자동 양도 |
| DELETE | `/trips/{tripId}/members/{memberId}` | 방장 | `expectedVersion:integer`(query) | 204 | 본인·방장 내보내기 금지. 강제 이탈 시 타인 자료 삭제 여부는 Q-11 |

`leave`에서 방장 다음 순서는 ACTIVE 멤버의 `joinOrder` 오름차순이다. 양도·멤버 비활성화·초대 권한·채팅 참여 해제를 한 트랜잭션으로 처리한다. 마지막 멤버는 일반 이탈을 409로 막고 방장의 여행 삭제 경로를 안내하는 **제안**이다. 경비 보존은 여행 삭제와 계정 탈퇴까지 자동 확장하지 않는다. 이탈·강제 이탈 시 해당 사용자의 본 여행 게시물을 UNPUBLISHED로 바꾸고 허용 목록·사진 동의를 무효화한다. 동행의 별도 게시물·그룹 저장·경비는 유지한다. 사진 삭제 선택은 그 사진을 포함한 다른 피드의 표시에도 즉시 적용한다.

이탈 트랜잭션 안에서 삭제를 선택한 **당시 사진 ID·메시지 ID와 이탈 시각을 고정**해 정리 작업에 저장한다. worker가 실행 시점의 `memberId`만으로 삭제 대상을 다시 검색하면 안 된다. 재가입 후 생성한 자료는 대상에 포함하지 않는다. 삭제 대상은 승인 당시 범위를 확대하지 않으며 작업 재시도는 같은 대상에 대해 멱등이다. 일반 AI 작업은 현재 멤버십·동의를 재검사하지만, 승인된 삭제 작업은 고정된 대상에 대한 정리를 계속한다.

## 5. 장소·저장·추출·추천

근거: WD-FR-05~11·31. AI 서버의 내부 API는 별도 담당 범위이며 여기에는 앱→서비스 API만 정의한다.

| Method | URL | 권한 | 요청 | 성공 data / 상태 | 주요 규칙 |
| --- | --- | --- | --- | --- | --- |
| GET | `/places` | 로그인 | `query:string,regionId?:id` + 페이지 | `Place[]` / 200 | 공급자 결과를 provider/공급자 ID로 로컬 upsert한 뒤 로컬 UUID만 반환 |
| GET | `/places/{placeId}` | 로그인 | 없음 | `Place` / 200 | 일반 장소 정보, 원본 비공개 자료 제외 |
| POST | `/places` | 로그인 | `{name:string,address?:string,latitude:number,longitude:number,regionId?:id}` | `Place` / 201 | 수동 보정 장소, 공급자 장소로 임의 확정하지 않음 |
| GET | `/regions` | 로그인 | `query:string` + 페이지 | `Region[]` / 200 | 지역 투표 후보용 식별자 |
| GET | `/me/bookmarks` | 본인 | `regionId?:id` + 페이지 | `Bookmark[]` / 200 | 개인 저장만 |
| PUT | `/me/bookmarks/{placeId}` | 본인 | `{memo?:string,sourceFeedId?:id}` | `Bookmark` / 200 | 사용자·장소 유일, 원본 피드 열람 가능 여부 확인 |
| PATCH | `/me/bookmarks/{placeId}` | 본인 | `{memo:string}` | `Bookmark` / 200 | 장소 원본 수정 아님 |
| DELETE | `/me/bookmarks/{placeId}` | 본인 | 없음 | 204 | 그룹 저장은 독립 유지 |
| GET | `/trips/{tripId}/saved-places` | 멤버 | `filter?:ALL\|OVERLAP,memberId?:id,bbox?:string` + 페이지 | `SavedPlacePage` / 200 | 필터 전역 총계·멤버별 저장자 반환. 일반 페이지 형식 대신 DTO 사용 |
| PUT | `/trips/{tripId}/saved-places/{placeId}/me` | 멤버 | `{memo?:string}` | `SavedPlace` / 200 | 개인 보관함 전체를 자동 복사하지 않음 |
| PATCH | `/trips/{tripId}/saved-places/{placeId}/me` | 본인 저장자 | `{memo:string}` | `SavedPlace` / 200 | 타인 메모 변경 권한 Q-4 |
| DELETE | `/trips/{tripId}/saved-places/{placeId}/me` | 본인 저장자 | 없음 | 204 | 내 저장 기여만 삭제, 타인 저장 보존 |
| POST | `/extractions` | 본인 | `{url?:string,captureAssetIds?:id[],memo?:string}` | `JobRef` / 202 | URL·복수 캡처 동시 입력 허용, 하나 이상 필수, JPG/PNG 캡처. 원문·근거·설정 모드 보존 |
| GET | `/extractions/{jobId}` | 작업 소유자 | 없음 | `ExtractionResult` / 200 | 후보는 아직 저장·방문 아님 |
| DELETE | `/extractions/{jobId}` | 작업 소유자 | 없음 | 204 | 입력·후보 제거/작업 취소, 저장한 일반 장소와 분리 |
| POST | `/trips/{tripId}/recommendations` | 멤버 | `{regionId?:id}` | `JobRef` / 202 | 허용한 그룹 저장·취향만 스냅샷 |
| GET | `/trips/{tripId}/recommendations/{jobId}` | 멤버 | 없음 | `RecommendationResult` / 200 | 요청 여행과 작업 귀속 일치 |
| GET | `/me/discovery-recommendations` | 본인 | 페이지 | `DiscoveryItem[]` / 200 | 좋아요 기반 피드/장소 추천, 점수 미확정 |
| GET | `/trends/regions` | 로그인 | `from:date,to:date` + 페이지 | `TrendRegion[]` / 200 | 기간·표본 수·갱신 시점·자료 부족 표시 |
| PUT | `/feeds/{feedId}/like` | 피드 열람자 | 없음 | `{liked:true,count:integer}` / 200 | 사용자·피드 1개, 대상 D-12 |
| DELETE | `/feeds/{feedId}/like` | 본인 반응 | 없음 | 204 | 방문/평가로 집계하지 않음 |

장소 ID 계약: `/places`와 추출 결과의 `place.id`는 모두 `places.id`다. 공급자 ID를 UUID 대신 반환하지 않는다. 동시에 같은 공급자 결과를 저장하면 unique 충돌 후 기존 행을 재조회한다. 추출 후보를 실제 장소에 연결할 때도 같은 resolver를 사용한다. 수동 POST는 별도 MANUAL 장소이며 공급자 결과를 수동 장소로 우회 복제하지 않는다. 공급자 자료 저장 가능 범위는 Q-12 확인 후 적용한다.

| Method | URL | 권한 | 요청 | 성공 data / 상태 | 주요 규칙 |
| --- | --- | --- | --- | --- | --- |
| GET | `/regions/{regionId}` | 로그인 | 없음 | `RegionDetail` / 200 | 지역 소개·대표 장소·여행 생성 입력 |
| GET | `/places/{placeId}/social-summary` | 로그인 | 없음 | `PlaceSocialSummary` / 200 | 허용된 게시물에서만 방문자·평점 집계, 부분 장애 표시 |
| GET | `/places/{placeId}/public-reviews` | 로그인 | 페이지 | `PublishedReview[]` / 200 | 요청자에게 허용된 피드의 게시 평가만, 비공개 원본 reviews 직접 노출 금지 |

## 6. 투표·일정·여행 중 정보

근거: WD-FR-12~18. 지역·장소 모두 복수 선택이다. 마감시각 또는 전원 참여 시 종료·단독 최다 후보 자동 확정이 화면 기준이다. 동률/0표 결정자·전원 기준은 D-13 제안이며 Q-6에서 확정한다. capabilities는 서버 권한 판정 결과이며 클라이언트가 지정하지 않는다.

| Method | URL | 권한 | 요청 | 성공 data / 상태 | 주요 규칙 |
| --- | --- | --- | --- | --- | --- |
| GET | `/trips/{tripId}/polls` | 멤버 | 페이지 | `Poll[]` / 200 | 유형·상태·내 선택 |
| POST | `/trips/{tripId}/polls` | 멤버(제안) | `{type:REGION\|PLACE,title:string,candidates:CandidateInput[],closesAt:datetime}` | `Poll` / 201 | 후보 2개 이상 제안, 미래 마감·유형 검증, 참여 대상 스냅샷 |
| GET | `/trips/{tripId}/polls/{pollId}` | 멤버 | 없음 | `Poll` / 200 | 집계와 확정 결과 분리 |
| PUT | `/trips/{tripId}/polls/{pollId}/ballot` | 멤버 | `{candidateIds:id[],expectedVersion:integer}` | `Poll` / 200 | 참여 대상만 내 선택 전체 교체. 빈 배열=취소, 고유 참여 인원 재계산·자동 종료 판단 |
| POST | `/trips/{tripId}/polls/{pollId}/close` | canClose 권한자 | `{expectedVersion:integer}` | `Poll` / 200 | 수동 종료 허용 조건 Q-6. 자동 마감과 같은 트랜잭션 규칙 |
| POST | `/trips/{tripId}/polls/{pollId}/finalize` | canFinalize 권한자 | `{selectedCandidateIds:id[],expectedVersion:integer}` | `Poll` / 200 | 동률이면 공동 최다 후보에서 선택. 0표 직접 결정은 후보 중 선택. 자동 확정 결과 덮어쓰기 금지 |
| POST | `/trips/{tripId}/polls/{pollId}/extend` | canExtend 권한자 | `{closesAt:datetime,expectedVersion:integer}` | `Poll` / 200 | 0표 CLOSED→OPEN 연장, 기존 결과 없음 검사. 연장 횟수·참여자 변경 Q-6 |
| GET | `/trips/{tripId}/itinerary` | 멤버 | 없음 | `Itinerary` / 200 | 편집안과 confirmed 스냅샷을 함께 반환. 기존 확정본은 편집으로 바뀌지 않음 |
| PUT | `/trips/{tripId}/itinerary` | 멤버 | `ItineraryWrite` | `Itinerary` / 200 | 편집안만 전체 교체. version 증가, 이전 안 승인 요청은 STALE |
| POST | `/trips/{tripId}/itinerary/confirm` | canConfirm 권한자 | `{expectedVersion:integer}` | `Itinerary` / 200 | 편집안의 불변 revision 생성·확정 포인터 교체를 원자 처리, 빈 일정/수단 누락 422 |
| POST | `/trips/{tripId}/itinerary/proposals` | 멤버 | `ProposalWrite` | `JobRef` / 202 | 최초 생성에도 GET에서 얻은 version 사용, 기존 일정 자동 덮어쓰기 없음 |
| GET | `/trips/{tripId}/itinerary/proposals/{jobId}` | 멤버 | 없음 | `ItineraryProposal` / 200 | 변경 전후 비교, 기준 버전 표시 |
| POST | `/trips/{tripId}/itinerary/proposals/{jobId}/apply` | canApply 권한자 | `{expectedVersion:integer}` | `Itinerary` / 200 | 성공한 변경안·기준 버전·현재 권한 재검사 후 확정, 일반 멤버는 승인 요청 |
| GET | `/trips/{tripId}/itinerary/approval-requests` | 멤버 | `status?:string` + 페이지 | `CourseApproval[]` / 200 | 재접속 후 대기/결과 복원 |
| POST | `/trips/{tripId}/itinerary/approval-requests` | 멤버 | `{sourceJobId?:id,expectedVersion:integer}` | `CourseApproval` / 201 | sourceJobId 생략=현재 편집안, 지정=해당 작업의 성공한 변경안. 승인 대상 revision 고정 |
| POST | `/trips/{tripId}/itinerary/approval-requests/{requestId}/decision` | canApprove 권한자 | `{decision:APPROVE\|REJECT,expectedRequestVersion:integer,expectedItineraryVersion:integer}` | `CourseApproval` / 200 | 승인 시 저장된 revision 적용까지 원자 처리. 변경/만료/버전 충돌은 409, 기존 코스 보존 |
| DELETE | `/trips/{tripId}/itinerary/approval-requests/{requestId}` | 요청자 | `expectedVersion:integer`(query) | 204 | PENDING 취소, 재요청은 새 requestId |
| POST | `/trips/{tripId}/itinerary/undo` | canUndo 권한자 | `{expectedVersion:integer,targetRevisionId:id}` | `Itinerary` / 200 | D-13: 바로 이전 확정 revision만 새 revision으로 복원. 범위 Q-6, 과거 version 재사용 금지 |
| POST | `/trips/{tripId}/itinerary/routes/recalculate` | 멤버 | `{expectedVersion:integer}` | `JobRef` / 202 | 실패 구간 재조회, 변경된 편집안에는 자동 반영하지 않음 |
| POST | `/trips/{tripId}/visits` | 멤버 | `{placeId:id,visitedAt:datetime,evidenceType:MANUAL}` | `Visit` / 201 | 실제 방문 수동 기록 제안. 자동 위치 수집 추가 안 함 |
| GET | `/trips/{tripId}/visits` | 멤버 | `memberId?:id,placeId?:id,reviewStatus?:ALL\|WRITTEN\|UNWRITTEN` + 페이지 | `Visit[]` / 200 | 기본 본인·ALL. 같은 여행 멤버만 필터 가능, 평가할 visitId 복원 |
| DELETE | `/trips/{tripId}/visits/{visitId}` | 본인 방문 작성자 | 없음 | 204 | 방문 체크 되돌리기. 평가가 있으면 409 REVIEW_EXISTS 제안, Q-7 확정 후 조정 |
| POST | `/trips/{tripId}/visit-detections` | 멤버 | `{photoIds:id[]}` | `JobRef` / 202 | 허용된 사진 메타데이터로 후보만 제안, 실제 체크와 구분 |
| POST | `/trips/{tripId}/visit-candidates/{candidateId}/confirm` | 후보 본인 | `{expectedVersion:integer}` | `Visit` / 201 | 동일 후보 중복 확정은 기존 visit 반환. 사진 속 타인을 자동 방문자로 지정하지 않음 |
| GET | `/trips/{tripId}/weather` | 멤버 | `date:date,placeId:id` | `Weather` / 200 | 관측/예보 구분, 조회 시점·유효성 |
| POST | `/trips/{tripId}/weather-alternatives` | 멤버 | `{date:date,placeId:id,expectedVersion:integer}` | `JobRef` / 202 | 실제 공급자 날씨 데이터로 생성 |
| GET | `/places/{placeId}/facilities` | 로그인 | `type:string,radiusMeters:integer` + 페이지 | `Facility[]` / 200 | 시설 종류·반경 Q-8, 장애와 빈 결과 구분 |
| GET | `/trips/{tripId}/checklist` | 멤버 | 없음 | `{items:ChecklistItem[]}` / 200 | 공동 목록 제안 D-9 |
| POST | `/trips/{tripId}/checklist` | 멤버 | `{label:string,sourceJobId?:id,suggestionIndex?:integer}` | `ChecklistItem` / 201 | sourceJobId/index 동시 지정 시 같은 여행 성공 결과 검증·이유 보존, 없으면 직접 작성 |
| PATCH | `/trips/{tripId}/checklist/{itemId}` | 멤버(제안) | `{label?:string,checked?:boolean,expectedVersion:integer}` | `ChecklistItem` / 200 | 사용자 수정 표시 |
| DELETE | `/trips/{tripId}/checklist/{itemId}` | 멤버(제안) | 없음 | 204 | AI 재생성 시 삭제한 항목 강제 부활 금지 |
| POST | `/trips/{tripId}/checklist-suggestions` | 멤버 | `{date:date}` | `JobRef` / 202 | 제안만 생성. 수동 편집·체크 목록을 덮어쓰지 않음 |

경로는 `Itinerary.legs`로 반환하고 장소 순서가 바뀌면 다시 계산한다. 공급자 실패는 `durationSeconds:null,status:UNAVAILABLE`이며 0초로 대체하지 않는다. 되돌리기는 화면 요구로 포함하며 허용 범위는 D-13 제안이다. 모든 확정/적용/승인/되돌리기는 기존 revision을 보존하고 version을 증가시킨다. 성공 시 편집안도 새 확정본으로 동기화하고 다른 대기 요청을 STALE로 바꾼다. 승인 대상 revision은 본문이 불변이므로 내용이 바뀌면 재요청해야 한다. 만료 판정은 조회/결정 시에도 수행한다. 요청 만료시간은 서버 설정이며 예시의 30분을 고정하지 않는다. 투표 자동 종료는 타이머 및 투표 쓰기/조회 시 원자적으로 평가하고, 동률·0표는 CLOSED에 머문다. 여러 API 동시 호출도 한 번만 FINALIZED로 전이한다. 전원 참여는 표 합계가 아닌 고유 참여자로 판단한다.

일정 전체 교체에서는 요청에서 빠진 기존 항목을 삭제한다. 기존 항목 ID는 해당 일정 소유임을 검증하고, ID 없는 항목은 서버가 생성한다. `startTime`·`stayMinutes`는 **생략 또는 null이면 비움**이다. `transportMode`는 읽기 응답에도 포함하고, 새 여행에서만 null을 허용한다. INITIAL 제안 생성에는 이동 수단 선택이 필요하며, 그 외에는 현재 값을 유지할 수 있다.

날씨 대안은 `alternativeId`를 포함한다. WEATHER 제안 요청은 `sourceWeatherJobId`·`selectedAlternativeId`를 받아 같은 여행의 성공한 결과와 선택 항목을 검증하고 기준 일정 버전도 일치해야 한다. 대안 유형은 PLACE_SWAP/TIME_SHIFT/INFO다. TIME_SHIFT는 기존 itemId·목표 시각으로 같은 장소를 이동하므로 새 장소가 없어도 적용 가능하다. INFO만 있는 대안의 적용은 `422 UNSCHEDULABLE_ALTERNATIVE`로 거부한다. 선택한 대안을 무시하고 임의의 새 장소로 대체하지 않는다.

## 7. 사진·평가·경비

근거: WD-FR-19~23. 파일 업로드와 여행 사진 등록을 분리해 업로드 일부 실패를 처리한다.

| Method | URL | 권한 | 요청 | 성공 data / 상태 | 주요 규칙 |
| --- | --- | --- | --- | --- | --- |
| POST | `/assets/upload-intents` | 로그인/여행 사진은 멤버 | `{purpose:PROFILE\|CAPTURE\|TRIP_PHOTO,tripId?:id,contentType:string,byteSize:integer}` | `UploadIntent` / 201 | 서버 검증 후 업로드 위치 반환, 형식/크기 Q-7 |
| DELETE | `/assets/{assetId}` | 업로더 | 없음 | 204 | PENDING 업로드 취소만, 서버 객체 정리·이후 complete 거부. 등록된 사진은 사진 삭제 API 사용 |
| POST | `/assets/{assetId}/complete` | 업로더 | 없음 | `Asset` / 200 | 객체 존재·크기·형식 검증, 본인 파일만. 허용된 EXIF 위치/촬영시각은 비공개 메타데이터로 추출, 공개 파일은 GPS 메타데이터 제거 |
| GET | `/assets/{assetId}/download` | 실제 자료 접근권자 | `feedId?:id` | 파일 바이트 / 200 | 인증 게이트웨이 스트리밍 제안. 피드 경유면 매 요청 게시 상태·허용 친구·포함 사진·동의를 재검사, private/no-store |
| GET | `/trips/{tripId}/photos` | 멤버 | `topic?:string,groupId?:id` + 페이지 | `Photo[]` / 200 | 부분 업로드 실패는 기존 성공 사진과 독립 |
| POST | `/trips/{tripId}/photos` | 멤버 | `{assetId:id,placeId?:id,capturedAt?:datetime}` | `Photo` / 201 | READY·TRIP_PHOTO·본인·같은 여행 확인 |
| PATCH | `/trips/{tripId}/photos/{photoId}` | 업로더(제안) | `{placeId?:id\|null,topics?:string[],groupId?:id\|null,expectedVersion:integer}` | `Photo` / 200 | 수동 분류 우선. 다른 여행 groupId 금지 |
| DELETE | `/trips/{tripId}/photos/{photoId}` | 업로더(제안) | 없음 | `JobRef` / 202 | 원본·파생 파일 정리 범위 Q-11 |
| POST | `/trips/{tripId}/photo-classifications` | 멤버 | `{photoIds:id[]}` | `JobRef` / 202 | 성공/실패 사진별 결과, 원본 자동 삭제 없음 |
| GET | `/trips/{tripId}/photo-summary` | 멤버 | 없음 | `PhotoSummary` / 200 | 필터와 독립적인 전체·주제/장소별 건수·미지정 수 |
| POST | `/trips/{tripId}/photos/batch` | 업로더(D-16) | `PhotoBatchWrite` | `{photos:Photo[],deletedPhotoIds:id[]}` / 200 | 수정·이동·묶음 해제·삭제 중 하나. 검증 실패 시 전체 변경 없음 제안 |
| POST | `/trips/{tripId}/photo-classifications/{jobId}/apply` | 멤버 | `{expectedPhotoVersions:{photoId:id,version:integer}[]}` | `{photos:Photo[]}` / 200 | 확인 후 모드의 성공 결과만 명시 반영. 변경된 사진/수동 보정은 409 |
| GET | `/trips/{tripId}/reviews` | 멤버 | 페이지 | `Review[]` / 200 | 실제 방문 기록 참조 |
| PUT | `/trips/{tripId}/visits/{visitId}/review` | 방문 기록 작성자(제안) | `{score:integer,body:string,expectedVersion?:integer}` | `Review` / 200 | 1~5 척도·방문 자격은 Q-7 제안 |
| DELETE | `/trips/{tripId}/visits/{visitId}/review` | 평가 작성자(제안) | 없음 | 204 | 타인 평가 변경 불가 |
| GET | `/trips/{tripId}/expenses` | 멤버 | 페이지 | `Expense[]` / 200 | 원본 내역, 이탈자도 과거 분담자로 표시 |
| POST | `/trips/{tripId}/expenses` | 멤버 | `ExpenseWrite` | `Expense` / 201 | 등록자 서버 지정, 결제자·분담자는 같은 여행. 여행 통화 null이면 요청 통화로 원자 설정, 이미 지정됐으면 일치 검사 |
| PATCH | `/trips/{tripId}/expenses/{expenseId}` | 활성 멤버인 등록자 | `ExpensePatch` | `Expense` / 200 | 방장·결제자라도 등록자가 아니면 403 |
| DELETE | `/trips/{tripId}/expenses/{expenseId}` | 활성 멤버인 등록자 | `expectedVersion:integer`(query) | 204 | 전체 비용 버전 증가, 이전 정산 무효화 |
| GET | `/trips/{tripId}/settlement` | 멤버 | 없음 | `SettlementState` / 200 | current 계산(없으면 null)·현재 비용 버전·재계산 필요 반환. GET은 계산 생성 안 함. 경비 미입력/통화 미설정은 current=null |

지출이 10,001원이고 분담자가 3명이면 D-7 제안상 3,334/3,334/3,333원이다. 결제자의 실제 결제액에서 본인 부담액을 빼 잔액을 구하고, 양수는 받을 금액·음수는 보낼 금액이다. 모든 잔액 합은 0이어야 한다. 이미 나간 사람에게 신규 분담을 추가하는 것은 금지하는 제안이며 기존 지출의 과거 참여자는 보존한다. 이탈 후 등록자 수정 가능 여부는 Q-10이며 초안에서는 ACTIVE 권한을 요구한다.

| Method | URL | 권한 | 요청 | 성공 data / 상태 | 주요 규칙 |
| --- | --- | --- | --- | --- | --- |
| POST | `/trips/{tripId}/settlements` | 멤버 | `{expectedExpenseVersion:integer}` | `Settlement` / 201 | 통화 필수·비용 스냅샷·분담 내역·이체 항목 저장 및 current 포인터 교체. Idempotency-Key 필수, 오래된 비용 버전 409 |
| GET | `/trips/{tripId}/settlements` | 멤버 | 페이지 | `Settlement[]` / 200 | 이전 계산과 완료 상태. 보관기간 Q-10 |
| GET | `/trips/{tripId}/settlements/{settlementId}` | 멤버 | 없음 | `Settlement` / 200 | 원래 계산시각·버전·포함 지출 확인 |
| PATCH | `/trips/{tripId}/settlements/{settlementId}/transfers/{transferId}` | canMarkComplete 권한자(D-15) | `{completed:boolean,expectedVersion:integer}` | `Settlement` / 200 | 최신 비용 버전과 일치해야 함. 수동 완료/미완료, 실제 송금 아님 |
| POST | `/trips/{tripId}/settlements/{settlementId}/complete` | canMarkComplete 권한자(D-15) | `{expectedVersion:integer}` | `Settlement` / 200 | 현재 계산 ID·비용 버전·미완료 항목 없음 확인 후 완료·알림 원자 기록. 0건도 명시 완료 가능 |

## 8. 개인별 피드·지도·타임라인

근거: WD-FR-24~30. **여행 원본은 공동으로 관리하지만 게시물은 멤버별로 소유한다.** D-4에 따라 여행·작성자당 피드 하나를 재사용한다. 본인만 편집/게시/철회하며 방장은 타인 게시물 편집권을 얻지 않는다.

| Method | URL | 권한 | 요청 | 성공 data / 상태 | 주요 규칙 |
| --- | --- | --- | --- | --- | --- |
| GET | `/home/map` | 로그인 | `bbox:string,from?:date,to?:date` | `MapResult` / 200 | ACCEPTED 친구의 PUBLISHED 피드 중 본인이 허용 목록에 있는 것만 집계 |
| GET | `/home/regions/{regionId}/feeds` | 로그인 | 페이지 | `FeedCard[]` / 200 | 지도와 동일 ACL, 같은 여행의 서로 다른 게시물을 합쳐 공개 범위를 넓히지 않음 |
| GET | `/users/{userId}/feed-map` | 로그인 | `bbox:string,from?:date,to?:date` | `MapResult` / 200 | 해당 작성자의 허용된 게시물만, 본인 관리 지도와 별도 |
| GET | `/users/{userId}/feeds` | 로그인 | 페이지 | `FeedCard[]` / 200 | 작성자·ACL 필터를 페이지 분할 전에 적용 |
| GET | `/users/{userId}/timeline` | 로그인 | 페이지 | `TimelineItem[]` / 200 | 허용된 게시물 표현만 |
| GET | `/me/travel-map` | 본인 | `bbox:string,viewerId?:id,from?:date,to?:date` | `OwnMapResult` / 200 | 본인 원본 지도, viewerId면 친구 시점 미리보기. 숨긴 수/사유는 본인만 |
| GET | `/me/timeline` | 본인 | 페이지 | `TimelineItem[]` / 200 | 미게시·계획·날짜 미정 포함, 현재 ACTIVE 여행 기준 |
| GET | `/trips/{tripId}/timeline` | 멤버 | 없음 | `{items:PlaceTimelineItem[]}` / 200 | 장소별 계획/방문·시간·사진수 |
| GET | `/trips/{tripId}/summary` | 멤버 | 없음 | `TripSummary` / 200 | 내부 요약. 공개 요약과 구분 |
| GET | `/me/feeds` | 본인 | `tripId?:id,status?:DRAFT\|PUBLISHED\|UNPUBLISHED` + 페이지 | `OwnFeed[]` / 200 | 본인 게시물만, 미게시도 포함 |
| POST | `/trips/{tripId}/feeds` | 멤버 | `FeedWrite` | `OwnFeed` / 201 | 작성자는 세션에서 결정, 초기 DRAFT·허용 친구 [] 가능. 동일 여행/작성자 중복 409 |
| PATCH | `/feeds/{feedId}` | 작성자 + ACTIVE 멤버 | `FeedPatch` | `OwnFeed` / 200 | 본인 콘텐츠·허용 친구 전체 교체, 선택 후보·enabled를 저장하고 동행 자료 동의 범위를 재검사 |
| POST | `/feeds/{feedId}/publish` | 작성자 + ACTIVE 멤버 | `{expectedVersion:integer}` | `OwnFeed` / 200 | PUBLISHED 전이, enabled 사진 중 동의 없는 타인 사진은 제외. 선택 친구만 허용, []이면 본인만 |
| POST | `/feeds/{feedId}/unpublish` | 작성자 | `{expectedVersion:integer}` | `OwnFeed` / 200 | UNPUBLISHED 전이·모든 외부 접근 차단, 원본·동행 게시물 유지 |
| DELETE | `/feeds/{feedId}` | 작성자 | `expectedVersion:integer`(query) | 204 | 게시 표현만 삭제. 사진·평가·경비 원본 삭제를 뜻하지 않음 |
| GET | `/feeds/{feedId}` | 작성자 또는 허용된 친구 | 없음 | `Feed` / 200 | 타인은 PUBLISHED + ACCEPTED 친구 + feed_audiences 포함 모두 필요. 불허는 404 |
| GET | `/feeds/{feedId}/summary` | 피드 열람자 | 없음 | `FeedSummary` / 200 | 선택·허용된 표현만 집계, 내부 정산·전체 멤버 정보 제외 |
| GET | `/feeds/{feedId}/preview` | 작성자 | `viewerId:id` | `{visible:boolean,feed:Feed\|null}` / 200 | 실제 친구 권한 그대로 평가, 미허용이면 feed=null |
| POST | `/feeds/{feedId}/photo-consents` | 작성자 + ACTIVE 멤버 | `{photoIds:id[],expectedVersion:integer}` | `{requests:PhotoConsent[]}` / 201 | 소유자별 요청. 이미 선택한 사진·게시 내용·허용 친구 스냅샷 고정, 본인 사진 불필요 |
| GET | `/feeds/{feedId}/photo-consents` | 작성자 | 페이지 | `PhotoConsent[]` / 200 | 동의/거절/대기·게시에서 제외된 사진 복원 |
| GET | `/me/photo-consents` | 요청 수신자 | `status?:string` + 페이지 | `PhotoConsent[]` / 200 | 검토할 사진·게시 미리보기·열람 친구 제공, 전체 내부 여행 노출 금지 |
| POST | `/photo-consents/{consentId}/decision` | 사진 소유 수신자 | `{decision:ACCEPT\|DECLINE,expectedVersion:integer}` | `PhotoConsent` / 200 | 요청 시 범위와 현재 범위 일치 확인. 동의만으로 자동 게시하지 않음, 작성자가 선택 사진의 enabled=true PATCH 후 반영 |
| POST | `/photo-consents/{consentId}/revoke` | 사진 소유 수신자 | `{expectedVersion:integer}` | `PhotoConsent` / 200 | D-18: 철회 즉시 관련 사진·표지·파일 제외, 다른 게시자 자료는 유지 |

예시: 승기와 세은이 같은 부산 여행에서 각각 피드를 게시한다. 승기가 수철을 허용하지 않았으면 승기의 피드·직접 링크는 404다. 세은이 수철을 허용했다면 수철은 **세은의 별도 피드**만 본다. 같은 tripId라는 이유로 게시물 콘텐츠·허용 목록을 합치지 않는다. 친구 해제 시 해당 허용 행을 제거하므로 재친구가 되어도 과거 허용은 자동 복원하지 않는 제안이다.

`Feed`는 내부 Trip을 직렬화하지 않는다. `OwnFeed`만 허용 목록·미포함/대기 사진·관리 상태를 제공한다. 공개 경비는 D-14의 총액·통화만, 평가는 작성자 본인의 게시 시 스냅샷만 제안한다. 사진·평가·경비·코스 항목의 include가 false이면 대응 내용은 배열 [] 또는 null로 반환한다. 지도 핀·요약·트렌드·추천·저장 참조·파일도 같은 ACL을 사용한다. 장소 자체가 일반 정보여도 저장 출처의 피드 제목·비공개 위치 맥락은 별도 권한 없이 반환하지 않는다.

동의 범위는 `(게시물, 사진 버전/목록, 게시 내용, 허용 친구 목록)`의 불변 스냅샷/hash로 묶는다. **D-18 제안:** 제목/본문·선택 사진/버전·항목·허용 친구 등 동의 대상 내용 변경 시 기존 동의를 STALE로 만들고 타인 사진·표지를 즉시 제외한 뒤 새 범위로 요청한다. 읽기·다운로드에서도 현재 동의·친구·원본 삭제 상태를 검사한다. 동의 기한·철회 상세·재동의 최적화는 Q-3이다. 대기/거절 사진을 제외하고 먼저 게시하고, 수락 후 작성자가 해당 선택 사진의 enabled=true를 PATCH한다. feed_photos에는 선택 후보를 보관하되 enabled와 동의가 모두 충족되어야 표시한다. 동의 없는 사진은 enabled=false로 저장하며, enabled만 바꾸는 PATCH는 scope_hash를 바꾸지 않는다. 사진 ID·설명·원본 버전·본문·허용 대상 등의 변경은 scope_hash를 바꾼다. 공개 코스는 선택한 **확정 revision**의 스냅샷이며 편집으로 자동 바뀌지 않는다. 공개 콘텐츠 변경은 새 피드 version을 만들고 같은 요청의 동의 자료와 일치해야 한다.

사진 이동은 D-16 제안상 모든 원본/대상 여행 접근 및 버전을 먼저 검증한다. 원본 사진을 참조하는 피드 사진·표지·동의·방문 후보를 제외/무효화하고 asset.trip_id·uploader_member_id·group/topics 연결을 함께 갱신한다. 기존 실제 방문 기록은 자동 이동하지 않는다. 삭제도 읽기 접근을 즉시 막은 뒤 파일 정리를 비동기로 수행한다.

화면의 ‘기록까지 삭제’는 게시 철회와 별개다. 본인 사진·평가는 각 삭제 API로 제공하지만, 공동 정산에 영향을 주는 본인 기록 일괄 삭제 API는 Q-10·11의 보존 기준 확정 전 제공하지 않는다. 이 부분은 화면 연결 미완료로 남기며 feed DELETE로 경비까지 삭제하지 않는다.

## 9. 채팅·알림·작업 조회

근거: WD-FR-33~34, WD-NFR-02. REST 폴링으로 계약을 먼저 정하고 WebSocket/SSE 전송·재연결 규격은 Q-13에서 결정한다.

| Method | URL | 권한 | 요청 | 성공 data / 상태 | 주요 규칙 |
| --- | --- | --- | --- | --- | --- |
| GET | `/chat/rooms` | 본인 | 페이지 | `ChatRoom[]` / 200 | 현재 접근 가능한 방만 |
| POST | `/chat/direct-rooms` | 로그인 | `{peerUserId:id}` | `ChatRoom` / 200 | 같은 두 사람 방 중복 생성 방지, 진입 조건 D-11 |
| GET | `/trips/{tripId}/chat-room` | 멤버 | 없음 | `ChatRoom` / 200 | 여행당 그룹 채팅방 하나 |
| GET | `/chat/rooms/{roomId}/messages` | 방 참여자 | `beforeSequence?:integer,limit?:integer` | `Message[]` / 200 | 공통 cursor 미사용. sequence 내림차순·경계값 미포함 |
| POST | `/chat/rooms/{roomId}/messages` | 방 참여자 | `{clientMessageId:id,text:string}` | `Message` / 201 | 같은 sender/clientMessageId는 최초 응답. 다른 본문 재사용 409 |
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

사용자가 임의 알림·시스템 메시지를 만드는 API는 없다. 서버 이벤트로 알림과 시스템 메시지를 생성하고 `eventId`로 중복을 막는다. 전송 시점과 링크 진입 시점에 모두 권한을 검사한다. 수동 정산 완료·사진 동의·코스 승인 이벤트를 포함한다. 실제 송금 확인·푸시·채팅 첨부·일반 메시지 수정/삭제·대화 전체 읽음 규격은 추가하지 않았다. 시스템 카드 읽음은 event_receipts를 통해 알림과 연결한다. 그룹 이탈 시 삭제 선택은 §4 이탈 API로 제공한다.

## 10. 요청·응답 DTO

아래 DTO는 `data` 내부의 실제 반환 필드다. 나열하지 않은 `id`·시각·버전 필드를 자동으로 덧붙이지 않는다. DB에 존재해도 공개 DTO에 없으면 반환하지 않는다. 별도 선택 표기가 없는 반환 필드는 필수이며 값이 없을 때는 명시한 null을 사용한다. 모든 날짜시각은 ISO 8601 문자열, date는 `YYYY-MM-DD`, 금액·카운트·버전은 정수다. `TripStatus`는 PLANNING/ONGOING/COMPLETED다. UUID 생성 버전과 문자열 길이 상한은 구현 전 확정한다.

| DTO | 필드와 의미 |
| --- | --- |
| OAuthAuthorization | `authorizationId:id,authorizationUrl:string,state:string,expiresAt:datetime`. 시작 브라우저/앱 컨텍스트 바인딩·PKCE 지원 방식은 Q-1 인증 설계에서 확정 |
| OAuthExchange | `authorizationId:id,code:string,redirectUri:string,state:string,codeVerifier?:string`. 일회성 요청의 provider·state·만료·redirect와 시작 컨텍스트를 검증한 뒤 소비. 검증 없이 활성화하지 않음 |
| Session | `accessToken:string,refreshToken:string,expiresIn:integer,user:MyProfile,isNewUser:boolean` |
| UserCard | `id,nickname:string,profileImageUrl:string\|null,friendshipStatus:NONE\|SENT\|RECEIVED\|ACCEPTED`. 공개 연령·이메일·계정 공개 상태 없음 |
| MyProfile | UserCard + `ageBand:string\|null,ageUseConsent:boolean,profileCompleted:boolean,profileUrl:string` |
| Friendship | `id,requester:UserCard,recipient:UserCard,status:REQUESTED\|ACCEPTED,requestedAt:datetime,acceptedAt:datetime\|null` |
| PreferencesWrite | `explicitItems:{key:string,value:string}[],allowInference:boolean,sharingScope:EXPLICIT_ONLY\|EXPLICIT_AND_INFERRED\|NONE`. 직접 입력만 교체, 추론 생성과 공유를 구분 |
| Preferences | `explicitItems:{key:string,value:string}[],inferredItems:{key:string,value:string}[],allowInference:boolean,sharingScope:string,updatedAt:datetime`. 추론 거부 시 이후 생성/활용 중단, 삭제·보존 Q-11 |
| Trip | `id,title,startDate:date\|null,endDate:date\|null,destinationRegionIds:id[],status:TripStatus,currency:string\|null,ownerMemberId:id,members:Member[],version:integer,expenseVersion:integer` |
| Member | `id,user:UserCard,role:OWNER\|MEMBER,status:ACTIVE\|LEFT\|REMOVED,joinOrder:integer,joinedAt:datetime,leftAt:datetime\|null` — role은 owner FK로 계산 |
| InvitationSecret | `id,token:string,url:string,code:string,expiresAt:datetime`. 토큰/코드는 생성 시만 반환, 일반 목록 재노출 금지 |
| InvitationPreview | `tripTitle:string,startDate:date\|null,endDate:date\|null,inviter:{nickname:string},inviterUser:UserCard\|null,expiresAt:datetime`. 익명 inviterUser=null, 로그인 시만 본인 기준 관계 상태 포함 |
| LeaveResult | `tripId:id,newOwnerMemberId:id\|null,cleanupJobId:id\|null,status:LEFT` — 삭제 작업 유무와 멤버십 이탈 결과 분리 |
| Region | `id,code:string,name:string,parentId:id\|null,latitude:number\|null,longitude:number\|null` |
| Place | `id,name,address:string\|null,latitude:number,longitude:number,regionId:id\|null,provider:string\|null,providerPlaceId:string\|null,source:PROVIDER\|MANUAL` |
| Bookmark | `place:Place,memo:string\|null,sourceFeedId:id\|null,createdAt:datetime` |
| SavedPlace | `place:Place,savedBy:{memberId:id,memo:string\|null}[],savedCount:integer` |
| JobRef | `jobId:id,status:QUEUED,statusUrl:string` |
| Job | `id,kind:string,status:QUEUED\|RUNNING\|SUCCEEDED\|FAILED\|CANCELLED,progress:integer,result:object\|null,error:{code:string,message:string}\|null,createdAt:datetime,finishedAt:datetime\|null` |
| ExtractionResult | `job:Job,resultStatus:SUCCESS\|MULTIPLE_CANDIDATES\|NOT_FOUND\|FAILED\|null,candidates:{candidateId:id,name:string,place:Place\|null,evidence:string,confidence:number\|null}[]`. 식별 불가는 처리 성공과 별개 |
| RecommendationResult | `job:Job,items:{type:REGION\|PLACE,region:Region\|null,place:Place\|null,reason:string}[],basis:{sharedPlaceCount:integer,usedMemberCount:integer},insufficientData:boolean` |
| DiscoveryItem | `type:FEED\|PLACE,feed:FeedCard\|null,place:Place\|null,reason:string` |
| TrendRegion | `region:Region,rank:integer,previousRank:integer\|null,rankChange:integer\|null,isNew:boolean,publishedTripCount:integer,friendCount:integer,from:date,to:date,sampleSize:integer,updatedAt:datetime,insufficientData:boolean`. 권한 필터 후 집계, 기간/집계 정의 Q-9 |
| CandidateInput | `regionId?:id,placeId?:id` — 유형에 맞는 하나만 필수 |
| Poll | `id,tripId,type:REGION\|PLACE,title,status:OPEN\|CLOSED\|FINALIZED,version:integer,closesAt:datetime,closedReason:DEADLINE\|ALL_VOTED\|MANUAL\|null,eligibleMemberCount:integer,votedMemberCount:integer,candidates:{id,regionId:id\|null,placeId:id\|null,voteCount:integer}[],myCandidateIds:id[],selectedCandidateIds:id[],capabilities:{canClose:boolean,canFinalize:boolean,canExtend:boolean}` |
| ItineraryWrite | `expectedVersion:integer,items:{id?:id,placeId:id,day:integer,order:integer,startTime?:string\|null,stayMinutes?:integer\|null}[],transportMode:WALK\|CAR\|TRANSIT`. 수단 종류는 Q-6 제안. 전체 교체이며 항목 시간 생략=null |
| Itinerary | `tripId,version:integer,status:DRAFT\|CONFIRMED,transportMode:WALK\|CAR\|TRANSIT\|null,items:ItineraryItem[],legs:RouteLeg[],confirmed:CourseRevision\|null,capabilities:{canConfirm:boolean,canApply:boolean,canApprove:boolean,canUndo:boolean}`. items/legs는 편집안이며 confirmed는 확정본. 새 여행은 version=1·빈 편집안·confirmed=null |
| ItineraryItem | `id,place:Place,day:integer,order:integer,startTime:string\|null,stayMinutes:integer\|null` |
| RouteLeg | `fromItemId:id,toItemId:id,transportMode:string,durationSeconds:integer\|null,distanceMeters:integer\|null,geometry:{type:LineString,coordinates:number[][]}\|null,status:AVAILABLE\|UNAVAILABLE,queriedAt:datetime`. 좌표 순서는 경도·위도, 경로 조회 실패 시 geometry도 null |
| ItineraryProposal | `job:Job,baseVersion:integer,reason:string,proposed:CourseContent\|null,diff:{removedPlaceIds:id[],addedPlaceIds:id[],description:string},appliedAt:datetime\|null` |
| ProposalWrite | `reason:INITIAL\|PLACE_REMOVED\|WEATHER,expectedVersion:integer,transportMode?:WALK\|CAR\|TRANSIT,excludedPlaceIds?:id[],sourceWeatherJobId?:id,selectedAlternativeId?:id`. INITIAL은 transportMode 필수, PLACE_REMOVED는 기존 일정의 제외 장소 1개 이상 필수, WEATHER는 원본 작업·선택 대안 ID 필수. 무관한 유형 필드는 400 |
| Visit | `id,tripId,memberId:id,placeId:id,visitedAt:datetime,evidenceType:MANUAL\|PHOTO,reviewId:id\|null,reviewScore:integer\|null`. 본인 방문 확인 후만 평가 가능 |
| Weather | `placeId:id,date:date,queriedAt:datetime,forecastAt:datetime,source:string,condition:string,temperatureCelsius:number\|null,minCelsius:number\|null,maxCelsius:number\|null,precipitationProbability:number\|null,hourly:{at:datetime,condition:string,temperatureCelsius:number\|null,precipitationProbability:number\|null}[],stale:boolean`. 확률 0~1 제안, 미확인은 null |
| Facility | `providerId:string,name:string,type:string,latitude:number,longitude:number,walkingSeconds:integer\|null,availability:string\|null,queriedAt:datetime`. 실시간 상태 미확인은 null |
| ChecklistItem | `id,label:string,checked:boolean,source:MANUAL\|AI,sourceJobId:id\|null,reason:string\|null,modifiedByUser:boolean,version:integer` |
| UploadIntent | `assetId:id,uploadUrl:string,method:PUT,headers:object,expiresAt:datetime` — 업로드 URL 사용에는 API 인증 헤더를 자동 전달하지 않음 |
| Asset | `id,purpose:string,status:PENDING\|READY\|DELETING\|DELETED\|CANCELLED,contentType:string,byteSize:integer,tripId:id\|null` |
| Photo | `id,assetId,tripId,uploaderMemberId:id,placeId:id\|null,capturedAt:datetime\|null,topics:string[],groupId:id\|null,version:integer` |
| Review | `id,visitId,authorMemberId:id,score:integer,body:string,version:integer,createdAt:datetime,updatedAt:datetime` |
| ExpenseWrite | `title:string,memo?:string,amountMinor:integer,currency:string,payerMemberId:id,participantMemberIds:id[],spentAt:datetime`. 균등 분담만 계약, 직접 금액/비율 입력 Q-10 |
| ExpensePatch | ExpenseWrite의 변경 필드 + 필수 `expectedVersion:integer`. 분담자 변경은 전체 배열 교체 |
| Expense | ExpenseWrite + `id,registeredByMemberId:id,shares:{memberId:id,amountMinor:integer}[],version:integer` |
| Settlement | `id,tripId,currency:string,expenseVersion:integer,version:integer,stale:boolean,totalAmountMinor:integer,includedExpenses:{expenseId:id,expenseVersion:integer,title:string,amountMinor:integer,payerMemberId:id,shares:{memberId:id,amountMinor:integer}[]}[],members:{memberId:id,paidMinor:integer,owedMinor:integer,balanceMinor:integer}[],transfers:{id,fromMemberId:id,toMemberId:id,amountMinor:integer,completed:boolean,markedByMemberId:id\|null,markedAt:datetime\|null}[],calculatedAt:datetime,completedAt:datetime\|null,canMarkComplete:boolean`. 실제 송금 상태 아님 |
| FeedCard | `id,tripId,author:UserCard,title:string,coverPhotoId:id\|null,regions:Region[],startDate:date\|null,endDate:date\|null,publishedAt:datetime,likedByMe:boolean,likeCount:integer`. ACL 통과 자료만 |
| Feed | `id,tripId,author:UserCard,title:string,body:string,status:DRAFT\|PUBLISHED\|UNPUBLISHED,publishedAt:datetime\|null,coverPhotoId:id\|null,regions:Region[],startDate:date\|null,endDate:date\|null,photos:PublicPhoto[],places:Place[],publicItinerary:CourseContent\|null,publicReviews:PublishedReview[],expenseSummary:PublicExpenseSummary\|null,include:FeedIncludes,likedByMe:boolean,likeCount:integer,version:integer`. 비게시 상태는 작성자만 조회 |
| FeedWrite | `title:string,body:string,audienceUserIds:id[],include:FeedIncludes,photos:{photoId:id,caption:string\|null,enabled:boolean}[],placeIds:id[],coverPhotoId:id\|null,itineraryPublication:{include:boolean,revisionId?:id},reviewIds:id[]`. 신규 audience=[] 가능, include.route와 itineraryPublication.include 일치. 타인 사진은 동의 절차 후 명시 추가 |
| FeedPatch | 필수 `expectedVersion:integer` + FeedWrite의 변경 필드. 배열은 전체 교체, 코스 생략 시 스냅샷 유지. 비용 include=true로 명시 변경 시 최신 총액 스냅샷 갱신, 리뷰는 작성자 본인 것만 |
| PublicPhoto | `id,placeId:id\|null,imageUrl:string,caption:string\|null`. imageUrl은 인증되는 `/assets/{assetId}/download?feedId=...` 경로이며 외부 저장소 영구 URL 아님 |
| FeedSummary | `feedId:id,photoCount:integer,visitedPlaceCount:integer,visitedRegionCount:integer,plannedDistanceMeters:integer\|null,actualDistanceMeters:integer\|null,expenseSummary:PublicExpenseSummary\|null`. 허용된 게시 표현만 집계 |
| MapResult | `markers:{region:Region,feedIds:id[],authorUserIds:id[],visitCount:integer}[],criteria:{from:date\|null,to:date\|null,regionGrouping:string},updatedAt:datetime`. 비허용 피드 수·위치 미노출 |
| TimelineItem | `tripId:id,feedId:id\|null,date:date\|null,dateBasis:TRIP\|PUBLISHED\|UNKNOWN,status:string`. 본인 경로만 비게시/날짜 미정 포함 |
| ChatRoom | `id,type:DIRECT\|TRIP,tripId:id\|null,participants:UserCard[],lastMessage:Message\|null` |
| Message | `id,roomId,sequence:integer,senderId:id\|null,type:TEXT\|SYSTEM,text:string\|null,clientMessageId:id\|null,eventId:id\|null,target:{type:string,id:id}\|null,eventReadAt:datetime\|null,createdAt:datetime,deletedAt:datetime\|null` |
| Notification | `id,eventId,kind:string,message:string,target:{type:string,id:id},readAt:datetime\|null,createdAt:datetime` — 임의 이동 URL 대신 대상 타입·ID 반환 |
| UserSettings | `version:integer,ai:{photoClassification:AiMode,visitDetection:AiMode,placeExtraction:AiMode,checklist:AiMode,weather:SUGGEST_ONLY\|OFF},notifications:{friendRequests:boolean,voteCourseSettlement:boolean,photoConsents:boolean,friendTrips:boolean}`. AiMode=AUTO/CONFIRM/OFF. 초기값 미확정 시 CONFIRM·날씨 SUGGEST_ONLY·알림 true 제안 |
| SettingsPatch | `expectedVersion:integer,ai?:UserSettings.ai의 부분 필드,notifications?:UserSettings.notifications의 부분 필드`. 성공 시 원자 저장, 생략은 유지 |
| SavedPlacePage | `{items:SavedPlace[],totals:{allPlaceCount:integer,overlapPlaceCount:integer,filteredCount:integer},page:{nextCursor:string\|null,hasNext:boolean}}` |
| RegionDetail | `region:Region,introduction:string\|null,representativePlaces:Place[],partialErrors:string[]` |
| PlaceSocialSummary | `place:Place,visitorCount:integer,visitors:UserCard[],averageScore:number\|null,reviewCount:integer,partialErrors:string[]`. 평균·표본은 허용된 게시 평가로만 계산 |
| CourseContent | `transportMode:WALK\|CAR\|TRANSIT,items:ItineraryItem[],legs:RouteLeg[]` |
| CourseRevision | CourseContent + `id:id,confirmedByMemberId:id,confirmedAt:datetime,sourceVersion:integer` |
| CourseApproval | `id,tripId,requesterMemberId:id,target:CourseContent,sourceJobId:id\|null,baseVersion:integer,status:PENDING\|APPROVED\|REJECTED\|CANCELLED\|EXPIRED\|STALE,version:integer,expiresAt:datetime,decidedByMemberId:id\|null,decidedAt:datetime\|null,createdAt:datetime` |
| PhotoSummary | `totalCount:integer,unplacedCount:integer,topics:{topic:string,count:integer}[],places:{placeId:id,count:integer}[],groups:{groupId:id,count:integer}[]` |
| PhotoBatchWrite | `action:UPDATE\|MOVE\|UNGROUP\|DELETE,photos:{photoId:id,expectedVersion:integer}[],placeId?:id\|null,topics?:string[],targetTripId?:id`. 중복 ID 금지, 해당 action 필드만 허용. MOVE targetTripId 필수, UPDATE 필드 하나 이상 |
| VisitCandidate | `id,memberId:id,place:Place,visitedAt:datetime,evidencePhotoIds:id[],status:PENDING\|CONFIRMED\|INVALIDATED,version:integer,visitId:id\|null`. 후보는 실제 방문으로 집계하지 않음 |
| SettlementState | `current:Settlement\|null,currentExpenseVersion:integer,recalculationRequired:boolean` |
| FeedIncludes | `{photos:boolean,route:boolean,reviews:boolean,expenses:boolean}`. 신규 기본 모두 false 제안, 포함 선택 없이 원본 자동 공개 안 함 |
| OwnFeed | Feed + `audienceUserIds:id[],selectedPhotos:{photoId:id,caption:string\|null,enabled:boolean}[],photoConsents:PhotoConsent[],excludedPhotoIds:id[]`. 타인 응답은 허용 목록 미노출 |
| PhotoConsent | `id,feedId,ownerUserId:id,photos:{photoId:id,assetId:id,photoVersion:integer,previewUrl:string}[],audience:UserCard[],publicationPreview:{title:string,body:string,include:FeedIncludes},scopeHash:string,status:PENDING\|ACCEPTED\|DECLINED\|REVOKED\|STALE\|EXPIRED,version:integer,expiresAt:datetime\|null,decidedAt:datetime\|null`. 수신자는 이 제한된 스냅샷만 조회, previewUrl은 인증된 파일 경로 |
| PublishedReview | `id,placeId:id,author:UserCard,score:integer,body:string,writtenAt:datetime,feedId:id`. 게시 시 본인 평가 스냅샷 |
| PublicExpenseSummary | `{totalAmountMinor:integer,currency:string,asOfExpenseVersion:integer}`. 개별 지출·분담/정산 상대 미포함 제안 D-14 |
| OwnMapResult | `markers:{region:Region,tripIds:id[],feedIds:id[]}[],unlocatedTripCount:integer,hiddenTripCount:integer\|null,updatedAt:datetime`. viewerId 없는 hiddenTripCount=null |
| PlaceTimelineItem | `place:Place,plannedAt:datetime\|null,visitedAt:datetime\|null,status:PLANNED\|VISITED,photoCount:integer,plannedDistanceMeters:integer\|null` |
| TripSummary | `tripId:id,photoCount:integer,visitedPlaceCount:integer,visitedRegionCount:integer,plannedDistanceMeters:integer\|null,actualDistanceMeters:integer\|null,totalAmountMinor:integer\|null,currency:string\|null` |

### 비동기 작업 kind별 result

| kind | `/jobs/{jobId}`의 result |
| --- | --- |
| PLACE_EXTRACTION | ExtractionResult의 `resultStatus,candidates` |
| TRIP_RECOMMENDATION | RecommendationResult의 `items,basis,insufficientData` |
| ITINERARY_PROPOSAL | ItineraryProposal의 `baseVersion,reason,proposed,diff,appliedAt` |
| VISIT_DETECTION | `{candidates:VisitCandidate[]}`. CONFIRM 모드는 후보만, AUTO도 근거 있는 본인 후보만 확정하며 Q-7 판정 정책 확정 전 자동 실행 비활성 |
| ROUTE_RECALCULATION | `{baseVersion:integer,legs:RouteLeg[]}`. 버전 일치 시 편집안의 경로만 갱신 |
| WEATHER_ALTERNATIVES | `{alternatives:{alternativeId:id,type:PLACE_SWAP\|TIME_SHIFT\|INFO,place:Place\|null,itemId:id\|null,targetStartTime:string\|null,activity:string,reason:string}[],weather:Weather,baseVersion:integer}`. 해당 ID를 선택해 proposal 생성 후 적용 |
| CHECKLIST_SUGGESTIONS | `{items:{label:string,reason:string,sourceJobId:id}[]}`. 제안 선택 후 일반 checklist POST로 추가 |
| PHOTO_CLASSIFICATION | `{photos:{photoId:id,status:SUCCEEDED\|FAILED,topics:string[],groupId:id\|null,errorCode:string\|null}[]}` |
| LEAVE_CLEANUP / PHOTO_DELETE / TRIP_DELETE | `{scope:string,completedCount:integer,failedCount:integer}`. 실제 보존 범위 Q-11. ACCOUNT_DELETE는 서버 내부 작업이며 사용자 폴링 결과 없음 |

작업 result에는 Job을 다시 포함하지 않는다. 자원별 조회 API는 동일 결과에 Job 메타데이터를 덧붙인 표현이다. 일반 AI 작업은 이탈·동의 철회 시 입력 사용과 열람 권한을 재검사한다. 삭제 작업의 실행·최소 진행 상태 조회는 §9의 예외 권한표를 따른다.

### 클라이언트 호출 연결 예시

| 사용자 동작 | 호출 순서 | 유지해야 할 값 |
| --- | --- | --- |
| 첫 일정 만들기 | 여행 생성 → 일정 GET → PUT 또는 INITIAL proposal → 결과 조회 → confirm/apply 또는 승인 요청 | GET의 version=1과 이동 수단, 작업의 baseVersion. canApply=false면 승인 요청 |
| 재접속 후 평가 쓰기 | visits GET(memberId=본인,reviewStatus=UNWRITTEN) → 선택한 visitId로 review PUT | 기존 visitId, 평가 작성 때문에 방문을 다시 생성하지 않음 |
| 좋아요 표시 | feed GET → likedByMe/likeCount 표시 → like PUT/DELETE → 필요 시 feed 재조회 | 로그인·열람 권한 검사 후 새로고침에도 상태 복원 |
| 공개 코스 갱신 | 내부 itinerary GET → confirmed.id를 담아 feed PATCH | 내부 일정과 게시 스냅샷의 버전을 별도로 검사 |
| 날씨 대안 반영 | weather-alternatives 생성/조회 → alternativeId 선택 → WEATHER proposal → apply 또는 승인 요청 | 원본 작업 ID·선택 대안 ID·기준 일정 버전 |

## 11. ERD 연결과 구현 전 확인

| 범위 | PRD | 주요 테이블 |
| --- | --- | --- |
| 가입·관계·그룹 | WD-FR-01~04 | users, oauth_accounts, oauth_attempts, sessions, friendships, suggestion_dismissals, trips, trip_members, trip_invitations |
| 장소 수집·저장·취향 | WD-FR-05~08 | assets, jobs, extraction_candidates, places, regions, personal_bookmarks, trip_place_saves, user_preferences, preference_rejections, trip_members |
| 추천·반응·트렌드 | WD-FR-09~11·31 | jobs, feed_likes, visits 및 원본 집계 |
| 투표·일정·여행 중 | WD-FR-12~18 | polls, poll_candidates, poll_votes, poll_results, trip_destinations, itineraries, itinerary_items, itinerary_revisions, course_approvals, poll_participants, route_legs, jobs, checklist_items |
| 사진·평가·정산 | WD-FR-19~23 | photos, photo_topics, photo_groups, visits, reviews, expenses, expense_shares, visit_candidates, settlements, settlement_members, settlement_transfers |
| 피드·지도·타임라인 | WD-FR-24~30 | feeds, feed_photos, feed_places, feed_audiences, photo_consents, photo_consent_items, feed_reviews 및 방문·일정 집계 |
| 관리·채팅·알림 | WD-FR-32~35 | 전 자료의 생명주기, chat_rooms, chat_participants, messages, events, notifications, event_receipts, user_settings, idempotency_records |

이 초안에서 다음 항목은 구현 전 합의가 필요하다. 이미 확정한 정책을 다시 묻는 목록은 아니다.

1. **Q-3:** 사진 선택 세부·동의 만료/철회/재동의·공개 경비 상세. 멤버별 게시·친구 선택은 확정.
2. **Q-6:** 전원 참여 기준·동률/0표 결정권자·복수 선택 결과 수·연장·코스 승인 역할·만료시간·되돌리기 범위. D-13은 제안이며 승인 흐름 자체는 포함.
3. **Q-10:** 통화·반올림·수동 완료 주체/단위·재계산 후 완료 상태·계산 보관·명시적 원본 삭제와 공동 정산 영향. 새 계산의 완료 표시는 초기화하는 제안.
4. **Q-7·11·13:** 사진 일괄 편집 권한/원자성·이동/삭제 보존·방문 후보 판정/취소 시 평가·평가 척도·채팅 시작/과거 대화/첨부.
5. **Q-5·8·9·12·14:** 취향 전역/여행별 override·공급자/추천/집계·준비물 내/공동 범위·파일 한도/성능·알림 보관/필수 안내.

검증할 핵심 사례: 같은 여행의 서로 다른 작성자 피드 분리, 미허용 친구의 직접 링크/파일/지도 차단, 동의 전 사진 제외·동의 철회 즉시 차단, 친구 해제 후 재친구여도 과거 허용 자동 복구 안 됨, 타인 피드 수정 거부, 오래된 승인 거부·확정본 보존, 투표 자동 마감/동률/0표, 다른 여행 사진 이동 시 참조 정리, 비용 변경 후 이전 정산 완료 차단, 정산 총합 보존, 설정 실패 시 이전 값 보존, 알림/시스템 카드 읽음 동기화. 문서·DBML 검증은 구현/API 실행 검증을 대체하지 않는다.
