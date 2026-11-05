# 계약: 동행 초대·관리·나가기 API

백엔드 코드 기준이다(`EodiLog/src/main/java`, 2026-11-05 dev `e42e349`). 기본 경로는 `/api/v1`이고 모두 로그인이 필요하다. 오류 본문은 `{ error: { code, message, fields, traceId } }`이며, 앱에서는 `src/api/errors.ts`의 `toApiError`로 바꾼다. 요청 본문에 모르는 칸이 있으면 400이다.

출처:

- `invitation/controller/InvitationController.java`, `invitation/dto/InvitationSecretResponse.java`
- `trip/controller/TripController.java`(PATCH·DELETE), `trip/controller/TripMemberController.java`
- `trip/dto/UpdateTripRequest.java`, `OwnerTransferRequest.java`, `LeaveTripRequest.java`, `LeaveTripResponse.java`, `job/JobRef.java`
- 오류 코드: `trip/exception/TripErrorCode.java`(`TRIP_NOT_FOUND`, `MEMBER_NOT_FOUND`, `VERSION_CONFLICT`), `global/common/error/CommonErrorCode.java`(`FORBIDDEN`, `VALIDATION_ERROR`)

## 1. 초대 링크 만들기

`POST /trips/{tripId}/invitations` (본문 없음)

- **누가**: 참여 중인 사람 누구나.
- **201** `DataResponse<InvitationSecret>`

  ```json
  { "data": { "id": "uuid", "token": "43자", "url": "ieohaeng://invitations/{token}", "expiresAt": "2026-11-12T00:11:42Z" } }
  ```

  - `url`은 서버가 만든 그대로 공유한다. 앱 주소 형식이고, 앱의 `src/app/invitations/[token].tsx`(S04, A 담당)가 받는다.
  - `expiresAt`은 UTC이고 만든 때부터 7일이다.
  - 새로 만들면 같은 여행의 이전 링크는 410 `INVITATION_REVOKED`가 된다.
  - 서버는 해시만 보관하므로 다시 조회할 수 없다.
- **404** `TRIP_NOT_FOUND`
- **앱 규칙**: 화면에 들어올 때 부르지 않는다. 버튼을 누를 때만 부른다(FR-002).

## 2. 초대 링크 취소

`DELETE /trips/{tripId}/invitations` (본문 없음)

- **누가**: 참여 중인 사람 누구나.
- **204**: 쓸 수 있는 링크가 없어도(이미 취소·만료) 204다. 여행 `version`은 그대로다.
- **404** `TRIP_NOT_FOUND`

## 3. 여행 조회 (있음)

`GET /trips/{tripId}` → `DataResponse<Trip>`

- `members`는 참여 중(ACTIVE)인 사람만 `joinOrder` 순으로 온다.
- `ownerMemberId`와 `version`도 같은 응답에 있다.
- S18·S19는 이것만 부른다. `GET /trips/{tripId}/members`는 부르지 않는다(research R3).

## 4. 여행 정보 수정

`PATCH /trips/{tripId}`

```json
{ "expectedVersion": 3, "title": "부산 바다 1박 2일", "startDate": null, "endDate": null, "destinationRegionIds": [] }
```

- **누가**: 참여 중인 사람 누구나.
- **본문**: `expectedVersion`은 필수다. 나머지는 바뀐 칸만 보낸다.
  - 생략한 칸은 서버가 그대로 둔다.
  - `startDate`·`endDate`는 `null`로 비울 수 있다. 둘은 함께 있거나 함께 비어야 한다.
  - `destinationRegionIds`는 보낸 목록으로 통째로 바꾼다. `[]`면 모두 비운다.
- **200** `DataResponse<Trip>`: 바뀐 값이 없으면 `version`을 올리지 않고 지금 여행을 준다.
- **400** `VALIDATION_ERROR`: `fields`에 칸별 안내가 온다(이름 길이, 기간 짝).
- **404** `TRIP_NOT_FOUND`
- **409** `VERSION_CONFLICT`: 다른 사람의 수정·참여·나가기 등으로 버전이 바뀌었다.

## 5. 방장 넘기기

`POST /trips/{tripId}/owner-transfer`

```json
{ "targetMemberId": "멤버 uuid", "expectedVersion": 3 }
```

- **누가**: 방장만.
- **200** `DataResponse<Trip>`: 바뀐 `ownerMemberId`가 온다. 알림은 보내지 않는다.
- **400** `VALIDATION_ERROR`(`fields.targetMemberId`): 같은 여행의 참여 중 동행이 아니거나 이미 방장이다. 앱은 error로 보고 여행을 다시 받는다.
- **403** `FORBIDDEN`: 방장이 아니다.
- **404** `TRIP_NOT_FOUND`
- **409** `VERSION_CONFLICT`
- **검사 순서**: 서버는 방장(403) → 버전(409) → 대상(400) 순으로 본다(`TripMemberService.requireOwnerForUpdate`). 나가기도 버전을 올리므로, 대상이 그 사이 나갔으면 보통 409가 먼저 온다.

## 6. 동행 내보내기

`DELETE /trips/{tripId}/members/{memberId}?expectedVersion=3`

- **누가**: 방장만. 방장 자신은 내보낼 수 없다(앱은 목록에서 나를 뺀다).
- **204**
- **400** `VALIDATION_ERROR`(`fields.memberId`): 방장 자신을 골랐다.
- **403** `FORBIDDEN`
- **404** `TRIP_NOT_FOUND` / `MEMBER_NOT_FOUND`: `MEMBER_NOT_FOUND`는 버전은 같은데 대상이 참여 중이 아닐 때만 온다.
- **409** `VERSION_CONFLICT`: 대상이 그 사이 나갔으면 보통 이것이 먼저 온다. 검사 순서는 §5와 같다.

## 7. 여행 나가기 (있음: `api.ts` `leaveTrip`)

`POST /trips/{tripId}/leave`

```json
{ "deleteOwnPhotos": false, "deleteOwnMessages": true, "expectedVersion": 3 }
```

- **누가**: 참여 중인 사람 누구나.
- **본문**: 세 칸 모두 필수다.
  - `deleteOwnPhotos`는 `false`만 받는다. `true`면 400이다.
  - `deleteOwnMessages=true`는 받는다. 지울 메시지가 있으면 `LEAVE_CLEANUP` 작업이 만들어진다.
- **응답** `DataResponse<LeaveResult>`:

  | 경우 | 상태 | `status` | `tripDeleted` | `newOwnerMemberId` | `cleanupJobId` |
  | --- | --- | --- | --- | --- | --- |
  | 일반 나가기, 지울 것 없음 | 200 | `LEFT` | false | 방장이었으면 새 방장, 아니면 null | null |
  | 내 채팅 지우기 + 메시지 있음 | 202 | `LEFT` | false | 위와 같음 | 작업 id |
  | 혼자 남은 사람 | 202 | `TRIP_DELETED` | true | null | 작업 id |

- **404** `TRIP_NOT_FOUND`: 이미 나갔다. 앱은 성공으로 본다(`leaveTripOrGone`).
- **409** `VERSION_CONFLICT`
- **멱등키**: 없다. 다시 보내면 404다.

## 8. 여행 삭제

`DELETE /trips/{tripId}?expectedVersion=3`

- **누가**: 방장만.
- **202** `DataResponse<JobRef>`

  ```json
  { "data": { "jobId": "uuid", "status": "QUEUED", "statusUrl": "/api/v1/jobs/{jobId}" } }
  ```

  모든 멤버에게 즉시 404가 되고, 목록과 채팅방 목록에서도 빠진다. 되돌릴 수 없다.
- **403** `FORBIDDEN`
- **404** `TRIP_NOT_FOUND`: 이미 삭제됐다. 앱은 성공으로 본다.
- **409** `VERSION_CONFLICT`
- **멱등키**: 없다.

## 앱 쪽 함수 (`src/features/trip/api.ts`에 더함)

| 함수 | 요청 |
| --- | --- |
| `createInvitation(tripId)` → `InvitationSecret` | 1 |
| `cancelInvitations(tripId)` → `void` | 2 |
| `updateTrip(tripId, body: UpdateTripBody)` → `Trip` | 4 |
| `transferOwner(tripId, { targetMemberId, expectedVersion })` → `Trip` | 5 |
| `removeMember(tripId, memberId, expectedVersion)` → `void` | 6 |
| `leaveTrip` (있음, 설명만 고침) | 7 |
| `deleteTrip(tripId, expectedVersion)` → `JobRef` | 8 |

`API_ERROR`에 `FORBIDDEN`과 `MEMBER_NOT_FOUND`를 더한다.
