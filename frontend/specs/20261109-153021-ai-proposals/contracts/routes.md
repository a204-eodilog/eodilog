# Routes and API: AI 변경안

| 주소 | 쓰임 |
|---|---|
| /trips/[tripId]/proposal?jobId= | S29. S26 [변경안 보기] |
| /trips/[tripId]/proposal?removePlaceId= | S29. S24 [빼기], 화면이 PLACE_REMOVED 작업을 만든다 |
| /trips/[tripId]/course?applied=jobId | 적용 뒤 S24, 알림과 되돌리기 |
| /dev/proposal?state= | 미리보기: loading, compare, applied, failed |

## API
- POST /trips/{tripId}/itinerary/proposals `{reason:'PLACE_REMOVED', expectedVersion, excludedPlaceIds:[id]}` → 202 JobRef
- GET /trips/{tripId}/itinerary/proposals/{jobId} → ItineraryProposal
- POST /trips/{tripId}/itinerary/proposals/{jobId}/apply `{expectedVersion}` → Itinerary, 409 VERSION_CONFLICT, 422 UNSCHEDULABLE_ALTERNATIVE
- POST /trips/{tripId}/itinerary/undo `{expectedVersion, appliedJobId}` → Itinerary, 409 UNDO_UNAVAILABLE
