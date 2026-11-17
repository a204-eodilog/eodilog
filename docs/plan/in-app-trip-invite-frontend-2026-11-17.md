# 앱 내 여행 초대(맞팔 친구) — 프론트엔드 개발 문서

작성: 2026-11-17 · 대상 브랜치: `dev` · 짝 문서: [백엔드](in-app-trip-invite-backend-2026-11-17.md)

## 1. 목표와 사용자 흐름

지금 S18 동행 초대 화면(`features/trip/screens/invite-screen.tsx`)은 **링크 공유(카톡·복사)**만 있다. 여기에 **맞팔 친구를 골라 앱 안에서 바로 초대**하는 기능을 더한다.

```
[보내는 사람]
여행 상세 → 동행 초대(S18)
  └ "친구 초대" 줄 → 친구 고르기 시트(맞팔 목록, 여러 명 선택) → [초대 보내기]
      └ 결과 토스트 "2명에게 초대를 보냈어요"
      └ 목록에서 그 친구는 "초대함" 표시, [초대 취소] 가능

[받는 사람]
알림 "OO님이 '부산 2박3일' 여행에 초대했어요" (TRIP_INVITED, 앱 실행 팝업에도 뜸)
  └ 누르면 → 받은 초대 화면(/trip-invitations/{id})
      └ 여행 제목·기간·인원·초대한 사람
      └ [참여하기] → 여행 상세로 이동(openJoinedTrip)
      └ [거절] → 닫기
알림 탭 또는 내 여행 목록 위 "받은 초대 n" 배너 → 받은 초대 목록(/trip-invitations)
```

맞팔(서로 팔로우 수락) 판정은 **서버가 한다**. 프론트가 `friends` 보드로 직접 계산하지 않는다 — 서버가 이미 멤버인지·이미 초대했는지 상태까지 붙여 준다.

## 2. API 연동

백엔드 문서 5장 기준. `apiClient`(`@/api/client`)를 쓴다.

### 2.1 타입 — `features/invitation/types.ts`에 추가

```ts
import type { UserCard } from '@/api/types';

export type InvitableFriendState = 'INVITABLE' | 'INVITED' | 'MEMBER';

export type InvitableFriend = {
  user: UserCard;
  state: InvitableFriendState;
  /** INVITED일 때만. 취소에 쓴다 */
  invitationId: string | null;
};

export type InvitableFriends = {
  friends: InvitableFriend[];
  activeMemberCount: number;
  capacity: number;
  truncated: boolean;
};

export type SendResult = 'SENT' | 'ALREADY_INVITED' | 'ALREADY_MEMBER' | 'NOT_MUTUAL';
export type SendFriendInvitationsResponse = {
  results: { userId: string; result: SendResult; invitationId: string | null }[];
};

export type ReceivedTripInvitationStatus = 'PENDING' | 'EXPIRED' | 'ACCEPTED' | 'DECLINED' | 'CANCELED';
export type ReceivedTripInvitation = {
  id: string;
  trip: { id: string; title: string; startDate: string | null; endDate: string | null; memberCount: number };
  inviter: UserCard;
  status: ReceivedTripInvitationStatus;
  alreadyMember: boolean;
  expiresAt: string;
  createdAt: string;
};
```

### 2.2 함수

| 함수 | 위치 | 호출 |
|---|---|---|
| `getInvitableFriends(tripId, signal)` | `features/trip/api.ts` | `GET /trips/{tripId}/invitable-friends` |
| `sendFriendInvitations(tripId, userIds)` | `features/trip/api.ts` | `POST /trips/{tripId}/friend-invitations` |
| `cancelFriendInvitation(tripId, invitationId)` | `features/trip/api.ts` | `DELETE /trips/{tripId}/friend-invitations/{id}` |
| `getReceivedTripInvitations(signal)` | `features/invitation/api.ts` | `GET /me/trip-invitations` |
| `getReceivedTripInvitation(id, signal)` | `features/invitation/api.ts` | `GET /me/trip-invitations/{id}` |
| `acceptTripInvitation(id)` | `features/invitation/api.ts` | `POST /me/trip-invitations/{id}/accept` → `Trip` |
| `declineTripInvitation(id)` | `features/invitation/api.ts` | `POST /me/trip-invitations/{id}/decline` |

보내는 쪽은 S18이 있는 `features/trip`, 받는 쪽은 링크 초대 S04가 있는 `features/invitation`에 둔다(기존 담당 구분 유지).

### 2.3 Query key와 캐시

```ts
// features/trip/hooks/use-invitable-friends.ts
export const invitableFriendsKey = (tripId: string) => [...tripKey(tripId), 'invitable-friends'] as const;

// features/invitation/hooks/use-received-invitations.ts
export const receivedInvitationsKey = ['me', 'trip-invitations'] as const;
export const receivedInvitationKey = (id: string) => [...receivedInvitationsKey, id] as const;
```

| 동작 | 성공 후 |
|---|---|
| 보내기 | `invitableFriendsKey` 무효화(서버 상태로 다시 그림). 낙관적 갱신은 하지 않음 — 결과가 사람마다 달라서 |
| 취소 | 해당 친구를 `INVITABLE`로 낙관적 갱신, 실패 시 되돌림, 끝나면 무효화 |
| 수락 | `receivedInvitationsKey` 무효화, 응답 `Trip`을 `tripKey(trip.id)`에 넣기, 내 여행 목록 키 무효화, `openJoinedTrip(trip.id)` |
| 거절 | `receivedInvitationsKey`에서 그 항목 제거 |
| 알림 목록 갱신 시 | `TRIP_INVITED`가 새로 오면 `receivedInvitationsKey` 무효화(배너 숫자) |

## 3. 화면

### 3.1 S18 동행 초대 화면 수정 — `features/trip/screens/invite-screen.tsx`

공유 버튼 줄(카카오톡·링크 복사) 옆에 **세 번째 버튼 "친구"**를 둔다. 기존 `ShareButton` 컴포넌트를 그대로 쓴다.

```
  (카톡)   (링크 복사)   (친구)
```

- 아이콘: `person-plus`(알림에서 이미 쓰는 아이콘), 배경 `colors.brand.primary` 계열.
- `full`(20명)이면 비활성 — 기존 `canShare`와 같은 규칙. 링크가 없어도 **친구 버튼은 활성**(링크와 무관).
- 누르면 `FriendInviteSheet`를 연다.

"함께하는 사람" 목록 위에 **대기 중인 초대** 칸을 하나 더한다(있을 때만).

```
초대 보낸 사람 2
 (아바타) 민지      초대함 · [취소]
 (아바타) 철수      초대함 · [취소]
```

데이터는 `useInvitableFriends(tripId)`에서 `state==='INVITED'`만 걸러 쓴다. 따로 API를 부르지 않는다.

### 3.2 친구 고르기 시트(새로) — `features/trip/components/friend-invite-sheet.tsx`

기존 `BottomSheet` + `RoundCheck`(멤버 고르기 시트 `member-pick-sheet.tsx`와 같은 모양)를 쓴다.

```
┌─────────────────────────────┐
│ 친구 초대                    │
│ 서로 팔로우한 친구만 보여요   │
│ [🔍 닉네임 검색            ] │
│ ○ (아바타) 민지              │
│ ● (아바타) 영희              │
│ ○ (아바타) 철수   초대함      │  ← INVITED: 체크 대신 회색 글자, 누를 수 없음
│ ○ (아바타) 지수   참여 중     │  ← MEMBER: 맨 아래, 누를 수 없음
│                             │
│ [ 1명 초대하기 ]             │
└─────────────────────────────┘
```

규칙:
- 고를 수 있는 최대 인원 = `capacity - activeMemberCount`. 넘으면 더 체크되지 않고 안내 "남은 자리는 n명이에요".
- 검색은 클라이언트에서 닉네임 `includes`(서버가 최대 500명을 한 번에 줌).
- 맞팔이 한 명도 없으면 `EmptyState`: "서로 팔로우한 친구가 없어요" + [친구 찾기] → `/find-friends`.
- `truncated=true`면 목록 끝에 "친구가 많아 일부만 보여요. 검색해 보세요" 안내.
- 버튼 누르면 `sendFriendInvitations` → 결과 집계 토스트(4장 문구표).
- 보내는 동안 버튼 `Spinner`, 시트 닫기 막음.

### 3.3 받은 초대 화면(새로) — `features/invitation/screens/received-invitation-screen.tsx`

라우트: `app/(main)/trip-invitations/[invitationId].tsx`

링크 초대 화면(S04, `features/invitation/screens/invite-screen.tsx`)과 같은 카드 모양을 쓴다. `components/trip-invite-card.tsx`를 재사용한다 — 링크 미리보기와 받은 초대가 같은 정보(제목·기간·초대한 사람)를 가지므로 카드 props를 맞춰 쓴다.

상태별 화면:

| status / 조건 | 보이는 것 | 버튼 |
|---|---|---|
| `alreadyMember` | "이미 함께하는 여행이에요" | [여행 보기] |
| `PENDING` | 카드 + "OO님이 초대했어요" + 만료 날짜 | [참여하기] [거절] |
| `EXPIRED` | "초대 기간이 지났어요. 동행에게 다시 받아 주세요" | [닫기] |
| `CANCELED` / `DECLINED` | "더 이상 쓸 수 없는 초대예요" | [닫기] |
| `ACCEPTED`(멤버 아님 = 나중에 나감) | "더 이상 쓸 수 없는 초대예요" | [닫기] |
| 404 | `TripGoneState`와 같은 "찾을 수 없는 초대" | [닫기] |

- [참여하기] 오류 처리(링크 S04의 처리와 같은 문구 재사용 — `invite-rules.ts`):
  - 409 `TRIP_FULL` → "여행 인원이 가득 찼어요"
  - 410 `INVITATION_EXPIRED` → 만료 상태로 전환
  - 410 `INVITATION_REVOKED` → 취소 상태로 전환
- [거절]은 `ConfirmSheet`로 한 번 묻는다("초대를 거절할까요? 초대한 사람에게 알리지 않아요").
- 가입 대기(`pending`) 상태면 링크 라우트(`app/invitations/[token].tsx`)처럼 프로필 화면으로 보낸다. 앱 내 초대는 로그인 상태에서만 오므로 `signedOut` 처리는 필요 없다.

### 3.4 받은 초대 목록(새로) — `features/invitation/screens/received-invitations-screen.tsx`

라우트: `app/(main)/trip-invitations/index.tsx`

- `useReceivedInvitations()` 목록, 줄마다 여행 제목·초대한 사람·만료까지 남은 날, 오른쪽 [참여] [거절] 작은 버튼.
- 비었으면 `EmptyState` "받은 초대가 없어요".
- 들어가는 곳:
  1. `TRIP_INVITED` 알림이 여러 개일 때 팝업의 "모두 보기"
  2. 내 여행 목록(`trip-list-screen.tsx`) 맨 위 배너 "받은 여행 초대 n개 >" — `received.length > 0`일 때만

## 4. 문구

| 상황 | 문구 |
|---|---|
| 보내기 결과: 모두 SENT | "n명에게 초대를 보냈어요" |
| 일부 ALREADY_INVITED | "n명에게 보냈어요. m명은 이미 초대했어요" |
| ALREADY_MEMBER 포함 | "m명은 이미 함께하고 있어요" (위 문장 뒤에 붙임) |
| NOT_MUTUAL 포함 | "m명은 서로 팔로우가 아니라 초대하지 못했어요" |
| 보내기 409 | "여행 인원이 가득 찼어요" |
| 취소 성공 | "초대를 취소했어요" |
| 수락 성공 | (토스트 없이 여행 상세로 이동) |
| 거절 성공 | "초대를 거절했어요" |

문구 조합 로직은 순수 함수 `sendResultMessage(results)`로 `features/trip/friend-invite-rules.ts`에 두고 단위 테스트한다.

## 5. 알림 연동 — `features/notification/notification-rules.ts`

```ts
// KINDS
TRIP_INVITED: { label: '여행 초대', icon: 'trip' },

// ACTION_KINDS — 앱 실행 팝업에 띄운다(받은 사람이 해야 할 일이 있음)
'TRIP_INVITED',

// destinationOf
case 'TRIP_INVITATION':
  return { href: `/trip-invitations/${target.id}`, tripId: null };
```

- `tripId: null`이어야 한다. 받는 사람은 아직 멤버가 아니라 "열기 전에 여행 받아 보기"를 하면 404가 난다.
- 서버도 이 알림의 `tripId`를 null로 보낸다(백엔드 문서 6장).
- `pickPopup`: `TRIP_INVITED`가 하나면 그 초대 화면으로, 여러 개면 기존 'many' 팝업 → 받은 초대 목록.
- `api/dev-mock-notification.ts`에 `TRIP_INVITED` 샘플 하나 추가(개발 모드 확인용).

## 6. 파일 목록

**새로 만들기**
```
features/trip/hooks/use-invitable-friends.ts
features/trip/hooks/use-friend-invite-actions.ts      // send, cancel 뮤테이션
features/trip/components/friend-invite-sheet.tsx
features/trip/friend-invite-rules.ts                  // 선택 한도, 결과 문구, 정렬
features/trip/friend-invite-rules.test.ts
features/invitation/hooks/use-received-invitations.ts // 목록·단건·accept·decline
features/invitation/screens/received-invitation-screen.tsx
features/invitation/screens/received-invitations-screen.tsx
features/invitation/received-invitation-rules.ts      // status → 화면 상태 매핑
features/invitation/received-invitation-rules.test.ts
app/(main)/trip-invitations/index.tsx
app/(main)/trip-invitations/[invitationId].tsx
```

**고치기**
```
features/trip/api.ts                       // 보내는 쪽 API 3개
features/invitation/api.ts                 // 받는 쪽 API 4개
features/invitation/types.ts               // 2.1 타입
features/trip/screens/invite-screen.tsx    // 친구 버튼, 초대 보낸 사람 칸
features/trip/screens/trip-list-screen.tsx // 받은 초대 배너
features/notification/notification-rules.ts (+ test)
api/dev-mock-notification.ts
```

## 7. 테스트

**순수 함수 (vitest/jest, 기존 `*-rules.test.ts` 방식)**
- `friend-invite-rules`: 남은 자리 계산, 선택 한도 초과 막기, 정렬(INVITABLE→INVITED→MEMBER), 결과 문구 조합 4종
- `received-invitation-rules`: status·alreadyMember → 화면 상태 6종, 410 코드 → 상태 전환
- `notification-rules`: `TRIP_INVITED` 라벨·팝업 포함·`destinationOf`가 `/trip-invitations/{id}`, `tripId: null`

**컴포넌트 (`@testing-library/react-native`, 기존 `invite-screen.test.tsx` 방식)**
- 시트: 맞팔 0명 빈 화면, INVITED·MEMBER 줄은 눌러도 체크 안 됨, 남은 자리 2명이면 3번째 체크 안 됨
- 받은 초대 화면: [참여하기] 성공 시 `openJoinedTrip` 호출, 409 문구, 410 EXPIRED면 만료 화면으로 바뀜
- S18: 20명이면 친구 버튼 비활성, 링크가 없어도 친구 버튼 활성

**수동 확인 (기기 2대 또는 계정 2개)**
1. A·B 서로 팔로우 → A가 여행에서 B 초대 → B 알림·팝업 확인
2. B 수락 → B 여행 상세 진입, A 쪽 멤버 목록·`TRIP_MEMBER_JOINED` 알림
3. A가 초대 취소 → B가 알림 눌렀을 때 "더 이상 쓸 수 없는 초대"
4. B가 A 언팔 → A 시트에서 B가 사라짐

## 8. 작업 순서

1. 타입·API 함수·query 훅 (백엔드 5.1 DTO 확정 후 바로 시작 가능, 서버 전엔 `dev-mock`으로)
2. 받는 쪽: 알림 연동 → 받은 초대 화면 → 목록·배너
3. 보내는 쪽: 친구 시트 → S18 연결 → 초대 보낸 사람 칸
4. 테스트·수동 확인

받는 쪽을 먼저 하는 이유: 보내기 API만 붙여도 서버에서 알림이 생기므로, 받는 화면이 없으면 알림을 눌러도 갈 곳이 없다.
