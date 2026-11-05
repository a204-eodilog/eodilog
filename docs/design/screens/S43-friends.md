# S43 친구 목록

## 근거와 경로

- 화면 목록 S43, 사용자 흐름 §2, 결정 F-24, API 명세 Follow·UserCard와 팔로우 API.
- Figma 6개 상태는 2026-11-05 이 구현에 맞춰 고쳤다: 목록 상태에 팔로잉·팔로워 탭 항상 표시, 자물쇠 안내 "수락해도 여행 그룹·채팅은 공개되지 않아요", 사람 줄 간격 20, 해제 확인 문구, 수락 후 팔로워 탭 선택·설명 "나를 팔로우하는 사람".
- 실제 경로: /friends. S37이 아직 없어 진입 메뉴는 추가하지 않는다.
- 개발 미리보기: /dev/friends. ?state=following|followers|empty|accepted|confirm|failure|load-error.
- N9 사람 프로필과 S44 친구 찾기는 화면이 없어 '준비 중이에요' 토스트만 표시한다.

| 상태             | Figma 노드 |
| ---------------- | ---------- |
| 기본(팔로잉)     | 201:23283  |
| 팔로워 탭        | 385:5529   |
| 친구 없음        | 201:23433  |
| 요청 수락 후     | 201:23483  |
| 팔로우 해제 확인 | 201:23632  |
| 요청 수락 실패   | 201:31953  |

## 화면 구성과 값

| 영역      | 값·부품                                                                                                                |
| --------- | ---------------------------------------------------------------------------------------------------------------------- |
| 바탕·상단 | colors.surface.white, 공통 Header('친구'), 상단 안전 영역은 Header에서 적용                                            |
| 본문      | 좌우 layout.screenPaddingX(20), 위 spacing[16], 영역 간 spacing[24], 아래 안전 영역과 spacing[24] 중 큰 값             |
| 친구 찾기 | Card outline, radius.lg(16), 40 원형 연파랑 아이콘, bodyBold 제목 + caption 설명, chevron-right                        |
| 받은 요청 | 맨 위 친구 찾기 아래. title3 제목, 개수 표시                                                                           |
| 요청 카드 | colors.brand.primaryBg, radius.lg, 안쪽 20, 내용·버튼 간격 20. Avatar lg(40), 닉네임 bodyBold, 요청일 caption          |
| 수락·거절 | Button sm, 터치 높이는 layout.minTouchTarget(44)로 확장. 거절 흰 바탕, 수락 brand.primary + 흰 체크                    |
| 공개 안내 | lock 아이콘 16 + caption. “수락해도 여행 그룹·채팅은 공개되지 않아요”로 안내                                           |
| 탭        | 가로 동등 폭, 간격 8, 최소 높이 44, radius.md. 선택 brand.primaryLight + primaryDark, 미선택 surface.default           |
| 사람 줄   | Avatar lg(40), 간격 14, 닉네임 bodyBold, 여행 설명 caption. 줄 간격 20(사용자 검토 후 확대). 우측 더 보기 44 터치 영역 |
| 수락 후   | 팔로워 탭으로 이동. 새 팔로워 Tag, 수락일 표시, 그룹·채팅이 자동으로 열리지 않는 안내 Card                             |
| 확인창    | 공통 ConfirmSheet. 취소 / 팔로우 해제. 팔로워 탭의 삭제도 같은 부품                                                    |
| 없음·실패 | 공통 EmptyState / ErrorState. 조회 실패는 예시 데이터로 대체하지 않는다                                                |
| 알림      | 공통 toast.success/error, 실패에는 다시 시도 버튼                                                                      |

## API와 상태 변경

실제 화면은 TanStack Query → features/friends/api.ts → apiClient로 연결한다. 2026-11-05 확인한 기준 dev에는 팔로우 컨트롤러가 없다. 따라서 실제 서버가 실패하면 ErrorState로 보이고 샘플을 채우지 않는다. 별도로 켠 개발 테스트 모드에서는 api/dev-mock.ts가 명세 경로를 흉내 낸다.

- GET /me/following, GET /me/followers, GET /me/follow-requests?direction=RECEIVED: 커서 끝까지 조회. 최대 100개씩, 취소 신호 전달, 반복·누락 커서 오류 처리.
- POST /me/follow-requests/{requestId}/accept: 받은 요청 제거 + 팔로워 추가. 팔로잉은 늘리지 않는다.
- DELETE /me/follow-requests/{requestId}: 받은 요청 거절.
- DELETE /users/{userId}/follow: 내 팔로잉 방향만 해제.
- DELETE /me/followers/{userId}: 상대의 나를 향한 팔로우만 해제.
- 먼저 바뀐 화면을 보여주되 서버 캐시는 성공 때만 바꾼다. 실패하면 해당 낙관적 표시를 제거해 원래 값이 보인다. 다른 사람에 대한 성공 변경은 보존한다.
- 같은 사람의 작업은 응답까지 잠근다. 실패 토스트에서 같은 작업을 재시도한다.
- 목록이 이미 있을 때 다시 읽기가 실패하면 보이던 목록을 그대로 둔다. 오류 화면은 처음 불러오기 실패일 때만.
- 서버 데이터는 Zustand에 넣지 않는다. 개발 미리보기는 별도 QueryClient와 메모리 서비스로 실제 서버와 분리한다.

## Figma와 다른 점 및 결정 필요

1~3은 Figma에 반영했다. 4~7은 공통 부품을 그대로 쓴 차이라 Figma는 두고 코드가 기준이다.

1. 일부 캡처에는 탭이 없다. 요구사항과 팔로워 캡처에 맞춰 목록 상태에는 두 탭을 항상 표시한다. 전체 빈 화면은 캡처처럼 가운데 안내만 둔다.
2. 수락 후에는 단방향 계약대로 팔로워만 늘어난다(팔로워 6, 팔로잉 5 유지). 팔로워 탭이 선택된 상태로 보인다.
3. 해제 확인의 '서로의 공개 여행이 안 보여요'는 공개 계정 열람 정책과 양방향 독립 관계를 오해하게 할 수 있어 '이 사람의 여행을 더 이상 팔로우하지 않아요. 함께한 여행은 유지돼요'로 안내한다.
4. 공통 Header·Button·EmptyState·toast를 재사용한다. 제목 글자, 버튼 높이, 빈 화면의 버튼 아이콘, 토스트 위치(앱 공통 상단)는 캡처와 차이가 있다. 요청 버튼은 36 대신 터치 영역 44다.
5. 친구 추가 아이콘은 기존 people 아이콘으로 대체하고 더 보기는 글자 ⋯로 표시한다. 공통 아이콘을 새로 늘리지 않았다.
6. 예시 이름은 일반 이름으로 바꿨다. 개발 상태 전환 버튼은 /dev/friends에만 표시한다.
7. 팔로워 삭제 확인은 별도 캡처가 없어 공통 ConfirmSheet로 구현했다.

## 백엔드에 필요한 값

- Follow·UserCard에는 '함께 간 여행 수'와 '동행 중인 여행 이름/목록'이 없다. 이 설명은 previewTrips로 개발 미리보기에서만 전달하며 실제 화면에는 숨긴다.
- 팔로우 컨트롤러 7개와 실제 오류·삭제 멱등 정책 확인이 필요하다. 정의되지 않은 오류 코드를 성공으로 간주하지 않는다.
- 서버에서 확인한 것은 없으며 모의 API·브라우저·규칙/훅 테스트로 검증한다.

## 공통 부품 보정

EmptyState와 ErrorState의 공통 action 스타일에 alignSelf: center를 추가했다. Button의 기본 왼쪽 정렬로 가운데 안내 화면의 버튼만 치우치던 문제를 바로잡는다.
