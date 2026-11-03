# S50 삭제·나가기·탈퇴 확인

담당 B(틀) · 완성도 · 요구사항 WD-FR-32, Q-11 · 여는 곳 S19(C), S32, S35, S38, S39(A), S45(A)

화면 규칙은 [화면 목록](../../flow/screen-list.md) S50 줄: 영향 안내, 여행 나가기는 내 사진·채팅 삭제 체크·경비 유지 안내, 방장이면 받을 사람 안내, 혼자 남으면 여행 삭제 안내, 진행/취소.

**공통 확인 시트**: B가 틀을 만들고, 여행 나가기 문구는 C, 탈퇴 문구는 A가 채운다. 공통 `BottomSheet`의 `title` `description` `footer`로 만들 수 있다(`/dev/ui` 하단 시트 예시가 이 모양).

API: 여행 나가기 `POST /trips/{tripId}/leave`(혼자 남은 사람은 202 + `tripDeleted:true`), 여행 삭제 `DELETE /trips/{tripId}`. 사진·메시지 지우기 옵션은 서버의 정리 작업이 생기기 전까지 400이라 처음엔 "남김"만 보낸다.

## 상태

| 상태 | 피그마 | 달라지는 점 |
| --- | --- | --- |
| 여행 나가기 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-26230) | 아래 "여행 나가기" 그대로 |
| 여행 나가기 · 방장일 때 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=385-4086) | 설명이 "나가면 민준님이 방장이 돼요 · 다른 사람에게 넘기기"(뒤쪽은 글자 링크 → S19 방장 넘기기). 사진 줄 "사진 12장도 지워요 · 피드는 남아요", 채팅 줄 "보낸 메시지도 지워요" |
| 여행 나가기 · 혼자 남았을 때 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=385-4607) | 제목 "혼자 남아서 나가면 여행이 삭제돼요", 설명 "겨울 여행의 기록이 모두 지워져요". 줄 설명이 "여행 사진이 모두 지워져요 / 그룹 채팅방이 사라져요 / 경비 기록도 함께 지워져요". 빨간 버튼 "나가고 여행 삭제" |
| 처리 실패 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-26401) | 기본 + 오류 문구 "나가지 못했어요", "다시 시도해 주세요", 빨간 버튼 "다시 시도" |
| 사진 삭제 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-18079) | 짧은 시트: "사진 2장을 지울까요?", "휴대폰 원본은 그대로예요", [취소] [지우기] |
| 탈퇴 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-24452) | 짧은 시트: "어디로그를 탈퇴할까요?", "내 기록이 모두 지워져요.⏎함께 만든 여행은 동행에게 남아요", [취소] [탈퇴하기] |

## 여행 나가기

시트 안쪽 좌우 20·아래 34, 손잡이 36x4 `colors.gray[300]`.

1. **제목 줄** — "겨울 여행에서 나갈까요?" `typography.title1`, 간격 2, 정보 아이콘 16 + "나가면 이렇게 바뀌어요" `typography.caption` `colors.text.icon`
2. **바뀌는 것 목록** — 위 16, 줄 사이 14. 줄(높이 48, 간격 14): 회색 동그라미 36(`colors.surface.default`) 안 아이콘 18 · 이름 `typography.bodyBold` + 설명 `typography.caption` `colors.text.icon`
   - 지도: "내 지도에서 이 여행이 빠져요"
   - 사진: "올린 사진 12장, 지울지 골라요" — 줄 오른쪽에 지울지 고르는 체크(피그마에는 글자만 있음, 확인 필요)
   - 채팅: "보낸 메시지, 지울지 골라요" — 위와 같음
   - 정산: "경비 기록은 남아요"
3. **버튼 줄** — 위 20, 오른쪽 정렬, 간격 10. 글자 버튼 "취소"(`typography.bodyMedium` `colors.text.icon`, 좌우 16), 빨간 알약 48 "나가기"(나가기 아이콘 20, `Button variant="danger"`)

## 공통 부품과 맞지 않는 점

- 사진·채팅을 "지울지 고르는" 체크박스가 피그마에 그려져 있지 않다. 화면 목록에는 체크박스가 있다고 되어 있어 피그마 보완이 필요하다. 공통 체크박스는 아직 없다(2차 부품 목록).
- 설명 안 글자 링크("다른 사람에게 넘기기")를 넣는 자리가 공통 `BottomSheet`의 `description`에는 없다. `children`으로 넣으면 된다.

## 예시 데이터

방장 넘김 대상은 피그마에서 민준(가장 먼저 참여한 동행)으로 바꿔 적었다.
