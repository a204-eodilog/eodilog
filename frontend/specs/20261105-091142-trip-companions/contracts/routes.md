# 계약: 화면 주소와 이동

expo-router 파일 기준이다. 라우트 파일은 `features/trip/screens`의 화면을 내보내기만 한다(`CONVENTION.md`). 주소에 `index`를 붙이지 않는다. 이전 명세에서 `/expenses/index`가 지출 id로 읽힌 문제가 있었다.

## 새 주소

| 파일 | 주소 | 화면 |
| --- | --- | --- |
| `src/app/(main)/trips/[tripId]/invite.tsx` | `/trips/{tripId}/invite` | S18 `InviteScreen` |
| `src/app/(main)/trips/[tripId]/settings.tsx` | `/trips/{tripId}/settings` | S19 `TripSettingsScreen` |
| `src/app/(main)/trips/[tripId]/settings-region.tsx` | `/trips/{tripId}/settings-region` | 여행지 검색(설정용, `useTripEditDraft`) |

방장 넘기기 대상 선택·내보낼 동행 고르기·확인·나가기는 S19 위에 뜨는 하단 시트다. 주소가 없다.

## 들어오는 길

| 어디서 | 무엇을 | 가는 곳 |
| --- | --- | --- |
| S17 `TripHero` | 초대 버튼(지금 `comingSoon`) | `router.push('/trips/{id}/invite')` |
| S17 `TripHero` | 설정 버튼(지금 `comingSoon`) | `router.push('/trips/{id}/settings')` |
| S19 | 여행지 줄 | `router.push('/trips/{id}/settings-region')` |

## 나가는 길

| 상황 | 이동 |
| --- | --- |
| S18·S19 [뒤로] | `router.back()`. S19는 고친 값을 버린다 |
| S19 [완료] 성공, 또는 바뀐 게 없음 | `router.back()`(상세로) |
| 설정용 여행지 검색 [완료]·[뒤로] | `router.back()`(S19로, 고른 값은 스토어에 남음) |
| 나가기·여행 삭제 성공(이미 처리됨 포함) | `router.replace('/trips')`. 그다음 그 여행 캐시를 지운다(research R5) |
| S18·S19가 404 `TRIP_NOT_FOUND` | 화면 안에 "볼 수 없는 여행이에요"와 [여행 목록으로] → `router.replace('/trips')`. 상세와 같은 모양이다 |

## 나가기 뒤 스택

나가기·삭제는 상세(S17) → 설정(S19) 위에서 일어난다. `replace('/trips')`는 지금 화면을 여행 탭으로 바꾼다. 하지만 스택 아래의 상세가 남으면, 뒤로 가기로 나간 여행 상세에 돌아갈 수 있다. 그래서 `router.dismissAll()` 뒤 `router.replace('/trips')`로 스택을 비우고 탭으로 간다. `dismissAll`의 이름과 동작은 구현 때 SDK 58 expo-router 문서로 확인한다. 실제 동작은 기기에서 확인한다(quickstart 3).
