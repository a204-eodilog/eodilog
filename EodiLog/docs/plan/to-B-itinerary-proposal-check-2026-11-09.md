# A → B: 코스 제안 MR !169 통합 확인

2026-11-09. 전달 문서와 실제 dev `4481f3875e0aaa6e760346f717ccc079e1a9fa35`를 대조했다. A의 사진 AI 변경은 백업 후 최신 dev에 통합했다.

## 반영한 내용

- A의 미병합 사진 AI 마이그레이션을 `V202611091100`에서 **`V202611091300__create_photo_classification_groups.sql`**로 변경했다. 이미 병합된 B의 `V202611091200__create_itinerary_undo_states.sql`은 수정하지 않았다. outOfOrder를 켜지 않는다.
- TripDeleteJobHandler에서 A의 `photo_topics → photos → photo_groups`와 B의 `itinerary_undo_states → route_legs → itinerary_items → itineraries` 삭제 순서를 모두 유지했다.
- 공통 AiServerClient는 B의 FilePart 기반 호출과 A의 디스크 기반 사진 전송을 모두 보존했다. HttpAiServerClient는 B의 MultipartBodyBuilder·공통 call을 함께 사용하도록 합쳐 자동 병합으로 생긴 중복 메서드를 제거했다.
- api-spec의 현재 실행기에 PLACE_EXTRACTION·ITINERARY_PROPOSAL·PHOTO_CLASSIFICATION을 모두 유지했고, 코스 INITIAL 범위 설명이 사진 분류에 잘못 붙지 않도록 정리했다.
- 멤버 권한 테스트는 앞서 수정한 JPEG를 유지한다. 전용 HEIC 테스트는 별도로 남긴다.

## 제약·PUT 동작 확인

- 변경된 AVAILABLE 제약은 이동 시간을 필수로 두고 거리·지도선 NULL을 허용한다. 기존 데이터는 새 제약을 계속 만족한다. `duration_seconds >= 0`·`distance_meters >= 0`의 기존 별도 CHECK와 UNAVAILABLE의 세 필드 NULL 조건도 유지된다.
- 따라서 프론트는 AVAILABLE만 보고 거리·지도선이 있다고 가정하면 안 된다. 현재 AI 구간은 이동 시간만 있을 수 있다는 API 명세를 그대로 유지한다.
- 문서의 “PUT을 거치면 UNAVAILABLE”은 **실제 코스 내용이 변경된 PUT**에 해당한다. ItineraryService.unchanged가 참인 동일 PUT은 즉시 기존 응답을 반환하므로 AI 구간 시간·현재 version·undo 상태를 유지한다. 코스 변경 때는 CourseWriter가 새 구간을 UNAVAILABLE로 쓰고 undo 기록을 제거한다.

## 안전 보존

- 원래 A 변경 백업 stash: `37470c2debf86fffe1587e99017dd651c1bfeaf7`.
- 현재 작업 브랜치: `feature/EODI-229-photo-classification`.
- `.env`·기존 개인 자료는 변경하지 않았다. 이 통합 확인으로 커밋·푸시를 수행하지 않는다.

## 검증 결과

- 최신 dev 통합 후 전체 build 성공: 총512개 중503개 성공, 실패/오류0, 외부 연동 opt-in9개 skip.
- `PhotoClassificationMigrationUpgradeTest`: Testcontainers의 고유 스키마에서1200 적용 → 기존 사진/수동 주제/코스/시간만 있는 AVAILABLE 구간/undo 기록 생성 →1300 업그레이드·validate 성공. 이전 데이터와 기존 제약이 보존됨을 확인했다.
- `PhotoUploadApiTest.tripDeletionCleansAppliedPhotoGroupsAndCourseUndoStateTogether`: 적용된 사진 그룹과 코스 undo/구간이 함께 있는 여행의 실제 TRIP_DELETE worker 정리가 성공했다.
- 기존 `ItineraryApiTest`·`ItineraryProposalApiTest`, 공통 HTTP·jobs 테스트도 포함해 통과했다.
- 별도 실제 S3+실제 SigLIP 모델 왕복 1개 성공(skip0): 새 테스트 사진2장 업로드 → 분석 → 그룹 apply → 목록/요약 → 동일 apply 재요청. 생성 객체를 정리했다.
- 위 실제 모델 검증은 사진 분류 경로다. 코스 제안의 외부 AI 호출을 다시 실행한 결과로 표현하지 않는다.
