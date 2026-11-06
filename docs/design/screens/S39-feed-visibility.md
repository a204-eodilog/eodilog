# S39 내 노출 설정

담당 A · 핵심 · 요구사항 WD-FR-28 · S38 내 여행 기록에서 들어온다

구현 `frontend/src/features/feed`(visibility), 주소 `/feeds/[feedId]/visibility`, 미리보기 `/dev/visibility?state=basic|delete|loading|error`.

| 상태                    | 피그마                                                                                | 이번에 만듦                              |
| ----------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------- |
| 기본                    | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-21725) | 예                                       |
| 공동 피드 삭제 확인     | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-22328) | 시트 부품 `DeleteFeedSheet` (S38이 연다) |
| 저장하는 중 / 저장 실패 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-31610) | 버튼 로딩 + 토스트                       |

## 기본

- 머리: [닫기] "내 노출 설정" + 여행 이름
- "내 프로필·피드에서 숨길 친구" + "N명 숨김"
- **숨긴 친구 N**(빨강 수): 이름 흐리게 + [다시 보이기]
- **보여 주는 친구 N**(파랑 수): 동행은 "이 여행 동행 · 항상 보여요" + 흐린 "동행"(숨길 수 없음), 그 밖은 [숨기기]
- 🔒 "숨겨도 다른 동행 피드에서는 보일 수 있어요"
- 오른쪽 아래 안전 영역 안에 [저장](바뀐 게 없으면 흐림, 안드로이드 탐색 버튼 위 여백 확보) → `PUT /feeds/{feedId}/visibility/me {hiddenViewerUserIds, expectedVersion}`, 409면 다시 읽고 "다른 곳에서 설정이 바뀌었어요" 토스트

목록 = 나를 팔로우하는 사람(`GET /me/followers`) + 이 여행 동행(`GET /trips/{tripId}` 활성 멤버, 나 빼고). 숨김 값은 `GET /me/feeds`의 `visibility`.

## 공동 피드 삭제 확인 (`DeleteFeedSheet`)

결정 Q-3(동행 누구나 삭제). [공동 피드 삭제](기본, "모든 동행의 피드에서 사라져요. 각자 기록은 남아요") / [기록까지 삭제](빨강, "내 기록만 지워져요") 중 고르고 [삭제하기]. 공동 피드 삭제는 `DELETE /feeds/{feedId}?expectedVersion=`(`deleteFeed`). **S38(B) 화면에서 열어 주어야 한다.**

## 백엔드에 필요한 것

1. "기록까지 삭제"가 어떤 API인지(내 방문·사진·평가 삭제? 여행 나가기?) 명세에 없다
2. `GET /me/feeds/{feedId}` 한 건 조회가 있으면 목록 전체를 받지 않아도 된다
