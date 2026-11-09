# S30 사진 선택·업로드

담당 B · 시연 핵심 · 요구사항 WD-FR-19 · 여는 곳 S17, S31 [사진 올리기]

화면 규칙은 [화면 목록](../../flow/screen-list.md) S30 줄: 사진 선택(JPG·PNG·HEIC, 한 번에 최대 50장), 업로드 진행. 시연은 안드로이드만이라 HEIC 변환은 뒤로 미뤄도 된다.

> **구현 결정(2026-11-09, EODI-227, `features/photo`)** — 사진은 **기기 사진 선택창**(이미 설치된 expo-image-picker, 여러 장·최대 50장)으로 고른다. 앱 안 갤러리(expo-media-library)는 새 네이티브 라이브러리·사진 읽기 권한·팀 개발 빌드 재생성이 필요해 쓰지 않았다. 그래서 아래 "사진 선택"의 **날짜 묶음·보기 범위 칩("여행 기간 사진")**과 **사진 권한 거절** 상태는 없다.
> - **처음**: 가운데 안내 화면(사진 아이콘, "올릴 사진을 골라 주세요", "한 번에 50장까지 올릴 수 있어요", [사진 고르기]) → 선택창
> - **고른 뒤**: "고른 사진" + [+ 더 고르기], 안내 "사진을 누르면 올리지 않을 사진으로 빠져요", 4열 사진 칸(고르기 표시는 아래 값 그대로), 아래 줄 "N장 선택" + [올리기]
> - 받지 않는 형식(GIF 등)·15MB 초과·50장 초과는 넣지 않고 토스트로 알린다. EXIF 촬영 시각이 있으면 등록 때 `capturedAt`으로 보낸다
> - **올리기**: 배치 하나 → 사진마다 차례로 자리 받기 → PUT → 완료 확인 → 등록. 서버가 완료 처리를 한 번에 한 건만 받아서(503) 동시에 올리지 않고, 503이면 잠깐 기다렸다 다시 보낸다. 실패한 사진만 다시 올리고, 완료까지 끝난 사진은 등록만 다시 한다
> - **다 올리면**: S31이 아직 없어 앞 화면으로 돌아가며 토스트 "사진 N장을 올렸어요"
> - **올리는 중 [뒤로]·기기 뒤로·[올리기 취소]**: 확인 시트 "올리기를 멈출까요?" [계속 올리기]/[올리기 취소]. 멈추면 완료 전 파일은 `DELETE /assets/{assetId}`, 이미 등록한 사진은 남는다
> - 개발용 상태 보기 `/dev/photo-upload?state=empty|pick|uploading|failed`

## 상태

| 상태 | 피그마 | 달라지는 점 |
| --- | --- | --- |
| 사진 선택 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-16782) | 아래 "사진 선택" 그대로 |
| 사진 권한 거절 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-16998) | 아래 "사진 권한 거절" 참고 |
| 업로드 진행 중 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-17057) | 아래 "업로드 진행 중" 참고 |
| 일부 실패 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-17208) | 아래 "일부 실패" 참고 |

## 사진 선택

1. **상단 바** — [뒤로], 제목 "사진 올리기" `typography.bodyBold` + 가방 아이콘 16 "겨울 여행" `typography.caption`
2. **본문** — 위 16, 좌우 20, 간격 18
   - **보기 범위 칩**(가로 스크롤, 간격 10): 알약 높이 36, 좌우 14, 안 간격 8. 고른 칩 "여행 기간 사진 24"(배경 `colors.brand.primaryLight`, 글자 `typography.bodyMedium` + 숫자 `typography.captionMedium` 모두 `colors.brand.primaryDark`), 안 고른 칩 "모든 사진"(배경 `colors.surface.default`, `colors.text.icon`). 공통 `Chip`과 숫자 표시 차이만 있다
   - 안내: 정보 아이콘 16 + "여행 기간 사진만 보여요" `typography.caption` `colors.text.icon`
   - **날짜 묶음**(묶음 사이 간격 18, 제목과 격자 12): 왼쪽 "11.14(토)" `typography.title3`, 오른쪽 "14장 중 12장" `typography.caption` `colors.text.icon`
   - **사진 격자**: 4열, 칸 83x84, 둥글기 `radius.md`(12), 사진 없으면 `colors.line.default`. 고른 사진은 위에 `colors.text.default` 반투명 막 + 오른쪽 위 흰 동그라미 24 안에 체크 14. 안 고른 사진은 흰 테두리 동그라미 24만
3. **아래 줄** — 위 12·아래 34, 좌우 20. 왼쪽 "20장 선택" `typography.bodyBold`, 오른쪽 알약 주 버튼 48: 올리기 아이콘 20 + "올리기"

## 업로드 진행 중

상단 바는 같다. 보기 범위 칩은 사라진다.

1. **진행 상자** — 배경 `colors.brand.primaryBg`, 둥글기 `radius.xl`(20), 안쪽 18, 세로 간격 14
   - 줄(간격 14): 흰 동그라미 44 안에 올리기 아이콘 22 · "20장 중 12장 올렸어요" `typography.bodyBold` + "다 올리면 주제와 장소별로 나눠요" `typography.caption` `colors.text.icon`(간격 2)
   - **진행 막대** 높이 6, 흰 바탕 알약, 채운 부분 `colors.brand.primary` 알약(12/20 만큼)
2. **사진 격자** — 선택 화면과 같은 4열 83x84. 올린 사진은 오른쪽 위에 `colors.status.success` 동그라미 20 + 체크 12, 아직 안 올린 사진은 표시 없음
3. 안내: 정보 아이콘 16 + "취소해도 이미 올린 사진은 남아요" `typography.caption` `colors.text.icon`
4. **아래 줄** — 왼쪽 글자 버튼 "올리기 취소"(`typography.bodyMedium` `colors.text.icon`, 높이 48, 좌우 16). 주 버튼 없음

## 일부 실패

1. **안내 상자** — 배경 연회색(피그마 `color/grey/98`, `colors.surface.subtle`), 둥글기 20, 안쪽 20, 줄 간격 14: 흰 동그라미 44 안에 경고 아이콘 22 · "2장을 올리지 못했어요" `typography.bodyBold` + "18장은 올라갔어요" `typography.caption` `colors.text.icon`
2. **사진 격자** — 올라간 사진은 초록 체크 동그라미 20, 실패한 사진은 오른쪽 위 빨간 동그라미(`colors.status.dangerMid`) + X, 칸 아래 "실패" `typography.micro` `colors.status.danger`
3. 안내: 정보 아이콘 16 + "실패한 2장만 다시 올려요" `typography.caption`
4. **아래 줄**(오른쪽 정렬, 간격 10): 글자 버튼 "나중에"(`colors.text.icon`), 알약 주 버튼 48 [다시 시도 아이콘 20 + "2장 다시 시도"]

## 공통 부품과 맞지 않는 점

- 사진 고르기 칸(체크 동그라미, 어두운 막)은 S30·S32·S31 장소 미지정에서 같이 쓴다. B 기능 폴더에 **사진 칸** 부품을 하나 두면 좋다.
- 칩 안 숫자 표시는 공통 `Chip`에 없다(`label`에 숫자까지 넣거나 `count`를 추가).

## 사진 권한 거절

[README 상태 공통 모양](README.md#상태-공통-모양)의 **가운데 안내 화면**(좌우 40, 위 16): 사진 아이콘, "사진에 접근할 수 없어요", "설정에서 사진 접근을 허용해 주세요", 주 버튼 [설정 아이콘 + "설정으로 이동"], 그 아래(간격 10) 글자 버튼 "나중에". 상단 바는 그대로, 사진 격자 없음

## 버튼과 이동

[사용자 흐름](../../flow/user-flow.md) 기준. 누르는 것마다 어디로 가는지와 어떤 API를 부르는지.

| 누르는 것 | 어디서 | 동작·이동 |
| --- | --- | --- |
| [뒤로] | 상단 바 | S17 또는 S31로. 업로드 진행 중이면 '올리기 취소'와 같은 확인 |
| 보기 범위 칩 | 사진 선택 | 여행 기간 사진 / 모든 사진 전환 |
| 사진 칸 | 사진 선택 | 고르기·해제. 최대 50장, 넘으면 토스트 "한 번에 50장까지 올릴 수 있어요" |
| [올리기] | 사진 선택 | `POST /trips/{tripId}/photo-upload-batches`(fileCount, Idempotency-Key) → 사진마다 `POST /assets/upload-intents`(TRIP_PHOTO, batchId) → 받은 주소로 PUT → `POST /assets/{assetId}/complete` → `POST /trips/{tripId}/photos`(batchId, assetId) → 업로드 진행 중. 고른 사진이 없으면 누를 수 없음. (`photos/batch`는 올린 사진을 한꺼번에 수정·이동·삭제하는 API라 업로드에는 쓰지 않는다) |
| [설정으로 이동] | 사진 권한 거절 | 기기 앱 설정 열기 |
| [나중에] | 사진 권한 거절 · 일부 실패 | S31로 |
| [올리기 취소] | 업로드 진행 중 | 남은 업로드 중단. 아직 안 올라간(PENDING) 자산은 `DELETE /assets/{assetId}`로 지움. 이미 등록한 사진은 남김 → S31 |
| [N장 다시 시도] | 일부 실패 | 실패한 사진만 다시 업로드 → 진행 중 |
| 업로드 완료 | 업로드 진행 중 | 자동으로 S31 (분류 중 상태) |
