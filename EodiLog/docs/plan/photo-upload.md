# 캡처·여행 사진 업로드 (EODI-214)

## 기능별 이슈와 커밋

- 상위 작업: [EODI-214](https://jira.example.com/browse/EODI-214)
- 공통 저장소 기반: [EODI-221](https://jira.example.com/browse/EODI-221) — 설정 호환, S3 오류 처리, 읽기 제한, 검증 테스트.
- 사진 기능: [EODI-222](https://jira.example.com/browse/EODI-222) — 배치·등록·목록, 이미지 검증·HEIC, 스트리밍, 만료·삭제 정리. 공통 저장소 기반 커밋에 의존한다.
- 작업 브랜치는 상위 목적에 맞춰 `feature/EODI-214-photo-upload`를 유지하고 기능별 커밋으로 구분한다.

## 실제 S3 확인 (2026-11-06)

- `gradlew.bat test --tests '*AssetRealS3Test' -PrealS3=true` 실행: 2개 모두 통과, 실패·오류·건너뜀 0.
- 실제 버킷의 응답 리전은 시드니 `ap-southeast-2`였다. 로컬 `.env`의 `STORAGE_REGION`을 서울에서 시드니로 수정한 뒤 재검증했다. 버킷 이름·인증 키는 문서에 기록하지 않는다.
- 합성 PNG로 서명 URL PUT → 완료 검증·표시 이미지 저장 → 인증 다운로드를 확인했다. 서명된 Content-Type 변경은 실제 S3가 403으로 거부했다.
- 업로드 취소와 객체 삭제를 확인했으며, 테스트에서 생성한 원본·표시 객체는 finally에서 정리했다. DB는 Testcontainers를 사용했다.
- 이 실행은 S3 왕복 검증이다. 브라우저 CORS·여행 사진 배치의 실제 앱 연동·HEIC의 실제 S3 왕복·버킷 lifecycle 설정 검증을 대신하지 않는다. 아래의 미검증 표기는 이 실행 전 기록이다.

PROFILE·CAPTURE는 JPG/PNG, TRIP_PHOTO는 ACTIVE 여행 멤버의 JPG/PNG/HEIC(HEIF)다. PROFILE은 로그인 사용자에게 제공하며 CAPTURE는 본인만 이용한다. 사진 편집·개별 삭제·분류·그룹·AI 추출 실행·피드는 이번 구현에 포함하지 않는다. API 경로/응답은 루트 `docs/api-spec.md` §7·DTO를 따른다.

## 사용 순서

1. 여행 사진은 `POST /api/v1/trips/{tripId}/photo-upload-batches`에 `{fileCount:1..50}`과 `Idempotency-Key`를 보낸다.
2. `POST /api/v1/assets/upload-intents`에 purpose/contentType/byteSize를 보낸다. 여행 사진은 tripId가 필수다. 기존 batchId 없는 업로드도 호환하며 사진 등록을 하려면 같은 여행·본인 배치의 batchId를 보낸다.
3. 받은 URL로 원본 바이트를 PUT한다. Content-Type을 응답 headers와 맞추고 Content-Length는 바디 크기로 자동 생성한다(브라우저에서 수동 설정하지 않는다). API Bearer 토큰을 S3에 보내지 않는다.
4. 미완료 파일 기한(기본 24시간) 전에 `/api/v1/assets/{assetId}/complete`를 호출한다. PUT URL 기한과 완료 기한은 별도다. 실제 객체 크기, MIME 일치, 이미지 픽셀 전체 디코딩, 픽셀 상한을 검사한다. HEIC는 실제 libheif 디코딩과 JPEG 변환을 거친다. READY 재요청은 같은 결과다.
5. 여행 사진은 `/api/v1/trips/{tripId}/photos`에 batchId·assetId·선택 placeId/capturedAt을 보내 등록한다. 등록 전에는 다른 멤버가 다운로드할 수 없다. 같은 asset·같은 본문 재시도는 동일 사진이고 등록 수가 늘지 않는다.
6. 목록의 assetId로 `/api/v1/assets/{assetId}/download`를 인증 호출한다. PROFILE은 로그인 사용자, CAPTURE는 소유자만, 여행 사진은 업로더를 포함해 ACTIVE 멤버만, 이탈·여행 삭제는 즉시 404다. 응답은 `private, no-store`, 원본 EXIF가 없는 JPEG/PNG다.

## 저장과 경합

업로드는 `uploads/{assetId}`, 다운로드는 별도 `display/{assetId}`다. 검증 이후에도 남아 있는 PUT URL로 표시 이미지를 변경할 수 없다. JPG/PNG는 실제 디코딩한 픽셀을 새 이미지로 저장하고 EXIF 방향을 픽셀에 적용한다. HEIC는 크기 사전 조회·픽셀 상한 확인 후 제한된 외부 ImageMagick 프로세스로 첫 이미지를 실제 디코딩·JPEG 변환하고 Java가 다시 디코딩·재인코딩한다. 원본 메타데이터의 GPS·촬영시각만 비공개 JSON으로 추출하고 API DTO에는 포함하지 않는다. 클라이언트가 직접 지정한 Photo.capturedAt과 EXIF는 구분한다.

쓰기의 잠금 순서는 여행 행 → asset 행이다. 이탈·삭제와 직렬화하고 동일 asset 동시 등록과 배치 마지막 자리 경합을 막는다. 사진 생성과 배치 registered_count 증가는 같은 트랜잭션이다. 각 파일은 별도 요청/트랜잭션이므로 실패한 다른 파일이 성공 사진을 롤백하지 않는다. DB는 asset_id 유일 제약, file_count 1~50, registered_count 범위 CHECK, FK를 보강한다. 같은 여행·소유자·배치 일치는 서비스가 여행 잠금 아래 검사한다.

완료 처리의 원본 읽기·디코딩·표시 이미지 쓰기는 애플리케이션 인스턴스당 한 건으로 제한한다. 처리 중 다른 파일 완료 요청은 대기열에 쌓지 않고 `503 IMAGE_PROCESSOR_UNAVAILABLE`로 응답하며 이후 재시도할 수 있다. 성공·실패 모두 처리 슬롯을 반환한다. 사진 등록 재요청은 멤버십·소유자·여행·배치·메타데이터가 기존 사진과 같으면 배치 만료 후에도 기존 사진을 반환한다. capturedAt과 사진 목록 cursor의 시각은 UTC `0001-01-01T00:00:00Z`부터 `9999-12-31T23:59:59.999999Z`까지만 허용하며, capturedAt은 마이크로초로 정규화한다. 범위 밖 값은 `400 VALIDATION_ERROR`다.

처리 슬롯은 여행/파일 행 잠금 전에 비차단으로 검사하므로 같은 여행의 다른 완료 요청도 즉시 503을 받는다. 기존 파일의 지연 변환도 같은 재진입 처리 잠금을 사용한다. 표시 파일 다운로드는 권한 검사 뒤 저장소 HEAD로 크기 상한을 확인하고 Content-Length·형식·private/no-store를 지정한 제한 스트림을 전달하며 응답 후 저장소 스트림을 닫는다. 표시 이미지 전체를 요청별 byte[]로 적재하지 않는다. 변환기 시간 초과는 잘못된 이미지와 구분해 `503 IMAGE_PROCESSOR_UNAVAILABLE`로 반환하고 유효한 원본/PENDING을 유지한다.

## 로컬·운영 설정

`.env.example`의 STORAGE_BUCKET·STORAGE_REGION을 설정한다. dev의 app.storage/global.storage 하나만 사용하며 .env의 AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY 정적 키와 IAM 기본 자격 증명 체인을 모두 유지한다. 기본 AWS 자격 증명 체인(IAM role 권장)을 사용하며 비밀 키를 저장소에 적지 않는다. 로컬 S3 호환 저장소는 STORAGE_ENDPOINT(이전 S3_ENDPOINT 별칭)로 지정하며 그 호스트는 PUT을 수행하는 클라이언트에서도 접근 가능해야 한다. 버킷은 비공개로 두고 Block Public Access를 활성화한다. 서비스 권한은 해당 버킷의 uploads/*·display/*에 GetObject/PutObject/DeleteObject가 필요하다.

웹 직접 업로드에는 S3 CORS의 실제 프론트 origin, PUT, Content-Type 헤더를 허용한다. API 서버 CORS와 S3 CORS는 별도다. 버킷 버전 관리는 이번 삭제 계약에 포함하지 않는다. 버전 관리가 켜진 운영 버킷은 별도의 noncurrent-version 만료 정책을 설정해 이전 원본이 남지 않게 한다.

ImageMagick 7과 HEIC 읽기 가능한 libheif delegate를 설치하고 `IMAGE_MAGICK`에 실행 파일 경로를 지정한다. `magick -list format`에 HEIC/HEIF 읽기 지원이 있어야 한다. 디코더 실행 파일이 없으면 `503 IMAGE_PROCESSOR_UNAVAILABLE`, 디코딩 실패는 `422 INVALID_ASSET`이며 READY가 되지 않는다. 신뢰할 수 있는 ImageMagick 배포판과 제한된 서비스 계정·policy.xml을 사용한다.

| 설정 | 기본값 |
| --- | --- |
| STORAGE_MAX_BYTES (ASSET_MAX_BYTES 별칭) | 15728640 (15MiB) |
| ASSET_MAX_PIXELS | 40000000 |
| STORAGE_UPLOAD_URL_TTL (ASSET_UPLOAD_TTL 별칭) | 10m |
| ASSET_BATCH_TTL | 24h |
| ASSET_INCOMPLETE_TTL | 24h |
| IMAGE_CONVERSION_TIMEOUT | 30s (각 크기 조회/변환 호출) |

미완료 기한이 업로드 URL 기한보다 짧으면 서버 시작 시 설정 오류로 거부한다. 저장소 SDK 장애는 공급자 URL·메시지를 노출하지 않는 `503 STORAGE_UNAVAILABLE`로 변환하며, HEAD의 없는 객체는 빈 결과로 구분한다.

완료 요청은 미완료 파일 기한 전에 실행한다. 배치 만료는 새 등록을 차단하며 기존 사진을 지우지 않는다. 정리 스케줄러는 매시간 현재 정리 대상 전체를 개별 처리한다. 한 객체 삭제가 실패해도 다른 객체를 계속 처리하고 다음 주기에 재시도한다. 미완료/취소/미등록 READY 파일은 미완료 기한 뒤 지운다. READY 원본은 PUT URL 만료 후부터 기존 미완료 기한(expires_at, 기본 발급 후 24시간)까지 매 주기 반복 삭제하고, 기한 이후 한 번 더 성공적으로 삭제하면 반복을 마친다. 이는 URL 만료 전에 시작해서 첫 삭제 뒤 끝나는 PUT을 다시 정리하기 위한 유예 기간이다. 실패 로그에는 asset ID·예외 클래스·업무 오류 코드만 남긴다.

여행 삭제 작업은 먼저 외부 객체를 삭제하고 성공한 경우에만 사진 → asset의 배치 FK 해제/DELETING → 배치 → 멤버 순으로 DB를 정리한다. 사전 발급 PUT은 취소할 수 없으므로 asset tombstone을 기존 미완료 기한까지 유지하고 PUT 만료 후 매 주기 객체를 다시 삭제한다. 유예 기한이 지난 뒤 삭제에 성공해야 tombstone을 제거한다. 작업 성공 뒤에도 이 기간 DELETING 행이 남을 수 있지만 모든 접근은 이미 차단된다.

execute는 파일마다 원본·표시 객체 쌍을 모두 삭제한 직후 기존 DELETING 상태로 진행을 독립 커밋한다. 뒤 파일 삭제가 실패해도 재시도는 앞에서 완료한 쌍을 건너뛰며, 키는 위 유예 정리 규칙대로 유지한다.

**운영 필수 조건: S3 버킷의 `uploads/` 접두사에 Lifecycle expiration을 반드시 설정한다.** 유한한 애플리케이션 유예 기간만으로는 임의로 오래 진행되는 PUT의 완료 시점을 보장할 수 없다. DB 키 정리 후에 완료되는 원본까지 S3가 최종 삭제하도록 아래 JSON을 버킷의 기존 lifecycle 규칙과 병합해 적용한다. 이는 설정 예시이며 이 작업에서 클라우드 리소스를 생성하거나 정책을 적용하지 않는다. S3 lifecycle 삭제는 비동기이므로 정확한 시각 삭제를 보장하지 않는다. 1일 만료는 기본 24시간 완료 기한에 맞춘 예시이며 미완료 기한을 더 길게 설정한다면 함께 조정한다. `display/`에는 이 원본 정리 규칙을 적용하지 않는다. 버전 관리 사용 시 기존 버전의 noncurrent expiration도 필수다.

[AWS S3 Lifecycle 설정 예시](https://docs.aws.amazon.com/AmazonS3/latest/userguide/lifecycle-configuration-examples.html)의 prefix·expiration·noncurrent version·multipart 규칙을 따른다.

```json
{
  "Rules": [
    {
      "ID": "expire-upload-originals",
      "Status": "Enabled",
      "Filter": {"Prefix": "uploads/"},
      "Expiration": {"Days": 1},
      "NoncurrentVersionExpiration": {"NoncurrentDays": 1},
      "AbortIncompleteMultipartUpload": {"DaysAfterInitiation": 1}
    }
  ]
}
```

## 검증 기록

- Java compileJava 통과(2026-11-06).
- 자동 검증은 실제 PostGIS Testcontainers + 대체 ObjectStorage API 테스트, 실제 S3 SDK/서명 PUT을 Adobe S3Mock 컨테이너에 보내는 테스트, JPEG/PNG/EXIF 방향/형식 위조·픽셀 상한 단위 테스트로 구성한다. S3Mock은 실제 IAM·서명 검증과 같은 보장을 하지 않으므로 운영 버킷 비공개 정책 검증은 별도다.
- `IMAGE_MAGICK`를 설정하면 공식 libheif HEIC fixture를 실제 디코딩하고 JPEG 1280×854와 잘린 HEIC 거부를 검사한다. fixture 출처·해시는 `src/test/resources/images/README.md`에 기록한다.
- 2026-11-06 최종 `IMAGE_MAGICK` 설정 후 `./gradlew.bat build` 통과(4분 48초). JUnit XML 집계 372 tests, 0 failures, 0 errors, 0 skipped. 신규 검증은 ImageSanitizer 6개, S3ObjectStorage 1개, PhotoUploadApi 11개이며 모두 통과했다. `/v3/api-docs` 검사로 UI 수동 점검을 대신했다.
- 실제 ImageMagick 7.1.2-35 Q8/libheif 1.23.7로 HEIC→JPEG 디코딩과 잘린 HEIC 거부, API 업로드 완료→사진 등록→멤버 JPEG 다운로드를 검증했다. JPEG GPS/촬영시각 비공개 추출·표시 이미지에서 제거, EXIF 방향 적용도 검증했다. 실제 AWS S3 버킷·실제 사용자 계정으로는 아직 검증하지 않았다.
- 첫 전체 실행은 캐시된 Spring 컨텍스트별 기본 Hikari 풀 때문에 공유 PostgreSQL의 100 연결 상한을 넘어 실패했다. test 프로필만 maximum-pool-size=4/minimum-idle=0으로 제한한 뒤 위 전체 실행이 통과했다. 운영 풀 설정은 바꾸지 않았다.
- 리뷰 수정 후에는 변경 경로의 `ImageSanitizerTest` 6개와 `PhotoUploadApiTest` 16개만 실행해 22개 통과(실제 HEIC 포함, 실패·오류·skip 0)를 확인했다. 100건 초과 정리와 실패 격리, 첫 삭제 뒤 늦은 PUT 반복 정리·유예 후 tombstone 제거, 안전한 오류 로그, 완료 처리 용량 거부·실패 후 복구, 만료 배치의 동일 재등록, 장소·나노초 시각 정규화·변경 충돌, 극단 시각 400, JPEG 회전 색상 위치를 검증했다. 리뷰 수정 후 최종 전체 `gradlew.bat build`도 4분 36초에 통과했다. JUnit XML 직접 집계: 377개 테스트, 실패·오류·건너뜀 0.

참고: [AWS Java SDK presigned PUT](https://docs.aws.amazon.com/sdk-for-java/latest/developer-guide/examples-s3-presign.html), [ImageMagick resource limits](https://imagemagick.org/script/resources.php), [libheif 예제](https://github.com/strukturag/libheif/tree/v1.20.2/examples).

## dev 호환 통합

V202611061300__create_assets.sql과 AI 준비물 V202611061000__add_checklist_suggestion_adoption.sql은 변경하지 않는다. 새 V202611061400__extend_assets_and_create_photos.sql이 배치·사진과 표시/만료/메타데이터 열을 추가하고 기존 assets ID·객체 키·상태·원본을 보존한다. 과거 READY 파일은 display_content_type이 비어 있으면 최초 complete/다운로드에서 전체 디코딩·표시 변환한다. 그 전에 정리 작업이 원본을 지우지 않는다. 기존 배치 없는 여행 사진은 등록 없이도 ACTIVE 멤버 다운로드를 유지한다. 소유자도 이탈·여행 삭제 후에는 파일을 이용할 수 없다.

과거 시그니처 검사만 통과했지만 실제 디코딩할 수 없는 READY 원본도 지우지 않는다. 해당 파일은 표시 이미지를 만들지 않고 `422 UPLOAD_MISMATCH`를 반환하므로 원본 보존과 새 검증 기준을 함께 지킨다. 과거 사용자 프로필 참조의 FK는 `NOT VALID`로 추가해 기존 불일치 데이터를 삭제하거나 마이그레이션을 중단하지 않으며 새 참조에는 FK를 적용한다.

dev의 공개 정책15MiB/10분을 기본값으로 사용한다. STORAGE_BUCKET/STORAGE_REGION/STORAGE_ENDPOINT/STORAGE_UPLOAD_URL_TTL/STORAGE_MAX_BYTES가 우선이며 S3_BUCKET/AWS_REGION/S3_ENDPOINT/ASSET_UPLOAD_TTL/ASSET_MAX_BYTES는 이전 설정 별칭으로만 유지한다. 실제 .env는 수정하지 않는다. 신규 원본은 uploads/에만 생성한다. 과거 profile/,capture/,trip-photo/ 원본은 우선 전체 표시 변환을 완료한 뒤 해당 기존 원본 접두사에도 적절한 수명 정책을 마련해야 한다. 그 전 접두사 전체 만료는 미변환 기존 READY 데이터를 지울 수 있으므로 적용하지 않는다. 과거 URL의 무기한 in-flight PUT까지 고려한 수명 정책 전환은 운영 점검 항목이다.

통합 검증: dev `36d14f16336fcd2ae08b695808470f42e0f67b64`에 대해 실제 HEIC 경로를 설정한 focused merge 회귀 42개 중 41개 실행 통과·실제 AI opt-in 1개 건너뜀. 이어서 전체 `./gradlew.bat build`가 2분 10초에 통과했다. XML 총 404개(401개 실행 통과), 실패·오류 0, 의도적인 실제 AWS 2개·실제 AI 1개만 건너뜀. 불변 V1300 스키마에 PENDING/CANCELLED/READY를 먼저 넣은 뒤 V1400을 적용해 ID·키·상태와 만료 열을 검증했고, 기존 READY 원본의 변환 전 정리 제외·손상 원본 보존·이탈/삭제 접근 차단도 검증했다. 기존 파일 API의 가짜 시그니처 이미지는 실제 디코딩 가능한 PNG/JPEG/HEIC로 대체했으며 검증을 약화하거나 정상 사례를 제거하지 않았다.

통합 리뷰 후 수정은 관련 경로의 41개 테스트만 실행해 통과했다(실패·오류·skip 0, 실제 HEIC 포함). 같은 여행의 완료 경합 즉시 503, 처리/변환 시간 초과 뒤 원본 보존·복구, 스트리밍 응답/닫힘과 등록 전 READY 파일 접근 차단, 파일별 삭제 진행 재사용, 설정 기한 교차 검증, SDK 장애 503 및 OpenAPI 입력 400을 확인했다. 이 수정 뒤 전체 build는 상위 검증 단계에서 별도로 실행한다.

최종 통합 검증(2026-11-06): 검토 수정 후 전체 Gradle build는 3분 36초에 통과했다. JUnit XML 직접 집계 412개 중 409개 실행 통과, 실패·오류 0, 실제 AWS 2개·실제 AI 1개는 opt-in으로 제외했다. 다운로드 스트리밍·완료 요청 경합·삭제 재시도 진행 상태·변환 timeout 원본 보존·교차 TTL 시작 검증·SDK 오류 매핑·등록 전 접근 차단 보완을 포함한다.
