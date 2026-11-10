# S31 여행 사진 목록

담당 B · 시연 핵심 · 요구사항 WD-FR-19, 20 · 여는 곳 S17, S30

화면 규칙은 [화면 목록](../../flow/screen-list.md) S31 줄: 주제별 분류, 비슷한 사진 묶음, 올린 사람, 연결된 장소, [공동 피드 게시]. 장소 미지정 묶음이 따로 있다.

> **구현(2026-11-09, EODI-228, `features/photo`)** — 백엔드 사진 목록·요약·수동 보정 API(EODI-226) 기준.
> - **만든 것**: 기본(주제 칩 수는 `GET /photo-summary`, 거르기는 받은 목록에서), 장소 미지정 안내 줄, 장소별 묶음(코스 장소는 코스 순서·일차, 코스에 없는 장소는 `GET /places/{id}` 이름으로 뒤에), 사진 없음, 사진 크게 보기(검은 바탕, 올린 사람·장소), 장소 미지정 묶음(코스 장소 라디오 → [연결하기])
> - **서버가 아직 지원하지 않아 뺀 것**: 비슷한 사진 묶음(groupId 항상 null → 칸마다 한 장, 묶음 알약 없음, 칸을 누르면 크게 보기만), 분류 중·자동 분류 실패(분류 작업 API 없음), S32로 가기
> - **장소 미지정 묶음**: 서버는 올린 사람만 사진을 고칠 수 있어 **내 사진만 고를 수 있다**(기본은 내 사진 모두, 동행 사진은 흐리게). 한 장이면 `PATCH /trips/{tripId}/photos/{photoId}`(expectedVersion, placeId), 여러 장이면 `POST /trips/{tripId}/photos/batch`(action UPDATE, 50장씩)로 보낸다. 묶음 하나는 전부 되거나 전부 안 되고, 다른 곳에서 바뀐 사진이 있으면(409) "다른 곳에서 사진이 바뀌었어요. 다시 확인해 주세요" 뒤 목록을 다시 읽는다(2026-11-10). 코스 목록 아래 **장소 검색 줄** → S13(`pickPlace`, 여행 첫 목적지 지역 안에서 먼저 찾음). 고른 장소는 코스 목록 아래 한 줄(지도 핀 아이콘)로 고른 채 돌아오고 [연결하기]로 저장한다(2026-11-09, EODI-237)
> - 안내 줄 설명은 "위치와 날짜 정보가 없어요" 대신 "어디서 찍었는지 연결해 주세요"(장소 미지정은 위치·날짜 유무가 아니라 장소 연결 여부라서)
> - S30 업로드가 끝나면·[나중에]·[올리기 취소] 뒤 S31로, S17 여행 메뉴 '사진' → S31

## 상태

| 상태 | 피그마 | 달라지는 점 |
| --- | --- | --- |
| 기본 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-17384) | 아래 "기본" 그대로 |
| 분류 중 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-17604) | 아래 "그 밖의 상태" 참고 |
| 사진 없음 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-17738) | 아래 "그 밖의 상태" 참고 |
| 장소 미지정 묶음 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-17795) | 아래 "장소 미지정 묶음 (별도 화면)" 참고 |
| 자동 분류 실패 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-30488) | 아래 "그 밖의 상태" 참고 |

## 기본

1. **상단 바** — [뒤로], 제목 "사진" `typography.bodyBold` + "겨울 여행" `typography.caption`, 오른쪽 [사진 올리기](더하기 사진 아이콘 24) → S30
2. **본문** — 위 16, 좌우 20, 간격 24
   1. **주제 칩**(가로 스크롤, 간격 10): "전체 32 / 풍경 14 / 음식 9 / 사람 6 / 기타 3". 모양은 [S30 칩](S30-photo-upload.md#사진-선택)과 같다
   2. **장소 미지정 안내 줄** — 상자 배경 연회색(피그마 변수 `color/grey/98 2`, `colors.surface.subtle`로 맞추면 됨), 둥글기 `radius.lg`, 안쪽 16, 간격 14. 왼쪽에 사진 40x40 세 장을 12씩 겹쳐 놓음(둥글기 10) · "장소 미지정 3장" `typography.bodyBold` + "위치와 날짜 정보가 없어요" `typography.caption` `colors.text.icon` · 오른쪽 "연결하기" `typography.captionMedium` `colors.brand.primaryDark` + `Icon chevron-right` 14. 누르면 장소 미지정 묶음 화면
   3. **장소별 묶음**(섹션 간격 24, 제목과 격자 12)
      - 제목 줄: 핀 아이콘 18 + 장소 이름 `typography.title3` + 오른쪽 "1일차 · 9장" `typography.caption` `colors.text.icon`
      - 칸 3개 가로(111x112, 둥글기 12)
        - 묶음 칸: 왼쪽 아래 검은 알약(`colors.text.default`, 높이 22, 좌우 5/7) 안에 겹친 사진 아이콘 14 + 장수 "6" `typography.captionMedium` 흰색
        - 오른쪽 아래 올린 사람 얼굴 22(`typography.captionBold`). **나**는 `colors.brand.primaryLight` 배경, 다른 동행은 `colors.line.default` ([S35 얼굴 모양](S35-expenses.md#얼굴-모양))
      - 칸을 누르면 묶음이면 S32, 한 장이면 사진 크게 보기
3. **아래 줄** — 왼쪽 "사진 32장 · 3명이 올렸어요" `typography.caption` `colors.text.icon`, 오른쪽 알약 주 버튼 48 "공동 피드 게시"(게시 아이콘 20) → S38

## 장소 미지정 묶음 (별도 화면)

상단 바 [뒤로], 제목 "장소 미지정" `typography.bodyBold` + "겨울 여행" `typography.caption`, 오른쪽 동행 얼굴 묶음 24. 본문 위 16, 좌우 20, 세로 간격 14.

1. 안내 "위치와 날짜가 없는 사진을 장소에 연결해요" `typography.caption` `colors.text.sub2`
2. **사진 묶음** — 제목 줄: "사진 3장" `typography.title3` + 오른쪽 "3장 선택" `typography.caption` `colors.text.icon`, 간격 12. 칸 82x88(둥글기 12) 3개 가로: 오른쪽 아래 올린 사람 얼굴 22, 고른 칸은 `colors.text.default` 막 흐림 0.38 + 흰 동그라미 24 체크 14. 기본은 모두 고른 상태
3. **어디서 찍었나요?** — 제목 줄: "어디서 찍었나요?" `typography.title3` + 오른쪽 "코스 장소" `typography.caption`. 아래 일차별 목록(간격 2)
   - 일차 머리 "1일차 · 11.14(토)" `typography.captionMedium` `colors.text.icon`(위 4)
   - 장소 줄(높이 48, 좌우 12, 둥글기 14, 간격 14): 번호 동그라미 28(`colors.text.muted`, `typography.captionBold` 흰색) · 이름 `typography.body` · 오른쪽 라디오 24(안 고름 `colors.line.default` 동그라미). 고른 줄은 배경 `colors.brand.primaryBg`, 번호 `colors.brand.primary`, 라디오 `colors.brand.primary` + 체크 14
4. **장소 검색 줄** — 배경 `colors.surface.default`, 둥글기 16, 안쪽 16/20, 간격 18: 검색 아이콘 20 · "장소 검색" `typography.bodyMedium` + "코스에 없는 곳이면 찾아서 연결해요" `typography.caption` · `Icon chevron-right` 16 → S13(A)
5. **아래 버튼** — 오른쪽 알약 주 버튼 48 [링크 아이콘 20 + "연결하기"]. 고른 사진을 고른 장소에 붙이고 S31로 돌아간다

## 예시 데이터

해운대 해변(1일차 · 9장: 지우 6장 묶음, 서연 1장, 민준 2장 묶음), 서면 돼지국밥집(1일차 · 6장), 감천문화마을(2일차 · 14장). 제목 표기는 "N일차 · N장"으로 통일했다(2026-11-03 피그마 수정).

## 그 밖의 상태

- **분류 중** — 주제 칩 대신 [README 상태 공통 모양](README.md#상태-공통-모양)의 **진행 상자(연파랑)**: 분류 아이콘, "사진을 주제별로 나누고 있어요" + "32장 중 20장 나눴어요 · 끝나면 묶음이 보여요", 진행 막대(20/32). 그 아래 섹션 제목 "올린 순서" + 오른쪽 "아직 나누지 않았어요", 3열 111x112 사진 격자(올린 사람 얼굴 22만, 묶음 표시 없음). 아래 [공동 피드 게시] 줄 없음. 작업 조회로 자동 갱신
- **사진 없음** — [README 상태 공통 모양](README.md#상태-공통-모양)의 **가운데 안내 화면**: 사진 아이콘, "아직 올린 사진이 없어요", "사진을 올리면 장소별로 나눠요", 주 버튼 [올리기 아이콘 + "사진 올리기"] → S30
- **자동 분류 실패** — 분류 중과 같은 배치인데 상자가 [README 상태 공통 모양](README.md#상태-공통-모양)의 **안내 상자(회색)**: "사진을 주제별로 나누지 못했어요" + 흰 알약 버튼 36 [새로고침 16 + "다시 시도"]. 진행 막대 없음

## 버튼과 이동

[사용자 흐름](../../flow/user-flow.md) 기준. 누르는 것마다 어디로 가는지와 어떤 API를 부르는지.

| 누르는 것 | 어디서 | 동작·이동 |
| --- | --- | --- |
| [뒤로] | 상단 바 | S17 |
| [사진 올리기] 상단 아이콘 / 빈 화면 버튼 | 기본 · 사진 없음 | S30 |
| 주제 칩 | 기본 | 전체/풍경/음식/사람/기타로 거르기 |
| 장소 미지정 안내 줄 [연결하기] | 기본 | 장소 미지정 묶음 화면 |
| 묶음 칸 | 기본 | 묶음이면 S32, 한 장이면 사진 크게 보기(뒤로로 돌아옴) |
| [공동 피드 게시] | 아래 버튼 | S38 내 여행 기록 (게시 확인) |
| [다시 시도] | 자동 분류 실패 | 분류 작업 다시 요청 → 분류 중 |
| 사진 칸 | 장소 미지정 묶음 | 연결할 사진 고르기·해제 |
| 코스 장소 줄 | 장소 미지정 묶음 | 라디오로 장소 하나 고르기 |
| [장소 검색] | 장소 미지정 묶음 | S13(A). 고른 장소를 안고 돌아옴 |
| [연결하기] | 장소 미지정 묶음 | 고른 사진을 장소에 연결(`PATCH /trips/{tripId}/photos/{photoId}`의 placeId, 여러 장이면 `POST /trips/{tripId}/photos/batch`) → S31 기본으로 |
