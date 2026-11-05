# S44 친구 추천·검색

담당 A · 완성도 · 요구사항 WD-FR-03, 02 · S43·S05 [친구 찾기]에서 들어온다

구현 `frontend/src/features/people`, 주소 `/find-friends`, 미리보기 `/dev/find-friends?state=basic|no-suggestions|no-results`.

| 상태                      | 피그마                                                                                | 이번에 만듦                                       |
| ------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 기본                      | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-23797) | 예                                                |
| 추천 후보 없음            | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-23938) | 예                                                |
| 검색 결과 없음            | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-23995) | 예                                                |
| 비공개 계정에 팔로우 요청 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-24053) | 버튼이 "요청됨" + "팔로우 요청을 보냈어요" 토스트 |
| 팔로우 요청 실패          | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-32112) | 토스트                                            |

- 닉네임 검색칸 + [찾기](결정 Q-2: 닉네임만, ID·링크 검색 없음) → `GET /users?query=`
- **추천 친구** 카드: 얼굴 + 이름 + 공개 가능한 이유("공개 취향이 같아요" + 겹친 낱말 / "공개 여행 4개를 올렸어요"), [숨기기](다시 추천 안 함) · [팔로우]
- 팔로우 버튼: 팔로우(파랑) · 요청됨 · 팔로잉(회색). 다시 누르면 끊기·요청 취소 → `POST`/`DELETE /users/{userId}/follow`
- 사람을 누르면 N9

## 백엔드에 필요한 것

1. **추천 친구 API가 명세에 없다.** 제안: `GET /me/friend-recommendations` → `{user: UserCard, reason: {kind: TASTE, tags} | {kind: TRIPS, count}}[]`, 숨기기 `POST /me/friend-recommendations/{userId}/hide`. 지금은 이 경로로 부르고 서버에 없으면(404) 빈 목록
