# S32 사진 분류·묶음 수정

담당 B · 완성도 · 요구사항 WD-FR-20 · 여는 곳 S31 묶음 칸

화면 규칙은 [화면 목록](../../flow/screen-list.md) S32 줄: 주제 변경, 묶음 분리, 장소·여행 연결 보정, 삭제(→ S50 사진).

> **구현(2026-11-09, EODI-230, `features/photo`)** — 백엔드에 비슷한 사진 묶음(groupId)이 아직 없어 **S31 장소별 묶음을 고치는 화면**으로 만들었다(`/trips/[tripId]/photos/place/[placeId]`, S31 묶음 제목 오른쪽 [수정] — 내 사진이 있는 묶음에만).
> - 제목 "사진 수정", 머리 "해운대 해변 사진 3장" + "내가 올린 사진만 고칠 수 있어요"(서버가 올린 사람만 PATCH·DELETE 허용 → 동행 사진은 흐리게, 고를 수 없음). 사진 3열 고르기
> - **고른 N장 바꾸기 상자**: 주제 칩(풍경/음식/사람/기타, 하나만 — 고르면 그 주제 하나로 바꿈), 장소 [바꾸기] → 코스 장소 시트(S31 장소 미지정과 같은 목록, 아래 장소 검색 줄 → S13. 고른 장소는 다른 바꿈처럼 [완료]에 저장 — EODI-237). 바꾼 것은 화면에만 두고 **[완료]**로 저장(사진마다 `PATCH`, 지금 값과 같으면 안 보냄). 실패한 사진만 남겨 토스트 [다시 시도]
> - **[N장 삭제]**(빨간 버튼) → S50 확인 "사진 N장을 지울까요?" → 사진마다 `DELETE`(202). 묶음이 비면 S31로
> - 저장 전 [뒤로]·기기 뒤로 → "바꾼 것을 저장하지 않고 나갈까요?"
> - **없는 것**(서버 미지원): 묶음에서 빼기, 대표 배지, 여행 [바꾸기](PATCH에 여행 값 없음)

## 상태

| 상태 | 피그마 | 달라지는 점 |
| --- | --- | --- |
| 기본 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-17941) | 아래 "기본" 그대로 |
| 바꾸기 실패 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-30627) | 아래 "바꾸기 실패" 참고 |

## 기본

1. **상단 바** — [뒤로], 제목 "묶음 수정" `typography.bodyBold` + "겨울 여행" `typography.caption`, 오른쪽 글자 버튼 "완료" `typography.bodyMedium` `colors.brand.primaryDark`
2. **본문** — 위 16, 좌우 20, 간격 14
   1. **묶음 머리** — 왼쪽 "해운대 해변 묶음 6장" `typography.title3`, 아래 얼굴 20 + "지우가 올렸어요" `typography.caption` `colors.text.icon`(간격 8). 오른쪽 "2장 선택" `typography.captionMedium` `colors.brand.primaryDark`
   2. **사진 격자** — 3열, 칸 111x104, 둥글기 12. 고르기 표시는 [S30 사진 격자](S30-photo-upload.md#사진-선택)와 같다. 대표 사진 왼쪽 위에 검은 알약 "대표"(높이 22, 좌우 7, 12/22 보통 흰색)
   3. **고른 사진 바꾸기 상자** — 배경 `colors.surface.default`, 둥글기 `radius.xl`(20), 안쪽 16/20, 줄 간격 8
      - 제목 "고른 2장 바꾸기" `typography.captionMedium` `colors.brand.primaryDark`
      - 줄 3개(높이 40, 간격 14): 왼쪽 이름표(아이콘 16 + "주제/장소/여행" `typography.captionMedium` `colors.text.icon`, 폭 64)
        - 주제: 작은 칩 높이 32, 좌우 12 "풍경/음식/사람/기타"(고른 칩 `colors.brand.primaryLight`)
        - 장소·여행: 지금 값 `typography.body` + 오른쪽 흰 알약 버튼 "바꾸기"(높이 32, 좌우 12, `typography.captionMedium`)
   4. 안내: 정보 아이콘 16 + "원본은 지우지 않아요" `typography.caption` `colors.text.icon`
3. **아래 버튼 두 개** — 위 12·아래 34, 간격 10. 회색 알약 48 "묶음에서 빼기"(배경 `colors.surface.default`, 글자 `colors.text.default`), 빨간 알약 48 "삭제"(공통 `Button variant="danger"`) → S50 사진 삭제 확인

## 공통 부품과 맞지 않는 점

- 글자 12/22 보통("대표" 배지)은 토큰에 없다.
- 회색 알약 버튼은 공통 `Button variant="neutral"`인데, 피그마는 글자색이 `colors.text.default`, 공통은 `colors.text.icon`이다.

## 바꾸기 실패

기본 화면 그대로에 [README 상태 공통 모양](README.md#상태-공통-모양)의 **버튼 있는 토스트**: 경고 아이콘 20 + "묶음을 바꾸지 못했어요" + [다시 시도]. 고른 사진과 바꾼 값은 남아 있다

## 버튼과 이동

[사용자 흐름](../../flow/user-flow.md) 기준. 누르는 것마다 어디로 가는지와 어떤 API를 부르는지.

| 누르는 것 | 어디서 | 동작·이동 |
| --- | --- | --- |
| [뒤로] | 상단 바 | S31. 바꾼 것이 있으면 저장할지 확인 |
| [완료] | 상단 바 | 주제·장소·여행 변경 저장 → S31 |
| 사진 칸 | 기본 | 고르기·해제. 고른 수가 "N장 선택"에 표시 |
| 주제 칩 | 고른 사진 바꾸기 | 고른 사진의 주제를 바꿈 |
| 장소 [바꾸기] | 고른 사진 바꾸기 | 코스 장소 고르기(S31 장소 미지정과 같은 목록) 또는 S13 |
| 여행 [바꾸기] | 고른 사진 바꾸기 | 내 여행 고르기(N4와 같은 목록) |
| [묶음에서 빼기] | 아래 버튼 | 고른 사진을 이 묶음에서 떼어 따로 둠. 삭제 아님 |
| [삭제] | 아래 버튼 | S50 삭제 확인 · 사진. 진행하면 `DELETE /trips/{tripId}/photos/{photoId}`(202 작업) 후 S31 |
| [다시 시도] | 바꾸기 실패 | 같은 변경을 다시 저장 |
