# S08 장소 저장 시트

담당 B · 시연 핵심 · 요구사항 WD-FR-06, 07 · 여는 곳 S07, N3, N7, S12, S47 (A·C 화면에서도 쓴다)

화면 규칙은 [화면 목록](../../flow/screen-list.md) S08 줄: 개인 / 그룹 선택, 그룹이면 참여 중인 여행 선택. 여행이 없으면 그룹 비활성·개인에만 저장.

**공통 시트**: 여러 화면에서 열리므로 `features/bookmark/components` 같은 B 기능 폴더에 두고, A·C는 가져다 쓴다. 공통 `BottomSheet` 위에 만든다.

## 상태

| 상태 | 피그마 | 달라지는 점 |
| --- | --- | --- |
| 기본 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-3621) | 아래 "기본" 그대로. "동행과 같이"가 골라져 있고 여행 두 개 중 첫 번째 선택 |
| 참여 중인 여행 없음 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-3983) | 여행 목록 자리에 안내 "참여 중인 여행이 없어요⏎개인 즐겨찾기에만 저장돼요". 그룹 칸은 누를 수 없음 |
| 저장 완료 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-4637) | 시트가 닫히고 토스트 "강릉 바다 여행에 담았어요" + 글자 버튼 [보기]. 공통 `toast`에 버튼 자리가 필요 |
| 가져온 장소 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-7075) | S12 추출 결과에서 연 경우. 제목 아래 "장소 2곳", "나만 보기"가 골라져 있고 여행 목록 없음. 안내 "개인 즐겨찾기는 나만 볼 수 있어요" |
| 저장 실패 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-27887) | 기본 화면 + 오류 문구 "저장하지 못했어요", "담지 못했어요. 다시 시도해 주세요" |

## 기본

시트 안쪽 좌우 여백 20, 아래 여백 34, 배경 흰색. 시트 위 손잡이는 공통 `BottomSheet`가 그린다(36x4, `colors.gray[300]`).

1. **제목 줄** — 왼쪽 "어디에 저장할까요?" `typography.title1`, 그 아래 간격 2: 핀 아이콘(`Icon map-pin`, 16) + 장소 이름 "강문 해변" `typography.caption` `colors.text.icon`. 오른쪽 [닫기](`Icon close`, 24, 누르는 영역 44)
2. **저장 위치** — 위 여백 16. 두 칸 가로로(각 170x56), 둥글기 `radius.lg`(16), 칸 안 세로 간격 3: 아이콘 24 + 글자 12/18 보통(Medium)
   - 고른 칸: 배경 `colors.brand.primaryBg`, 글자 `colors.text.default`
   - 안 고른 칸: 배경 `colors.surface.default`, 글자 `colors.text.icon`
   - "나만 보기"(사람 아이콘), "동행과 같이"(`Icon people`)
3. **담을 여행** — "동행과 같이"를 골랐을 때만. 위 여백 16, 줄 사이 10
   - 한 줄: 높이 80, 안쪽 여백 16/20, 둥글기 `radius.lg`, 고른 줄 배경 `colors.brand.primaryBg`, 안 고른 줄 `colors.surface.default`
   - 왼쪽: 여행 이름 `typography.bodyBold`, 아래 간격 2: [달력 아이콘 16 + "12.26 – 12.27"] [사람 아이콘 16 + "민준, 지우"] `typography.caption` `colors.text.icon`, 묶음 간격 14
   - 오른쪽 라디오 22: 고르면 `colors.brand.primary` 동그라미 안에 흰 점 8, 안 고르면 흰 동그라미
4. **안내** — 자물쇠·정보 아이콘 16 + "고른 여행의 동행만 볼 수 있어요" `typography.caption` `colors.text.icon`
5. **저장 버튼** — 위 여백 20, 오른쪽 끝 동그라미 주 버튼 48(`colors.brand.primary`), 체크 아이콘 24 흰색

## 공통 부품과 맞지 않는 점

- 글자 12/18 보통(저장 위치 칸)은 토큰에 없다. 가까운 것은 `typography.captionMedium`(12/20).
- 토스트에 [보기] 버튼을 넣는 자리가 공통 `toast`에 없다.
- 동그라미 아이콘 버튼(48)은 공통 `Button`에 없다.

## 예시 데이터

여행 "연말 강릉"(12.26 – 12.27, 민준·지우), "겨울 여행"(11.14 – 11.15, 서연·민준·지우). 피그마 예시 이름은 바꿨다.

## 버튼과 이동

[사용자 흐름](../../flow/user-flow.md) 기준. 누르는 것마다 어디로 가는지와 어떤 API를 부르는지.

| 누르는 것 | 어디서 | 동작·이동 |
| --- | --- | --- |
| 어두운 막, [닫기], 아래로 끌기 | 모든 상태 | 시트 닫고 원래 화면(S07·N3·N7·S12·S47)으로 |
| 나만 보기 / 동행과 같이 | 기본 | 저장 위치 바꾸기. '동행과 같이'를 고르면 담을 여행 목록이 펼쳐짐. 참여 중인 여행이 없으면 '동행과 같이'는 누를 수 없음 |
| 담을 여행 줄 | 기본 | 여행 하나 고르기(라디오) |
| [저장] 체크 동그라미 | 기본 | 나만 보기 → `PUT /me/bookmarks/{placeId}`, 동행과 같이 → `PUT /trips/{tripId}/saved-places/{placeId}/me`. 성공하면 시트 닫고 토스트 "OO 여행에 담았어요" + [보기]. 실패하면 저장 실패 상태 |
| 토스트 [보기] | 저장 완료 | 담은 여행의 S20 그룹 즐겨찾기(개인이면 S10) |
| [저장] | 가져온 장소(S12에서) | 찾은 장소 전부를 고른 위치에 저장. 성공하면 S10(개인) 또는 S20(그룹)으로 |
