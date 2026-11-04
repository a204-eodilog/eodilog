# 화면 주소와 이동 규칙

| 주소 | 화면 | 탭 보임 | 들어오는 곳 |
| --- | --- | --- | --- |
| `/home` | S05 홈 (A) | 예 | 탭 |
| `/trips` | S15 여행 목록 | 예 | 탭 |
| `/saved` | S10 저장 (B, 자리만) | 예 | 탭 |
| `/chats` | S46 대화방 목록 (C, 자리만) | 예 | 탭 |
| `/me` | S37 마이페이지 (A, 자리만) | 예 | 탭 |
| `/trips/new` | S16 새 여행 | 아니오 | S15 [새 여행], S15 빈 화면, S05 첫 방문 [+ 새 여행] |
| `/trips/new?regionId={id}` | S16, 여행지 미리 채움 | 아니오 | N3 [이 여행지로 새 여행] (A가 연결) |
| `/trips/new-region` | 여행지 검색 | 아니오 | S16 "어디로" 줄 |
| `/trips/{tripId}` | S17 여행 상세 | 아니오 | S15 카드·줄, S16 만들기 성공 |

## 이동 규칙

- 주소는 expo-router typed route로 쓴다(`app.json` `experiments.typedRoutes: true`). 문자열을 직접 만들지 말고 `{ pathname: '/trips/[tripId]', params: { tripId } }` 형태를 쓴다
- S16에서 뒤로 가기·닫기(X)를 하면 입력을 비운다(US1-12). 여행지 검색은 S16 위에 쌓이므로 S16의 입력은 남는다

- S16 성공: `router.replace('/trips/{id}')`. 상세에서 뒤로 → S16이 아니라 들어온 곳
- 여행지 검색 [완료]: `router.back()`. 고른 지역은 `useNewTripDraft`에 이미 있음
- S16 닫기(X): 입력을 비우고 `router.back()`
- S17 [초대] → `/trips/{id}/invite`(S18), 설정 → `/trips/{id}/settings`(S19): 다음 명세가 만든다. 이번에는 "준비 중이에요" 토스트
- S17 여행 메뉴·지금 할 일 버튼의 대상 화면도 아직 없으면 같은 토스트

## 다른 담당자가 쓸 것

- A(홈 첫 방문): `router.push('/trips/new')`
- A(N3): `router.push({ pathname: '/trips/new', params: { regionId } })`
