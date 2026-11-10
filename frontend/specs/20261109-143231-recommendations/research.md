# Research: 추천 결과

## R1 작업 기다리기
- Decision: POST로 jobId를 받고 GET /trips/{tripId}/recommendations/{jobId}를 1.5초마다 부른다. job.status가 SUCCEEDED면 결과, FAILED·CANCELLED면 실패, 2분이 넘으면 실패.
- Rationale: 준비물 제안, 코스 자동 추천과 같은 간격과 제한. 응답이 결과와 작업 상태를 함께 준다.

## R2 생성 중 단계
- Decision: 0~2초 모은 장소 살펴보기, 2~5초 취향 맞춰 보기, 그 뒤 여행지와 장소 고르기. job.progress가 오면 33·66 기준으로 앞당긴다.
- Rationale: 서버가 단계를 주지 않는다. 코스 자동 추천 생성 중과 같은 방식.

## R3 담기
- Decision: group-favorites의 useFavoriteMutations.add를 쓴다. 두 번 누르기 막기와 캐시 갱신, 안내가 이미 있다. '담김'은 그룹 목록에서 내가 담은 장소와 이번 화면에서 담은 장소.

## R4 취향 먼저
- Decision: 화면을 열면 getPreferences로 내 취향을 확인한다. 없거나 비었으면 /preferences?from=recommendation&tripId로 보내고, 화면이 다시 보일 때 추천을 시작한다. S03은 끝나면 router.back으로 돌아온다.
