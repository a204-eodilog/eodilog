# A → B: 장소 추출 MR 공통 변경 확인

2026-11-09. 장소 추출 [MR !163](https://github.com/a204-eodilog/eodilog/-/merge_requests/163)의 `355fb40e18b4cabdabc255a11e4072ecb44071a3`을 확인한 뒤, 코스 제안까지 병합된 dev `4481f3875e0aaa6e760346f717ccc079e1a9fa35`에 A 사진 AI 변경을 통합했다. 이 문서는 해당 통합본의 공통 호출·작업·파일 정리 호환 결과다.

## 확인 결과

- `JobService.discard`와 `JobStore.discard`는 최신 dev 반영본을 유지했다. A PHOTO_CLASSIFICATION 등록·실행·적용 경로와 직접 충돌하지 않는다. cleanup 작업 철회 금지, 소유자/kind/현재 계정·읽기 정책 검사, 작업 행 잠금 후 입력/결과 제거 구조를 확인했다.
- 실제 MR에는 jobs 외에 `AiServerClient`·`HttpAiServerClient`의 multipart 구현도 포함돼 있어 A 변경과 함께 통합했다. 자동 병합으로 생길 수 있는 중복 메서드는 정리했다.
- A는 B의 정확한 호출 계약 `postMultipart(path, traceId, Map<String,String> fields, List<FilePart> files)`와 `FilePart(field, filename, contentType, byte[] bytes)`를 수용했다. null 문자열 필드 생략과 UTF-8도 유지한다.
- 사진 50장의 메모리 사용을 제한하기 위해 A의 디스크 파일 기반 overload도 함께 유지했다. 바이트 기반 캡처와 디스크 기반 사진은 B의 MultipartBodyBuilder·공통 call을 공유한다. 사진 분석에서 전체 파일을 byte[] 목록으로 바꾸지 않는다. 오류 로그에는 외부 응답 본문·예외 메시지·서명 URL을 남기지 않는다.
- `AssetApiTest.tripPhotoIsLimitedToActiveMembers`를 JPEG로 바꿨다. 권한 검증은 항상 실행하고 실제 HEIC 변환은 기존 전용 테스트에 남긴다.
- 캡처가 `AssetCleanup`의 DELETING 경로를 공유한다는 점을 확인했다. A 사진 AI는 이 경로를 변경하지 않는다.

## 통합본 공유 시 유지할 내용

1. 공통 AI 호출은 B의 FilePart 호출 계약과 A의 디스크 기반 overload를 모두 보존한다. 내부 토큰/traceId와 UTF-8 전송을 유지한다.
2. JobIntegrationTest는 B의 ROUTE_RECALCULATION 가짜 kind 변경과 A의 photo_groups/photo_classification_applies FK 정리 순서를 모두 보존한다.
3. api-spec §9 현재 실행기에는 PLACE_EXTRACTION·ITINERARY_PROPOSAL·PHOTO_CLASSIFICATION을 모두 포함한다.
4. A migration은 후속 B 코스 제안 병합을 반영해 `V202611091300__create_photo_classification_groups.sql`로 늦췄다. 이미 병합된 B의 `V202611091200` 이후에 적용한다.

공통 AI 계약 호환·JPEG 변경은 A의 EODI-229 작업에 포함한다. 코스 제약·삭제 순서·PUT 동작은 [코스 제안 통합 확인](to-B-itinerary-proposal-check-2026-11-09.md)에 정리했다. 현재 변경은 로컬 A 브랜치에 있으며 커밋·푸시는 아직 수행하지 않았다.

## 검증 결과

- 최신 dev와 A 통합본 전체 build: **512개 중503개 성공, 외부 opt-in9개 skip, 실패/오류0**. 장소 추출·코스 제안·사진 AI·공통 jobs/HTTP 테스트를 함께 실행했다.
- B FilePart 호출의 UTF-8·null 필드 생략·파일 이름과 A의 디스크 전송을 실제 HTTP 테스트로 검증했다.
- Flyway1200→1300 업그레이드·기존 데이터/제약 보존 및 사진 그룹·코스 undo가 공존하는 여행 삭제 회귀 테스트를 통과했다.
- 별도 실제 S3+실제 SigLIP 모델 사진 왕복1개 성공(skip0): 테스트 사진2장 업로드 → 분류 worker → apply → 그룹 목록/요약 → 동일 apply 재요청. 생성 객체는 정리했다.
- 마지막 실제 모델 검증은 사진 분류 경로이며, 장소 추출·코스 제안의 외부 AI를 다시 호출했다는 뜻은 아니다.
