# 앱 내 여행 초대(맞팔 친구) — 백엔드 개발 문서

작성: 2026-11-17 · 대상 브랜치: `dev` · 짝 문서: [프론트엔드](in-app-trip-invite-frontend-2026-11-17.md)

## 1. 목표

지금 여행 초대는 **링크(토큰) 방식 하나**뿐이다(`/trips/{tripId}/invitations`, `/invitations/{token}/accept`). 카톡 등 외부 앱으로 링크를 보내야 한다.

여기에 **앱 안에서 바로 초대**하는 경로를 더한다.

- 여행의 ACTIVE 멤버는 **나와 서로 팔로우(맞팔) 중인 회원**을 골라 초대를 보낸다.
- 받은 사람은 알림(`TRIP_INVITED`)을 받고, 앱에서 **수락하거나 거절**한다.
- 수락하면 링크 수락과 똑같이 여행에 참여한다(정원 20명, 채팅 참여, version 증가, `TRIP_MEMBER_JOINED` 알림).

기존 링크 초대는 그대로 둔다. 두 경로는 서로 영향을 주지 않는다(링크를 새로 만들어도 앱 초대는 유지되고, 그 반대도 같다).

## 2. 정책 결정

| # | 항목 | 결정 | 이유 |
|---|---|---|---|
| P-1 | 바로 참여 vs 수락 필요 | **수락 필요**(초대 → 수락/거절) | 여행은 채팅·경비가 있는 공동 공간이라 동의 없이 넣지 않는다 |
| P-2 | 맞팔 정의 | `me→상대`, `상대→me` **두 방향 모두 `ACCEPTED`**. `REQUESTED`는 맞팔이 아니다. 상대는 `users.status='ACTIVE' AND profile_completed` | 기존 `FollowService.USABLE_USER`, "한쪽 방향을 맞팔로 해석하지 않음" 원칙과 같다 |
| P-3 | 맞팔 검사 시점 | **보낼 때만** 검사한다. 수락할 때는 다시 검사하지 않는다 | 받는 사람이 동의하는 시점이라 그 사이 언팔해도 참여 의사를 막을 이유가 없다 |
| P-4 | 누가 보내나 | 여행의 **ACTIVE 멤버 누구나**(방장 전용 아님) | 링크 발급 권한과 같다 |
| P-5 | 유효 기간 | 보낸 뒤 **7일**(`InvitationService.EXPIRES_AFTER` 재사용) | 링크와 같은 기준 |
| P-6 | 중복 | 같은 여행·같은 받는 사람에 대기(`PENDING`) 초대는 **하나만**. 다시 보내면 기존 것을 그대로 돌려준다(멱등, 알림 재발송 없음) | 알림 폭탄 방지 |
| P-7 | 초대한 사람이 여행을 나감 | 그 사람이 보낸 대기 초대는 **수락 시 410 `INVITATION_EXPIRED`** | 링크의 "초대한 사람이 나간 링크"와 같다 |
| P-8 | 정원 | 대기 초대는 정원에 넣지 않는다. 보낼 때 이미 20명이면 409 `TRIP_FULL`, 수락할 때 다시 검사 | 링크와 같다 |
| P-9 | 나갔거나 내보낸 사람 | 다시 초대할 수 있다. 수락하면 기존 멤버십을 다시 쓰고 `joinOrder`를 새로 받는다 | 링크 수락과 같다(`TripMember.rejoin`) |
| P-10 | 알림 설정 | 받는 사람의 알림 설정과 상관없이 보낸다(행동이 필요한 알림) | 설정 칸 추가는 범위 밖. 필요하면 후속으로 `trip_invites_enabled` |
| P-11 | 거절 알림 | 보낸 사람에게 **알리지 않는다** | 거절 사실 노출 부담. 초대 화면에서 상태만 바뀐다 |

> P-1·P-3·P-10·P-11은 팀 확인이 필요하면 이 표만 보고 결정을 바꾸면 된다. 나머지 설계는 그대로 쓸 수 있다.

## 3. 데이터 모델

### 3.1 마이그레이션 `V202611171000__create_trip_friend_invitations.sql`

```sql
-- 앱 내 맞팔 초대. 링크 초대(trip_invitations)와 별개다
CREATE TABLE trip_friend_invitations (
    id uuid PRIMARY KEY,
    trip_id uuid NOT NULL REFERENCES trips (id),
    inviter_member_id uuid NOT NULL REFERENCES trip_members (id),
    invitee_user_id uuid NOT NULL REFERENCES users (id),
    status varchar(16) NOT NULL CHECK (status IN ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELED')),
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone NOT NULL,
    responded_at timestamp with time zone,
    CONSTRAINT ck_tfi_expires_at CHECK (expires_at > created_at),
    CONSTRAINT ck_tfi_responded CHECK ((status = 'PENDING') = (responded_at IS NULL))
);

-- 같은 여행·같은 사람에게 대기 초대는 하나(P-6)
CREATE UNIQUE INDEX uk_tfi_pending ON trip_friend_invitations (trip_id, invitee_user_id)
    WHERE status = 'PENDING';
-- 받은 초대 목록
CREATE INDEX idx_tfi_invitee_status ON trip_friend_invitations (invitee_user_id, status, created_at DESC);
CREATE INDEX idx_tfi_inviter_member ON trip_friend_invitations (inviter_member_id);
```

- `EXPIRED`는 저장하지 않는다. `status='PENDING' AND expires_at <= now`면 만료로 계산한다. 배치 작업이 필요 없다.
- 기간이 지난 `PENDING` 행이 남아 있으면 부분 유니크 인덱스에 걸린다. 같은 사람에게 다시 보낼 때 **만료된 대기 행을 먼저 `CANCELED`로 바꾸고** 새로 넣는다(4.2).

### 3.2 엔티티·패키지

기존 `invitation` 패키지 안에 둔다.

```
invitation/
  domain/TripFriendInvitation.java          // 엔티티 + status enum
  domain/TripFriendInvitationStatus.java    // PENDING, ACCEPTED, DECLINED, CANCELED
  repository/TripFriendInvitationRepository.java
  service/FriendInvitationService.java      // 보내기·취소·목록·수락·거절
  service/FriendInvitationNotifier.java     // TRIP_INVITED
  service/TripJoiner.java                   // 링크·앱 초대 공통 참여 처리(4.1)
  controller/FriendInvitationController.java
  dto/...
```

엔티티 메서드: `create(...)`, `isUsableAt(now)`, `accept(now)`, `decline(now)`, `cancel(now)`.

### 3.3 맞팔 조회

`user/follow`에 읽기 전용 메서드를 하나 더한다(다른 도메인이 `follows`를 직접 읽지 않도록).

```java
// FollowService 또는 새 MutualFollowReader
public boolean isMutual(UUID a, UUID b);                     // 보내기 검사
public List<UUID> mutualIds(UUID me);                         // 초대 후보 목록
```

```sql
-- mutualIds
SELECT f1.followee_user_id
FROM follows f1
JOIN follows f2 ON f2.follower_user_id = f1.followee_user_id
               AND f2.followee_user_id = f1.follower_user_id
               AND f2.status = 'ACCEPTED'
JOIN users u ON u.id = f1.followee_user_id
WHERE f1.follower_user_id = :me AND f1.status = 'ACCEPTED'
  AND u.status = 'ACTIVE' AND u.profile_completed
```

`follows_pair_unique (follower, followee)` 인덱스로 양쪽 조인이 모두 인덱스를 탄다.

## 4. 서비스 로직

### 4.1 공통 참여 처리 추출 — `TripJoiner`

`InvitationService.acceptInvitation`의 참여 부분을 그대로 옮겨 두 경로가 같이 쓴다. **동작은 바꾸지 않는다.**

```java
// 호출 전에 trip은 findActiveByIdForUpdate로 잠겨 있어야 한다
@Transactional(propagation = Propagation.MANDATORY)
public void join(Trip trip, UUID userId, Optional<TripMember> existing) {
    if (countActive(trip) >= MAX_ACTIVE_MEMBERS) throw TRIP_FULL;
    pollCloser.closeDuePolls(trip.getId());
    long joinOrder = findMaxJoinOrder + 1;
    TripMember member = existing.map(rejoin).orElseGet(join);
    chatParticipationService.joinTripRoom(...);
    trip.markMembersChanged(now);
    tripRepository.flush();
    invitationNotifier.memberJoined(member);
}
```

`InvitationService.acceptInvitation`은 `requireUsable` 뒤에 `tripJoiner.join(...)`을 부르도록 바꾼다. 기존 `InvitationServiceTest`·통합 테스트가 그대로 통과해야 한다(리팩터링 검증).

### 4.2 보내기

`send(UUID me, UUID tripId, List<UUID> inviteeIds)`

1. `inviteeIds` 1~19개, 중복 제거, 자기 자신 포함 시 400 `VALIDATION_ERROR`.
2. `tripAccessChecker.requireActiveMemberForUpdate(tripId, me)` → 아니면 404 `TRIP_NOT_FOUND`. (여행 행 잠금으로 동시 보내기·수락 정리)
3. ACTIVE 멤버 수가 20 이상이면 409 `TRIP_FULL`.
4. 받는 사람마다 결과를 정한다(부분 성공). 하나가 실패해도 나머지는 보낸다.

| 판정 순서 | 결과 `result` | 동작 |
|---|---|---|
| 맞팔 아님·없는 회원·탈퇴 | `NOT_MUTUAL` | 아무것도 안 함 |
| 이미 ACTIVE 멤버 | `ALREADY_MEMBER` | 아무것도 안 함 |
| 기간 남은 PENDING 있음 | `ALREADY_INVITED` | 기존 초대 반환, 알림 없음 |
| 그 밖 | `SENT` | 기간 지난 PENDING은 `CANCELED`로 바꾼 뒤 새 행 저장 + `TRIP_INVITED` 알림 |

"맞팔 아님"과 "없는 회원"을 구분하지 않는다(회원 존재 여부 노출 방지).

### 4.3 받은 사람: 수락

`accept(UUID me, UUID invitationId)` → `TripResponse`

판정 순서(링크 수락과 맞춘다):

1. 초대 조회. 없거나 `invitee_user_id != me`면 404 `FRIEND_INVITATION_NOT_FOUND`.
2. 여행을 `findActiveByIdForUpdate`로 잠근다. 삭제된 여행이면 410 `INVITATION_EXPIRED`.
3. **이미 ACTIVE 멤버면** 초대가 PENDING일 때 `ACCEPTED`로 바꾸고, 바뀐 것 없이 여행을 반환한다(200, 멱등).
4. 잠근 뒤 다시 읽은 상태가 `ACCEPTED`면 3과 같이 처리, `DECLINED`·`CANCELED`면 410 `INVITATION_REVOKED`.
5. 기간 지남 또는 초대한 멤버가 ACTIVE가 아님 → 410 `INVITATION_EXPIRED`.
6. `tripJoiner.join(...)` (정원 409 `TRIP_FULL` 포함).
7. 초대 `ACCEPTED`, `responded_at=now`.
8. 같은 여행에 이 사람에게 온 다른 PENDING 초대는 없다(유니크 인덱스). 같은 사람에게 온 **링크**는 건드리지 않는다.

### 4.4 받은 사람: 거절

`decline(me, invitationId)` → 204. PENDING이면 `DECLINED`. 이미 DECLINED면 204(멱등). ACCEPTED·CANCELED·없음·남의 초대는 404 `FRIEND_INVITATION_NOT_FOUND`. 알림 없음(P-11).

### 4.5 보낸 쪽: 취소

`cancel(me, tripId, invitationId)` → 204. 여행의 ACTIVE 멤버 누구나(P-4와 같은 기준). PENDING만 `CANCELED`, 그 밖이거나 없으면 204(멱등, 링크 취소와 같음). 받은 사람 알림 목록의 `TRIP_INVITED`는 지우지 않는다 — 눌러서 들어가면 "취소된 초대" 상태를 보여 준다.

### 4.6 초대 후보 목록

`invitableFriends(me, tripId, cursor, limit)`

- 여행 ACTIVE 멤버만(404).
- `mutualIds(me)`를 기준으로 각 사람의 상태를 붙인다.
  - `MEMBER`: 이 여행의 ACTIVE 멤버
  - `INVITED`: 기간 남은 PENDING 초대 있음(누가 보냈든). `invitationId` 함께
  - `INVITABLE`: 그 밖
- 정렬: `INVITABLE` → `INVITED` → `MEMBER`, 같은 그룹 안에서는 닉네임 오름차순. 맞팔 수가 많지 않으므로 페이지는 `limit` 1~100, 커서는 `(group, nickname, id)` 인코딩. 단순하게 가려면 **페이지 없이 최대 500명 한 번에** 돌려주고 프론트가 검색한다 — 구현 담당이 고른다(추천: 페이지 없이, 500명 넘으면 잘라서 `truncated=true`).
- 회원 카드는 `UserCardReader.findCards(me, ids)`로 한 번에 읽는다.

### 4.7 받은 초대 목록

`received(me)` → 기간 남은 PENDING만, 최신순. 여행이 삭제됐거나 초대한 멤버가 나간 초대는 빼고 돌려준다. 여행 제목·기간·초대한 사람 카드·멤버 수를 담는다(동행 명단·경비는 담지 않음 — 링크 미리보기와 같은 공개 범위).

### 4.8 단건 조회(알림에서 들어올 때)

`get(me, invitationId)` → 받은 사람 본인만. 상태를 계산해서 `PENDING | EXPIRED | ACCEPTED | DECLINED | CANCELED` + `alreadyMember`를 준다. 만료·취소여도 410 대신 200으로 상태만 알려 준다(화면이 안내 문구를 고르기 쉽게).

## 5. API

공통 prefix `/api/v1`. 응답 래퍼는 기존 `DataResponse` / `PageResponse`.

| Method | URL | 권한 | 요청 | 성공 | 오류 |
|---|---|---|---|---|---|
| GET | `/trips/{tripId}/invitable-friends` | 멤버 | 없음 | `InvitableFriendsResponse` / 200 | 404 `TRIP_NOT_FOUND` |
| POST | `/trips/{tripId}/friend-invitations` | 멤버 | `{inviteeUserIds: uuid[]}` (1~19) | `SendFriendInvitationsResponse` / 200 | 400 `VALIDATION_ERROR`, 404 `TRIP_NOT_FOUND`, 409 `TRIP_FULL` |
| DELETE | `/trips/{tripId}/friend-invitations/{invitationId}` | 멤버 | 없음 | 204 | 404 `TRIP_NOT_FOUND` |
| GET | `/me/trip-invitations` | 본인 | 없음 | `ReceivedTripInvitation[]` / 200 | — |
| GET | `/me/trip-invitations/{invitationId}` | 받은 사람 | 없음 | `ReceivedTripInvitation` / 200 | 404 `FRIEND_INVITATION_NOT_FOUND` |
| POST | `/me/trip-invitations/{invitationId}/accept` | 받은 사람 | 없음 | `Trip` / 200 | 404, 409 `TRIP_FULL`, 410 `INVITATION_EXPIRED`·`INVITATION_REVOKED` |
| POST | `/me/trip-invitations/{invitationId}/decline` | 받은 사람 | 없음 | 204 | 404 `FRIEND_INVITATION_NOT_FOUND` |

> 경로 이름: 기존 `/trips/{tripId}/invitations`는 링크 전용이라 섞지 않고 `friend-invitations`로 분리한다.

### 5.1 DTO

```jsonc
// InvitableFriendsResponse
{
  "friends": [
    {
      "user": UserCard,                 // 기존 회원 카드(followingStatus·followedByStatus 모두 ACCEPTED)
      "state": "INVITABLE" | "INVITED" | "MEMBER",
      "invitationId": "uuid | null"     // INVITED일 때만
    }
  ],
  "activeMemberCount": 4,
  "capacity": 20,
  "truncated": false
}

// SendFriendInvitationsResponse
{
  "results": [
    { "userId": "uuid", "result": "SENT" | "ALREADY_INVITED" | "ALREADY_MEMBER" | "NOT_MUTUAL",
      "invitationId": "uuid | null" }
  ]
}

// ReceivedTripInvitation
{
  "id": "uuid",
  "trip": { "id": "uuid", "title": "부산 2박3일", "startDate": "2026-12-01", "endDate": "2026-12-03",
            "memberCount": 4 },
  "inviter": UserCard,
  "status": "PENDING" | "EXPIRED" | "ACCEPTED" | "DECLINED" | "CANCELED",
  "alreadyMember": false,
  "expiresAt": "2026-11-24T10:00:00Z",
  "createdAt": "2026-11-17T10:00:00Z"
}
```

### 5.2 오류 코드

`InvitationErrorCode`에 하나 더한다.

```java
// 없는 초대·내가 받은 초대가 아님·이미 처리돼 거절할 수 없는 초대
FRIEND_INVITATION_NOT_FOUND(HttpStatus.NOT_FOUND, "초대를 찾을 수 없습니다."),
```

`INVITATION_EXPIRED`, `INVITATION_REVOKED`, `TRIP_FULL`은 그대로 재사용한다(프론트 오류 처리 공유).

## 6. 알림 `TRIP_INVITED`

`FriendInvitationNotifier.invited(invitation, inviterUserId, trip)`

```java
registrar.register(new EventCommand(
    "TRIP_INVITED",
    null,                       // ⚠ tripId는 반드시 null
    inviterUserId,
    "TRIP_INVITATION",          // targetType
    invitation.getId(),         // targetId
    nickname(inviterUserId) + "님이 '" + trip.getTitle() + "' 여행에 초대했어요.",
    "TRIP_INVITED:" + invitation.getId()),
    List.of(inviteeUserId));
```

**`tripId`를 null로 두는 이유**: `NotificationEventRegistrar`는 `tripId`가 있으면 받는 사람이 그 여행의 ACTIVE 멤버인지 거른다(`NotificationEventRegistrar.java:62`). 받는 사람은 아직 멤버가 아니라 알림이 사라진다. `FollowNotifier`도 같은 이유로 null을 쓴다.

수락 시에는 `TripJoiner`가 기존 `TRIP_MEMBER_JOINED`를 기존 멤버에게 보낸다(추가 작업 없음).

## 7. 다른 기능에 미치는 영향

| 위치 | 해야 할 일 |
|---|---|
| `TripDeleteJobHandler.java:131` | `delete from trip_friend_invitations where trip_id = ?`를 `trip_invitations` 삭제 **앞**에 추가(FK `trip_members` 삭제 전에 지워야 함) |
| 회원 탈퇴 처리 | 탈퇴자가 받은 PENDING 초대는 목록·수락에서 빠지도록 조회에 `users.status='ACTIVE'` 조건. 행 삭제가 필요하면 탈퇴 정리 작업에 추가 |
| 여행 나가기/내보내기 | 별도 처리 없음. 초대한 멤버가 나가면 수락 시 410(P-7). 후보 목록 `INVITED` 판정에도 "초대한 멤버 ACTIVE" 조건을 넣는다 |
| 언팔로우 | 별도 처리 없음(P-3) |
| `docs/api-spec.md` §4·§9 | 5장의 표와 `TRIP_INVITED` 알림 종류를 추가 |
| `docs/erd.dbml` | `trip_friend_invitations` 추가 |

## 8. 테스트

**단위 (`FriendInvitationServiceTest`)**
- 맞팔이면 SENT + 알림 1건, 한쪽만 ACCEPTED·REQUESTED면 NOT_MUTUAL
- 같은 사람 두 번 → 두 번째 ALREADY_INVITED, 알림 1건 유지
- 기간 지난 PENDING이 있으면 CANCELED 처리 후 새로 SENT
- 이미 멤버 → ALREADY_MEMBER, 20명 → 409
- 수락: 정상 참여(멤버·채팅·version·`TRIP_MEMBER_JOINED`), 이미 멤버면 멱등 200, 만료 410 EXPIRED, 취소/거절 410 REVOKED, 초대자 나감 410 EXPIRED, 남의 초대 404
- 나갔던(LEFT)·내보낸(REMOVED) 사람 수락 시 같은 멤버십 재사용, joinOrder 맨 뒤
- 거절 멱등, 취소 멱등

**리팩터링 회귀**
- 기존 `InvitationService`·링크 수락 통합 테스트 전부 통과(`TripJoiner` 추출 검증)

**통합 (Testcontainers / 기존 통합 테스트 방식)**
- 동시성: 19명인 여행에 두 사람이 동시에 수락 → 하나만 성공, 하나 409
- 같은 사람에게 동시에 보내기 → PENDING 1행(부분 유니크 인덱스)
- 여행 삭제 작업 후 `trip_friend_invitations` 비어 있음
- `TRIP_INVITED` 알림이 받은 사람 알림 목록에 실제로 보임(`tripId=null` 확인)

## 9. 작업 순서 (Jira 쪼개기 예)

1. 마이그레이션 + 엔티티 + 리포지토리 + 맞팔 조회
2. `TripJoiner` 추출 (동작 변화 없음, 기존 테스트로 검증) — **단독 MR 권장**
3. 보내기·취소·후보 목록 API + `TRIP_INVITED` 알림
4. 받은 목록·단건·수락·거절 API
5. 여행 삭제 작업 정리 + api-spec·erd 반영

프론트는 5.1 DTO만 정해지면 3·4번과 병렬로 시작할 수 있다.
