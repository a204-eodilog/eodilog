# Data Model: 동행 초대·관리·나가기

앱이 쓰는 타입과 계산 규칙이다. 서버 모양은 [contracts/companions-api.md](./contracts/companions-api.md)에 있다. `Trip`·`TripMember`·`LeaveResult`는 이전 명세에서 만든 `src/features/trip/types.ts`를 그대로 쓴다.

## 서버에서 오는 것

### Trip (있음)

이번에 쓰는 칸:

| 칸 | 쓰는 곳 |
| --- | --- |
| `title` · `startDate` · `endDate` · `destinationRegionIds` | S19 칸, 수정 본문의 비교 기준 |
| `ownerMemberId` | 내가 방장인지(`tripRole`) |
| `members` | 함께하는 사람(참여 중만, `joinOrder` 순), 이어받을 사람, 혼자 남음, 정원 |
| `version` | 모든 변경 요청의 `expectedVersion` |

### TripMember (있음)

| 칸 | 쓰는 곳 |
| --- | --- |
| `id` | 멤버 id. 넘기기 `targetMemberId`, 내보내기 경로 |
| `user.id` | 나를 찾는다(`me.id`와 비교) |
| `user.nickname` · `user.profileImageUrl` | 줄 표시. 탈퇴한 사용자는 서버가 닉네임 "탈퇴한 사용자"로 준다 |
| `joinOrder` | 정렬, 이어받을 사람 |
| `joinedAt` | 넘기기 시트 설명 "11.03 참여"(서울 날짜) |

### InviteLink (새로)

```ts
/** POST /trips/{id}/invitations 201 응답. 토큰은 쓰지 않고 url만 보인다 */
type InvitationSecret = { id: string; token: string; url: string; expiresAt: string };

/** 기기에 남기는 모양(R1) */
type SavedInviteLink = { url: string; expiresAt: string };
type InviteStore = { userId: string; links: Record<string /* tripId */, SavedInviteLink> };
```

- 저장 키: `eodilog.invites`(보안 저장소)
- 상태 전이(이 기기 기준):

```text
없음 ──[링크 만들기]──▶ 있음
있음 ──[새 링크 만들기]──▶ 있음(다른 url)
있음 ──[링크 취소]──▶ 없음
있음 ──expiresAt 지남──▶ 없음(읽을 때 판단)
있음 ──여행에서 빠짐·로그아웃·다른 사용자──▶ 없음
```

### JobRef (새로, 여행 삭제 응답)

```ts
type JobRef = { jobId: string; status: 'QUEUED'; statusUrl: string };
```

앱은 받기만 하고 조회하지 않는다(R10).

## 앱이 계산하는 것

모두 `src/features/trip/companion-rules.ts`의 순수 함수다. 단위 테스트 대상이다.

| 함수 | 입력 → 출력 | 규칙 |
| --- | --- | --- |
| `myMember(trip, meId)` | `TripMember \| null` | `members`에서 `user.id === meId`. 없으면(나간 직후 등) `null` |
| `tripRole(trip, meId)` | `'owner' \| 'member' \| null` | `myMember.id === ownerMemberId`면 owner |
| `isAlone(trip)` | `boolean` | `members.length === 1` |
| `nextOwner(trip, myMemberId)` | `TripMember \| null` | 나를 뺀 멤버 중 `joinOrder` 최소 |
| `pickableMembers(trip, myMemberId)` | `TripMember[]` | 나를 뺀 멤버, `joinOrder` 순. 넘기기·내보내기 시트 목록 |
| `settingsActions(role, memberCount)` | `SettingsAction[]` | R7 표. 방장이 혼자면 넘기기·내보내기는 `disabled`와 이유를 단다 |
| `canInvite(memberCount)` | `boolean` | `memberCount < TRIP_CAPACITY`(20) |
| `memberLabel(member, trip, meId)` | `('방장' \| '나')[]` | 방장·나 표시. 둘 다일 수 있다 |
| `buildTripUpdate(base, draft)` | `UpdateTripBody \| null` | R6. `base`는 수정을 시작한 때의 여행이다. `base`와 비교해 바뀐 칸만 담고 `expectedVersion = base.version`이다. 바뀐 게 없으면 `null` |
| `memberActionFailure(error)` | `'conflict' \| 'notOwner' \| 'memberGone' \| 'tripGone' \| 'error'` | R4 표 |


초대 링크 함수는 `src/features/trip/invite-storage.ts`에 둔다. US2가 고치는 `companion-rules.ts`와 겹치지 않게 하기 위해서다.

| 함수 | 입력 → 출력 | 규칙 |
| --- | --- | --- |
| `inviteExpiryLabel(expiresAt)` | `string` | 서울 날짜 `"11.12(목)까지 쓸 수 있어요"` |
| `isInviteExpired(link, now)` | `boolean` | `now >= Date.parse(expiresAt)` |

```ts
type SettingsAction =
  | { key: 'handover' | 'kick'; label: string; disabled: boolean; reason?: string }
  | { key: 'leave'; label: string }
  | { key: 'delete'; label: string; danger: true };

/** PATCH 본문. 생략한 칸은 서버가 유지한다 */
type UpdateTripBody = {
  expectedVersion: number;
  title?: string;
  startDate?: string | null;
  endDate?: string | null;
  destinationRegionIds?: string[];
};
```

## 입력 중 상태 (zustand)

### useTripEditDraft (새로)

S19와 설정용 여행지 검색 화면이 함께 쓴다. 서버 데이터를 복사해 두는 게 아니라, [완료]를 누르기 전의 입력값이다. `useNewTripDraft`와 같은 규칙이다.

| 칸 | 설명 |
| --- | --- |
| `base` | `Trip \| null`. 채울 때의 여행 전체. 저장할 때 비교 기준과 `expectedVersion`이 된다 |
| `title` · `range` · `regions` | 고치는 중인 값. `regions`는 이름을 보여야 해서 `Region[]`. 1번 `useNewTripDraft`와 같은 공통 조각 `tripDraftFields`를 쓴다 |
| `fill(trip, regions)` | 부르면 언제나 덮어쓴다. 화면이 S19를 처음 열 때와 409 뒤에만 부른다. 수정 중 여행을 새로 받아도 부르지 않는다 |
| `reset()` | S19가 닫힐 때 부른다 |

검증: 이름은 공백을 뺀 1~200자다. 기간은 둘 다 있거나 둘 다 없어야 한다. 같은 지역은 한 번만 넣는다. 모두 새 여행과 같다.

## 캐시 키

| 키 | 내용 | 이번에 하는 일 |
| --- | --- | --- |
| `['trips', tripId]` | 여행(있음, 경비도 같은 키) | 수정·넘기기 뒤 `setQueryData`, 내보내기 뒤 무효화 |
| `['trips', tripId, 'invite']` | 이 기기의 초대 링크(새로) | 만들기·취소 뒤 `setQueryData` |
| `['trips', 'mine']` | 여행 탭 목록(있음) | 모든 변경 뒤 무효화 |
| `['me', 'trips']` | N4 내 여행 목록(다른 팀원) | 모든 변경 뒤 무효화 |
| `['trips', tripId, ...]` 전체 | 그 여행의 모든 캐시 | 나가기·삭제 뒤 이동한 다음 `removeQueries` |
