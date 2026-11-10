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

> **FE 제안(2026-11-09, 구현 `components/extract-steps.tsx`)** — 아래 1~3(Figma 기준)을 이렇게 바꿨다. Figma 반영과 팀 합의 전이다.
> - 위에서부터 왼쪽 정렬, 좌우 20: **원본 요약 칩**(회색 `colors.surface.default` 알약 높이 32, 그림자 없음) → 간격 28 → "장소를 찾고 있어요" `typography.title1` + "보통 10초 안에 끝나요" `typography.caption` → 간격 28 → **세로 단계 표시**. 아래 가운데 [취소]. 동그라미 세 겹 그림은 뺐다
> - **세로 단계 표시**: 번호 동그라미 28을 세로선 2(`colors.line.default`, 끝난 구간은 `colors.brand.primary`)로 잇고 줄 간격 24, 동그라미와 글자 간격 14
>   - 끝난 단계: `colors.brand.primary` 동그라미 + 흰 체크 16, 글자 `typography.body` `colors.text.icon`
>   - 지금 단계: `colors.brand.primaryBg` 바탕 + `colors.brand.primary` 테두리 1.5 + 파란 번호, 바깥 4 띄워 한쪽만 파란 테두리 2가 1초에 한 바퀴 돈다(움직임 줄이기면 멈춤). 글자 `typography.bodyBold` `colors.text.default`, 아래에 "지금 하는 일" 한 줄 `typography.caption` `colors.text.sub`
>   - 남은 단계: 흰 바탕 + `colors.line.strong` 테두리 + 번호 `colors.text.muted`, 글자 `typography.body` `colors.text.muted`
> - **지금 하는 일**: 1단계는 보낸 입력에 맞춘다 — 링크+캡처 "게시물 글과 캡처 N장을 읽고 있어요" / 링크 "링크 속 글을 읽고 있어요" / 캡처 "캡처 N장을 읽고 있어요" / 모름 "보낸 내용을 읽고 있어요". 2단계 "가게 이름과 주소를 찾고 있어요", 3단계 "찾은 곳을 지도에 올리고 있어요"

1. **찾는 중 그림** — 화면 가운데 위쪽에 `colors.brand.primary` 동그라미 세 겹(140·100·64, 바깥일수록 옅게)과 가운데 점 20(흰 테두리). 퍼져 나가는 움직임을 넣으면 좋다
2. **원본 요약 칩** — 성공 상태와 같은 흰 알약 [링크 아이콘 + 주소] [사진 아이콘 + "2장"]
3. **아래 영역** — 좌우 40·아래 34, 세로 간격 20, 가운데 정렬
   - "장소를 찾고 있어요" `typography.title1`, 간격 2, "보통 10초 안에 끝나요" `typography.caption` `colors.text.icon`
   - **진행 단계** 세로 목록(간격 14, 폭 148): 줄마다 동그라미 24(끝난 단계 `colors.status.successMid` 바탕 + 체크 16, 진행 중 `colors.brand.primary`, 남은 단계 `colors.line.default`) + 글자 `typography.body` `colors.text.icon` — "링크와 캡처 읽기 / 장소 이름 찾기 / 지도에 표시하기"
   - 글자 버튼 "취소" `typography.bodyMedium` `colors.text.icon`(높이 48, 좌우 16). 누르면 `DELETE /extractions/{jobId}`로 작업을 취소하고 S11로
4. 진행 중 조회는 `GET /extractions/{jobId}`를 주기적으로 읽는다(`GET /jobs/{jobId}`로 공통 작업 상태만 볼 수도 있다). 단계는 작업 상태로 바꾼다

## 복수 후보

> **언급별 묶음(FE, 2026-11-09)** — AI 서버는 게시물 속 가게 이름(언급)마다 지도 검색을 하고 후보를 한 줄로 이어 붙여 준다. 같은 `name`의 후보는 한 언급의 여러 지점이고, 지점 이름은 `place.name`에 있다. `MULTIPLE_CANDIDATES`는 지점이 여럿이거나 지도에서 못 찾은(`place: null`) 언급이 **하나라도** 있다는 뜻이라, 화면은 `resultStatus` 대신 묶음으로 나눈다(`ai/app/features/place_extraction/service.py`, FE `groupCandidates`).
> - 지점이 하나인 언급 → 바로 성공 목록에 둔다
> - 지점이 여럿인 언급 → 아래 "어느 곳인가요?"에서 하나씩 고른다. 여럿이면 차례로 묻고 설명 끝에 "· 1/2". 다 고르면 성공 목록(고른 지점과 한 곳인 가게가 함께)
> - 지도에서 못 찾은 언급 → 성공 목록에 회색 "?" 동그라미 줄로 둔다. [핀] 대신 [돋보기 + "지도에서 찾지 못했어요"], 오른쪽 [돋보기] → S13으로 장소를 정하면 일반 줄이 된다. 저장 수 [N곳]에는 세지 않는다
> - 설명은 `"바다 앞 카페" 같은 이름이 2곳 있어요`, 후보 줄 이름은 지점 이름(`place.name`)

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
  - 언급이 하나도 없을 때(`NOT_FOUND`)만이다. 언급은 있는데 모두 지도에서 못 찾았으면 이름이 보이도록 성공 목록에 "?" 줄로 두고 제목 "지도에서 찾지 못했어요", 설명 "직접 골라 주세요"(FE)
- **처리 실패** — 같은 가운데 안내 화면: 끊긴 링크 아이콘, "링크를 열지 못했어요", "불러오지 못했어요", 주 버튼 [새로고침 + "다시 시도"]
  - 제목·아이콘은 보낸 입력에 맞춘다(FE 제안, !154 리뷰): 링크만 → 위 그대로 / 캡처만 → 사진 아이콘, "캡처를 읽지 못했어요" / 둘 다 → 링크 아이콘, "링크와 캡처를 읽지 못했어요" / 앱을 다시 켜 보낸 입력을 모르면 → 경고 아이콘, "장소 찾기를 마치지 못했어요"
  - **시간 초과**(FE 제안) — 화면을 연 뒤 60초가 지나도 작업이 QUEUED·RUNNING이면 다시 읽기를 멈추고 처리 실패로 보인다. 설명은 "시간이 너무 오래 걸려요. 다시 시도해 주세요". [다시 시도]는 새 작업이 접수된 뒤에 멈춘 작업에 `DELETE /extractions/{jobId}`를 보낸다(실패해도 진행). 먼저 지우면 그 작업에만 쓴 캡처가 지워져 새 작업이 400을 받는다(2026-11-09 백엔드 안내). 서버는 503이면 30초 간격으로 세 번까지 다시 해 1~3분 걸릴 수 있다. 서버 쪽 제한 시간이 정해지면 그 값에 맞춘다
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
| [여기에 없어요] | 복수 후보 | S13 장소 직접 검색, 고른 장소로 이 언급을 정함 |
| [이곳으로] | 복수 후보 | 고른 지점으로 정함 → 고를 언급이 남았으면 다음 언급, 없으면 성공 상태 |
| 장소 줄 [돋보기] | 성공(지도에서 못 찾은 줄) | S13 장소 직접 검색, 고르면 일반 장소 줄이 됨 |
| [장소 직접 검색하기] | 식별 불가 | S13 |
| [다시 시도] | 처리 실패 | 같은 입력으로 작업 다시 보냄 → 진행 중 |
