# Data Model: 코스 함께 편집

서버 모델은 코스 짜기와 같다([코스 data-model](../20261109-121845-course/data-model.md)). 이번에 더하는 것은 화면 안 모델뿐이다.

## 처음 코스 base
- 편집을 시작했거나 마지막으로 맞춘 저장 코스(Itinerary). 고친 날을 가리는 기준.
- 합치기나 최신 코스 보기 뒤에는 그 최신 코스가 새 처음 코스다.

## 고친 날 changedDays(base, draft)
- 0부터 센 일차 번호 집합. 두 초안의 그 날 값(장소 ID, 시작 시각, 머무는 시간, 인접 쌍 수단)이 다르면 고친 날이다. 일수가 다르면 없는 날은 빈 날로 본다.

## 합치기 결과 RebaseResult
- `none`: 내가 고친 날이 없다. 최신 코스로 바꾼다.
- `merged`: 서로 다른 날을 고쳤다. draft는 최신 코스에 내 날을 얹은 초안, baseVersion은 최신 version. mineDays, theirDays.
- `overlap`: 같은 날을 고쳤다. days는 겹친 날.
- 덮기(force)는 overlap이어도 merged를 돌려준다. 내 날이 이긴다.

## 확인 상자 상태
- `{ latest: Itinerary; editor: string }` 또는 없음. editor는 latest.updatedByMemberId의 동행 이름, 모르면 "다른 동행".

## 편집 중 동행 CoEditor
- `{ name: string; imageUrl: string | null }[]`. 지금은 미리보기에서만 채운다(Q-8-5).
