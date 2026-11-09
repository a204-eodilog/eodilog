# Tasks: 지역·장소 투표

**Input**: `specs/20261109-094657-poll-vote/` 의 spec.md, plan.md, research.md, data-model.md, contracts/

**Tests**: 요청됨. 순수 규칙마다 jest 테스트, 단계 끝마다 RNTL 테스트와 `/dev/polls` 확인.

**단계 끝 확인**: `npm test -- src/features/poll`, `npm run typecheck`, `npm run lint`를 통과시킨 뒤 체크한다.

## Phase 1: Setup

- [X] T001 투표 기능 폴더 `src/features/poll/`와 `hooks/`·`components/`·`screens/`를 만들고 `src/features/poll/index.ts`에 공개할 것(화면, 라우트용 함수)만 내보낸다

## Phase 2: Foundational

- [X] T002 [P] `src/features/poll/types.ts`에 data-model의 `Poll`, `PollCandidate`, `PollType`, `PollStatus`, `CandidateInput`, `SavedPlace`, `SavedPlacePage`, `Place`, `CandidateOption` 타입 정의
- [X] T003 [P] `src/api/errors.ts`의 `API_ERROR`에 `POLL_CLOSED`, `POLL_NOT_FOUND` 추가(설명 주석 포함)
- [X] T004 `src/features/poll/api.ts`에 contracts/poll-api.md의 7개 함수 구현: `getPolls`, `getPoll`, `createPoll`, `replaceBallot`, `addCandidate`, `getPlace`, `getTripSavedPlaces`(감싸지 않은 응답, cursor로 끝까지)
- [X] T005 [P] `src/features/poll/hooks/poll-keys.ts`에 `pollsKey(tripId)`, `pollKey(tripId, pollId)`, `placeKey(placeId)`, `pollSourceKey(tripId)` 정의, 모두 plan 쿼리 키 표대로
- [X] T006 `src/features/poll/poll-rules.ts`에 화면 상태 판정 `pollViewState(poll, now)`(none·open·closing·decided·tie·noVotes), 남은 시간 문구 `remainingLabel`(분·시간·일), 마감 기본값 `defaultClosesAt(now)`, 범위 검사 `validateClosesAt(value, now)`(past·tooFar), 마감 문구 `closesAtLabel`("10.28(수) 21:00 마감 · 24시간 뒤"), 자동 제목 `pollTitle(type)`, 새 후보 판정 `isNewCandidate`, 득표 비율 `voteRatio`, 최다 후보 `topCandidateIds`
- [X] T007 [P] `src/features/poll/poll-rules.test.ts`에 T006 규칙 테스트: 상태 6가지, 남은 시간 경계 59분·1시간·23시간·1일, 마감 기본 24시간, 지금 이전·정확히 30일·30일 1분, 새 후보 1분 경계, 동률 최다
- [X] T008 `src/features/poll/ballot-queue.ts`에 표 저장 합치기: 보내는 중 하나 + 다음 선택 하나, 끝나면 서버 선택과 다를 때만 보냄, 실패 콜백
- [X] T009 [P] `src/features/poll/ballot-queue.test.ts`: 요청 중 10번 눌러도 요청 최대 2번, 마지막 선택이 저장됨, 서버 선택과 같아지면 보내지 않음, 실패 뒤 다음 선택 처리
- [X] T010 `src/features/poll/candidate-options.ts`에 그룹 즐겨찾기 → 후보 줄 만들기: 장소 투표는 장소 이름·주소, 지역 투표는 `regionId`로 묶고 "그룹 즐겨찾기 N곳", 이미 후보인 곳 제외
- [X] T011 [P] `src/features/poll/candidate-options.test.ts`: 지역 묶기와 장소 수, regionId 없는 장소 제외, 이미 후보 제외, 순서는 장소 수 많은 순
- [X] T012 `src/api/dev-mock-poll.ts`에 테스트 모드 가짜 투표 서버: 목록·상세·열기·내 선택(version 검사, 마감 검사)·후보 추가, `GET /places/{id}`, `GET /trips/{id}/saved-places`, 조작 `addCandidateByOther()`, `closeNow(kind)`, `reset()`. `src/api/dev-mock.ts`의 `handle`에 한 줄로 연결하고 `__devMock.poll`에 조작 노출
- [X] T013 [P] `src/features/poll/hooks/use-candidate-names.ts`: 지역은 기존 `useRegions`, 장소는 `useQueries`로 `getPlace`(staleTime Infinity), 후보 ID → 이름 맵, 못 받으면 "알 수 없는 곳"
- [X] T014 [P] `src/features/poll/hooks/use-saved-places.ts`: `pollSourceKey`로 그룹 즐겨찾기 전체를 받는 훅

## Phase 3: User Story 2 - 투표 열기 (P1)

**Goal**: 빈 상태에서 N8로 후보를 골라 투표를 연다.

**Independent Test**: 투표가 없는 가짜 여행에서 S22 빈 상태 → N8 → 지역 두 곳 → [투표 열기] → 진행 중 화면.

- [X] T015 [P] [US2] `src/features/poll/hooks/use-polls.ts`: 목록 받기와 대표 투표 고르기 `pickPoll`(진행 중 최근 → 최근 → 없음), `poll-rules.ts`에 `pickPoll` 추가하고 T007 테스트에 경우 3개 더함
- [X] T016 [US2] `src/features/poll/hooks/use-open-poll.ts`: `createPoll` 뮤테이션, 성공하면 목록 무효화와 새 투표 캐시 넣기, 400 필드 오류를 돌려줌, 요청 중 `isPending`
- [X] T017 [P] [US2] `src/features/poll/components/closes-at-picker.tsx`: datetimepicker로 날짜 → 시각, `validateClosesAt`로 막고, 웹은 "기기에서 바꿀 수 있어요" 안내
- [X] T018 [US2] `src/features/poll/components/open-poll-sheet.tsx` N8(Figma 385-560): 지역·장소 칩, 시트 제목, "후보 N곳 · 여러 곳을 고를 수 있어요", 후보 줄과 체크, 30곳 제한 안내, 마감 카드(마감 문구·자동 확정 안내·[눌러서 마감 시각 바꾸기]), [투표 열기] 비활성 규칙, 빈 즐겨찾기 안내, 서버 거절 문구
- [X] T019 [US2] `src/features/poll/components/poll-views.tsx`에 `PollEmptyView`(Figma 201-10579): 체크 아이콘 원, "진행 중인 투표가 없어요", 설명 두 줄, [후보 고르러 가기]
- [X] T020 [US2] `src/features/poll/screens/poll-screen.tsx` 뼈대: 헤더("지역 투표"·"장소 투표"·"투표" + 여행 이름), 로딩·오류·빈 상태·N8 열기, 열기 성공 시 그 투표 주소로 바꾸기
- [X] T021 [US2] 라우트 `src/app/(main)/trips/[tripId]/polls/index.tsx`, `src/app/(main)/trips/[tripId]/polls/[pollId].tsx` 추가(화면만 감싸는 얇은 파일)
- [X] T022 [US2] `src/app/dev/polls.tsx` 미리보기 시작: N8, 진행 중인 투표 없음
- [X] T023 [US2] `src/features/poll/screens/poll-screen.test.tsx` RNTL: 빈 상태 → [후보 고르러 가기] → N8에서 두 곳 고르고 [투표 열기] → 진행 중 제목이 보임, 0곳이면 버튼 비활성, 두 번 눌러도 createPoll 1번

## Phase 4: User Story 1 - 표 던지기 (P1)

**Goal**: 진행 중 투표에서 후보를 눌러 선택을 바꾸고, 충돌·끊김에서 선택을 지킨다.

**Independent Test**: 가짜 투표에서 후보 두 곳을 눌러 표 수가 바로 바뀌고, `addCandidateByOther()` 뒤 누르면 실패 안내와 [다시 시도]가 보인다.

- [X] T024 [P] [US1] `src/features/poll/hooks/use-poll.ts`: 투표 하나 받기, 앱 복귀 시 다시 받기, `closing`이면 다시 받기, 404면 `notFound`
- [X] T025 [US1] `src/features/poll/hooks/use-ballot.ts`: 낙관적 선택(표 수·내 선택을 화면용으로 계산), `ballot-queue`로 저장, 409 VERSION_CONFLICT는 다시 받고 선택 유지 + 실패 상태, 409 POLL_CLOSED는 다시 받고 마감 안내, 끊김은 저장된 선택으로 되돌림 + 실패 상태, [다시 시도]
- [X] T026 [P] [US1] `src/features/poll/hooks/use-ballot.test.tsx`: 연달아 누름 요청 수, VERSION_CONFLICT 뒤 선택 유지와 다시 시도 version, POLL_CLOSED 뒤 결과, 끊김 되돌림
- [X] T027 [P] [US1] `src/features/poll/components/poll-header-card.tsx` 진행 중 카드(Figma 201-10912): '투표 중' 태그, 남은 시간, 제목, "N명 투표했어요", "N명 아직이에요"
- [X] T028 [P] [US1] `src/features/poll/components/candidate-row.tsx`: 체크 원, 이름, '내 선택'·'새 후보'·'가장 많이' 태그, 보조 줄(새 후보 설명·그룹 즐겨찾기 N곳), 표 수, 막대, 눌림·비활성, 접근성 라벨
- [X] T029 [P] [US1] `src/features/poll/components/my-vote-bar.tsx`: "부산에 투표했어요"·"2곳 투표했어요" 요약, [취소], [바꾸기](목록 맨 위로), 고른 것 없으면 "후보를 눌러 투표해요"
- [X] T030 [US1] `src/features/poll/components/poll-views.tsx`에 `PollOpenView`: 카드, "후보 N곳 여러 곳 골라도 돼요", 후보 목록, [+ 후보 추가] 자리, 하단 요약, 실패 토스트(Figma 201-29384 "○○으로 바꾸지 못했어요. ○○ 투표는 그대로예요" + [다시 시도])
- [X] T031 [US1] `poll-screen.tsx`에 진행 중 상태 연결과 `/dev/polls`에 진행 중·투표 바꾸기 실패 추가
- [X] T032 [US1] `poll-screen.test.tsx`에 진행 중 RNTL: 후보 누르면 표 수와 '내 선택' 바뀜, 충돌 뒤 실패 안내와 선택 유지, [취소]

## Phase 5: User Story 3 - 진행 중 후보 추가 (P2)

**Goal**: 동행 누구나 진행 중에 후보를 넣는다.

**Independent Test**: [+ 후보 추가] → 한 곳 고르고 [후보에 넣기] → 맨 아래 '새 후보'.

- [X] T033 [US3] `src/features/poll/hooks/use-add-candidates.ts`: 고른 후보를 차례로 `addCandidate`, VERSION_CONFLICT면 다시 받아 한 번 재시도, 이미 있음·30개 400은 건너뜀, POLL_CLOSED면 중단하고 결과, 요청 중 비활성
- [X] T034 [US3] `src/features/poll/components/add-candidate-sheet.tsx`(Figma 418-188): "후보 추가", "지역 투표 · 여러 곳을 골라 넣을 수 있어요", 후보 줄과 체크, "넣으면 투표 중인 동행에게 알려요", [후보에 넣기], 고를 곳 없음 안내
- [X] T035 [US3] `PollOpenView`에 [+ 후보 추가] 점선 버튼(30곳이면 숨김)과 시트 연결, '새 후보' 표시(Figma 385-2305), `/dev/polls`에 후보 추가 시트·진행 중 후보 추가됨 추가
- [X] T036 [US3] `src/features/poll/hooks/use-add-candidates.test.tsx`와 `poll-screen.test.tsx` 후보 추가 경우: 넣기 성공 뒤 '새 후보', 충돌 한 번 재시도, 이미 있는 후보 건너뜀

## Phase 6: User Story 4 - 마감 결과 (P1)

**Goal**: 마감된 투표를 결과 종류별로 보이고, 지역 확정 뒤 여행 캐시를 새로 한다.

**Independent Test**: `closeNow('decided'|'tie'|'noVotes')` 뒤 S22가 맞는 결과를 보이고, 지역 확정이면 S17 여행지가 바뀐다.

- [X] T037 [P] [US4] `poll-rules.ts`에 결과 문구 `resultHeadline`(자동 확정·동률 "부산과 강릉이 1표씩 같아요"·0표), `notVotedLine`, `decidedLine` 추가하고 T007 테스트에 경우 추가
- [X] T038 [US4] `poll-header-card.tsx`에 마감 카드(Figma 201-11073, 201-11213): '마감' 태그, 마감 시각, 결과 제목, 보조 줄
- [X] T039 [US4] `poll-views.tsx`에 `PollDecidedView`(마감 후 자동 확정 201-11073, 결과 목록 + [확정된 여행지 보기]), `PollDecidedCardView`(여행지 확정 201-11569, 초록 확정 카드 + "투표 결과" + [장소 모으고 코스 짜기]), `PollTieView`(201-11213, "부산과 강릉을 모두 확정했어요" 줄 + 결과 + [코스에서 날짜별로 나누기]), `PollNoVotesView`(201-11494, [다시 열기]·[직접 정하기]·안내)
- [X] T040 [US4] `src/features/poll/poll-routes.ts`: 아직 없는 화면 버튼은 '준비 중이에요' 토스트, [직접 정하기]는 `settings-region`
- [X] T041 [US4] `use-poll.ts`에 지역 투표 FINALIZED 첫 확인 때 `tripKey`와 여행 목록 무효화, `use-open-poll.ts`에 [다시 열기](같은 유형·제목·후보, 24시간 뒤)
- [X] T042 [US4] `poll-screen.tsx`에 결과 상태 연결, 지역 투표 결과 화면에서 [확정된 여행지 보기]를 누르면 같은 화면이 여행지 확정 카드로 바뀜(장소 투표는 버튼 없음), `/dev/polls`에 마감 후 자동 확정·동률·0표·여행지 확정 추가
- [X] T043 [US4] `poll-screen.test.tsx` 결과 RNTL: 세 결과 문구, [다시 열기]가 createPoll을 같은 후보로 부름, 지역 확정 시 여행 캐시 무효화

## Phase 7: User Story 5 - 진입 연결 (P2)

- [X] T044 [P] [US5] `src/features/trip/components/trip-menu-grid.tsx`의 'poll' 메뉴에 `/trips/[tripId]/polls`로 가는 `open` 추가
- [X] T045 [P] [US5] `src/features/chat/system-card-routes.ts`에 `poll` 이동: 대상 투표 ID가 있으면 `/trips/[tripId]/polls/[pollId]`, 없으면 목록 주소
- [X] T046 [US5] `poll-views.tsx`에 `PollNotFoundView`("볼 수 없는 투표예요" + 뒤로), `poll-screen.tsx`에서 404에 연결, `/dev/polls`에 추가
- [X] T047 [US5] 진입 테스트: `trip-menu-grid` 투표 메뉴 이동, 시스템 카드 이동, 404 안내

## Phase 8: Polish

- [X] T048 긴 제목·긴 후보 이름 말줄임, 후보 30곳 스크롤 끝이 하단 요약에 가려지지 않음, 안전 영역, 터치 영역 44, 접근성 라벨 점검과 수정(`/dev/polls`에 긴 예시 추가)
- [X] T049 `specs/20261109-094657-poll-vote/quickstart.md`를 구현 결과에 맞게 고침(가짜 서버 조작 이름 등)
- [X] T050 전체 `npm test`, `npm run typecheck`, `npm run lint` 통과
- [ ] T051 (사용자) 로컬 백엔드(`EodiLog/dev-up.cmd`) + 웹 실서버 모드(`expo-web-live`)로 quickstart 실서버 순서 확인
- [ ] T052 (사용자) 안드로이드 기기 확인(마지막): 마감 시각 선택기, 두 계정 투표

## Dependencies

- Phase 2가 모든 이야기보다 먼저다.
- US2(열기)가 S22 화면 뼈대를 만들어 US1·US3·US4가 그 위에 붙는다.
- US3은 US1의 진행 중 화면이 있어야 한다. US4는 US1과 따로 해도 되지만 화면 뼈대(T020)가 필요하다.
- US5는 라우트(T021)만 있으면 된다.

## Parallel Examples

- Phase 2: T002·T003·T005 동시에, T007·T009·T011 테스트 동시에
- US1: T027·T028·T029 부품 동시에
- US5: T044·T045 동시에

## Implementation Strategy

MVP는 Phase 2 + US2 + US1(투표 열고 표 던지기). 이어서 US4 결과, US3 후보 추가, US5 연결, Polish 순서로 붙인다. 단계마다 테스트·타입·린트를 통과시키고 커밋한다.

## Phase 9: Convergence

- [X] T053 N8과 후보 추가 시트 제목 오른쪽에 닫기 버튼 44를 두어 Figma 385-560·418-188처럼 시트를 닫을 수 있게 한다 in src/features/poll/components/open-poll-sheet.tsx, add-candidate-sheet.tsx per FR-009 (partial)
- [X] T054 결과 화면 초록 확정 줄의 '가장 많이' 태그가 줄 배경과 같은 색이라 보이지 않는 문제를 고쳐 Figma 201-11073처럼 연한 초록 면에 진한 초록 글자로 보이게 한다 in src/features/poll/components/candidate-row.tsx per US4/AC1 (partial)
- [X] T055 N8 장소 후보 줄에 담은 동행 얼굴과 이름("세은, 승기")을 savedBy.memberId와 여행 동행 목록으로 찾아 보인다 in src/features/poll/components/option-row.tsx, open-poll-sheet.tsx per US2/AC4 (partial)

## Phase 10: Review 1

- [X] T056 dev/polls 미리보기를 주소 ?state=상태이름으로 바로 열 수 있게 해 상태마다 같은 조건으로 화면을 찍어 Figma와 비교한다 in src/app/dev/polls.tsx
- [X] T057 후보 줄 이름 옆 '내 선택'·'새 후보'·'가장 많이' 태그를 이름과 세로 가운데로 맞춘다 in src/features/poll/components/candidate-row.tsx
- [X] T058 여행지 확정 카드 화면의 결과 목록에서 '내 선택' 태그를 숨겨 Figma 201-11569와 맞춘다 in src/features/poll/components/poll-views.tsx, screens/poll-screen.tsx
- [X] T059 0표 화면 [다시 열기] 버튼을 가운데로 맞춘다 in src/features/poll/components/poll-views.tsx
- [X] T060 투표 바꾸기 실패 안내 중에는 [+ 후보 추가]를 숨겨 Figma 201-29384와 맞춘다 in src/features/poll/components/poll-views.tsx
- [X] T061 미리보기에서 주소로 바로 연 N8·후보 추가 시트가 그린 뒤 열리게 한다 in src/app/dev/polls.tsx

## Phase 11: Review 2

- [X] T062 투표 카드 제목과 결과 제목이 좁은 화면에서 낱말 가운데서 끊기지 않게 한글 낱말 단위 줄바꿈을 준다 in src/features/poll/components/poll-header-card.tsx, poll-views.tsx
- [X] T063 결과 목록 후보 줄 tone 계산을 resultTone 함수로 빼고 죽은 갈래를 지운다 in src/features/poll/components/poll-views.tsx
- [X] T064 투표 바꾸기 실패 안내의 [다시 시도] 누르는 자리를 44 이상으로 한다 in src/features/poll/components/poll-views.tsx
