# Data Model: AI 변경안

- **ItineraryProposal**(코스 types): job, baseVersion, reason, proposed(CourseContent), diff{removedPlaceIds, addedPlaceIds, description}, appliedAt, canUndo.
- **비교 날**: 0부터 센 일차.
- **숫자 칸**: 장소 `N곳 / 기존 M곳`, 이동 `N분|계산 전 / 기존 M분`, 마지막 일정 `HH:MM / 기존 HH:MM`.
- **줄 표시**: same(그대로) | earlier(당겨짐) | later(늦춰짐) | new(새로) | removed(빠짐), 구간 changed(바뀜).
