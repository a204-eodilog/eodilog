# Implementation Plan: 지역·장소 투표

**Branch**: `feature/EODI-225-poll-vote` | **Date**: 2026-11-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/20261109-094657-poll-vote/spec.md`

## Summary

S22 투표 화면과 N8 투표 열기 시트를 만든다. S17의 '투표' 메뉴와 채팅 투표 카드가 S22로 이어진다.

- **조회**: 여행의 투표 목록과 투표 하나를 TanStack Query로 받는다. 화면에 들어오거나 앱이 앞으로 돌아오면 다시 받는다(실시간 이벤트 없음).
- **표 던지기**: 후보를 누르면 화면의 선택을 바로 바꾸고(낙관적 표시), 저장 요청은 한 번에 하나만 보낸다. 요청 중에 또 누르면 마지막 선택 하나만 기억했다가 앞 요청이 끝난 뒤 보낸다(`ballot-queue`). 그래서 연달아 눌러도 표가 두 번 세어지지 않는다.
- **버전 충돌**: 후보 추가로 투표 version이 오르면 `409 VERSION_CONFLICT`다. 최신 투표를 다시 받고, 내가 고르던 선택은 화면에 남긴 채 실패 안내와 [다시 시도]를 보인다(S22 투표 바꾸기 실패).
- **마감**: 서버가 한다. `409 POLL_CLOSED`나 마감 시각이 지난 응답을 받으면 결과 화면으로 바꾼다. 지역 투표가 `FINALIZED`면 여행 상세·목록 캐시를 무효화한다(서버가 여행지를 추가함).
- **후보 이름**: 투표 응답에는 `regionId`·`placeId`만 있다. 지역은 기존 `['regions', id]` 캐시(`use-region-names`)로, 장소는 새 `GET /places/{id}`로 받는다.
- **후보 출처**: N8과 후보 추가 시트는 `GET /trips/{tripId}/saved-places`(그룹 즐겨찾기)에서 장소를, 그 장소들의 `regionId`로 지역을 만든다.
- **미리보기**: `/dev/polls`에서 N8과 S22 9개 상태를 서버 없이 본다. 웹 테스트 모드용 가짜 서버는 `src/api/dev-mock-poll.ts`.

## Technical Context

**Language/Version**: TypeScript 6, React 19.3, React Native 0.88. Expo SDK 58, expo-router `typedRoutes`. 이전 명세와 같다.

**Primary Dependencies**: 새 패키지 없음.

- `@tanstack/react-query`: 투표·후보 이름·그룹 즐겨찾기 캐시
- `@react-native-community/datetimepicker` 9.2.1: N8 마감 시각 바꾸기. 이미 설치돼 있고 아직 쓰는 곳이 없다(research R4)
- `expo-router`: `/trips/[tripId]/polls`, `/trips/[tripId]/polls/[pollId]`
- 공통 부품 `components/ui`: `Header`, `BottomSheet`, `Button`, `Chip`, `RoundCheck`, `Tag`, `EmptyState`·`ErrorState`, `Icon`, `toast`
- 이전 명세에서 만든 것: `apiClient`(401 갱신), `errors.ts`(`apiErrorCode`), `features/trip`의 `tripKey`·`invalidateTripLists`·`useRegions`, `features/chat`의 `SYSTEM_CARD_ROUTES`, `lib/seoul-date`

**Storage**: 서버 데이터는 메모리 캐시만. 기기에 새로 남기는 것은 없다. 표 저장 큐는 투표 화면이 떠 있는 동안만 메모리에 있다.

**Testing**: jest-expo + @testing-library/react-native.

- 순수 함수: `poll-rules`(상태 판정, 남은 시간 문구, 마감 기본값·범위, 결과 문구, 새 후보 판정, 지역 후보 묶기), `ballot-queue`(요청 합치기)
- 훅: 가짜 API와 실제 `QueryClient`로 409 두 종류와 연결 끊김
- 화면: S22 상태별 RNTL 렌더 테스트, N8 고르기·열기

**Target Platform**: Android 개발 빌드. 웹 테스트 모드(`expo-web`)로 먼저 본다.

**Project Type**: mobile-app (`frontend/`)

**Performance Goals**: 후보를 누른 뒤 표 수가 바뀌기까지 서버를 기다리지 않는다(낙관적 표시, SC-006).

**Constraints**: 후보 1~30개, 제목 1~200자, 마감은 지금 이후 30일 이내(서버 규칙과 같다). 문구는 Figma 그대로.

**Scale/Scope**: 화면 1개(S22, 상태 9개 + 볼 수 없음), 시트 2개(N8, 후보 추가), 라우트 2개, 미리보기 1개.

## Constitution Check

`.specify/memory/constitution.md`의 원칙을 따른다(이전 명세와 같은 확인).

- 화면은 `src/theme` 토큰과 `components/ui`만 쓴다. 색·글자 크기를 숫자로 직접 쓰지 않는다. → 지킴
- 라우트 파일은 `src/app/`에 얇게 두고 화면은 `src/features/poll/screens`에 둔다. → 지킴
- 순수 규칙은 테스트와 함께 둔다. → 지킴
- 새 패키지 없음. → 지킴

## Project Structure

### Documentation (this feature)

```text
specs/20261109-094657-poll-vote/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── poll-api.md
│   └── routes.md
└── tasks.md
```

### Source Code

```text
src/features/poll/
├── api.ts                     # 투표 목록·상세·열기·내 선택·후보 추가, 장소 하나, 그룹 즐겨찾기 목록
├── types.ts                   # Poll, PollCandidate, CandidateInput, SavedPlace
├── poll-rules.ts(+test)       # 화면 상태 판정, 문구, 마감 시각, 새 후보, 지역 후보 묶기
├── ballot-queue.ts(+test)     # 표 저장 요청 합치기
├── poll-routes.ts             # 아직 없는 화면으로 가는 버튼(준비 중이에요)
├── hooks/
│   ├── poll-keys.ts
│   ├── use-polls.ts           # 목록과 S17 메뉴용 대표 투표 고르기
│   ├── use-poll.ts            # 투표 하나, 마감 감지, 지역 확정 시 여행 캐시 무효화
│   ├── use-ballot.ts          # 낙관적 선택과 저장, 409 처리
│   ├── use-open-poll.ts       # 투표 열기와 다시 열기
│   ├── use-add-candidates.ts  # 후보 여러 개 차례로 넣기, 409 VERSION_CONFLICT 한 번 재시도
│   ├── use-candidate-names.ts # 지역·장소 이름
│   └── use-saved-places.ts    # 그룹 즐겨찾기 목록(B와 같은 키 앞부분)
├── components/
│   ├── poll-header-card.tsx   # 진행 중·마감·확정 위쪽 카드
│   ├── candidate-row.tsx      # 후보 한 줄(체크·이름·표 수·막대·태그)
│   ├── my-vote-bar.tsx        # 하단 내 선택 요약
│   ├── open-poll-sheet.tsx    # N8
│   ├── add-candidate-sheet.tsx
│   ├── closes-at-picker.tsx   # 마감 시각 바꾸기
│   └── poll-views.tsx         # 상태별 본문(없음·진행 중·자동 확정·동률·0표·여행지 확정·볼 수 없음)
└── screens/
    └── poll-screen.tsx

src/app/(main)/trips/[tripId]/polls/index.tsx      # 대표 투표 또는 빈 상태
src/app/(main)/trips/[tripId]/polls/[pollId].tsx   # 투표 하나
src/app/dev/polls.tsx                               # 상태 미리보기
src/api/dev-mock-poll.ts                            # 테스트 모드 가짜 서버
```

고치는 기존 파일(연결점만):

- `src/api/errors.ts`: `POLL_CLOSED`, `POLL_NOT_FOUND` 코드 추가
- `src/api/dev-mock.ts`: 가짜 투표 서버 연결 한 줄
- `src/features/trip/components/trip-menu-grid.tsx`: 'poll' 메뉴 `open`
- `src/features/chat/system-card-routes.ts`: `poll` 이동

## 오류 처리표

| 요청 | 응답 | 화면 동작 |
|------|------|-----------|
| GET 투표 하나 | 404 `POLL_NOT_FOUND`·`TRIP_NOT_FOUND` | 볼 수 없는 투표 안내 + 뒤로 |
| GET 목록·하나 | 네트워크 끊김·시간 초과 | `ErrorState` + [다시 시도], 받아 둔 투표가 있으면 그대로 보임 |
| PUT ballot | 409 `VERSION_CONFLICT` | 투표 다시 받기, 화면 선택 유지(새 후보 목록에 없는 ID는 뺌), "○○으로 바꾸지 못했어요. ○○ 투표는 그대로예요" + [다시 시도] |
| PUT ballot | 409 `POLL_CLOSED` | 투표 다시 받기 → 결과 화면, "투표가 마감됐어요" 안내 |
| PUT ballot | 400 `VALIDATION_ERROR`(candidateIds) | 투표 다시 받기, 서버 선택으로 되돌림 + 실패 안내 |
| PUT ballot | 404 | 볼 수 없는 투표 |
| PUT ballot | 끊김·시간 초과 | 서버에 마지막 저장된 선택으로 되돌림 + 실패 안내 + [다시 시도] |
| POST polls | 400 필드(`closesAt`·`candidates`·`title`) | 시트 유지, 필드 문구를 시트 안에 보임 |
| POST polls | 404 `TRIP_NOT_FOUND` | 시트 닫고 볼 수 없는 투표 |
| POST polls | 끊김 | 시트 유지 + "투표를 열지 못했어요" + 다시 누를 수 있음 |
| POST candidates | 409 `VERSION_CONFLICT` | 다시 받고 최신 version으로 한 번 재시도, 이미 있는 후보는 건너뜀 |
| POST candidates | 409 `POLL_CLOSED` | 시트 닫고 결과 화면 |
| POST candidates | 400 `candidate`(이미 있음·30개) | 그 후보는 건너뛰고 남은 것 계속, 끝에 안내 |
| 모든 요청 | 401 | 기존 `apiClient`가 토큰을 갱신하고 한 번 다시 보낸다. 갱신 실패면 로그인 화면 |

## 두 번 누르기와 멱등키

- 서버는 투표 API에 `Idempotency-Key`를 요구하지 않는다(api-spec §1 목록에 없음, PollController도 읽지 않음). 그래서 화면에서 막는다.
- [투표 열기]·[다시 열기]·[후보에 넣기]: 요청 중에는 버튼 비활성.
- 후보 누르기: 막지 않고 `ballot-queue`가 합친다. 요청 중에 들어온 선택은 마지막 하나만 남는다. 앞 요청이 끝나면 그 선택이 서버 선택과 다를 때만 보낸다.

## 쿼리 키와 캐시 무효화

| 키 | 내용 | 무효화·갱신하는 때 |
|----|------|------|
| `['trips', tripId, 'polls']` | 투표 목록(첫 페이지 20개) | 투표 열기·다시 열기 성공, 투표 하나를 새로 받았을 때 그 항목 교체 |
| `['trips', tripId, 'polls', pollId]` | 투표 하나 | 내 선택·후보 추가 응답으로 교체, 409 뒤 다시 받기, 마감 시각이 지나면 다시 받기, 앱 복귀 |
| `['regions', regionId]` | 지역(이름) | 바뀌지 않음(`staleTime: Infinity`), 기존 키 공유 |
| `['places', placeId]` | 장소 | 바뀌지 않음(`staleTime: Infinity`) |
| `['trips', tripId, 'saved-places', 'poll-source']` | 그룹 즐겨찾기 전체(후보 출처) | B의 저장·삭제가 `['trips', tripId, 'saved-places']`를 무효화하면 같이 새로 받음 |
| `tripKey(tripId)`와 여행 목록 | 여행 상세·목록 | 지역 투표가 `FINALIZED`인 것을 처음 본 때 `invalidateQueries` |

`['trips', tripId]` 아래에 두어 여행 나가기의 `forgetTrip`이 투표 캐시도 같이 지운다.

## 측정할 것

- 후보를 10번 빠르게 눌렀을 때 실제로 나간 ballot 요청 수(목표: 앞 요청 하나 + 마지막 선택 하나, 최대 2번). jest에서 가짜 API 호출 수로 센다.
- 후보를 누른 뒤 표 수가 바뀌기까지 걸린 렌더 횟수(서버 응답을 기다리지 않음, 1번).

## 단위 테스트로 증명할 것

- 상태 판정: OPEN·FINALIZED 하나·FINALIZED 여럿(동률)·CLOSED NO_VOTES와 마감 시각 지난 OPEN을 각각 맞는 화면 상태로 바꾼다.
- `ballot-queue`: 요청 중 여러 번 누르면 마지막 선택 하나만 보낸다, 서버 선택과 같아지면 보내지 않는다.
- 409 `VERSION_CONFLICT` 뒤 화면 선택이 유지되고 [다시 시도]가 최신 version으로 보낸다.
- 마감 시각: 기본 24시간 뒤, 지금 이전과 30일 넘는 값 거절, 남은 시간 문구의 분·시간·일 경계.
- 지역 후보 묶기: 그룹 즐겨찾기 장소를 지역별로 묶고 장소 수를 센다, 이미 후보인 곳 제외.

## Complexity Tracking

없음. 새 패키지·새 전역 상태 없이 기존 구조를 따른다.
