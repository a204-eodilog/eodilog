# Research: 여행 만들기와 여행 상세

백엔드 계약은 `EodiLog/src/main/java` 코드를 기준으로 확인했다(2026-11-03, 2026-11-04 다시 확인). 문서와 다르면 코드를 따른다. 목록 경로는 `GET /api/v1/me/trips`다. `/trips`에는 목록 GET이 없다.

2026-11-04 명세 보완으로 R6·R7·R12를 고치고 R13~R16을 더했다.

## R1. 화면 주소와 탭

- **Decision**: `(main)` Stack 안에 `(tabs)` 그룹을 두고 Tabs의 `tabBar`에 공통 `TabBar`를 넣는다. 탭 첫 화면은 `home`·`trips`·`saved`·`chats`·`me`. S16(`/trips/new`)·여행지 검색(`/trips/new-region`)·S17(`/trips/[tripId]`)은 탭 밖 Stack 화면이라 하단 탭이 보이지 않는다.
- **Rationale**: 공통 `TabBar`가 "각 탭의 첫 화면에만 보인다"는 규칙을 가진다. 탭 밖 Stack에 두면 상세·입력 화면에서 탭이 자동으로 숨는다. -55(내비게이션 뼈대)가 영광 담당이다.
- **Alternatives**: 각 탭마다 내부 Stack — 화면이 탭마다 중복되고 상세에서 탭 숨김 처리가 더 필요해 버림.

## R2. 만든 뒤 이동과 뒤로 가기 (FR-007)

- **Decision**: 성공하면 `router.replace('/trips/{id}')`로 S16을 상세로 바꾼다. 여행지 검색 화면은 S16 위에 쌓였다가 고르면 `router.back()`.
- **Rationale**: S16을 스택에서 지워야 상세에서 뒤로 가면 들어온 곳(여행 목록 또는 홈)으로 간다.

## R3. 멱등 키 (FR-006, SC-002)

- **Decision**: `createIdempotencyKeyStore()`가 "지금 만들려는 입력"의 키를 기억한다. 같은 입력으로 다시 보내면 같은 키, 입력이 바뀌면 새 키(`expo-crypto.randomUUID`), 성공하면 버린다. 요청 중에는 버튼을 `loading`으로 잠근다.
- **Rationale**: 서버는 같은 키 + 같은 본문이면 저장된 201을 다시 주고, 같은 키 + 다른 본문이면 409 `IDEMPOTENCY_KEY_REUSED`, 처리 중이면 409 `REQUEST_IN_PROGRESS`를 준다. 실패하면 기록이 지워져 같은 키로 다시 보낼 수 있다. 요청마다 새 키를 만들면 응답을 못 받고 다시 보낸 경우 여행이 두 개 생긴다.
- **409 `REQUEST_IN_PROGRESS`**: 첫 요청이 아직 처리 중이라는 뜻이다. 1초 뒤 같은 키로 한 번 더 보내 저장된 결과를 받는다.
- **Alternatives**: 요청마다 새 UUID(팀 문서 문구) — 시간 초과 뒤 재시도에서 중복이 생겨 버림.

## R4. 공통 오류 변환

- **Decision**: `toApiError(e)`가 axios 오류를 `{ kind: 'http' | 'network' | 'timeout', status, code, message, fields: Record<string,string>, traceId }`로 바꾼다. 서버 `fields`는 배열 `[{field, message}]`이라 객체로 바꾼다. 기존 `ApiErrorBody` 타입의 `fields`도 배열로 고친다.
- **Rationale**: 화면은 코드로만 분기한다(`PROFILE_INCOMPLETE`, `TRIP_NOT_FOUND`, `VALIDATION_ERROR`). `traceId`는 오류 안내에 같이 남겨 백엔드와 같은 요청을 찾는다.

## R5. 403 프로필 미완성 (FR-009)

- **Decision**: `useCreateTrip`이 403 `PROFILE_INCOMPLETE`를 받으면 `profileIncomplete` 상태로 바꾸고 화면이 시트를 연다. [닉네임 정하기]는 `/profile`, [나중에]는 시트만 닫는다. 입력은 스토어에 남는다.
- **Rationale**: 로그인 흐름상 가입을 마친 사람만 `(main)`에 들어오지만, 서버 기준이 최종이다. 앱 전체 처리(어느 요청이든 403이면 프로필로)는 A의 로그인 범위라 이 명세에서는 만들기 화면만 처리한다.

## R6. 여행 상태·D-day·날짜 표시

- **Decision (11-04 고침)**: 상태도 D-day·"n일차"처럼 앱이 기간과 서울 오늘로 계산한다. `tripStatus(trip, today)`는 백엔드 정책 P-2와 같은 규칙을 쓴다: 기간 없음 → PLANNING, 오늘 < 시작 → PLANNING, 시작 ≤ 오늘 ≤ 종료 → ONGOING, 그 밖 → COMPLETED. 서버 `status`는 타입에만 남기고 화면에는 쓰지 않는다. 서울 오늘은 `useSeoulToday()`가 준다. 이 훅은 AppState가 `active`로 바뀔 때마다 다시 구한다.
- **왜 바꿨나**: 서버 `status`는 응답을 받은 시각의 값이다. 화면을 열어 둔 채 자정이 지나거나, 연결이 끊겨 캐시만 보이는 경우 틀린 상태가 남는다(FR-018a). 같은 규칙을 앱에서 쓰면 다시 받지 않아도 맞는다. D-day는 어차피 앱이 계산하므로 상태와 D-day가 서로 어긋나지도 않는다. 서울 날짜는 현재 UTC 시각에 9시간을 더한 날짜로 구한다(한국은 서머타임이 없다). 날짜 문자열(`YYYY-MM-DD`)끼리의 일 수 차이는 `dayjs`로 계산한다. 표시 형식은 `11.14(토)`, 기간은 `11.14(토) – 11.15(일)`.
- **Rationale**: 서버는 D-day를 주지 않는다. 상태 경계가 서버(Asia/Seoul)와 같아야 한다. 고정 +9시간은 기기 시간대 설정이나 Intl 지원에 영향을 받지 않고 테스트에서 시각을 넣기 쉽다.
- **Alternatives**: dayjs `timezone` 플러그인 — Intl 시간대 데이터에 기대고 결과가 같아서 버림.

## R7. 목록 묶기와 모두 받기 (FR-011~013a)

- **Decision (11-04 고침)**: `GET /me/trips`를 `useInfiniteQuery`로 받는다. `limit`은 서버 최대인 100으로 하고 `page.hasNext`가 false가 될 때까지 이어서 받는다. 쪽 수 제한은 두지 않는다. 다 받기 전에는 묶음을 보이지 않는다. 처음이면 로딩을, 전에 다 받은 캐시가 있으면 그 캐시를 보인다. 다 받으면 `groupTrips(trips, today)`로 묶는다:
  - 맨 위 카드: 여행 중 가운데 시작일이 가장 이른 것. 없으면 다가오는 여행(기간 있는 PLANNING 가운데 시작일이 가장 가까운 것)
  - 다음 계획: 나머지 여행 중·PLANNING. 시작일 순이고 기간 없는 여행은 뒤
  - 다녀온 여행: COMPLETED. 종료일이 늦은 순
  - 목록 끝의 `onEndReached` 이어 받기는 없앤다.
- **Rationale**: 서버는 만든 순서로만 준다. 그래서 일부만 받으면 오래전에 만든 여행 중이 맨 위 카드에서 빠질 수 있다(FR-013a는 이를 금지). 한 사람의 여행은 보통 수십 개라 `limit=100`이면 요청 1번이다. 300개여도 3번이다.
- **Alternatives**:
  - 상태별로 따로 받기(`status=ONGOING` 등): 상태마다 요청이 늘어난다. 서버 정렬도 여전히 만든 순서라 다녀온 여행은 결국 다 받아야 해서 버렸다.
  - 백엔드에 시작일 정렬 요청: 가장 깔끔하지만 계약 변경이라 '백엔드에 요청할 것'에 남긴다.

## R8. 지역 이름

- **Decision**: 여행 응답에는 `destinationRegionIds`만 있다. `useRegionNames(ids)`가 `GET /regions/{id}`를 id마다 `useQueries`로 부르고 `staleTime: Infinity`로 캐시한다. 보여 줄 때는 `name`의 마지막 단어를 쓰고, 광역 단위면 "특별시·광역시·특별자치시·특별자치도·도"를 뗀다(예: "부산광역시" → "부산", "강원특별자치도 강릉시" → "강릉시").
- **Rationale**: 지역 이름은 바뀌지 않아 한 번 받으면 다시 부를 필요가 없다. 여행지 검색에서 고른 지역은 미리 캐시에 넣어 상세 첫 화면에서 다시 부르지 않는다.
- **Alternatives**: 백엔드에 지역 이름 포함 요청 — 좋지만 계약 변경이라 요청 목록에 남긴다.

## R9. 여행지 검색

- **Decision**: 입력 300ms 뒤 `GET /regions?query=`(작은 `useDebouncedValue` 훅, 새 라이브러리 없음). 결과를 누르면 선택에 더하고(같은 지역은 한 번만), 위쪽 칩으로 보여 준다. [완료]로 S16에 돌아간다.
- **Rationale**: 서버 검색은 이름 부분 일치이고 `query`는 1자 이상 필수다.

## R10. 기간 시트

- **Decision**: 공통 `BottomSheet` 안에 `react-native-calendars`의 기간 선택. 위에 [당일] [1박 2일] [2박 3일] 칩: 시작일을 먼저 고르면 그 기준으로 끝날을 채운다. 시작일만 고른 상태에서는 [완료]를 막는다.
- **Rationale**: Figma S16 기간 선택 프레임과 같다. 시작·종료는 둘 다 있거나 둘 다 없어야 한다.

## R11. 끊긴 연결에서 목록 유지 (FR-016)

- **Decision**: TanStack Query는 다시 불러오기에 실패해도 마지막 데이터를 남긴다. `isError && data`이면 목록 위에 "연결이 불안정해요 · 다시 불러오기" 줄을 보인다. 데이터가 없으면 공통 `ErrorState`.

## R12. 아직 없는 기능과 연결할 자리

- **Decision**: 아직 없는 기능 자리는 아래처럼 둔다.
  - 다녀온 여행 사진: 사진 기능(S31)이 없으므로 파랑 블록
  - 새 소식 점: 각 기능이 없으므로 보이지 않음
  - (11-04 추가) 여행 중 상세의 오늘 코스 요약: "오늘 코스가 아직 없어요" 줄
  - (11-04 추가) S15 진행 단계의 '게시됨': 강조하지 않음. 다녀온 여행은 '다녀옴'까지 강조
  - (11-04 추가) 다녀온 여행 단계: 늘 '사진 올리기'가 지금 단계
  - 지금 단계 버튼·여행 메뉴·초대·설정의 대상 화면이 없으면 `toast.show('준비 중이에요')`
- **Rationale**: 명세 Assumptions. 각 기능 명세가 연결할 곳을 찾기 쉽게 `TodoTarget`과 메뉴 항목 키에서 한 곳(`trip-rules.ts`·`trip-menu-grid.tsx`)만 바꾸면 되게 한다.

## R13. 지난 날짜 선택

- **Decision**: 기간 시트의 `minDate` 제한을 없애 지난 날짜도 고르게 한다. 빠른 선택 칩은 고른 시작일을 기준으로 끝날을 채운다.
- **Rationale**: 서버는 시작 ≤ 종료만 검사한다(P-1). 이미 다녀왔거나 어제 출발한 여행을 뒤늦게 만들어 사진·경비를 정리하는 경우를 막지 않는다(명세 Edge Cases).
- **Alternatives**: 오늘부터만 고르기(11-03 구현) — 위 경우를 막아서 버렸다.

## R14. 여행지·동행 표시 줄이기

- **Decision**: `destinationLabel(names)`는 1곳이면 "부산", 2곳이면 "부산·강릉", 3곳 이상이면 "부산 외 2곳"으로 보인다. 큰 제목·카드·목록 줄이 모두 이 함수를 쓴다. 동행 얼굴은 `AvatarGroup max=4`로 보이고 나머지는 "+n"으로 줄인다. 동행 이름 줄은 기존 `companionsLabel`을 쓴다.
- **Rationale**: 두 곳까지는 한 줄에 들어가 "외 1곳"보다 정보가 많다.

## R15. 돌아왔을 때 새로 받기 (FR-016a)

- **Decision**: 세 가지로 처리한다.
  - `src/api/query-focus.ts`에서 AppState를 TanStack `focusManager`에, NetInfo를 `onlineManager`에 연결한다. 앱이 다시 앞으로 오면 오래된 쿼리를 다시 받고, 연결이 돌아오면 멈춘 요청을 다시 보낸다.
  - S15는 `useFocusEffect`로 탭에 돌아올 때 `refetch()`한다.
  - 만들기에 성공하면 기존처럼 목록 캐시를 무효화한다.
- **Rationale**: React Native에는 브라우저의 창 포커스가 없어서 TanStack 기본 동작만으로는 앱 복귀·연결 복구 때 다시 받지 않는다. 두 패키지는 이미 설치돼 있다.

## R16. 연결 끊김과 캐시 범위 (SC-007)

- **Decision**: 메모리 캐시만 쓴다. 앱을 쓰는 중에 연결이 끊기면 마지막 목록과 "연결이 불안정해요"를 보인다. 앱을 새로 켤 때는 오프라인 목록을 보장하지 않는다.
- **Rationale**: 기기 저장(persister)을 더하면 로그아웃 시 지우기와 버전 관리가 따라온다. 명세는 앱을 쓰는 중의 연결 끊김만 요구한다(SC-007).

## 백엔드에 요청할 것 (이 명세에서 발견)

- 여행 응답에 지역 이름(`destinations: [{id, name}]`)을 함께 주면 상세·목록에서 지역 요청이 사라진다
- `GET /me/trips`에 시작일 기준 정렬(여행 중·다가오는 순)을 두면 앱이 모두 받을 필요가 없다(R7)
- 팀 문서의 "요청마다 UUID"를 "동작마다 UUID, 재시도는 같은 키"로 고친다
