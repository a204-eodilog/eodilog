# 화면별 피그마 링크

피그마 MCP를 쓸 수 없어도 화면을 찾고 만들 수 있게 정리한 문서다. 기준은 피그마 **어디로그(파랑)** 페이지의 `screens` 묶음이다. 화면 ID·이름·담당은 [화면 목록](../../flow/screen-list.md)과 같다.

- 링크를 누르면 그 상태 화면이 피그마에서 바로 열린다. 피그마 보기 권한이 있으면 된다.
- 담당: A 지도, B 업로드·AI·배포, C 실시간 (2026-11-03 확정).
- 화면별 디자인 값 문서(간격·글자·색을 토큰 이름으로 정리)는 같은 폴더에 `화면ID-영문이름.md`로 하나씩 추가한다. AI에게 화면을 만들게 할 때 이 문서와 [CONVENTION](../../../frontend/CONVENTION.md)을 함께 준다.
- 화면 사진은 없어도 된다. 기본 상태와, 기본과 모양이 많이 다른 상태(지도 보기, 진행 중, 시트가 뜨는 상태 등)는 구조·간격·글자·색·문구를 다 적었다. 나머지 상태도 "그 밖의 상태" 절에 값이 있고, 반복되는 모양은 아래 "상태 공통 모양"에 한 번만 적었다. 그래도 결과가 어긋나면 링크로 연 그 상태를 한 장 캡처해 같이 주면 된다.
- 피그마를 고치면 이 표도 함께 고친다. 상태 이름은 피그마 프레임 이름 그대로다.
- 화면 56개, 상태 214개. 오류 상태는 피그마 15번 섹션에 따로 있지만 여기서는 해당 화면 아래에 같이 둔다.

## 값 문서가 있는 화면

B 담당 화면 17개 전부와 A 담당 S13. 다른 화면은 필요할 때 같은 모양으로 추가한다.

| 화면 | 문서 |
| --- | --- |
| S08 장소 저장 시트 | [S08-place-save-sheet.md](S08-place-save-sheet.md) |
| S10 개인 즐겨찾기 | [S10-bookmarks.md](S10-bookmarks.md) |
| S11 링크·캡처 등록 | [S11-link-capture.md](S11-link-capture.md) |
| S12 추출 결과 확인 | [S12-extract-result.md](S12-extract-result.md) |
| S13 장소 직접 검색·지정 (수동 장소 규칙 포함) | [S13-place-search.md](S13-place-search.md) |
| S14 저장 장소 상세 | [S14-saved-place.md](S14-saved-place.md) |
| S30 사진 선택·업로드 | [S30-photo-upload.md](S30-photo-upload.md) |
| S31 여행 사진 목록 | [S31-trip-photos.md](S31-trip-photos.md) |
| S32 사진 분류·묶음 수정 | [S32-photo-group-edit.md](S32-photo-group-edit.md) |
| S33 방문 장소 평가 목록 | [S33-visit-review-list.md](S33-visit-review-list.md) |
| S34 평점·평가 작성 | [S34-review-write.md](S34-review-write.md) |
| S35 경비 목록·지출 입력 | [S35-expenses.md](S35-expenses.md) |
| S36 정산 결과 | [S36-settlement.md](S36-settlement.md) |
| N4 내 여행 목록 | [N4-my-trips.md](N4-my-trips.md) |
| S38 내 여행 기록·공동 피드 게시 | [S38-my-trip-record.md](S38-my-trip-record.md) |
| S41 타임라인 | [S41-timeline.md](S41-timeline.md) |
| S42 여행 요약 카드 | [S42-trip-summary-card.md](S42-trip-summary-card.md) |
| S50 삭제·나가기·탈퇴 확인 | [S50-confirm.md](S50-confirm.md) |

**여러 화면에 반복되는 것** (공통으로 만들면 좋은 것): 회색 상자 입력칸(S11·S34·S35), 둥글기 8 작은 태그(S12·S14·S33·N4·S41), 사진 고르기 칸(S30·S31·S32), 버튼이 있는 토스트(S08·S33), "나" 얼굴 연파랑(S31·S35·S36), 흰 테두리 카드(S38·S42), 새로고침·카드·계산기·별 아이콘.

## 상태 공통 모양

여러 화면의 빈 화면·오류·진행 상태가 같은 모양을 쓴다. 값 문서에서 "README 상태 공통 모양"이라고 가리키면 여기 값이다.

| 모양 | 값 | 공통 부품 |
| --- | --- | --- |
| **가운데 안내 화면** (빈 화면·오류·권한) | 본문 좌우 36~40, 세로 가운데 정렬. 동그라미 64(`colors.surface.default`, 오류 종류에 따라 `colors.brand.primaryBg`) 안에 아이콘 32 → 위 20 제목 `typography.title1` 가운데 정렬 → 위 8 설명 `typography.body` `colors.text.icon` → 위 24 알약 주 버튼 48(아이콘 20 + 글자) → 간격 10 글자 버튼 `typography.bodyMedium` `colors.text.icon`(있을 때만) | `EmptyState` / `ErrorState` |
| **안내 상자 (회색)** (실패·연결 끊김) | 배경 `colors.surface.subtle`(피그마 grey/98), 둥글기 `radius.xl`(20), 안쪽 20, 세로 간격 10~18. 줄(간격 14): 흰 동그라미 44 안에 아이콘 22 · 제목 `typography.bodyBold` + 설명 `typography.caption` `colors.text.icon`(간격 2). 버튼이 있으면 아래에 흰 알약 36(좌우 12/16, 아이콘 16 + `typography.bodyMedium`) | 없음. `Card variant="filled"`로 만들 수 있음 |
| **진행 상자 (연파랑)** (업로드·분류·재계산 안내) | 안내 상자와 같은데 배경 `colors.brand.primaryBg`. 진행 중이면 아래 진행 막대 높이 6(흰 바탕 알약, 채운 부분 `colors.brand.primary`). 버튼이 있으면 알약 주 버튼 40(`colors.brand.primary`) | 없음 |
| **오류 띠** (시트·입력 화면 안 실패) | 배경 `colors.surface.subtle`, 둥글기 14, 안쪽 16/18, 가로 간격 16: 빨간 느낌표 아이콘 20 · "…하지 못했어요" `typography.bodyBold` `colors.status.danger` + 안내 `typography.caption` `colors.text.icon`. 그 위 여백 16 | 없음 |
| **버튼 있는 토스트** | 공통 토스트(`colors.text.strong` 바탕, 둥글기 12, 안쪽 12/8/12/16): 아이콘 20~22 + 글 `typography.body` 흰색 + 오른쪽 글자 버튼 `typography.bodyMedium` `colors.brand.primarySoft` | `toast.success(글, { action })` |

## 1. 진입

| 화면 | 상태 | 담당 | 피그마 |
| --- | --- | --- | --- |
| S00 | 랜딩 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-5) |
| S01 | 로그인 · 기본 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-17) |
| S01 | 로그인 · 실패 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-54) |
| S01 | 로그인 · 로그인 만료 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-26585) |
| S02 | 프로필·연령 입력 · 기본 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-96) |
| S02 | 프로필·연령 입력 · 필수 항목 누락 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-184) |
| S02 | 프로필·연령 입력 · 저장 실패 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-26804) |
| S03 | 취향 입력 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-276) |
| S03 | 취향 입력 · 추천 직전 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-9958) |
| S03 | 취향 입력 · 저장 실패 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-26904) |
| S04 | 초대 참여 확인 · 유효 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-396) |
| S04 | 초대 참여 확인 · 무효·만료 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-475) |
| S04 | 초대 참여 확인 · 이미 참여 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-575) |
| S04 | 초대 참여 확인 · 인원 가득 참 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=772-231) |

## 2. 홈

| 화면 | 상태 | 담당 | 피그마 |
| --- | --- | --- | --- |
| S05 | 홈 친구 여행 지도 · 기본 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-724) |
| S05 | 홈 · 지도 확대 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=516-203) |
| S05 | 홈 · 추천 시트 펼침 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-1161) |
| S05 | 홈 · 친구 없음 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-1689) |
| S05 | 홈 · 첫 방문(여행 없음) | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=665-602) |
| S05 | 홈 · 공개된 기록 없음 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-2030) |
| S05 | 홈 · 지도 로드 실패 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-2369) |
| S06 | 같은 지역 여행 목록 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-2446) |
| S06 | 같은 지역 여행 목록 · 불러오기 실패 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-27514) |
| S07 | 친구 여행 상세 · 기본 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-2852) |
| S07 | 친구 여행 상세 · 일부 항목 비공개 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-3146) |
| S07 | 친구 여행 상세 · 볼 수 없음 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-3391) |
| S07 | 친구 여행 상세 · 스크롤 중 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-3434) |
| S07 | 친구 여행 상세 · 사진 모두 보기 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=342-1514) |
| S08 | 장소 저장 시트 · 기본 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-3621) |
| S08 | 장소 저장 시트 · 참여 중인 여행 없음 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-3983) |
| S08 | 장소 저장 시트 · 저장 완료 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-4637) |
| S08 | 저장 위치 선택 · 가져온 장소 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-7075) |
| S08 | 장소 저장 시트 · 저장 실패 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-27887) |
| S09 | 최근 트렌드 여행지 · 기본 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-4933) |
| S09 | 최근 트렌드 여행지 · 당겨서 새로고침 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=249-1509) |
| S09 | 최근 트렌드 여행지 · 자료 부족 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-5149) |
| S09 | 최근 트렌드 여행지 · 불러오기 실패 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-28260) |
| N3 | 여행지 정보 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-5211) |
| N3 | 여행지 정보 · 불러오기 실패 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-28309) |
| N7 | 장소 정보 시트 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-5305) |
| N7 | 장소 정보 시트 · 불러오기 실패 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-27033) |

## 3. 저장

| 화면 | 상태 | 담당 | 피그마 |
| --- | --- | --- | --- |
| S10 | 개인 즐겨찾기 · 목록 보기 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-5795) |
| S10 | 개인 즐겨찾기 · 지도 보기 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-5989) |
| S10 | 개인 즐겨찾기 · 저장 없음 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-6363) |
| S10 | 개인 즐겨찾기 · 연결 끊김 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-28358) |
| S11 | 링크·캡처 등록 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-6459) |
| S11 | 링크·캡처 등록 · 지원하지 않는 형식 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-6573) |
| S12 | 추출 결과 확인 · 진행 중 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-6645) |
| S12 | 추출 결과 확인 · 성공 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-6941) |
| S12 | 추출 결과 확인 · 복수 후보 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-6727) |
| S12 | 추출 결과 확인 · 식별 불가 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-6847) |
| S12 | 추출 결과 확인 · 처리 실패 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-6894) |
| S12 | 추출 결과 확인 · 그룹 즐겨찾기에서 시작 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-7617) |
| S13 | 장소 직접 검색·지정 · 검색 결과 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-7765) |
| S13 | 장소 직접 검색·지정 · 검색 결과 없음 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-7856) |
| S13 | 장소 직접 검색·지정 · 지도에서 고르기 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-7911) |
| S13 | 장소 직접 검색·지정 · 검색 오래 걸림 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-28563) |
| S14 | 저장 장소 상세 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-7248) |
| S14 | 저장 장소 상세 · 원본 공동 피드 삭제·볼 수 없음 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-7347) |
| S14 | 저장 장소 상세 · 그룹 즐겨찾기에 추가 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-7447) |
| S14 | 저장 장소 상세 · 그룹 즐겨찾기에 추가 · 참여 중인 여행 없음 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=385-5108) |

## 4. 여행: 만들기·동행·모으기·정하기

| 화면 | 상태 | 담당 | 피그마 |
| --- | --- | --- | --- |
| S15 | 여행 목록 · 기본 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-7985) |
| S15 | 여행 목록 · 여행 없음 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-8153) |
| S15 | 여행 목록 · 연결 끊김 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-28622) |
| S16 | 새 여행 만들기 · 기본 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-8206) |
| S16 | 새 여행 만들기 · 이름 없음 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-8260) |
| S16 | 새 여행 만들기 · 프로필 미완성 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=620-285) |
| S16 | 새 여행 만들기 · 기간 선택 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=342-1113) |
| S16 | 새 여행 만들기 · 여행지 검색 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=342-1348) |
| S16 | 새 여행 만들기 · 만들기 실패 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-28823) |
| S17 | 여행 상세 · 계획 중(여행지 미정) · 아이콘 격자 안 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-8338) |
| S17 | 여행 상세 · 계획 중(여행지 미정) · 탭 안 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-8493) |
| S17 | 여행 상세 · 계획 중(여행지 정해짐) | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-8623) |
| S17 | 여행 상세 · 여행 중 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-8797) |
| S17 | 여행 상세 · 다녀옴 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-8970) |
| S17 | 여행 상세 · 불러오기 실패 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-28907) |
| S18 | 초대 링크 공유 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-9145) |
| S18 | 초대 링크 공유 · 링크 없음 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=792-240) |
| S18 | 초대 링크 공유 · 링크 만들기 실패 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-28954) |
| S19 | 여행 설정 · 동행이 볼 때 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-9254) |
| S19 | 여행 설정 · 방장이 볼 때 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=403-582) |
| S19 | 여행 설정 · 방장 넘기기 대상 선택 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=385-3733) |
| S19 | 여행 정보 수정 · 저장 실패 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-29051) |
| S20 | 그룹 즐겨찾기 · 목록 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-9344) |
| S20 | 그룹 즐겨찾기 · 지도 보기 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-9521) |
| S20 | 그룹 즐겨찾기 · 장소 없음 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-9686) |
| S20 | 그룹 즐겨찾기 · 장소 추가 시트 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-9751) |
| S20 | 그룹 즐겨찾기 · 코스에 있는 장소 빼기 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-29151) |
| N8 | 투표 열기 시트 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=385-560) |
| S21 | 추천 결과 · 생성 중 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-10044) |
| S21 | 추천 결과 · 성공 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-10081) |
| S21 | 추천 결과 · 겹침 없음 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-10340) |
| S21 | 추천 결과 · 자료 부족 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-10470) |
| S21 | 추천 결과 · 생성 실패 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-10530) |
| S22 | 지역·장소 투표 · 진행 중인 투표 없음 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-10579) |
| S22 | 지역·장소 투표 · 진행 중 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-10912) |
| S22 | 지역·장소 투표 · 후보 추가 시트 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=418-188) |
| S22 | 지역·장소 투표 · 진행 중 후보 추가됨 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=385-2305) |
| S22 | 지역·장소 투표 · 마감 후 자동 확정 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-11073) |
| S22 | 지역·장소 투표 · 동률 · 같은 표 모두 확정 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-11213) |
| S22 | 지역·장소 투표 · 0표 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-11494) |
| S22 | 지역·장소 투표 · 여행지 확정 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-11569) |
| S22 | 지역·장소 투표 · 투표 바꾸기 실패 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-29384) |
| S23 | 코스 짜기 · 구성 방식 선택 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-12269) |
| S23 | 코스 짜기 · 여행지 미정 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-12377) |
| S23 | 코스 짜기 · 기간 없음 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-12442) |
| S23 | 코스 짜기 · 자동 추천 생성 중 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-12610) |
| S23 | 코스 짜기 · 자동 추천 실패 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-12684) |
| S23 | 코스 짜기 · 직접 만들기 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-12753) |
| S23 | 코스 짜기 · 직접 만들기 · 장소 놓은 뒤 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=523-349) |
| S23 | 코스 짜기 · 코스 초안 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-12879) |
| S23 | 코스 짜기 · 장소 교체·순서 변경·삭제 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-13071) |
| S23 | 코스 짜기 · 이동 시간 계산 불가 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-13272) |
| S23 | 코스 짜기 · 함께 편집 중 연결이 끊겼다 돌아옴 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-13453) |
| S23 | 코스 짜기 · 여러 지역 날짜별로 나누기 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=385-2817) |
| S24 | 코스 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-13969) |
| S24 | 코스 · 이동 시간 갱신 실패 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-29705) |

## 5. 여행 중

| 화면 | 상태 | 담당 | 피그마 |
| --- | --- | --- | --- |
| S25 | 여행 중 · 여행 중 상태 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-14252) |
| S25 | 여행 중 · 코스 없음 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-14433) |
| S25 | 여행 중 · 여행 시작 전 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-14584) |
| S25 | 여행 중 · 날씨 갱신 실패 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-14701) |
| S26 | 날씨 대안 · 기본 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-14861) |
| S26 | 날씨 대안 · 코스에 반영한 뒤 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-15028) |
| S26 | 날씨 대안 · 대안 없음 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-15227) |
| S26 | 날씨 대안 · 날씨 갱신 실패 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-29899) |
| S27 | 준비물 체크리스트 · 기본 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-15314) |
| S27 | 준비물 체크리스트 · 항목 없음 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-15518) |
| S27 | 준비물 체크리스트 · 다시 제안 실패 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-30067) |
| S28 | 주변 편의시설 · 기본 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-15586) |
| S28 | 주변 편의시설 · 조회 실패 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-15776) |
| S28 | 주변 편의시설 · 결과 없음 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-15901) |
| S29 | AI 변경안 · 비교 (동행 누구나 적용) | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-16028) |
| S29 | AI 변경안 · 적용 후 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-16198) |
| S29 | AI 변경안 · 재계산 실패 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-16329) |

## 6. 여행 후

| 화면 | 상태 | 담당 | 피그마 |
| --- | --- | --- | --- |
| S30 | 사진 선택·업로드 · 사진 선택 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-16782) |
| S30 | 사진 선택·업로드 · 사진 권한 거절 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-16998) |
| S30 | 사진 선택·업로드 · 업로드 진행 중 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-17057) |
| S30 | 사진 선택·업로드 · 일부 실패 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-17208) |
| S31 | 여행 사진 목록 · 기본 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-17384) |
| S31 | 여행 사진 목록 · 분류 중 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-17604) |
| S31 | 여행 사진 목록 · 사진 없음 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-17738) |
| S31 | 여행 사진 목록 · 장소 미지정 묶음 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-17795) |
| S31 | 여행 사진 목록 · 자동 분류 실패 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-30488) |
| S32 | 사진 분류·묶음 수정 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-17941) |
| S32 | 사진 분류·묶음 수정 · 바꾸기 실패 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-30627) |
| S33 | 방문 장소 평가 목록 · 방문 후보 있음 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-18223) |
| S33 | 방문 장소 평가 목록 · 사진 없는 장소 직접 체크 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-18402) |
| S33 | 방문 장소 평가 목록 · 방문 후보 없음 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-18587) |
| S33 | 방문 장소 평가 목록 · 불러오기 실패 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-30774) |
| S34 | 평점·평가 작성 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-18768) |
| S34 | 평점·평가 · 남긴 뒤 (본인만 수정, 삭제) | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-18933) |
| S34 | 평점·평가 작성 · 저장 실패 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-30839) |
| S35 | 경비 목록 · 기본 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-19096) |
| S35 | 경비 목록 · 지출 없음 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-19260) |
| S35 | 경비 목록 · 정산 후 지출 변경 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-19308) |
| S35 | 경비 목록 · 지출 추가 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-19508) |
| S35 | 경비 목록 · 지출 저장 실패 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-31016) |
| S36 | 정산 결과 · 기본 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-19618) |
| S36 | 정산 결과 · 재계산 필요 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-19859) |
| S36 | 정산 결과 · 계산 실패 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-31138) |

## 7. 마이페이지·친구

| 화면 | 상태 | 담당 | 피그마 |
| --- | --- | --- | --- |
| S37 | 마이페이지 · 기본 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-20528) |
| S37 | 마이페이지 · 기록 없음 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-20892) |
| S37 | 마이페이지 · 지도 불러오기 실패 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-31205) |
| N4 | 내 여행 목록 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-21213) |
| N4 | 내 여행 목록 · 불러오기 실패 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-31328) |
| S38 | 내 여행 기록 · 게시 전 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-21466) |
| S38 | 내 여행 기록 · 게시 확인 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=385-3339) |
| S38 | 내 여행 기록 · 게시됨 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-21588) |
| S38 | 내 여행 기록 · 불러오기 실패 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-31377) |
| S39 | 내 노출 설정 · 기본 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-21725) |
| S39 | 내 노출 설정 · 공동 피드 삭제 확인 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-22328) |
| S39 | 내 노출 설정 · 저장 실패 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-31426) |
| S39 | 내 노출 설정 · 저장하는 중 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-31610) |
| S40 | 친구에게 보이는 모습 · 특정 친구 기준 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-22631) |
| S40 | 친구에게 보이는 모습 · 불러오기 실패 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-31785) |
| S41 | 타임라인 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-22968) |
| S41 | 타임라인 · 불러오기 실패 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-31855) |
| S42 | 여행 요약 카드 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-23170) |
| S42 | 여행 요약 카드 · 만들기 실패 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-31904) |
| S43 | 친구 목록 · 기본 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-23283) |
| S43 | 친구 목록 · 팔로워 탭 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=385-5529) |
| S43 | 친구 목록 · 친구 없음 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-23433) |
| S43 | 친구 목록 · 요청 수락 후 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-23483) |
| S43 | 친구 목록 · 팔로우 해제 확인 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-23632) |
| S43 | 친구 목록 · 요청 수락 실패 (N6 받은 요청) | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-31953) |
| S44 | 친구 추천·검색 · 기본 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-23797) |
| S44 | 친구 추천·검색 · 추천 후보 없음 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-23938) |
| S44 | 친구 추천·검색 · 검색 결과 없음 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-23995) |
| S44 | 친구 추천·검색 · 비공개 계정에 팔로우 요청 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-24053) |
| S44 | 친구 추천·검색 · 팔로우 요청 실패 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-32112) |
| N9 | 다른 사용자 프로필 · 공개 계정, 팔로잉 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=385-1303) |
| N9 | 다른 사용자 프로필 · 비공개 계정 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=385-2062) |
| S45 | 프로필·취향·설정 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-24201) |
| S45 | 프로필·취향·설정 · 설정 바꾸기 실패 | A | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-32262) |

## 8. 채팅

| 화면 | 상태 | 담당 | 피그마 |
| --- | --- | --- | --- |
| S46 | 대화방 목록 · 기본 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-24721) |
| S46 | 대화방 목록 · 대화방 없음 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-24897) |
| S46 | 대화방 목록 · 연결 끊김 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-32522) |
| S47 | 대화방 · 기본 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-25069) |
| S47 | 대화방 · 비참여자 차단 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-25215) |
| S47 | 대화방 · 시스템 메시지 모음 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-25281) |
| S47 | 대화방 · 투표 시스템 메시지 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-11701) |
| S47 | 대화방 · 코스 시스템 메시지 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-14141) |

## 9. 알림·공통

| 화면 | 상태 | 담당 | 피그마 |
| --- | --- | --- | --- |
| S48 | 알림 팝업 · 미확인 알림 모아 보기 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-25425) |
| S48 | 알림 팝업 · 투표 시작 (동행이 받는 화면) | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-11808) |
| S49 | 알림 목록 · 기본 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-25921) |
| S49 | 알림 목록 · 알림 없음 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-26140) |
| S49 | 알림 목록 · 볼 수 없음 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-26179) |
| S49 | 알림 목록 · 불러오기 실패 | C | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-32709) |
| S50 | 삭제·나가기·탈퇴 확인 · 여행 나가기 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-26230) |
| S50 | 삭제·나가기·탈퇴 확인 · 여행 나가기 · 방장일 때 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=385-4086) |
| S50 | 삭제·나가기·탈퇴 확인 · 여행 나가기 · 혼자 남았을 때 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=385-4607) |
| S50 | 삭제·나가기·탈퇴 확인 · 처리 실패 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-26401) |
| S50 | 삭제 확인 · 사진 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-18079) |
| S50 | 삭제 확인 · 탈퇴 | B | [열기](https://www.figma.com/design/GDzsmFpkkSRSUzQTWpBtVc/eodilog?node-id=201-24452) |
