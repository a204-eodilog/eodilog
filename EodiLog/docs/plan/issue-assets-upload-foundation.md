# [BE] 캡처·여행 사진 업로드 및 여행 사진 등록·조회 구현

상태: [EODI-214](https://jira.example.com/browse/EODI-214) 등록 완료.

## 목적

사용자가 장소 추출용 캡처와 여행 사진을 공통 S3 기반으로 업로드한다. 서버가 파일을 검증하고, 여행 사진은 배치 한도 안에서 등록해 동행과 목록·다운로드로 공유한다.

## 범위

- 비공개 S3 저장소 연동 및 presigned 업로드 URL 발급.
- assets 테이블과 소유자·객체 키·용도·파일 형식·크기·상태·만료 시각 관리.
- `POST /api/v1/assets/upload-intents`
- `POST /api/v1/assets/{assetId}/complete`
- `DELETE /api/v1/assets/{assetId}` — PENDING 취소.
- `GET /api/v1/assets/{assetId}/download` — CAPTURE는 소유자, 등록된 여행 사진은 ACTIVE 여행 멤버만 접근.
- `POST /api/v1/trips/{tripId}/photo-upload-batches` — 1~50장 배치 생성.
- `POST /api/v1/trips/{tripId}/photos` — 검증된 READY 파일을 여행 사진으로 등록.
- `GET /api/v1/trips/{tripId}/photos` — 여행 사진 목록 조회.
- CAPTURE는 JPG/PNG, TRIP_PHOTO는 JPG/PNG/HEIC 지원.
- 사진 소유자·여행·배치 일치 검증 및 배치 한도 원자적 예약/소비.
- 기존 TRIP_DELETE 작업에 여행 사진·파일 정리 연결.
- 실제 객체·파일 형식·크기 검사, 취소·만료·반복 요청 처리.
- 다운로드 파일의 GPS 등 메타데이터 제거.
- 환경 설정 예시, API 명세·Swagger, 테스트 작성.

## 완료 조건

- 정상 이미지가 업로드 요청 → S3 업로드 → complete → 인증 다운로드까지 동작한다.
- 타인의 파일 완료·취소와 CAPTURE 다운로드를 차단하고, 여행 사진은 ACTIVE 멤버만 다운로드한다.
- 여행 사진 배치 생성 → 업로드 → 등록 → 목록·다운로드까지 동작한다.
- 중복 등록과 다른 소유자·여행·배치의 파일 등록을 차단한다.
- 동시 요청에도 배치 한도를 지키고 일부 업로드 실패 시 기존 성공 사진은 유지한다.
- 존재하지 않거나 크기·형식이 맞지 않는 파일은 READY가 되지 않는다.
- 취소·만료한 요청으로 완료할 수 없으며 READY 파일은 업로드 취소로 삭제할 수 없다.
- S3 접근 키 등 비밀값을 소스·문서에 기록하지 않는다.
- 백엔드 build 통과 및 실제 S3 검증 여부를 별도로 기록한다.

## 후속 범위

사진 수동 편집·삭제·그룹 관리·AI 사진 분류·공동 피드·AI 장소 추출 자체는 별도 작업으로 분리한다.

## 참고

- [A/B 분담](backend-a-b-work-split-2026-11-06.md)
- [API 명세 §7](../../../docs/api-spec.md)
