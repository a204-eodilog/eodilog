# S11 링크·캡처 등록

담당 B · 시연 핵심 · 요구사항 WD-FR-05 · 여는 곳 S10 [+], S20

화면 규칙은 [화면 목록](../../flow/screen-list.md) S11 줄: 링크 붙여넣기, 캡처 선택(한 번에 최대 10장), 메모.

## 상태

| 상태 | 피그마 | 달라지는 점 |
| --- | --- | --- |
| 기본 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-6459) | 아래 "기본" 그대로 |
| 지원하지 않는 형식 | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-6573) | 아래 "지원하지 않는 형식" 참고 |

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

## 지원하지 않는 형식

- 복사한 링크 안내 상자 없음. 링크 칸에 "https://example.com/menu.pdf"가 들어 있고 칸 아래(간격 12) 오류 줄: 경고 아이콘 16 + "이 형식에서는 장소를 찾을 수 없어요" `typography.captionMedium` `colors.status.danger`
- 그 아래 안내 상자(배경 `colors.surface.default`, 둥글기 16, 안쪽 20, 세로 12): "이런 것을 넣어 주세요" `typography.captionMedium` `colors.text.icon` → [링크 아이콘 20 + "SNS 게시물, 블로그 글 링크"] [사진 아이콘 20 + "캡처 이미지 (JPG, PNG)"] `typography.body`
- 캡처·메모 칸은 없고, [장소 찾기] 버튼은 흐림 0.32로 누를 수 없음
- 이 상태가 되는 링크(FE): http(s)가 아님, 파일 링크(.pdf·.zip·.mp4 등), 그리고 서버가 400으로 거부하는 링크(계정 정보 `user@` 포함, 80·443 외 포트, 2048자 초과, 백엔드 안내 2026-11-09)
- 설정에서 "링크와 캡처에서 장소 찾기"를 끈 채 보내면(409 `AI_FEATURE_DISABLED`) 다시 시도해도 안 되므로 오류 토스트 "설정에서 "링크와 캡처에서 장소 찾기"가 꺼져 있어요" + [설정] 버튼(설정 화면으로 이동). S12 [다시 시도]도 같음

## 버튼과 이동

[사용자 흐름](../../flow/user-flow.md) 기준. 누르는 것마다 어디로 가는지와 어떤 API를 부르는지.

| 누르는 것 | 어디서 | 동작·이동 |
| --- | --- | --- |
| [뒤로] | 상단 바 | S10(또는 S20)으로. 입력한 내용은 버림 |
| [붙여넣기] (안내 상자·칸 안 버튼) | 복사한 링크 안내 / 링크 칸 | 클립보드 링크를 링크 칸에 넣음. 안내 상자는 사라짐 |
| [추가] 캡처 칸 | 캡처 | 기기 사진 고르기. 한 번에 최대 10장. 권한 거절이면 S30과 같은 권한 안내 |
| 캡처 썸네일 [X] | 캡처 | 그 캡처만 뺌 |
| [장소 찾기] | 아래 버튼 | 링크·캡처·메모를 AI 추출 작업으로 보냄 → S12 진행 중. 링크 형식이 안 맞으면 지원하지 않는 형식 상태로 남고 보내지 않음. 링크도 캡처도 없으면 누를 수 없음 |
