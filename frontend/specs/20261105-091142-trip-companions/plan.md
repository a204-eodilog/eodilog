# Implementation Plan: 동행 초대·관리·나가기

**Branch**: `feat/EODI-194` | **Date**: 2026-11-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/20261105-091142-trip-companions/spec.md`

## Summary

여행 상세(S17)의 초대·설정 버튼에서 두 화면을 연다.

- **S18 초대 링크 공유**: 만들기·카카오톡·복사·새로 만들기·취소, 함께하는 사람.
- **S19 여행 설정**: 정보 수정, 방장 넘기기, 동행 내보내기, 나가기, 여행 삭제.

서버는 초대 링크를 만들 때만 알려 준다. 그래서 이 기기에서 만든 링크를 만료 전까지 보안 저장소에 남겨 다시 보여 준다. 변경 요청은 모두 화면에 그린 여행의 `version`을 보낸다. 409·403이면 최신 여행을 다시 받아 보여 주고, 사용자가 다시 누르게 한다.

나가기 확인은 B가 이미 dev에 머지한 `LeaveTripSheet`·`useLeaveTrip`을 쓴다. 다만 사진 줄 숨김과 채팅 체크 켜기를 위해 시트 속성을 나눈다. 판단 로직은 순수 함수 `companion-rules.ts`에 모아 단위 테스트한다. 대상은 방장 여부, 메뉴, 이어받을 사람, 혼자 남음, 수정 본문, 실패 분류, 만료다.

## Technical Context

**Language/Version**: TypeScript 6, React 19.3, React Native 0.88. Expo SDK 58이고 React Compiler와 expo-router `typedRoutes`가 켜져 있다. 이전 명세와 같다.

**Primary Dependencies**: 모두 이미 설치돼 있다. 새 패키지는 없다.

- **expo-router**: 새 주소 3개(`[tripId]/invite`, `settings`, `settings-region`)
- **@tanstack/react-query**: 여행·초대 링크 캐시, 변경 요청
- **zustand**: S19 입력 중 상태 `useTripEditDraft`
- **axios** `apiClient`
- **expo-clipboard** `~58.0.4`: 링크 복사
- **React Native `Share`**: OS 공유 창(팀 기술 스택 결정)
- **expo-secure-store**(`src/lib/secure-storage.ts`): 초대 링크 보관
- **공통 부품** `components/ui`: `ConfirmSheet`, `BottomSheet`, `Header`, `TextField`, `Avatar`·`AvatarGroup`, `RoundCheck`, `Button`, `toast`, `EmptyState`·`ErrorState`
- **이전 명세에서 만든 것**:
  - `src/api/errors.ts`, `src/lib/seoul-date.ts`
  - `features/trip`의 `api`, `useTrip`, `MY_TRIPS_KEY`, `trip-rules`, `DateRangeSheet`, `RegionSearchScreen`, `useRegionNames`
- **B가 만든 것**: `LeaveTripSheet`, `useLeaveTrip`

**Storage**:

- 서버 데이터는 TanStack Query 메모리 캐시에 둔다.
- 기기에 새로 남기는 것은 초대 링크 하나다. 보안 저장소 키 `eodilog.invites`에 사용자별로 두고, 만료된 것은 지운다(research R1).

**Testing**: jest-expo + @testing-library/react-native.

- 순수 함수: `companion-rules.ts`, 초대 링크 저장
- 캐시 정리: `QueryClient` 실제 인스턴스로 확인
- `LeaveTripSheet` 렌더: 사진 줄 숨김, 채팅 체크 켜짐

**Target Platform**: Android 개발 빌드. 웹 미리보기(테스트 모드)로 화면 흐름을 먼저 확인한다.

**Project Type**: mobile-app (`frontend/`)

**Performance Goals**:

- S19를 열 때 요청은 `GET /trips/{id}` 1번이다(멤버 목록을 따로 받지 않는다).
- S18 재진입으로 생기는 초대 링크 발급은 0건이다(SC-002).
- [나가기]를 누르고 여행 탭 목록이 보이기까지 3초 안이다(SC-007). 정리 작업은 기다리지 않는다.

**Constraints**:

- API 계약은 백엔드 코드를 기준으로 한다([contracts/companions-api.md](./contracts/companions-api.md)).
  - 변경 요청은 모두 `expectedVersion`을 필수로 보낸다.
  - 방장 확인(403)이 버전 확인(409)보다 먼저다.
  - 나가기·삭제에는 멱등키가 없다. 다시 보내면 404가 온다.
  - `deleteOwnPhotos=true`는 400이다.
- 요청 본문에는 계약에 있는 칸만 보낸다. 모르는 칸이 있으면 400이다.
- 링크 url은 서버가 준 앱 주소(`ieohaeng://invitations/{token}`)를 그대로 쓴다. 카카오톡에서 누를 수 있는지는 앱 이름 변경 작업의 몫이다.
- 날짜 표시는 서울 기준이다. 만료 판단은 시각으로 한다.

**Scale/Scope**:

- 화면: S18, S19, 설정용 여행지 검색
- 시트: 넘기기·내보내기 고르기(`MemberPickSheet`), 확인(`ConfirmSheet` 4가지), 나가기(`LeaveTripSheet` 3가지)
- 동행: 최대 20명

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md`는 아직 빈 양식이다. 이전 명세와 같은 관문을 쓴다.

| 관문 | 근거 | 결과 |
| --- | --- | --- |
| 기능 코드는 `features/trip/...`. 라우트 파일은 화면을 내보내기만 | `frontend/CONVENTION.md` | 통과 |
| 색·글자·간격은 `src/theme` 토큰과 StyleSheet. 공통 부품과 `icon.tsx`를 다시 쓴다 | `CONVENTION.md`, 사용자 입력 | 통과. 새 공통 부품을 만들지 않는다 |
| 서버 데이터는 TanStack Query. zustand에는 입력 중 상태만 | `CONVENTION.md` | 통과. `useTripEditDraft`는 [완료] 전 입력값만 둔다 |
| 새 패키지는 `npx expo install`로만 | `frontend/AGENTS.md` | 해당 없음(추가 없음) |
| 끝내기 전 lint·typecheck 통과 | `frontend/AGENTS.md` | 구현 단계에서 확인 |
| 다른 사람의 부품을 새로 만들지 않고, 고칠 때는 알린다 | 팀 분담(S50은 B) | 통과. `LeaveTripSheet`는 새로 만들지 않고 속성만 나눈다. B에게 알린다(research R9) |
| S04 초대 참여 화면(A)은 건드리지 않는다 | 명세 범위 | 통과. 링크를 만들고 보내는 쪽만 다룬다 |

설계 후 재확인: 통과. 위반은 없다. 피그마와 다른 두 가지를 기록해 둔다.

- 내보내기는 피그마의 메뉴 줄 + 고르기 시트를 쓴다. 명세 US4·FR-021도 이것에 맞췄다(2026-11-05 분석 반영, research R7).
- 피그마 '저장 실패' 프레임의 동행 화면에 있는 [여행 삭제]는 따르지 않는다.

## Project Structure

### Documentation (this feature)

```text
specs/20261105-091142-trip-companions/
├── spec.md
├── plan.md                  # 이 문서
├── research.md              # 결정과 근거 R1~R15
├── data-model.md            # 타입, 계산 함수, 입력 상태, 캐시 키
├── quickstart.md            # 확인 시나리오와 측정 기록 표
├── contracts/
│   ├── companions-api.md    # 이번에 쓰는 서버 API 8개 (백엔드 코드 기준)
│   └── routes.md            # 새 주소와 이동 규칙
├── checklists/requirements.md
└── tasks.md                 # /speckit-tasks 출력
```

### Source Code (`frontend/`)

```text
src/
├── api/
│   ├── errors.ts                    # 고침: API_ERROR에 FORBIDDEN, MEMBER_NOT_FOUND
│   └── dev-mock.ts                  # 고침: 새 API 7개 가짜 응답, 버전·409 흉내(R15)
├── stores/
│   └── session-store.ts             # 고침: clearSession에서 초대 링크 저장 지우기
├── app/(main)/trips/[tripId]/
│   ├── invite.tsx                   # 새로: S18
│   ├── settings.tsx                 # 새로: S19
│   └── settings-region.tsx          # 새로: 설정용 여행지 검색
├── app/dev/ui.tsx                   # 고침: LeaveTripSheet 예시의 바뀐 속성
└── features/trip/
    ├── api.ts                       # 고침: 함수 6개 추가, leaveTrip 설명 고침
    ├── types.ts                     # 고침: InvitationSecret, UpdateTripBody, JobRef
    ├── companion-rules.ts           # 새로: data-model의 계산 함수
    ├── companion-rules.test.ts      # 새로
    ├── invite-storage.ts            # 새로: 보안 저장소 읽기·쓰기·지우기(R1), 만료 판단·표시
    ├── invite-storage.test.ts       # 새로
    ├── hooks/
    │   ├── trip-cache.ts            # 새로: invalidateTripLists, forgetTrip(R5)
    │   ├── trip-cache.test.ts       # 새로
    │   ├── use-create-trip.ts       # 고침: invalidateTripLists 사용(N4 목록 포함)
    │   ├── use-invite-link.ts       # 새로: 링크 읽기·만들기·취소
    │   ├── use-new-trip-draft.ts    # 고침: 공통 조각 tripDraftFields를 뽑음(R6)
    │   ├── use-trip-edit-draft.ts   # 새로: zustand 입력 상태(R6). base 여행을 기억
    │   ├── use-update-trip.ts       # 새로: PATCH + 409 처리
    │   ├── use-member-actions.ts    # 새로: 넘기기·내보내기·삭제 + 409/403 처리
    │   └── use-leave-trip.ts        # 그대로 사용
    ├── components/
    │   ├── trip-hero.tsx            # 고침: 초대·설정 버튼 연결
    │   ├── leave-trip-sheet.tsx     # 고침: showPhotos, messageCleanupSupported(R9)
    │   ├── leave-trip-sheet.test.tsx # 새로
    │   ├── member-row.tsx           # 새로: 얼굴·닉네임·방장/나 표시 줄(S18)
    │   └── member-pick-sheet.tsx    # 새로: 넘기기·내보내기 대상 고르기
    └── screens/
        ├── region-search-screen.tsx # 고침: 고른 값을 읽고 쓸 곳을 인자로
        ├── invite-screen.tsx        # 새로: S18
        └── trip-settings-screen.tsx # 새로: S19
```

**Structure Decision**: 동행 관리는 여행 기능의 일부라 `features/trip`에 둔다. `features/invitation`(A, S04)은 초대받는 쪽이라 쓰지 않는다.

이름이 겹치지 않게 S18 화면은 `features/trip/screens/invite-screen.tsx`로 둔다. A의 `features/invitation/screens/invite-screen.tsx`와 파일 이름은 같지만, 내보내는 이름은 `TripInviteScreen`으로 다르게 한다.

## 측정할 것

quickstart의 측정 기록 표에 값을 남긴다.

- **S18 재진입 발급 수**: S18에 10번 들어갔다 나오고 앱도 한 번 다시 켠다. 그동안 서버로 간 `POST /trips/{id}/invitations` 수를 웹 네트워크 기록(실서버)으로 센다. 목표는 0이다(SC-002).
- **S19 진입 요청 수**: 상세에서 S19를 열 때 나가는 요청 수. 목표는 `GET /trips/{id}` 1번이고 `/members`는 없어야 한다.
- **나가기 → 목록 시간**: [나가기]를 누른 시각부터 여행 탭 목록이 그려진 시각까지. 기기 개발 빌드에서 로그 타임스탬프로 5번 잰다. 내 채팅이 있는 경우(202)와 없는 경우(200)를 나눈다. 목표는 3초 안이다(SC-007).
- **동시 수정 덮어쓰기**: 두 계정이 같은 여행을 연 뒤 차례로 저장하기를 5번 한다. 뒤에 저장한 쪽이 409를 받고, 앞사람 값이 남은 횟수를 센다. 목표는 덮어쓰기 0건이다(SC-003).
- **이어받을 사람 일치**: 방장 나가기 시트에 보인 이름과 나간 뒤 서버 `ownerMemberId`의 사람이 같은지. quickstart 3-4·3-5에서 확인한다(SC-005).

## 단위 테스트로 증명할 것

- **방장 여부와 메뉴** (`tripRole`, `settingsActions`):
  - 방장이면 넘기기·내보내기·나가기·삭제 4줄, 동행이면 나가기 1줄만 나온다(SC-004).
  - 방장이 혼자면 넘기기·내보내기가 `disabled`이고 이유가 붙는다.
  - `members`에 내가 없으면 `null`이다(메뉴 없음).
- **이어받을 사람** (`nextOwner`, `pickableMembers`):
  - 나를 뺀 사람 중 `joinOrder`가 가장 작은 사람을 고른다.
  - 배열 순서가 섞여 와도 `joinOrder`로 고른다.
  - 다시 참여해 `joinOrder`가 큰 사람은 뒤로 간다.
  - 나만 있으면 `null`이다.
- **혼자 남음** (`isAlone`): 1명이면 `true`, 2명이면 `false`. 혼자일 때 나가기 시트에 이어받을 사람을 넘기지 않는다.
- **정원** (`canInvite`): 19명이면 `true`, 20명이면 `false`.
- **수정 본문** (`buildTripUpdate`):
  - 바뀐 칸만 담는다.
  - 이름은 앞뒤 공백을 지운다.
  - 기간을 비우면 `startDate`·`endDate`를 둘 다 `null`로 보낸다.
  - 여행지를 모두 빼면 `[]`이다.
  - 여행지 순서만 바뀌어도 바뀐 것으로 본다.
  - 아무것도 안 바뀌면 `null`이다.
  - `expectedVersion`은 언제나 들어간다.
- **실패 분류** (`memberActionFailure`): 409 `VERSION_CONFLICT`는 conflict, 403 `FORBIDDEN`은 notOwner, 404 `MEMBER_NOT_FOUND`는 memberGone, 404 `TRIP_NOT_FOUND`는 tripGone, 네트워크·시간 초과·500은 error.
- **409 처리 훅** (`use-update-trip`, `use-member-actions`): 가짜 API와 `QueryClient`로 확인한다.
  - conflict·notOwner면 `['trips', id]`를 다시 받는다.
  - 수정 화면 입력 상태가 최신 여행 값으로 다시 채워진다.
  - 요청을 자동으로 다시 보내지 않는다.
- **캐시 정리** (`trip-cache`):
  - `forgetTrip`은 `['trips', id]`·`['trips', id, 'expenses']`·`['trips', id, 'invite']`를 지운다.
  - 다른 여행과 `['trips','mine']`은 남긴다.
  - `invalidateTripLists`는 `['trips','mine']`과 `['me','trips']`를 둘 다 무효화한다.
- **초대 링크 저장** (`invite-storage`):
  - 같은 사용자는 저장한 것을 그대로 읽는다.
  - 다른 사용자거나 만료가 지났으면 `null`이다. 만료 1초 전은 있고, 만료 시각 정각은 없다.
  - 저장할 때 만료된 다른 여행 항목을 지운다.
  - 여행 하나를 지워도 나머지는 남는다.
  - 로그아웃하면 전부 지운다.
- **만료 표시** (`inviteExpiryLabel`): `2026-11-11T15:00:00Z`는 "11.12(목)까지"이고, `14:59:59Z`는 "11.11(수)까지"다(서울 날짜 경계).
- **나가기 시트** (`LeaveTripSheet` 렌더):
  - `showPhotos=false`면 사진 줄이 없다.
  - 채팅 체크를 켜면 `onConfirm`이 `{ deleteOwnPhotos: false, deleteOwnMessages: true }`를 받는다.
  - `alone`이면 체크가 없고 버튼은 "나가기"다(2026-11-05 사용자 요청으로 짧게).

## Complexity Tracking

위반 없음.
