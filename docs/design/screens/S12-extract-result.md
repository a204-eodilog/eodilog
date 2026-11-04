# S12 추출 결과 확인

담당 B · 시연 핵심 · 요구사항 WD-FR-05 · API: AI 장소 추출(결과·진행 조회 `GET /extractions/{jobId}`, 취소 `DELETE /extractions/{jobId}`. `GET /jobs/{jobId}`는 공통 작업 상태만 주고 취소 API가 없다), 결과 4종 `SUCCESS` `MULTIPLE_CANDIDATES` `NOT_FOUND` `FAILED`

화면 규칙은 [화면 목록](../../flow/screen-list.md) S12 줄: 진행 상태, 지도 핀 + 장소명·지역·키워드, 한 링크에서 찾은 여러 장소를 골라 저장, 수정·제거.

## 상태

| 상태 | 피그마 | 달라지는 점 |
| --- | --- | --- |
| 진행 중 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-6645) | 아래 "진행 중" 참고 |
| 성공 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-6941) | 아래 "성공" 그대로 |
| 복수 후보 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-6727) | 아래 "복수 후보" 참고 |
| 식별 불가 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-6847) | 아래 "그 밖의 상태" 참고 |
| 처리 실패 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-6894) | 아래 "그 밖의 상태" 참고 |
| 그룹 즐겨찾기에서 시작 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-7617) | 아래 "그 밖의 상태" 참고 |

## 성공

화면 전체가 지도이고 그 위에 요소가 겹친다.

1. **상단 바** — 흰 배경, [뒤로] + 큰 제목 "찾은 장소" `typography.title1`
2. **원본 요약 칩** — 지도 위 가운데 떠 있는 흰 알약(높이 36, 좌우 12, 간격 14): [링크 아이콘 16 + "sns.example.com/p/8Kd2"] [사진 아이콘 16 + "2장"] `typography.caption` `colors.text.default`
3. **지도 핀** — 번호 동그라미 24(`colors.brand.primary`, 숫자 `typography.label` 흰색) + 옆에 흰 알약 이름표(높이 24, 좌우 10, 12/24 보통 `colors.text.default`). **지도 공통 부품(A)**의 마커를 쓴다
4. **아래 시트** — 흰 배경, 좌우 20·아래 34, 손잡이 36x4 `colors.gray[300]`
   - 제목 "장소 2곳을 찾았어요" `typography.title1`, 간격 2, "확인하고 저장해 주세요" `typography.caption` `colors.text.icon`
   - 장소 줄(위 여백 20, 줄 사이 24, 줄 안 간격 18): 번호 동그라미 24 · 가운데(세로 간격 8) · 오른쪽 동그라미 버튼 36 두 개(배경 `colors.surface.default`, 연필 / X 아이콘 18, 간격 10)
     - 이름 `typography.bodyBold`
     - [핀 아이콘 16 + "부산 수영구" `typography.caption` `colors.text.icon`] 다음 키워드 칩(높이 24, 좌우 8, 둥글기 `radius.sm`(8), 배경 `colors.surface.default`, 12/24 보통 `colors.text.icon`), 간격 10
     - 찾은 근거 [반짝임 아이콘 16 + "게시물 글에서 찾았어요"] `typography.caption` `colors.brand.primaryDark`
   - 아래 오른쪽 알약 주 버튼 48: 저장 아이콘 20 + "2곳" → S08 가져온 장소

## 진행 중

상단 바 [뒤로] + 큰 제목 "장소 찾기" `typography.title1`. 지도는 없고 흰 배경.

1. **찾는 중 그림** — 화면 가운데 위쪽에 `colors.brand.primary` 동그라미 세 겹(140·100·64, 바깥일수록 옅게)과 가운데 점 20(흰 테두리). 퍼져 나가는 움직임을 넣으면 좋다
2. **원본 요약 칩** — 성공 상태와 같은 흰 알약 [링크 아이콘 + 주소] [사진 아이콘 + "2장"]
3. **아래 영역** — 좌우 40·아래 34, 세로 간격 20, 가운데 정렬
   - "장소를 찾고 있어요" `typography.title1`, 간격 2, "보통 10초 안에 끝나요" `typography.caption` `colors.text.icon`
   - **진행 단계** 세로 목록(간격 14, 폭 148): 줄마다 동그라미 24(끝난 단계 `colors.status.successMid` 바탕 + 체크 16, 진행 중 `colors.brand.primary`, 남은 단계 `colors.line.default`) + 글자 `typography.body` `colors.text.icon` — "링크와 캡처 읽기 / 장소 이름 찾기 / 지도에 표시하기"
   - 글자 버튼 "취소" `typography.bodyMedium` `colors.text.icon`(높이 48, 좌우 16). 누르면 `DELETE /extractions/{jobId}`로 작업을 취소하고 S11로
4. 진행 중 조회는 `GET /extractions/{jobId}`를 주기적으로 읽는다(`GET /jobs/{jobId}`로 공통 작업 상태만 볼 수도 있다). 단계는 작업 상태로 바꾼다

## 복수 후보

지도 위 핀이 번호 대신 글자 A·B·C다. 고른 후보(B)는 `colors.brand.primary` 동그라미 30(글자 15 굵게 흰색), 나머지는 `colors.text.sub2` 동그라미 24(`typography.label` 흰색)에 흐림 0.55.

**아래 시트**(좌우 20·아래 34, 손잡이 36x4)
1. "어느 곳인가요?" `typography.title1`, 간격 2, [핀 아이콘 16 + "같은 이름이 3곳 있어요" `typography.caption` `colors.text.icon`]
2. **후보 줄**(위 16, 줄 사이 10): 높이 74, 안쪽 14/18/14/14, 둥글기 `radius.lg`(16), 간격 18. 고른 줄 배경 `colors.brand.primaryBg`, 나머지 `colors.surface.default`
   - 왼쪽 글자 동그라미 24("A", `typography.captionBold` 흰색, 고른 것 `colors.brand.primary` 나머지 `colors.text.sub2`)
   - 가운데: 이름 "바다 앞 카페 남천점" `typography.bodyBold` + [핀 아이콘 16 + "부산 수영구 남천동" `typography.caption` `colors.text.icon`]
   - 오른쪽 라디오 22(S08과 같음)
3. **버튼 줄**(위 20, 간격 10, 오른쪽 정렬): 글자 버튼 [검색 아이콘 20 + "여기에 없어요"](`colors.text.icon`) → S13, 알약 주 버튼 48 [체크 아이콘 + "이곳으로"]

## 공통 부품과 맞지 않는 점

- 글자 12/24 보통(지도 이름표, 키워드 칩)은 토큰에 없다. 가까운 것은 `typography.captionMedium`(12/20).
- 키워드 칩은 공통 `Chip`(알약)과 모양이 달라 둥글기 8의 작은 태그다. 여러 화면(S12, S14)에 나와서 공통 **태그**로 만드는 게 좋다.
- 진행 단계 표시는 공통 부품에 없다.

## 그 밖의 상태

- **식별 불가** — [README 상태 공통 모양](README.md#상태-공통-모양)의 **가운데 안내 화면**(좌우 40): 돋보기 아이콘, "장소를 알아내지 못했어요", "장소를 찾지 못했어요. 직접 골라 주세요", 주 버튼 [검색 아이콘 + "장소 직접 검색하기"] → S13. 상단 바 제목 "장소 찾기"
- **처리 실패** — 같은 가운데 안내 화면: 끊긴 링크 아이콘, "링크를 열지 못했어요", "불러오지 못했어요", 주 버튼 [새로고침 + "다시 시도"]
- **그룹 즐겨찾기에서 시작** — 성공 상태와 같고 둘만 다르다. 설명이 "겨울 여행 그룹 즐겨찾기에서 시작했어요", 아래 버튼 영역이 연회색 상자(`colors.surface.subtle`, 둥글기 24, 안쪽 16) 안에 가로 꽉 찬 주 버튼 [저장 아이콘 + "겨울 여행 그룹에 저장"]. 저장 위치 시트를 띄우지 않음

## 버튼과 이동

[사용자 흐름](../../flow/user-flow.md) 기준. 누르는 것마다 어디로 가는지와 어떤 API를 부르는지.

| 누르는 것 | 어디서 | 동작·이동 |
| --- | --- | --- |
| [뒤로] | 상단 바 | S11로. 진행 중이면 작업은 계속 돌고, 다시 들어오면 결과를 보여 줌 |
| [취소] | 진행 중 | `DELETE /extractions/{jobId}`(입력·후보 제거) 후 S11 |
| 진행 단계 | 진행 중 | `GET /extractions/{jobId}` 결과로 자동 갱신. 끝나면 결과 상태로 바뀜 |
| 장소 줄 [연필] | 성공 | S13 장소 직접 검색(A)으로 가서 이 장소를 바꿈 |
| 장소 줄 [X] | 성공 | 그 장소를 목록에서 뺌. 다 빼면 저장 버튼 비활성 |
| 지도 핀 | 성공·복수 후보 | 해당 장소 줄 강조 |
| [N곳] 저장 | 성공 | S08 저장 위치 선택 · 가져온 장소 시트 |
| [겨울 여행 그룹에 저장] | 그룹 즐겨찾기에서 시작 | 저장 위치를 묻지 않고 그 그룹에 바로 저장 → S20으로 복귀 |
| 후보 줄 | 복수 후보 | 라디오로 하나 고르기 |
| [여기에 없어요] | 복수 후보 | S13 장소 직접 검색 |
| [이곳으로] | 복수 후보 | 고른 후보로 확정 → 성공 상태 |
| [장소 직접 검색하기] | 식별 불가 | S13 |
| [다시 시도] | 처리 실패 | 같은 입력으로 작업 다시 보냄 → 진행 중 |
