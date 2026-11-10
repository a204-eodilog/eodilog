# Contract: 화면 주소

| 주소 | 화면 | 들어오는 곳 |
|---|---|---|
| /trips/[tripId]/course | S24 코스. 코스가 비었으면 edit로 바꿔 연다 | S17 '코스' 메뉴, 알림(12번 주제) |
| /trips/[tripId]/course/edit | S23 코스 짜기 | S24 [편집], S24 빈 코스 |
| /trips/[tripId]/course/edit?split=1 | S23 날짜별 지역 고르기로 열기 | S22 동률 [코스에서 날짜별로 나누기](합친 뒤, Q-6-4) |
| /dev/course?state= | 미리보기 | choose, no-region, no-dates, auto-loading, auto-fail, manual, manual-placed, draft, item-sheet, no-route, split, view, view-fail, load-error |
