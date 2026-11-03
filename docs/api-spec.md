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
| D-16 | 사진 일괄 변경은 업로더 본인 자료만 한 트랜잭션으로 처리하는 제안. 여행 이동은 양쪽 ACTIVE 멤버십 필요. 타인 편집·원자성 최종 합의 대기 | Q-7 |
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
| 404 | `TRIP_NOT_FOUND`, `FEED_NOT_FOUND`, `JOB_NOT_FOUND` — 존재를 공개할 수 없는 자료도 같은 응답. 여행 안의 하위 자료는 `MEMBER_NOT_FOUND`(없거나 이탈한 멤버십), `CHECKLIST_ITEM_NOT_FOUND`(없거나 삭제된 준비물), `EXPENSE_NOT_FOUND`(없거나 삭제된 경비), `SETTLEMENT_NOT_FOUND`(없거나 다른 여행의 정산 계산), `CHAT_ROOM_NOT_FOUND`(없거나 삭제된 여행·참여하지 않았거나 나간 채팅방), `POLL_NOT_FOUND`(없거나 다른 여행의 투표) |
| 409 | `VERSION_CONFLICT`, `POLL_CLOSED`, `ALREADY_MEMBER`, `ALREADY_APPLIED`, `TRIP_DELETION_PENDING`(여행 삭제 기능 전 혼자 남은 방장의 나가기), `TRIP_FULL`(여행 ACTIVE 멤버 정원 초과), `CLIENT_MESSAGE_ID_REUSED`(같은 clientMessageId를 다른 방·본문에 재사용) |
| 410 | `INVITATION_EXPIRED`·`INVITATION_REVOKED` — 사용자가 제시한 유효 형식의 초대 토큰 검증 결과. 새 링크 발급으로 무효가 된 링크만 `INVITATION_REVOKED`, 없는 토큰·기간 지남·삭제된 여행·초대자 이탈은 `INVITATION_EXPIRED` |
| 422 | `INSUFFICIENT_DATA`, `CURRENCY_MISMATCH`, `INVALID_PARTICIPANTS`, `UNSUPPORTED_INPUT`, `INVALID_ROUTE_LEGS`(코스 구간이 빠지거나 겹치거나 인접하지 않음) |
| 503 | `PROVIDER_UNAVAILABLE` — 지도·날씨·장소 공급자 장애. 결과 없음과 구분 |

동시 편집 대상인 일정·투표·경비·정산·설정·피드 편집에는 `expectedVersion:integer`를 사용한다. 다른 버전을 덮어쓰지 않고 `409`를 반환한다. 공동 피드 편집과 개인 숨김 변경에도 버전 조건을 적용한다. 여행 생성·경비 생성·비동기 작업 생성·정산 계산·사진 업로드 배치 생성 POST에는 `Idempotency-Key` 헤더가 필수라는 제안이며 `(사용자, 실제 요청 경로, 키)`를 묶는다. 채팅 메시지 전송은 본문의 `clientMessageId`가 이 역할을 하므로 헤더를 요구하지 않는다(보내도 쓰지 않음, §9, 2026-11-02). 같은 키/같은 본문은 최초 결과, 다른 본문은 409. 여행 안 자료를 만드는 POST(경비 등록 등)는 최초 결과를 다시 줄 때도 현재 멤버 권한을 다시 검사한다(등록 뒤 이탈·내보내기·여행 삭제면 404). 다른 POST에는 이 헤더를 필수로 요구하지 않는다. 유효기간은 Q-12에서 확정한다.

## 3. 인증·프로필·팔로우·설정

근거: WD-FR-01~03·08·35. 인증 세부는 공급자 공식 흐름에 맞춰 별도 확정하며 URL에 제공자 토큰을 싣지 않는다.

2026-10-28 카카오·Expo 구현 결정: 최초의 유효 카카오 닉네임으로 가입 완료한다. 미제공·빈 값·기본 닉네임·50자 초과는 `nickname=""`, `profileCompleted=false`로 저장한다. 대기 토큰은 GET/PATCH `/me`와 갱신·현재 세션 로그아웃을 허용하고 다른 서비스 요청은 `403 PROFILE_INCOMPLETE`다. PATCH 완료 뒤에는 같은 토큰에서도 DB의 현재 상태로 접근을 판단한다. 재로그인은 이름을 덮어쓰지 않는다. 웹 쿠키와 NAVER는 후속이다. [환경 설정·Swagger 수동 호출 가이드](design/backend-auth-integration.md)를 따른다. 갱신·현재 세션 로그아웃은 구현하며 닉네임 외 프로필 API는 후속 설계 계약이다.

| Method | URL | 권한 | 요청 | 성공 data / 상태 | 주요 규칙 |
| --- | --- | --- | --- | --- | --- |
| POST | `/auth/oauth/{provider}/authorization-requests` | 공개 | `{redirectUri:string,codeChallenge:string}` | `OAuthAuthorization` / 201 | 현재 KAKAO만 구현. Expo 외부 브라우저 흐름, S256 challenge 필수. 허용된 redirect만 사용, verifier 소유에 바인딩된 state 발급 |
| POST | `/auth/oauth/{provider}/sessions` | 공개 | `OAuthExchange` | `Session` / 200 | 현재 KAKAO만 구현(NAVER 거부). 코드·state·redirect·만료·verifier 검증, 인가 컨텍스트 일회 소비. 제공자 오류는 503 PROVIDER_UNAVAILABLE |
| POST | `/auth/sessions/refresh` | 갱신 토큰 | `{refreshToken:string}` | `Session` / 200 | Bearer 불필요(만료 헤더도 무시). 이전 access·refresh 즉시 폐기, 새 refresh는 갱신 시점부터 14일. 재사용은 해당 로그인 후속 세션까지 폐기 후 401, 다른 기기 유지. 앱 갱신 직렬화, isNewUser=false, 원문 DB 저장 금지 |
| DELETE | `/auth/session` | 로그인 | 없음 | 204 | 유효 Bearer의 현재 세션 폐기. 다른 기기 유지, 가입 대기 허용 |
| GET | `/me` | 본인 | 없음 | `MyProfile` / 200 | 비공개 연령·동의 정보는 본인에게만 |
| PATCH | `/me` | 본인·가입 대기 허용 | `{nickname:string}` | `MyProfile` / 200 | 현재 구현은 닉네임만 지원, 다른 필드는 400. 공백 제거 후 1~50자로 가입 완료. 이미지·연령·공개 범위 수정은 후속 |
| DELETE | `/me` | 본인 | 없음 | `{accepted:true}` / 202 | 접수 후 계정 비활성화·세션 폐기, 별도 작업 폴링 없음. 보존 정책 Q-11 확정 후 활성화 |
| GET | `/users` | 로그인 | `query:string` + 페이지 | `UserCard[]` / 200 | 닉네임으로만 검색, 프로필 링크/ID 검색은 제공하지 않음, 노출 범위 Q-2 |
| GET | `/users/{userId}` | 로그인 | 없음 | `UserCard` / 200 | 연령·이메일 반환 금지 |
| GET | `/me/following` | 본인 | 페이지 | `Follow[]` / 200 | 내가 팔로우한 ACCEPTED 방향만 |
| GET | `/me/followers` | 본인 | 페이지 | `Follow[]` / 200 | 나를 팔로우한 ACCEPTED 방향만 |
| GET | `/me/follow-requests` | 본인 | `direction:RECEIVED\|SENT` + 페이지 | `Follow[]` / 200 | 비공개 계정의 REQUESTED 목록 |
| POST | `/users/{userId}/follow` | 로그인 | 없음 | `Follow` / 200 | 대상 PUBLIC이면 ACCEPTED, PRIVATE면 REQUESTED. 자기 자신 금지·방향별 멱등 |
| POST | `/me/follow-requests/{requestId}/accept` | 대상 계정 본인 | 없음 | `Follow` / 200 | REQUESTED→ACCEPTED, 반대 방향 생성 없음 |
| DELETE | `/me/follow-requests/{requestId}` | 당사자 | 없음 | 204 | 발신자 취소·수신자 거절 |
| DELETE | `/users/{userId}/follow` | 팔로우 발신자 | 없음 | 204 | 해당 방향 언팔로우, 공동 여행 유지 |
| DELETE | `/me/followers/{userId}` | 대상 계정 본인 | 없음 | 204 | 본인 팔로워 제거, 반대 방향 유지 |
| GET | `/me/follow-suggestions` | 본인 | 페이지 | `{user:UserCard,reason:string}[]` / 200 | 공개 가능한 추천 이유만 |
| PUT | `/me/follow-suggestion-dismissals/{userId}` | 본인 | 없음 | 204 | 추천 숨김은 영구 재추천 제외, 만료 없음 |
| GET | `/me/preferences` | 본인 | 없음 | `Preferences` / 200 | 직접 입력·추론 분리 |
| PUT | `/me/preferences` | 본인 | `PreferencesWrite` | `Preferences` / 200 | 직접 입력 전체 교체, 추론 허용과 공유 범위 별도 |
| PUT | `/trips/{tripId}/members/me/preference-consent` | 멤버 | `{scope:EXPLICIT_ONLY\|EXPLICIT_AND_INFERRED\|NONE\|INHERIT}` | `{scope:string,effectiveScope:string}` / 200 | D-17. 나만 보기는 NONE, 추론 허용을 대신하지 않음 |
| DELETE | `/me/preferences/inferred/{key}` | 본인 | 없음 | 204 | 추론 항목 개별 제거·재추론 거부 표식. 재추론 기간 Q-5 |
| GET | `/me/settings` | 본인 | 없음 | `UserSettings` / 200 | AI 기능·종류별 알림 설정 |
| PATCH | `/me/settings` | 본인 | `SettingsPatch` | `UserSettings` / 200 | expectedVersion 검사, 실패 시 전체 이전 설정 유지 |

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
| DELETE | `/trips/{tripId}` | 방장 | `expectedVersion:integer`(query) | `JobRef` / 202 | 전체 삭제 범위 Q-11, 즉시 접근 차단·후속 정리 작업 제안 |
| GET | `/trips/{tripId}/members` | 멤버 | `includeInactive?:boolean`(query, 기본 false) | `{members:Member[]}` / 200 | 기본 ACTIVE만 joinOrder 순. `includeInactive=true`면 정산에 남는 이탈(LEFT·REMOVED) 멤버도 포함 |
| POST | `/trips/{tripId}/invitations` | 멤버 | 없음 | `InvitationSecret` / 201 | 만료는 생성 후 7일(Q-4, 2026-10-30 결정). 링크별 사용 횟수 없음. 새로 만들면 같은 여행의 이전 링크는 모두 무효(여행당 쓸 수 있는 링크 하나), 화면 진입마다 호출하지 않음. 토큰 원문 1회 반환, 서버는 해시만 보관 |
| GET | `/invitations/{token}` | 공개(D-1) | 없음 | `InvitationPreview` / 200 | 여행명·기간·초대한 사람만, 내부 명단/경비 반환 안 함. 형식이 틀린 토큰 404, 링크가 쓸 수 없으면 410(사유는 §2). 로그인한 사람이 이미 ACTIVE 멤버면 링크가 만료·무효여도 200, `alreadyMember=true`. Authorization 헤더를 보내면 검증(잘못된 토큰 401, 가입 대기 403) |
| POST | `/invitations/{token}/accept` | 로그인 | 없음 | `Trip` / 200 | 유효 링크로 관계 없이 참여. 이미 ACTIVE 멤버면 링크가 만료·무효여도 바뀌는 것 없이 같은 여행 반환. 그 밖에는 새 발급으로 무효(410 `INVITATION_REVOKED`)·만료·초대자 이탈(410 `INVITATION_EXPIRED`) 검사 후, 정원은 여행당 ACTIVE 멤버 20명(방장 포함, Q-4)으로 넘으면 409 `TRIP_FULL`. 이탈 멤버는 기존 멤버십으로 재참여하고 joinOrder를 새로 받음. 채팅 참여와 함께 처리하고 여행 version 증가 |
| POST | `/trips/{tripId}/owner-transfer` | 방장 | `{targetMemberId:id,expectedVersion:integer}` | `Trip` / 200 | 같은 여행의 다른 ACTIVE 멤버만, 아니면 400. 방장 아닌 멤버 403. 알림 없음 |
| POST | `/trips/{tripId}/leave` | 멤버 | `{deleteOwnPhotos:boolean,deleteOwnMessages:boolean,expectedVersion:integer}` | `LeaveResult` / 200(삭제 작업이 있으면 202) | 일반 이탈은 경비 유지·방장 자동 양도. (2단계, 여행 삭제 기능 이후) 마지막 방장은 여행 삭제로 접수하며 tripDeleted=true, 같은 TRIP_DELETE 작업 사용. **1단계(2026-11-02 확정)**: 경비·사진·메시지를 남기는 기본 나가기만 지원한다. 성공은 200 + `LeaveResult{tripId,tripDeleted:false,newOwnerMemberId(방장이 나갔을 때만, 아니면 null),cleanupJobId:null,status:LEFT}`. 삭제 옵션 `true`는 삭제 기능 전까지 400 `VALIDATION_ERROR`(필드 deleteOwnPhotos·deleteOwnMessages), 혼자 남은 방장은 여행 삭제 기능 전까지 409 `TRIP_DELETION_PENDING`(상태 변경 없음). 여행 version 다르면 409, 성공 시 version 1 증가. 멱등키 대상이 아니므로 성공 뒤 재시도는 404 |
| DELETE | `/trips/{tripId}/members/{memberId}` | 방장 | `expectedVersion:integer`(query) | 204 | 본인·방장 내보내기 금지(400). 없거나 이탈한 대상 404 `MEMBER_NOT_FOUND`. 멤버십 REMOVED·채팅 참여 해제를 한 트랜잭션으로. 강제 이탈 시 타인 자료 삭제 여부는 Q-11 |

2026-10-30 사용자 확정: 여행 정원은 방장 포함 ACTIVE 멤버 최대 20명이다. 이탈·내보내기로 빈자리가 생기면 다시 참여할 수 있다. 초대 링크는 발급 시각부터 7일(168시간) 유효하며, 만료 시각부터 참여할 수 없다. ACTIVE 멤버 누구나 재발급할 수 있고 재발급하면 이전 링크는 즉시 무효화한다. 링크 만료·재발급은 기존 참여자에게 영향을 주지 않는다. 수락 시 정원 확인과 참여 반영을 원자적으로 처리해 동시 수락으로 20명을 초과하지 않게 한다. 만료는 410 INVITATION_EXPIRED, 정원 초과는 409 TRIP_FULL이다. 재발급 시 이전 링크 무효화는 EODI-128에서 반영했다(여행 행 잠금으로 동시 발급에도 쓸 수 있는 링크는 하나, 무효가 된 링크는 410 INVITATION_REVOKED). 기존 ACTIVE 멤버는 만료·무효 링크로 열어도 미리보기 `alreadyMember=true`, 수락은 같은 여행을 받는다.

방장 양도·멤버 내보내기의 `expectedVersion`은 여행의 `version`(`Trip.version`)이다(이탈·여행 삭제도 같은 version을 쓰는 제안). 입력 형식 400을 먼저 검사한 뒤 비참여자 404, 방장 전용 동작을 멤버가 요청하면 403, 버전이 다르면 409, 끝으로 대상(양도 대상이 동행이 아니거나 이미 방장이면 400, 내보낼 멤버가 없거나 이탈했으면 404 `MEMBER_NOT_FOUND`, 방장 자신이면 400) 순으로 판정한다. 양도·내보내기가 성공하면 `Trip`의 `ownerMemberId`·`members`가 바뀌므로 여행 version을 올리고, 그 전 version으로 보낸 여행 정보 수정(PATCH)은 409가 된다.

`leave`에서 방장 다음 순서는 ACTIVE 멤버의 joinOrder 오름차순이다. 양도·멤버 비활성화·본인 노출 경로 제외·채팅 참여 해제를 한 트랜잭션으로 처리한다. 마지막 방장의 이탈은 여행 삭제와 같은 처리이며 삭제 확인 안내 후 같은 TRIP_DELETE 작업을 생성한다. 일반 이탈의 경비 유지 규칙을 전체 여행 삭제의 영구 보존 규칙으로 해석하지 않는다. 이탈자의 공동 피드 표시 경로만 제거하고 공동 피드·그룹 저장·경비는 유지한다. 사진 삭제 선택은 공동 피드의 사진·표지·파일 접근에 즉시 반영한다.

이탈 트랜잭션 안에서 삭제를 선택한 **당시 사진 ID·메시지 ID와 이탈 시각을 고정**해 정리 작업에 저장한다. worker가 실행 시점의 `memberId`만으로 삭제 대상을 다시 검색하면 안 된다. 재가입 후 생성한 자료는 대상에 포함하지 않는다. 삭제 대상은 승인 당시 범위를 확대하지 않으며 작업 재시도는 같은 대상에 대해 멱등이다. 일반 AI 작업은 현재 멤버십·동의를 재검사하지만, 승인된 삭제 작업은 고정된 대상에 대한 정리를 계속한다.

## 5. 장소·저장·추출·추천

근거: WD-FR-05~11·31. AI 서버의 내부 API는 별도 담당 범위이며 여기에는 앱→서비스 API만 정의한다.

| Method | URL | 권한 | 요청 | 성공 data / 상태 | 주요 규칙 |
| --- | --- | --- | --- | --- | --- |
| GET | `/places` | 로그인 | `query:string,regionId?:id` + 페이지 | `Place[]` / 200 | 공급자 결과를 provider/공급자 ID로 로컬 upsert한 뒤 로컬 UUID만 반환 |
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
| POST | `/extractions` | 본인 | `{url?:string,captureAssetIds?:id[],memo?:string}` | `JobRef` / 202 | URL/캡처 하나 이상, 캡처 최대 10장·JPG/PNG. 11장 이상 422 INPUT_LIMIT_EXCEEDED. 용량·지원 사이트 Q-5 |
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
| GET | `/regions/{regionId}` | 로그인·가입 완료 | UUID 지역 ID | `RegionDetail` / 200 | region + introduction:null, representativePlaces:[], partialErrors:[]; 없는 지역404 REGION_NOT_FOUND, 잘못된 UUID400 |
| GET | `/places/{placeId}/social-summary` | 로그인 | 없음 | `PlaceSocialSummary` / 200 | 허용된 게시물에서만 방문자·평점 집계, 부분 장애 표시 |
| GET | `/places/{placeId}/public-reviews` | 로그인 | 페이지 | `PublishedReview[]` / 200 | 요청자에게 허용된 피드의 게시 평가만, 비공개 원본 reviews 직접 노출 금지 |

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
| POST | `/trips/{tripId}/itinerary/proposals` | 멤버 | `ProposalWrite` | `JobRef` / 202 | 최초 생성에도 GET에서 얻은 version 사용, 기존 일정 자동 덮어쓰기 없음 |
| GET | `/trips/{tripId}/itinerary/proposals/{jobId}` | 멤버 | 없음 | `ItineraryProposal` / 200 | 변경 전후 비교, 기준 버전 표시 |
| POST | `/trips/{tripId}/itinerary/proposals/{jobId}/apply` | 멤버 | `{expectedVersion:integer}` | `Itinerary` / 200 | 성공한 변경안·기준 버전·현재 멤버십 검증 후 단일 코스 원자 교체. 방장 승인 불필요 |
| POST | `/trips/{tripId}/itinerary/undo` | 멤버 | `{expectedVersion:integer,appliedJobId:id}` | `Itinerary` / 200 | 직전 AI 적용 1회만 되돌림. 적용 후 다른 쓰기면 409 UNDO_UNAVAILABLE 제안, 복원도 새 version. 시간 제한은 Q-15 |
| POST | `/trips/{tripId}/itinerary/routes/recalculate` | 멤버 | `{expectedVersion:integer}` | `JobRef` / 202 | 실패 구간 재조회, 변경된 코스에는 자동 반영하지 않음 |
| POST | `/trips/{tripId}/visits` | 멤버 | `{placeId:id,visitedAt:datetime,evidenceType:MANUAL}` | `Visit` / 201 | 실제 방문 수동 기록 제안. 자동 위치 수집 추가 안 함 |
| GET | `/trips/{tripId}/visits` | 멤버 | `memberId?:id,placeId?:id,reviewStatus?:ALL\|WRITTEN\|UNWRITTEN` + 페이지 | `Visit[]` / 200 | 기본 본인·ALL. 같은 여행 멤버만 필터 가능, 평가할 visitId 복원 |
| DELETE | `/trips/{tripId}/visits/{visitId}` | 본인 방문 작성자 | 없음 | 204 | 방문 체크 되돌리기. 평가가 있으면 409 REVIEW_EXISTS 제안, Q-7 확정 후 조정 |
| POST | `/trips/{tripId}/visit-detections` | 멤버 | `{photoIds:id[]}` | `JobRef` / 202 | 허용된 사진 메타데이터로 후보만 제안, 실제 체크와 구분 |
| POST | `/trips/{tripId}/visit-candidates/{candidateId}/confirm` | 후보 본인 | `{expectedVersion:integer}` | `Visit` / 201 | 동일 후보 중복 확정은 기존 visit 반환. 사진 속 타인을 자동 방문자로 지정하지 않음 |
| GET | `/trips/{tripId}/weather` | 멤버 | `date:date,placeId:id` | `Weather` / 200 | 관측/예보 구분, 조회 시점·유효성 |
| POST | `/trips/{tripId}/weather-alternatives` | 멤버 | `{date:date,placeId:id,expectedVersion:integer}` | `JobRef` / 202 | 실제 공급자 날씨 데이터로 생성 |
| GET | `/places/{placeId}/facilities` | 로그인 | `type:string,radiusMeters:integer` + 페이지 | `Facility[]` / 200 | 시설 종류·반경 Q-8, 장애와 빈 결과 구분 |
| GET | `/trips/{tripId}/checklist` | 멤버 | 없음 | `{items:ChecklistItem[]}` / 200 | 여행 공동 목록 하나, checkedByMemberId 포함. 페이지 없이 추가한 순(createdAt ASC, id ASC) |
| POST | `/trips/{tripId}/checklist` | 멤버 | `{label:string,sourceJobId?:id,suggestionIndex?:integer}` | `ChecklistItem` / 201 | sourceJobId/index 동시 지정 시 같은 여행 성공 결과 검증·이유 보존, 없으면 직접 작성. AI 준비물 제안 연동 전에는 sourceJobId/index를 400으로 거부 |
| PATCH | `/trips/{tripId}/checklist/{itemId}` | 멤버 | `{label?:string,checked?:boolean,expectedVersion:integer}` | `ChecklistItem` / 200 | 체크 시 서버가 checkedByMemberId/checkedAt 기록, 해제 시 둘 다 null. 타인 ID 입력 금지 |
| DELETE | `/trips/{tripId}/checklist/{itemId}` | 멤버 | 없음 | 204 | 행을 남기는 논리 삭제. AI 재생성 시 삭제한 항목 강제 부활 금지 |
| POST | `/trips/{tripId}/checklist-suggestions` | 멤버 | `{date:date}` | `JobRef` / 202 | 제안만 생성. 수동 편집·체크 목록을 덮어쓰지 않음 |

경로는 구간별 수단을 가진 Itinerary.legs로 반환하며 순서/장소/수단 변경 시 영향 구간을 재계산한다. 실패는 durationSeconds=null/status=UNAVAILABLE이다. 코스 저장·AI 적용·되돌리기·경로 반영은 현재 version을 검사하고 원자적으로 증가시키는 서버 제안이다. AI 결과 baseVersion이 다르면 409 VERSION_CONFLICT로 거부하되 별도의 오래된 변경안 확인 화면을 요구하지 않는다. 실시간 중 자동 재계산/재시도·복귀 충돌 UX는 Q-15 합의 대상이며 REST만으로 실시간 구현을 완료했다고 취급하지 않는다. 코스 변경 알림 묶음은 Q-16이다. 투표 마감은 타이머·조회·쓰기에서 같은 규칙으로 한 번만 처리한다. 최다 후보 전부를 FINALIZED, 0표는 CLOSED/NO_VOTES·selectedCandidateIds=[]로 마감한다. 0표를 결정권자 대기 상태로 해석하지 않는다. 지역 투표가 확정되면 확정 지역을 여행지 끝에 추가(이미 있으면 건너뜀)하고 여행 version을 올린다. 장소 확정은 코스를 바꾸지 않는다(2026-11-02).

일정 전체 교체에서 빠진 기존 항목은 제거한다. 기존 ID는 해당 코스 소유인지 검사하고 신규 항목 ID는 서버가 발급한다. startTime/stayMinutes는 생략/null이면 비운다. 구간은 `{day,fromOrder,toOrder,transportMode}`로 쓰고 서버가 결과 item ID에 연결한다. 같은 날짜의 연속 인접 구간을 빠짐없이 하나씩 지정하고 빠진/비인접/중복 구간은 422 `INVALID_ROUTE_LEGS`다(하루에 항목이 하나면 그 날은 구간 없음). 여행 전체 transportMode 필드는 제공하지 않는다. 2026-11-03 구현: 항목은 최대 200개, `day`는 1 이상이며 여행 기간이 정해져 있으면 일수 이하, 날짜별 `order`는 1부터 빈틈없이, `startTime`은 `HH:mm`, `stayMinutes`는 1~1440. 요청 자체의 오류는 400, 구간 구조 오류는 422, 그다음 여행 404 → version 409 → 코스 소유·여행 기간 400 순으로 판정한다. 바뀐 게 없으면 version을 올리지 않는다(여행 수정과 같은 규칙). 여행 기간을 줄여도 저장된 코스는 지우지 않고 다음 교체 때 검증한다. 경로 공급자 연동 전에는 구간을 `durationSeconds`·`distanceMeters`·`geometry` null, `status=UNAVAILABLE`로 저장한다.

날씨 대안은 `alternativeId`를 포함한다. WEATHER 제안 요청은 `sourceWeatherJobId`·`selectedAlternativeId`를 받아 같은 여행의 성공한 결과와 선택 항목을 검증하고 기준 일정 버전도 일치해야 한다. 대안 유형은 PLACE_SWAP/TIME_SHIFT/INFO다. TIME_SHIFT는 기존 itemId·목표 시각으로 같은 장소를 이동하므로 새 장소가 없어도 적용 가능하다. INFO만 있는 대안의 적용은 `422 UNSCHEDULABLE_ALTERNATIVE`로 거부한다. 선택한 대안을 무시하고 임의의 새 장소로 대체하지 않는다.

## 7. 사진·평가·경비

근거: WD-FR-19~23. 파일 업로드와 여행 사진 등록을 분리해 업로드 일부 실패를 처리한다.

| Method | URL | 권한 | 요청 | 성공 data / 상태 | 주요 규칙 |
| --- | --- | --- | --- | --- | --- |
| POST | `/assets/upload-intents` | 로그인/여행 사진은 멤버 | `{purpose:PROFILE\|CAPTURE\|TRIP_PHOTO,tripId?:id,contentType:string,byteSize:integer,batchId?:id}` | `UploadIntent` / 201 | TRIP_PHOTO는 JPG/PNG/HEIC. batchId는 같은 사용자/여행의 PhotoUploadBatch이며 등록 시 필수. 파일 실제 형식 검증, 용량 Q-7 |
| DELETE | `/assets/{assetId}` | 업로더 | 없음 | 204 | PENDING 업로드 취소만, 서버 객체 정리·이후 complete 거부. 등록된 사진은 사진 삭제 API 사용 |
| POST | `/assets/{assetId}/complete` | 업로더 | 없음 | `Asset` / 200 | 객체 존재·크기·형식 검증, 본인 파일만. 허용된 EXIF 위치/촬영시각은 비공개 메타데이터로 추출, 공개 파일은 GPS 메타데이터 제거 |
| GET | `/assets/{assetId}/download` | 실제 자료 접근권자 | `feedId?:id` | 파일 바이트 / 200 | 인증 게이트웨이 스트리밍 제안. 피드 경유면 매 요청 직접 공동 피드 공개 정책·포함 사진·삭제/이동 상태를 재검사. 개인 경로 숨김을 직접 파일 접근 차단으로 확대하지 않음, private/no-store |
| GET | `/trips/{tripId}/photos` | 멤버 | `topic?:string,groupId?:id` + 페이지 | `Photo[]` / 200 | 부분 업로드 실패는 기존 성공 사진과 독립 |
| POST | `/trips/{tripId}/photos` | 멤버 | `{batchId:id,assetId:id,placeId?:id,capturedAt?:datetime}` | `Photo` / 201 | READY·본인·같은 여행/배치·지원 형식 확인. 배치 한도 예약/소비는 원자적, 부분 성공 유지 |
| POST | `/trips/{tripId}/photo-upload-batches` | 멤버 | `{fileCount:integer}` | `PhotoUploadBatch` / 201 | Idempotency-Key 필수 제안. 한 번의 업로드 1~50장. 51장 이상 422 INPUT_LIMIT_EXCEEDED. 형식/파일 크기는 각 intent에서 검사 |
| PATCH | `/trips/{tripId}/photos/{photoId}` | 업로더(제안) | `{placeId?:id\|null,topics?:string[],groupId?:id\|null,expectedVersion:integer}` | `Photo` / 200 | 수동 분류 우선. 다른 여행 groupId 금지 |
| DELETE | `/trips/{tripId}/photos/{photoId}` | 업로더(제안) | 없음 | `JobRef` / 202 | 원본·파생 파일 정리 범위 Q-11 |
| POST | `/trips/{tripId}/photo-classifications` | 멤버 | `{photoIds:id[]}` | `JobRef` / 202 | 성공/실패 사진별 결과, 원본 자동 삭제 없음 |
| GET | `/trips/{tripId}/photo-summary` | 멤버 | 없음 | `PhotoSummary` / 200 | 필터와 독립적인 전체·주제/장소별 건수·미지정 수 |
| POST | `/trips/{tripId}/photos/batch` | 업로더(D-16) | `PhotoBatchWrite` | `{photos:Photo[],deletedPhotoIds:id[]}` / 200 | 수정·이동·묶음 해제·삭제 중 하나. 검증 실패 시 전체 변경 없음 제안 |
| POST | `/trips/{tripId}/photo-classifications/{jobId}/apply` | 멤버 | `{expectedPhotoVersions:{photoId:id,version:integer}[]}` | `{photos:Photo[]}` / 200 | 확인 후 모드의 성공 결과만 명시 반영. 변경된 사진/수동 보정은 409 |
| GET | `/trips/{tripId}/reviews` | 멤버 | 페이지 | `Review[]` / 200 | 실제 방문 기록 참조 |
| PUT | `/trips/{tripId}/visits/{visitId}/review` | 방문 기록 작성자 | `{score:integer,body:string,expectedVersion?:integer}` | `Review` / 200 | 1~5 정수 필수, 반 점 거부·확인한 본인 방문만 작성 |
| DELETE | `/trips/{tripId}/visits/{visitId}/review` | 평가 작성자 | 없음 | 204 | 타인 평가 변경 불가 |
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

## 8. 공동 피드·특정 친구 숨김·지도·타임라인

근거: WD-FR-24~30, 결정 Q-3/F-19/F-20. 게시 전 피드 없음, 멤버가 게시 버튼을 눌러야 여행당 하나 생성하고 게시 후 기본 전체 공개다. 멤버 누구나 게시/삭제한다. 항목별 공개 선택·사진 동의·개인별 게시물은 제공하지 않는다. 공동 편집/공개 내용/비공개 계정 결합의 상세는 Q-3과 D-14 제안이다.

| Method | URL | 권한 | 요청 | 성공 data / 상태 | 주요 규칙 |
| --- | --- | --- | --- | --- | --- |
| GET | `/home/map` | 로그인 | `bbox:string,from?:date,to?:date` | `MapResult` / 200 | 팔로우한 멤버 경로별 공개 범위/숨긴 viewer 검사 후 feedId로 중복 제거 |
| GET | `/home/regions/{regionId}/feeds` | 로그인 | 페이지 | `FeedCard[]` / 200 | 지도와 같은 경로별 판정 |
| GET | `/users/{userId}/feed-map` | 로그인 | `bbox:string,from?:date,to?:date` | `MapResult` / 200 | 해당 멤버 경로의 특정 친구 숨김 적용, 직접 공동 피드 권한과 분리 |
| GET | `/users/{userId}/feeds` | 로그인 | 페이지 | `FeedCard[]` / 200 | 계정 공개 범위·해당 경로 숨김 필터 후 페이지 분할 |
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
| PUT | `/feeds/{feedId}/visibility/me` | 멤버 | `{hiddenViewerUserIds:id[],expectedVersion:integer}` | `FeedVisibility` / 200 | 본인 경로의 숨길 친구 전체 교체, 독립 설정 버전 검사 |
| GET | `/feeds/{feedId}` | 로그인(제안) | 없음 | `Feed` / 200 | 게시된 공동 피드는 기본 전체 공개. 특정 멤버 숨김은 이 직접 경로를 막지 않음, 삭제 404 |
| GET | `/feeds/{feedId}/summary` | 공동 피드 열람자 | 없음 | `FeedSummary` / 200 | 서버 공통 공개 콘텐츠만, 내부 정산/명단 미노출 |
| GET | `/feeds/{feedId}/preview` | 멤버 | `viewerId:id,viaMemberUserId:id` | `{visible:boolean,feed:Feed\|null}` / 200 | 특정 멤버 경로의 실제 숨김/계정 판정, 직접 접근과 혼동 금지 |

승기가 수철을 숨기면 수철이 보는 승기의 프로필/피드/지도에서만 제외한다. 세은의 경로나 직접 공동 피드 링크는 계속 볼 수 있다. 경로별 계정 공개/비공개 결합은 Q-3이며 D-5는 공동 기본 공개를 유지하고 개인 프로필 경로는 PUBLIC 또는 ACCEPTED 팔로워만 허용하는 제안이다. 비공개 멤버가 섞인 경우의 최종 정책은 아직 확정하지 않았다.

공개 내용은 서버의 공통 정책으로 결정하고 사용자별 photos/route/reviews/expenses 공개 플래그를 받지 않는다. D-14의 공개 스냅샷은 제안이며 사진·평가·코스가 같은 여행인지와 현재 원본 삭제/이동 여부를 매 조회/파일 경로에서 확인한다. 게시 시점을 기준으로 공통 표현을 만들되 제목/본문 외 편집 범위와 갱신 시점은 Q-3이다. EXIF 위치는 공개 파일에서 제거한다.

삭제는 feeds 행을 tombstone으로 보존하는 제안이며 여행당 유일성을 유지한다. 재게시 허용/ID 재사용은 Q-3 합의 전 POST가 409 FEED_REPUBLICATION_PENDING을 반환한다. 게시와 삭제의 경합은 trip 잠금·피드 version으로 직렬화하고 삭제 시 모든 노출·지도·파일·요약·추천 참조에서 즉시 제외한다. 개인 저장은 이름·위치·내 메모만 유지한다. 삭제 알림은 결정 Q-3을 우선하고 흐름 문서의 ‘삭제해도 알림 없음’은 승계하지 않는다. 게시 알림은 없다.

사진 이동 후 batchId는 업로드 당시 출처로 유지하고 등록 때의 여행/배치 일치 검사를 이동 후 현재 여행 불변식으로 확대하지 않는다. 사진 이동은 양쪽 멤버십·버전 검사 뒤 원본 공동 피드 사진·표지·방문 후보를 제외/무효화하고 자산 귀속·분류를 함께 갱신한다. 실제 방문 기록은 자동 이동하지 않는다. 본인 자료 일괄 삭제는 공동 정산 보존 Q-10·11 합의 전 제공하지 않는다.

## 9. 채팅·알림·작업 조회

근거: WD-FR-33~34, WD-NFR-02. 여행 그룹 채팅만 제공한다. 아래 REST는 조회/전송 계약이며 채팅 실시간 전송은 Q-13, 코스 공동 편집 프로토콜은 Q-15에서 합의한다. 2026-11-02 Q-13 확정(REST 범위): 신규·재참여 ACTIVE 멤버 모두 여행 채팅의 처음부터 전체 대화를 보고(이탈 기간 포함), LEFT·REMOVED는 조회·전송할 수 없다. 첨부·일반 메시지 편집/삭제·대화 읽음 규격은 추가하지 않는다. 방 참여 권한은 현재 여행 ACTIVE 멤버십이며, `/chat/rooms/{roomId}/**`에서 삭제된 여행·비참여·이탈한 방은 모두 404 `CHAT_ROOM_NOT_FOUND`(여행 경로인 `GET /trips/{tripId}/chat-room`은 404 `TRIP_NOT_FOUND`).

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

jobs 공통 기반은 PostgreSQL 등록·실행·조회만 제공한다. kind별 실행기와 등록·실행·완료·조회 정책이 모두 등록된 기능만 활성화하며, 현재 운영 실행기는 없다. 공개 생성·재시도·취소 API는 제공하지 않는다. 조회 불가·없는 작업은 모두 404 `JOB_NOT_FOUND`다. 정리 result는 `{scope:LEAVE_CLEANUP|PHOTO_DELETE|TRIP_DELETE,completedCount:integer,failedCount:integer}`만 공개한다. `scope`는 작업 종류이며 대상 ID·본문·파일은 반환하지 않는다. 내부 SPI와 재시도·임대 보장은 [jobs 기반 문서](../EodiLog/docs/plan/jobs-foundation.md)를 따른다.

사용자가 임의 알림·시스템 메시지를 만드는 API는 없다. 서버 이벤트로 알림과 시스템 메시지를 생성하고 `eventId`로 중복을 막는다. 전송 시점과 링크 진입 시점에 모두 권한을 검사한다. 팔로우 요청/수락·투표 마감/자동 결과·여행 참여·코스 변경 이벤트를 포함한다. 정산 완료·사진 동의·코스 승인 이벤트는 제거한다. 코스 연속 변경의 묶음 키/시간창·최종 상태·시스템 카드 연동은 Q-16 합의 전 확정하지 않는다. 실제 송금 확인·푸시·채팅 첨부·일반 메시지 수정/삭제·대화 전체 읽음 규격은 추가하지 않았다. 시스템 카드 읽음은 event_receipts를 통해 알림과 연결한다. 그룹 이탈 시 삭제 선택은 §4 이탈 API로 제공한다.

### 실시간 공동 편집·기간·알림의 공통 동작

- 그룹 즐겨찾기/코스의 현재 버전·접속/편집 중 멤버·성공한 변경을 실시간 전달해야 한다. REST 조회/저장은 복구용 계약이고 WebSocket/SSE 등 전송·메시지 스키마·presence TTL·저장 단위/버튼 결합·재접속 재동기화는 Q-15다. 구현 전 전송 규격을 추가해야 한다. 연결 중 변경을 조용히 유실하지 않고 연결 단절 복귀 때 충돌 안내를 제공한다.
- 여행 상태는 기간에 따라 자동 전환한다. 날짜 미정은 PLANNING, 시작/종료 경계의 현지 시간대·서버 작업 시점은 Q-4에서 합의한다. status 직접 쓰기를 받지 않으며 날짜 수정 시 파생 상태를 다시 계산한다.
- 투표 기본 마감은 화면에서 서버 시각 기준 +24시간으로 제안하고 명시적 closesAt을 제출한다. 마감 1시간 전 현재 미투표자만 알린다. 짧은 마감/마감 변경·재개 정책은 Q-6이다. 결과는 여러 지역을 날짜별 배분 가능하게 반환하고 확정 장소는 후보 상단에 표시한다.
- 알림 종류는 FOLLOW_REQUESTED/ACCEPTED, TRIP_MEMBER_JOINED, TRIP_INFO_CHANGED, POLL_OPENED/CANDIDATE_ADDED/REMINDER/FINALIZED/CLOSED_NO_VOTES, AI_PROPOSAL_READY, COURSE_CHANGED, FEED_DELETED 제안이다. 후보 추가는 현재 투표한 멤버, reminder는 미투표자에게만. 게시·방장 양도·승인 요청·사진 동의·정산 완료 이벤트는 생성하지 않는다.
- 팝업은 POLL_OPENED/REMINDER, FOLLOW_REQUESTED, AI_PROPOSAL_READY처럼 내 행동이 필요한 이벤트만, 나머지는 목록으로 제공한다. 여행 이벤트는 해당 여행 그룹 시스템 카드에 연결하고 팔로우 이벤트는 여행 채팅에 넣지 않는다. 코스 변경 묶음 키/시간창·건수/최종 상태·읽음/카드 갱신은 Q-16이며 임의 수치를 확정하지 않는다.

## 10. 요청·응답 DTO

아래 DTO는 `data` 내부의 실제 반환 필드다. 나열하지 않은 `id`·시각·버전 필드를 자동으로 덧붙이지 않는다. DB에 존재해도 공개 DTO에 없으면 반환하지 않는다. 별도 선택 표기가 없는 반환 필드는 필수이며 값이 없을 때는 명시한 null을 사용한다. 모든 날짜시각은 ISO 8601 문자열, date는 `YYYY-MM-DD`, 금액·카운트·버전은 정수다. `TripStatus`는 PLANNING/ONGOING/COMPLETED다. 신규 영속 ID는 UUIDv7로 생성하며 기존 UUIDv4 ID도 유효하다. 문자열 길이 상한은 각 API의 명시된 제약을 따르고, 미기재 항목은 구현 전 확정한다.

| DTO | 필드와 의미 |
| --- | --- |
| OAuthAuthorization | `authorizationId:id,authorizationUrl:string,state:string,expiresAt:datetime`. 앱이 보관한 verifier의 S256 challenge에 바인딩. 기본 만료 300초(환경 설정). 외부 브라우저에서 authorizationUrl을 열고 앱 redirect의 code/state를 수신 |
| OAuthExchange | `authorizationId:id,code:string,redirectUri:string,state:string,codeVerifier:string`. verifier는 RFC 7636의 43~128자. provider·state·만료·redirect·S256 challenge 일치 후 컨텍스트 원자적 일회 소비. 제공자 실패도 재사용 불가, 인가 시작부터 재시도 |
| Session | `accessToken:string,refreshToken:string,expiresIn:integer,user:MyProfile,isNewUser:boolean` |
| UserCard | `id,nickname:string,profileImageUrl:string\|null,accountVisibility:PUBLIC\|PRIVATE,followingStatus:NONE\|REQUESTED\|ACCEPTED,followedByStatus:NONE\|REQUESTED\|ACCEPTED`. 양방향 독립, 연령·이메일 미반환 |
| Follow | `id,follower:UserCard,followee:UserCard,status:REQUESTED\|ACCEPTED,requestedAt:datetime,acceptedAt:datetime\|null` |
| FeedVisibility | `feedId:id,hiddenViewerUserIds:id[],version:integer,updatedAt:datetime`. 본인 경로의 특정 친구별 숨김, 피드와 독립 버전 |
| MyProfile | UserCard + `ageBand:string\|null,ageUseConsent:boolean,profileCompleted:boolean,profileUrl:string` |
| PreferencesWrite | `explicitItems:{key:string,value:string}[],allowInference:boolean,sharingScope:EXPLICIT_ONLY\|EXPLICIT_AND_INFERRED\|NONE`. 직접 입력만 교체, 추론 생성과 공유를 구분 |
| Preferences | `explicitItems:{key:string,value:string}[],inferredItems:{key:string,value:string}[],allowInference:boolean,sharingScope:string,updatedAt:datetime`. 추론 거부 시 이후 생성/활용 중단, 삭제·보존 Q-11 |
| Trip | `id,title,startDate:date\|null,endDate:date\|null,destinationRegionIds:id[],status:TripStatus,currency:KRW,ownerMemberId:id,members:Member[],version:integer,expenseVersion:integer` |
| Member | `id,user:UserCard,role:OWNER\|MEMBER,status:ACTIVE\|LEFT\|REMOVED,joinOrder:integer,joinedAt:datetime,leftAt:datetime\|null` — role은 owner FK로 계산 |
| InvitationSecret | `id,token:string,url:string,expiresAt:datetime`. 원문 토큰은 생성 시만 반환, 코드 없음 |
| InvitationPreview | `tripTitle:string,startDate:date\|null,endDate:date\|null,inviter:{nickname:string},inviterUser:UserCard\|null,expiresAt:datetime,alreadyMember:boolean`. 익명 inviterUser=null, 로그인 시만 본인 기준 관계 상태 포함. alreadyMember는 로그인한 사람이 이미 ACTIVE 멤버일 때만 true |
| LeaveResult | `tripId:id,tripDeleted:boolean,newOwnerMemberId:id\|null,cleanupJobId:id\|null,status:LEFT\|TRIP_DELETED`. 마지막 방장 이탈은 TRIP_DELETED·삭제 job 반환 |
| Region | `id,code:string,name:string,parentId:id\|null,latitude:number\|null,longitude:number\|null` |
| Place | `id,name,address:string\|null,latitude:number,longitude:number,regionId:id\|null,provider:string\|null,providerPlaceId:string\|null,source:PROVIDER\|MANUAL` |
| Bookmark | `place:Place\|null,retainedPlace:{name:string,latitude:number,longitude:number},memo:string\|null,sourceFeedId:id\|null,sourceUnavailable:boolean,createdAt:datetime`. 소실 시 place=null/sourceFeedId=null·retainedPlace/내 메모만 유지, 내부 원본 필드 미포함 |
| SavedPlace | `place:Place,savedBy:{memberId:id,memo:string\|null}[],savedCount:integer` |
| JobRef | `jobId:id,status:QUEUED,statusUrl:string` |
| Job | `id,kind:string,status:QUEUED\|RUNNING\|SUCCEEDED\|FAILED\|CANCELLED,progress:integer,result:object\|null,error:{code:string,message:string}\|null(FAILED·CANCELLED에서만),createdAt:datetime,finishedAt:datetime\|null` |
| ExtractionResult | `job:Job,resultStatus:SUCCESS\|MULTIPLE_CANDIDATES\|NOT_FOUND\|FAILED\|null,candidates:{candidateId:id,name:string,place:Place\|null,evidence:string,confidence:number\|null}[]`. 식별 불가는 처리 성공과 별개 |
| RecommendationResult | `job:Job,items:{type:REGION\|PLACE,region:Region\|null,place:Place\|null,reason:string}[],basis:{sharedPlaceCount:integer,usedMemberCount:integer},insufficientData:boolean` |
| DiscoveryItem | `type:FEED\|PLACE,feed:FeedCard\|null,place:Place\|null,reason:string` |
| TrendRegion | `region:Region,rank:integer,previousRank:integer\|null,rankChange:integer\|null,isNew:boolean,publishedTripCount:integer,followingCount:integer,from:date,to:date,sampleSize:integer,updatedAt:datetime,insufficientData:boolean`. 권한 필터 후 집계, 기간/집계 정의 Q-9 |
| CandidateInput | `regionId?:id,placeId?:id` — 유형에 맞는 하나만 필수 |
| Poll | `id,tripId,type:REGION\|PLACE,title,status:OPEN\|CLOSED\|FINALIZED,version:integer,closesAt:datetime,closedReason:DEADLINE\|NO_VOTES\|null,eligibleMemberCount:integer,votedMemberCount:integer,candidates:{id,regionId:id\|null,placeId:id\|null,voteCount:integer,addedAt:datetime}[],myCandidateIds:id[],selectedCandidateIds:id[]`. 0표 CLOSED·결과 [], 공동 최다 전부 FINALIZED. 진행 중에는 지금 ACTIVE 멤버의 표로 집계(나간 멤버의 표 제외, 재참여하면 다시 셈)하고 마감 때 인원·득표를 고정한다. 후보는 입력·추가 순 |
| ItineraryWrite | `expectedVersion:integer,items:{id?:id,placeId:id,day:integer,order:integer,startTime?:string\|null,stayMinutes?:integer\|null}[],legs:{day:integer,fromOrder:integer,toOrder:integer,transportMode:WALK\|CAR\|TRANSIT}[]`. 전체 교체, 시간 생략=null. WALK/CAR/TRANSIT 확정 |
| Itinerary | `tripId,version:integer,items:ItineraryItem[],legs:RouteLeg[],updatedByMemberId:id,updatedAt:datetime`. 현재 단일 코스, 새 여행 version=1·빈 items/legs. confirmed·승인 capabilities 없음 |
| ItineraryItem | `id,place:Place,day:integer,order:integer,startTime:string\|null,stayMinutes:integer\|null` |
| RouteLeg | `fromItemId:id,toItemId:id,transportMode:string,durationSeconds:integer\|null,distanceMeters:integer\|null,geometry:{type:LineString,coordinates:number[][]}\|null,status:AVAILABLE\|UNAVAILABLE,queriedAt:datetime`. 좌표 순서는 경도·위도, 경로 조회 실패 시 geometry도 null |
| ItineraryProposal | `job:Job,baseVersion:integer,reason:string,proposed:CourseContent\|null,diff:{removedPlaceIds:id[],addedPlaceIds:id[],description:string},appliedAt:datetime\|null,canUndo:boolean` |
| ProposalWrite | `reason:INITIAL\|PLACE_REMOVED\|WEATHER,expectedVersion:integer,defaultTransportMode?:WALK\|CAR\|TRANSIT,excludedPlaceIds?:id[],sourceWeatherJobId?:id,selectedAlternativeId?:id`. INITIAL의 default는 새 구간 생성용 힌트이며 결과는 구간별 수단. PLACE_REMOVED는 제외 장소 필수, WEATHER는 원본 작업·선택 대안 필수 |
| Visit | `id,tripId,memberId:id,placeId:id,visitedAt:datetime,evidenceType:MANUAL\|PHOTO,reviewId:id\|null,reviewScore:integer\|null`. 본인 방문 확인 후만 평가 가능 |
| Weather | `placeId:id,date:date,queriedAt:datetime,forecastAt:datetime,source:string,condition:string,temperatureCelsius:number\|null,minCelsius:number\|null,maxCelsius:number\|null,precipitationProbability:number\|null,hourly:{at:datetime,condition:string,temperatureCelsius:number\|null,precipitationProbability:number\|null}[],stale:boolean`. 확률 0~1 제안, 미확인은 null |
| Facility | `providerId:string,name:string,type:string,latitude:number,longitude:number,walkingSeconds:integer\|null,availability:string\|null,queriedAt:datetime`. 실시간 상태 미확인은 null |
| ChecklistItem | `id,label:string,checked:boolean,checkedByMemberId:id\|null,checkedAt:datetime\|null,source:MANUAL\|AI,sourceJobId:id\|null,reason:string\|null,modifiedByUser:boolean,version:integer` |
| UploadIntent | `assetId:id,uploadUrl:string,method:PUT,headers:object,expiresAt:datetime` — 업로드 URL 사용에는 API 인증 헤더를 자동 전달하지 않음 |
| Asset | `id,purpose:string,status:PENDING\|READY\|DELETING\|DELETED\|CANCELLED,contentType:string,byteSize:integer,tripId:id\|null` |
| PhotoUploadBatch | `id,tripId:id,fileCount:integer,registeredCount:integer,createdAt:datetime`. fileCount 1~50, 소유자/여행별 등록 예약 상한으로 중복 재시도 방지 |
| Photo | `id,assetId,tripId,batchId:id,uploaderMemberId:id,placeId:id\|null,capturedAt:datetime\|null,topics:string[],groupId:id\|null,version:integer` |
| Review | `id,visitId,authorMemberId:id,score:integer,body:string,version:integer,createdAt:datetime,updatedAt:datetime` |
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
| UserSettings | `version:integer,ai:{photoClassification:AiMode,visitDetection:AiMode,placeExtraction:AiMode,checklist:AiMode,weather:SUGGEST_ONLY\|OFF},notifications:{followRequests:boolean,voteCourse:boolean,tripChanges:boolean}`. AiMode=AUTO/CONFIRM/OFF. 초기값은 CONFIRM·날씨 SUGGEST_ONLY·알림 true 제안 |
| SettingsPatch | `expectedVersion:integer,ai?:UserSettings.ai의 부분 필드,notifications?:UserSettings.notifications의 부분 필드`. 성공 시 원자 저장, 생략은 유지 |
| SavedPlacePage | `{items:SavedPlace[],totals:{allPlaceCount:integer,overlapPlaceCount:integer,filteredCount:integer},page:{nextCursor:string\|null,hasNext:boolean}}` |
| RegionDetail | `region:Region,introduction:string\|null,representativePlaces:Place[],partialErrors:string[]` |
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
| PLACE_EXTRACTION | ExtractionResult의 `resultStatus,candidates` |
| TRIP_RECOMMENDATION | RecommendationResult의 `items,basis,insufficientData` |
| ITINERARY_PROPOSAL | ItineraryProposal의 `baseVersion,reason,proposed,diff,appliedAt,canUndo` |
| VISIT_DETECTION | `{candidates:VisitCandidate[]}`. CONFIRM 모드는 후보만, AUTO도 근거 있는 본인 후보만 확정하며 Q-7 판정 정책 확정 전 자동 실행 비활성 |
| ROUTE_RECALCULATION | `{baseVersion:integer,legs:RouteLeg[]}`. 버전 일치 시 현재 코스 경로만 갱신 |
| WEATHER_ALTERNATIVES | `{alternatives:{alternativeId:id,type:PLACE_SWAP\|TIME_SHIFT\|INFO,place:Place\|null,itemId:id\|null,targetStartTime:string\|null,activity:string,reason:string}[],weather:Weather,baseVersion:integer}`. 해당 ID를 선택해 proposal 생성 후 적용 |
| CHECKLIST_SUGGESTIONS | `{items:{label:string,reason:string,sourceJobId:id}[]}`. 제안 선택 후 일반 checklist POST로 추가 |
| PHOTO_CLASSIFICATION | `{photos:{photoId:id,status:SUCCEEDED\|FAILED,topics:string[],groupId:id\|null,errorCode:string\|null}[]}` |
| LEAVE_CLEANUP / PHOTO_DELETE / TRIP_DELETE | `{scope:string,completedCount:integer,failedCount:integer}`. 실제 보존 범위 Q-11. ACCOUNT_DELETE는 서버 내부 작업이며 사용자 폴링 결과 없음 |

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
| 장소 수집·저장·취향 | WD-FR-05~08 | assets, jobs, extraction_candidates, places, regions, personal_bookmarks, trip_place_saves, user_preferences, preference_rejections, trip_members |
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
5. **Q-1·2·4·5·7~9·11~14:** 인증/프로필·공개 전환·기간 경계/시간대·추천/사진 판정/집계·용량/보존·채팅 이력 등. 검색/추천 숨김·이미 정한 한도/별점/정렬/준비물은 다시 미정으로 돌리지 않는다.
6. 사용자 지정 C-1~C-51 원문은 여전히 없어 전체 항목 대조는 미완료이며 팀 전체 합의/구현 완료를 선언하지 않는다. 소스 간 폐기된 종료/확정 팝업·삭제 알림 충돌은 PRD §1.1의 우선순위를 따른다.

검증 사례: 닉네임 검색·영구 추천 숨김, 관계 없는 링크 참여·마지막 이탈=삭제, 수동 게시 유일성·특정 친구 경로 숨김/직접 경로 유지·전체 삭제 알림, 마감 경합·동률 모두·0표 미확정·후보 추가 알림, 10/11캡처·50/51사진·HEIC·정수 별점, 구간 수단·단일 코스·AI 1단계 undo·경합, 공동 준비물 체크 멤버, 시작일 정렬·날짜 미정 마지막, 원금/1인 올림 차액 분리·완료 상태 없음, 그룹 채팅만·이탈자 접근 차단.

문서·DBML 검증은 구현/API 실행 검증을 대체하지 않는다.
