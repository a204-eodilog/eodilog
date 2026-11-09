# Data Model: 추천 결과

API 명세 RecommendationResult 그대로.

- **RecommendationItem**: `type: 'REGION' | 'PLACE'`, `region: Region | null`, `place: Place | null`, `reason: string`. REGION이면 region, PLACE면 place가 있다. 없으면 보이지 않는다.
- **RecommendationResult**: `job: Job`, `items`, `basis: { sharedPlaceCount, usedMemberCount }`, `insufficientData`.
- **Job**: `id, kind, status(QUEUED·RUNNING·SUCCEEDED·FAILED·CANCELLED), progress, error`.
- **화면 상태**: `loading`(흐른 초) / `success` / `noOverlap`(success이면서 그룹 겹친 곳 0) / `insufficient` / `failed`.
- **근거 칸**: 모은 장소 `{sharedPlaceCount}곳` + 겹침 수, 공개 취향 `{usedMemberCount}명`, 여행지 이름 + 기간.
