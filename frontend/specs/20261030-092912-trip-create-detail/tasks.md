# Tasks: 여행 만들기와 여행 상세

**Input**: `specs/20261030-092912-trip-create-detail/` (plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md)

**순서**: 공통 기반(하단 탭, 오류 변환, 멱등 키, 서울 날짜) → S15 여행 목록(US2) → S16 새 여행(US1) → S17 여행 상세(US3) → 검사 → 기기 확인. 이야기 번호는 spec.md를 따른다. 그래서 단계 순서와 US 번호가 다르다.

**Tests**: 순수 로직(날짜·상태·묶기·표시 문구·멱등 키·오류 변환)은 구현 작업 바로 뒤에 jest 단위 테스트 작업을 둔다. 화면 테스트는 쓰지 않는다. 기기 확인은 마지막 단계에 모은다.

**진행 상태**: 2026-11-03 계획으로 이미 구현한 작업은 `[X]`다. `(C1)`~`(C7)` 표시가 붙은 `[ ]` 작업은 2026-11-04 명세·계획 갱신으로 새로 생긴 일이다([plan.md](./plan.md) "2026-11-04 명세 갱신으로 바뀐 것").

경로는 모두 `frontend/` 기준이다.

## Phase 1: Setup (하단 탭)

- [X] T001 탭 뼈대를 만든다: `src/app/(main)/(tabs)/_layout.tsx`(expo-router `Tabs` + `tabBar`에 공통 `TabBar`, 탭 키 home·trip·bookmark·chat·me ↔ 주소 home·trips·saved·chats·me), 기존 `src/app/(main)/home.tsx`를 `src/app/(main)/(tabs)/home.tsx`로 옮기고, `saved.tsx`·`chats.tsx`·`me.tsx`는 `EmptyState`("준비 중이에요") 자리 화면으로 만든다
- [X] T002 `src/app/(main)/_layout.tsx`의 Stack이 `(tabs)`와 `trips/*` 화면을 담도록 정리한다(로그인 확인 `Redirect`는 유지)

## Phase 2: Foundational (모든 이야기가 쓰는 것)

**오류 변환**

- [X] T003 [P] `src/api/types.ts`의 `ApiErrorBody.fields`를 서버와 같은 `{ field: string; message: string }[]`로 고치고 `PageResponse<T>`(`data`, `page.nextCursor`, `page.hasNext`)를 추가한다
- [X] T004 [P] `src/api/errors.ts`에 `ApiError` 타입(kind http·network·timeout, status, code, message, fields 객체, traceId)과 `toApiError(e)`, 오류 코드 상수(`PROFILE_INCOMPLETE`, `TRIP_NOT_FOUND`, `VALIDATION_ERROR`, `REQUEST_IN_PROGRESS`, `IDEMPOTENCY_KEY_REUSED`, `REGION_NOT_FOUND`)를 만든다
- [X] T005 [P] `src/api/errors.test.ts`: `{error}` 본문, 응답 없음(네트워크), `ECONNABORTED`(시간 초과), fields 배열 → 객체 변환, traceId

**멱등 키**

- [X] T006 [P] `src/api/idempotency.ts`에 `createIdempotencyKeyStore(makeKey?)`를 만든다: `keyFor(input)`은 같은 입력(JSON 비교)이면 같은 키, 바뀌면 새 키, `clear()`는 성공 뒤 버림. 기본 키는 `expo-crypto`의 `randomUUID`
- [X] T007 [P] `src/api/idempotency.test.ts`: 같은 입력 재시도 같은 키 / 입력 변경 새 키 / clear 뒤 새 키

**서울 날짜**

- [X] T008 [P] `src/lib/seoul-date.ts`에 `seoulToday(now?)`, `daysBetween(from, to)`, `formatDay(date)`(`11.14(토)`), `formatRange(start, end)`(당일이면 하루만), `addDays`를 만든다(UTC+9 고정, dayjs)
- [X] T009 [P] `src/lib/seoul-date.test.ts`: 14:59Z/15:00Z 경계에서 오늘이 바뀌는지, 요일 표시, 당일 범위
- [X] T010 [P] (C1) `src/lib/seoul-date.test.ts`에 기기 시간대와 무관함을 증명하는 경우를 더한다: 같은 `Date`(예: `2026-11-13T15:30:00Z`)에 대해 `seoulToday`가 `2026-11-14`. `TZ=PST8PDT npx jest src/lib/seoul-date.test.ts`와 `TZ=UTC`로도 통과하는지 확인한다(Git Bash. `America/Los_Angeles`처럼 `/`가 든 값은 Git Bash가 경로로 바꿔 적용되지 않는다). 서머타임 전환일을 지나는 `daysBetween`도 확인한다
- [X] T011 [P] (C1) `src/hooks/use-seoul-today.ts`: `seoulToday()`를 상태로 들고, `AppState`가 `active`로 바뀔 때 다시 구해 값이 바뀌었을 때만 갱신하는 `useSeoulToday()` 훅을 만든다(구독은 언마운트에서 해제)

**서버 상태 공통**

- [X] T012 [P] (C5) `src/api/query-focus.ts`: `AppState` → TanStack `focusManager.setFocused`, `@react-native-community/netinfo` → `onlineManager.setOnline`을 연결하는 `setupQueryFocus()`를 만들고, `src/app/_layout.tsx`에서 앱 시작 시 한 번 부른다(research R15)

**여행 공통 타입·API·규칙**

- [X] T013 `src/features/trip/types.ts`에 `Trip`, `TripStatus`, `TripMember`, `Region`, `CreateTripBody`, `TripSections`를 data-model.md대로 정의한다
- [X] T014 `src/features/trip/api.ts`에 `getMyTrips(cursor)`, `getTrip(id)`, `createTrip(body, idempotencyKey)`, `searchRegions({query, cursor})`, `getRegion(id)`를 `apiClient`로 만든다(경로는 `/me/trips` 등 `/api/v1` 뒤)
- [X] T015 [P] `src/features/trip/trip-rules.ts`에 `shortRegionName(name)`, `dDay(trip, today)`, `dayIndex(trip, today)`, `companionsLabel(members, myUserId)`, `destinationLabel(names)`를 만들고 `trip-rules.test.ts`에 테스트를 둔다
- [X] T016 (C1) `src/features/trip/trip-rules.ts`에 `tripStatus(trip, today): TripStatus`를 더한다(data-model.md "여행 상태": 기간 없음·시작 전 PLANNING, 시작~종료 ONGOING, 그 뒤 COMPLETED). `dDay`·`dayIndex`가 `trip.status` 대신 `tripStatus(trip, today)`로 판단하게 바꾼다
- [X] T017 (C1) `src/features/trip/trip-rules.test.ts`에 `tripStatus` 테스트를 더한다: 시작 전날 PLANNING / 시작일 ONGOING / 종료일 ONGOING / 종료 다음 날 COMPLETED / 기간 없음 PLANNING / 서버 `status`가 PLANNING으로 남아 있어도 날짜가 지나면 ONGOING. `dDay`·`dayIndex` 기존 테스트의 입력을 `status` 대신 날짜로 맞춘다
- [X] T018 (C3) `src/features/trip/trip-rules.ts`의 `destinationLabel`을 1곳 "부산", 2곳 "부산·강릉", 3곳 이상 "부산 외 2곳"으로 바꾸고, `trip-rules.test.ts`의 "여러 곳이면 첫 곳 외 N곳" 테스트를 1·2·3곳 세 경우로 고친다(research R14)
- [X] T019 [P] `src/features/trip/hooks/use-region-names.ts`: id 목록 → `useQueries`(`getRegion`, `staleTime: Infinity`)로 짧은 이름 목록, 고른 지역을 캐시에 미리 넣는 `primeRegion(region)`

**Checkpoint**: `npm test` 통과(errors·idempotency·seoul-date·trip-rules 기본)

## Phase 3: User Story 2 - S15 내 여행 목록 보기 (P1)

**Goal**: 여행 탭에서 여행 중·다가오는 여행 카드, 다음 계획, 다녀온 여행을 맞는 순서로 본다.

**Independent Test**: Swagger로 기간 있음 1·미정 2·여행 중 1·다녀옴 1 여행을 만든 계정으로 여행 탭을 열어 카드와 묶음을 확인한다(quickstart 1, 10, 12, 13, 20)

- [X] T020 [US2] `src/features/trip/trip-rules.ts`에 `groupTrips(trips)`와 카드용 `nextTodoLabel(trip)`(여행지 없음 "장소 모으고 투표하기", 여행지 있음 "장소 모으고 코스 짜기", 여행 중 "오늘 코스 보기", 다녀옴 "사진 올리고 정산하기")을 만든다
- [X] T021 [US2] `src/features/trip/trip-rules.test.ts`: 여행 중 우선, 다가오는 여행 선택, 다음 계획 정렬(기간 없음 뒤), 다녀온 여행 최근 순, 여행 중이 둘일 때, `nextTodoLabel`
- [X] T022 [US2] (C1) `src/features/trip/trip-rules.ts`의 `groupTrips(trips, today)`·`nextTodoLabel(trip, today)`가 `trip.status` 대신 `tripStatus(trip, today)`를 쓰게 바꾼다
- [X] T023 [US2] (C1) `src/features/trip/trip-rules.test.ts`의 `groupTrips`·`nextTodoLabel` 테스트에 `today`를 넘기고, 서버 `status`가 PLANNING인데 오늘이 시작일인 여행이 맨 위 "여행 중" 카드가 되는 경우를 더한다
- [X] T024 [US2] `src/features/trip/hooks/use-my-trips.ts`: `useInfiniteQuery(['trips','mine'])`로 받아 `groupTrips`로 묶어 돌려준다
- [X] T025 [US2] (C2) `src/features/trip/trip-rules.ts`에 `tripListState({ complete, failed, lastSections, today, trips })`를 더한다. 끝까지 받았으면 `{ kind: 'ready', sections: groupTrips(trips, today), stale: failed }`(다 받은 뒤 다시 불러오기만 실패해도 "연결이 불안정해요" 줄을 띄운다), 받는 중이면 이전에 다 받은 묶음이 있을 때 `{ kind: 'ready', sections: lastSections, stale: false }` 없으면 `{ kind: 'loading' }`, 다 받기 전에 실패했으면 이전 묶음이 있을 때 `{ kind: 'ready', sections: lastSections, stale: true }`(화면에 "연결이 불안정해요" 줄) 없으면 `{ kind: 'error' }`. 일부만 받은 `trips`로는 묶지 않는다(FR-013a, FR-016)
- [X] T026 [US2] (C2) `src/features/trip/trip-rules.test.ts`에 `tripListState` 테스트를 더한다: 첫 로딩 중 loading / 1쪽 성공 뒤 2쪽 실패하고 이전 묶음 없음 → error / 이전 묶음 있음 → 이전 묶음 + stale / 끝까지 받으면 새로 묶음 / 다시 받는 중에는 이전 묶음 유지
- [X] T027 [US2] (C2) `src/features/trip/api.ts`에 목록 전용 상수 `MY_TRIPS_LIMIT = 100`(서버 최대)을 따로 두고 `getMyTrips`만 이 값을 쓰게 한다(`PAGE_SIZE` 20은 `searchRegions`가 그대로 쓴다). 그리고 `src/features/trip/hooks/use-my-trips.ts`에서 `AUTO_LOAD_PAGES` 제한을 없애 `hasNextPage`가 false가 될 때까지 이어 받는다. 마지막으로 다 받은 묶음을 `useRef`로 기억하고, `useSeoulToday()`의 `today`와 함께 `tripListState`로 화면 상태(`loading`·`error`·`ready`+`stale`)를 돌려준다. 이어 받기가 실패하면 자동으로 더 받지 않고 다시 시도(`refetch`)를 기다린다(research R7)
- [X] T028 [P] [US2] `src/features/trip/components/upcoming-trip-card.tsx`: 파랑 카드("다가오는 여행"/"여행 중", D-day, 이름, 기간, 여행지, 동행 얼굴 `AvatarGroup`, 진행 단계 칩, `nextTodoLabel` 한 줄). 피그마 S15 기본(201:40057)
- [X] T029 [P] [US2] (C1, C7) `src/features/trip/components/upcoming-trip-card.tsx`: `today` prop을 받아 "여행 중" 여부·진행 단계 강조를 `tripStatus(trip, today)`로 정하고, 진행 단계 칩에 '게시됨'을 더하되 강조하지 않는다(research R12)
- [X] T030 [P] [US2] `src/features/trip/components/trip-row.tsx`: 날짜(없으면 "미정"), 이름, 여행지, 동행 얼굴
- [X] T031 [US2] `src/features/trip/screens/trip-list-screen.tsx`(S15): 제목 "여행", 오른쪽 [새 여행], 카드 + "다음 계획" + "다녀온 여행" 섹션 목록(`FlashList`), 당겨서 새로고침, 빈 화면 `EmptyState`([새 여행]), 데이터 있을 때 실패면 "연결이 불안정해요" 줄, 데이터 없이 실패면 `ErrorState`
- [X] T032 [US2] (C1, C2, C5) `src/features/trip/screens/trip-list-screen.tsx`: `FlashList`의 `onEndReached` 이어 받기를 없애고, `seoulToday()` 대신 `useSeoulToday()`를 쓰며, `expo-router`의 `useFocusEffect`로 탭에 돌아올 때 `refetch()`한다. 화면은 `tripListState` 결과만 보고 그린다: `loading`이면 로딩, `error`면 `ErrorState`(다시 시도 → `refetch`), `ready`이고 `stale`이면 목록 위에 "연결이 불안정해요 · 다시 불러오기" 줄. 기존 `isError && trips.length === 0` 분기는 없앤다
- [X] T033 [US2] 라우트 `src/app/(main)/(tabs)/trips.tsx`가 `TripListScreen`을 내보낸다

**Checkpoint**: 탭에서 목록을 확인하고, 줄을 누르면 상세로 간다. `npm test` 통과

## Phase 4: User Story 1 - S16 새 여행 만들기 (P1)

**Goal**: 이름만으로 여행을 만들고 상세로 간다. 기간·여행지는 선택이다.

**Independent Test**: 여행이 없는 계정으로 이름만 입력해 만들고 상세로 이동, 연타해도 1건(quickstart 2~7, 17, 18)

- [X] T034 [P] [US1] `src/features/trip/hooks/use-new-trip-draft.ts`: zustand로 `title`, `range`, `regions`, `setTitle`, `setRange`, `addRegion`(중복 무시), `removeRegion`, `reset`. `toCreateBody()`는 공백 제거한 title, 기간 없으면 날짜를 빼고, 여행지 없으면 `destinationRegionIds`를 뺀 본문
- [X] T035 [US1] `src/features/trip/hooks/use-create-trip.ts`: `useMutation`으로 `createTrip` 호출. 키는 `keyFor(body)`. 409 `REQUEST_IN_PROGRESS`면 1초 뒤 같은 키로 한 번 더. 결과를 `idle·pending·profileIncomplete·titleError·failed`로 준다. 성공하면 키 `clear`, `['trips','mine']` 무효화, 상세 캐시에 응답을 넣는다
- [X] T036 [P] [US1] `src/features/trip/components/date-range-sheet.tsx`: 공통 `BottomSheet` + `react-native-calendars` 기간 선택 + [당일][1박 2일][2박 3일] 칩, [나중에 정할게요]로 비우기, 시작일만 있으면 [완료] 비활성
- [X] T037 [P] [US1] (C4) `src/features/trip/components/date-range-sheet.tsx`: `Calendar`의 `minDate={today}`를 없애 지난 날짜도 고를 수 있게 한다. 빠른 선택 칩은 고른 시작일 기준으로 끝날을 채우는지 확인한다(research R13)
- [X] T038 [P] [US1] `src/features/trip/components/profile-incomplete-sheet.tsx`: "닉네임을 먼저 정해 주세요" 시트, [닉네임 정하기] → `/profile`, [나중에] 닫기
- [X] T039 [US1] `src/features/trip/screens/new-trip-screen.tsx`(S16): 닫기(X) 헤더, "어떤 여행을 떠나시나요?", `TextField large maxLength 200`, "언제"·"어디로" 줄(값 없으면 "나중에 정할게요"), 전체 폭 [여행 만들기](`Button xl block loading`). 이름 없음·실패 안내, 프로필 시트, 성공 시 `router.replace`로 상세, 화면을 떠나면 `reset`, `regionId` 파라미터면 미리 채움. 피그마 S16 기본(201:40272)·이름 없음(201:40323)
- [X] T040 [P] [US1] `src/features/trip/hooks/use-region-search.ts`(같은 파일에 `useDebouncedValue`, 300ms, 1자 이상일 때 `useInfiniteQuery`)
- [X] T041 [US1] `src/features/trip/screens/region-search-screen.tsx`: 검색 입력, 결과 목록(`FlashList`, 짧은 이름 + 전체 이름), 누르면 `addRegion` + `primeRegion`, 고른 지역 칩(눌러 빼기), 결과 없음 "찾는 지역이 없어요", [완료] → `router.back()`
- [X] T042 [US1] 라우트 `src/app/(main)/trips/new.tsx`, `src/app/(main)/trips/new-region.tsx`

**Checkpoint**: 이름만으로 만들기 → 상세로 이동, 연타해도 1건

## Phase 5: User Story 3 - S17 여행 상세에서 상태별 지금 할 일 (P2)

**Goal**: 상태 표 5행대로 큰 제목·단계·버튼을 보이고, 여행 메뉴로 이어진다.

**Independent Test**: 상태 표의 여행 5개(여행지 미정, 정해짐·기간 있음, 정해짐·기간 없음, 여행 중, 다녀옴)를 열어 표와 같은지 확인한다(quickstart 3, 8~11, 14~16, 19)

- [X] T043 [US3] `src/features/trip/trip-rules.ts`에 `tripDetailView(trip, regionNames, today)`(data-model.md "상세 보기")를 만들고 `trip-rules.test.ts`에 여행지 미정 / 정해짐 / 정해짐·기간 없음 / 여행 중 / 다녀옴 / 여행지 없이 여행 중 테스트를 둔다
- [X] T044 [US3] (C1) `src/features/trip/trip-rules.ts`의 `tripDetailView`가 `trip.status` 대신 `tripStatus(trip, today)`로 분기하게 바꾼다
- [X] T045 [US3] (C1, C3) `src/features/trip/trip-rules.test.ts`의 `tripDetailView` 테스트를 날짜 기준 입력으로 맞추고, 여행지 없이 다녀옴("{여행 이름}, 어땠나요?"), 여행지 2곳("부산·강릉 여행 D-n"), 서버 `status`가 PLANNING인데 오늘이 시작일("… 1일차예요") 경우를 더한다
- [X] T046 [US3] `src/features/trip/hooks/use-trip.ts`: `useQuery(['trips', id])`, 404 `TRIP_NOT_FOUND`·400이면 `notFound: true`, 재시도하지 않음
- [X] T047 [P] [US3] `src/features/trip/components/trip-hero.tsx`: 파랑 블록, 뒤로·설정 버튼, 여행 이름, 큰 제목, 날짜 칩("기간 미정"), 동행 얼굴 + 동행 줄, 초대 버튼(대상 없으면 "준비 중이에요" 토스트)
- [X] T048 [P] [US3] `src/features/trip/components/todo-steps.tsx`: "{닉네임}님, …" 인사 + 단계(완료 ✓ / 지금 / 다음) + 지금 단계 버튼, 여행 중이면 오늘 코스 자리와 [오늘 코스]
- [X] T049 [P] [US3] (C6) `src/features/trip/components/todo-steps.tsx`: 여행 중이면 오늘 코스 요약 자리에 "오늘 코스가 아직 없어요"를 보이고 [오늘 코스]는 그대로 누를 수 있게 한다(research R12)
- [X] T050 [P] [US3] `src/features/trip/components/trip-hero.tsx`: 동행 얼굴을 `members.slice(0, 4)` 대신 공통 `AvatarGroup`(`max=4`, 나머지 "+n")으로 바꾼다(명세 Edge Cases, 정원 20명)
- [X] T051 [P] [US3] `src/features/trip/components/trip-menu-grid.tsx`: 10개 메뉴 아이콘 격자(`icon.tsx`). 대상 화면이 없으면 "준비 중이에요" 토스트
- [X] T052 [US3] `src/features/trip/screens/trip-detail-screen.tsx`(S17): 위 부품 조합, 불러오는 중, `ErrorState` 다시 시도, 볼 수 없는 여행 `EmptyState`("볼 수 없는 여행이에요", [여행 목록으로]). 피그마 S17 프레임(201:40398, 201:40550, 201:40677, 201:40848, 201:41018)
- [X] T053 [US3] (C1) `src/features/trip/screens/trip-detail-screen.tsx`: `seoulToday()` 대신 `useSeoulToday()`를 써서 앱이 다시 앞으로 오면 큰 제목·단계를 새로 계산한다
- [X] T054 [US3] 라우트 `src/app/(main)/trips/[tripId].tsx`가 `TripDetailScreen`을 내보낸다

**Checkpoint**: 상태 표 5행 모두 확인, `npm test` 통과

## Phase 6: Polish

- [X] T055 [P] 측정용으로 개발 모드(`__DEV__`)에서만 `POST /trips`·`GET /me/trips` 요청을 콘솔에 남기는 요청 로그를 `src/api/client.ts`에 더한다(quickstart 시나리오 4·13 요청 수)
- [X] T056 `frontend/`에서 `npm run typecheck`, `npm run lint`, `npm test`를 모두 통과시킨다(C1~C7 반영 뒤 다시)

## Phase 7: 기기 확인 (마지막)

안드로이드 개발 빌드 + 로컬 백엔드(quickstart.md "준비")로 확인하고, 결과와 측정값을 `quickstart.md` "측정 기록" 아래에 적는다.

- [ ] T057 S15 목록 확인: quickstart 시나리오 1, 10, 12, 13, 20을 실행하고 `specs/20261030-092912-trip-create-detail/quickstart.md`에 결과를 적는다
- [ ] T058 S16 새 여행 확인: quickstart 시나리오 2~7, 17, 18을 실행하고(시나리오 4는 `POST /trips` 요청 수·여행 수) `specs/20261030-092912-trip-create-detail/quickstart.md`에 결과를 적는다
- [ ] T059 S17 상세 확인: quickstart 시나리오 3, 8, 9, 11, 14, 15, 16, 19를 실행하고 `specs/20261030-092912-trip-create-detail/quickstart.md`에 결과를 적는다
- [ ] T060 preview 빌드에서 여행 50개 목록 스크롤을 Flashlight로 1번 기록해 기준 FPS를 `specs/20261030-092912-trip-create-detail/quickstart.md`에 적는다

## Dependencies

- Phase 1 → Phase 2 → 이야기들 → Phase 6 → Phase 7
- Phase 2 안: T016(`tripStatus`) → T017 → T018. 세 작업은 같은 파일(`trip-rules.ts`·`trip-rules.test.ts`)을 고친다. T011(`useSeoulToday`)은 T027·T032·T053보다 먼저
- US2(S15): Phase 2만 필요. T022 → T023 → T025 → T026, T025·T011 → T027 → T032. 목록의 [새 여행]은 US1 화면으로 간다(이미 있음)
- US1(S16): Phase 2만 필요. 남은 일은 T037 하나이고 다른 작업과 겹치지 않는다
- US3(S17): T016 뒤에 T044 → T045. T011 → T053
- T022·T025·T044는 같은 파일(`trip-rules.ts`)이고 T023·T026·T045도 같은 파일이다. 동시에 하지 않는다
- Phase 7은 T056 통과 뒤

## Parallel Examples

- Phase 2 남은 일: T010·T011·T012를 동시에, 그와 함께 T016 → T017 → T018 차례로
- US2: T029(카드)과 T027(훅)를 동시에 → T032
- US1·US3: T037(기간 시트)·T049(오늘 코스 줄)·T050(상단 동행 얼굴)는 서로 다른 파일이라 US2 작업과 동시에 해도 된다
- Phase 7: T057~T059은 같은 기기에서 차례로, T060은 preview 빌드가 따로 필요

## Implementation Strategy

1. **기반 마무리**: T010~T012, T016~T018 → `npm test`. 상태·날짜 규칙이 여기서 바뀌므로 먼저 끝낸다
2. **S15 (MVP 입구)**: T022~T032. 모두 받기·중간 실패·돌아오면 새로 받기를 확인한다
3. **S16**: T037
4. **S17**: T044~T053
5. **검사**: T055·T056
6. **기기 확인**: T057~T060. 결과는 측정값과 함께 남긴다(포트폴리오 기록용, 실제 값만)
