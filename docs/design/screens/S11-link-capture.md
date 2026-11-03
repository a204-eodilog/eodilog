# S11 링크·캡처 등록

담당 B · 시연 핵심 · 요구사항 WD-FR-05 · 여는 곳 S10 [+], S20

화면 규칙은 [화면 목록](../../flow/screen-list.md) S11 줄: 링크 붙여넣기, 캡처 선택(한 번에 최대 10장), 메모.

## 상태

| 상태 | 피그마 | 달라지는 점 |
| --- | --- | --- |
| 기본 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-6459) | 아래 "기본" 그대로 |
| 지원하지 않는 형식 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-6573) | 링크 칸에 "https://example.com/menu.pdf", 칸 아래 오류 "이 형식에서는 장소를 찾을 수 없어요", 안내 상자 "이런 것을 넣어 주세요" · "SNS 게시물, 블로그 글 링크" · "캡처 이미지 (JPG, PNG)" |

## 기본

1. **상단 바** — 높이 56, [뒤로] + 큰 제목 "장소 가져오기" `typography.title1`
2. **본문** — 위 16, 좌우 20, 섹션 사이 28
   1. **복사한 링크 안내** — 배경 `colors.brand.primaryBg`, 둥글기 `radius.lg`(16), 안쪽 여백 14/8/14/18, 가로 간격 18. 클립보드 아이콘 20 · 가운데 "복사한 링크가 있어요" `typography.captionMedium` `colors.brand.primaryDark`, 아래 링크 주소 `typography.body` · 오른쪽 글자 버튼 "붙여넣기" `typography.bodyMedium` `colors.brand.primaryDark`(높이 36, 좌우 12). 클립보드에 링크가 있을 때만 보인다
   2. **링크** — 섹션 이름 줄(링크 아이콘 16 + "링크" `typography.captionMedium` `colors.text.icon`), 이름과 칸 간격 12. 입력 칸 높이 52, 배경 `colors.surface.default`, 둥글기 `radius.md`(12), 왼쪽 여백 16·오른쪽 52. 자리 글자 "링크를 붙여 넣어 주세요" 16/24 보통 `colors.text.sub`. 칸 안 오른쪽 끝에 흰 동그라미 붙여넣기 버튼 36(아이콘 18)
   3. **캡처** — 이름 줄 "캡처" + 오른쪽에 개수 "2장" `typography.caption`. 80x80 칸이 가로로: 첫 칸 [추가](배경 `colors.surface.default`, 둥글기 12, 더하기 아이콘 20 + "추가" `typography.captionMedium`), 그다음 고른 캡처 썸네일(둥글기 12, 오른쪽 위 검은 동그라미 24 빼기 버튼, X 아이콘 14 흰색)
   4. **메모** — 이름 줄 "메모" + 회색 작은 배지 "선택"(배경 `colors.surface.default`, 둥글기 6, 좌우 6, `typography.captionMedium` `colors.text.sub`). 여러 줄 입력 높이 88, 배경 `colors.surface.default`, 둥글기 12, 안쪽 16/18, 자리 글자 "예: 노을 질 때 가 보기" `typography.body`
3. **아래 버튼** — 오른쪽 정렬, 위 12·아래 34. 알약 주 버튼 48: 반짝임(찾기) 아이콘 20 + "장소 찾기". 누르면 S12 진행 중

## 공통 부품과 맞지 않는 점

- 입력 칸이 회색 상자 모양이라 공통 `TextField`(밑줄)와 다르다. S35 경비 입력과 같은 모양이라 **회색 상자 입력칸**을 공통으로 하나 만드는 게 좋다.
- 글자 16/24 보통(자리 글자)은 토큰에 없다. 가까운 것은 `typography.body`(16/26).
- 메모 자리 글자 색이 피그마 변수 `color/grey/46 2`로 따로 걸려 있다. `colors.text.muted`나 `colors.text.sub`로 맞추면 된다.
