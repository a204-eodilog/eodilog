# Research: AI 변경안

## R1 비교할 날
- 지금 코스와 제안 코스를 초안으로 바꿔 changedDays(코스 함께 편집 규칙)로 바뀐 날을 찾고 첫 바뀐 날을 보인다. 없으면 첫째 날.

## R2 요약 한 줄
- diff.removedPlaceIds 하나만: "{이름}를 빼요"(을·를), 아래 줄 "N일차 M번째 장소".
- 빠진 것 하나와 들어온 것 하나: "{빠진}을 {들어온}로 바꿔요". 아래 줄 같은 위치.
- 장소가 그대로이고 시각만: "{이름} 시간을 바꿔요". 그 밖에는 diff.description.

## R3 줄 표시
- 제안 날의 칸마다 같은 장소가 지금 날에 있으면 시각 비교: 같으면 그대로, 이르면 당겨짐, 늦으면 늦춰짐. 없으면 새로. 지금 날에만 있는 장소는 끝에 줄 긋고 빠짐. 구간은 앞뒤 장소 쌍이 지금 날에 없으면 바뀜.

## R4 적용·되돌리기
- 적용 POST .../proposals/{jobId}/apply {expectedVersion: baseVersion} → Itinerary. 코스 캐시를 그 값으로 바꾸고 S24로 replace하며 applied=jobId.
- S24는 applied가 있으면 한 번 "새 코스를 적용했어요" 알림과 되돌리기 액션. 되돌리기 POST /itinerary/undo {expectedVersion: 지금 version, appliedJobId}.
