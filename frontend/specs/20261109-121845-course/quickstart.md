# Quickstart: 코스 확인

## 테스트
```bash
npx jest src/features/course
npx tsc --noEmit
npx eslint src/features/course src/app/dev/course.tsx
```

## 미리보기
테스트 모드 웹(8090)에서 `/dev/course?state=<상태>`를 contracts/routes.md 목록대로 열어 Figma와 비교한다.

## 테스트 모드 흐름
1. 여행 상세 → '코스' → 코스가 비었으면 구성 방식 선택.
2. [직접 만들기] → 1일차에 칩 두 개, 2일차 칸 누르고 칩 하나 → [코스 만들기] → [완료] → S24.
3. S24 [편집] → 장소 더보기 → 아래로 → [완료] → 순서 바뀜.
4. 콘솔 `globalThis.__devMock.course.editByOther('trip-1')` 뒤 [완료] → 충돌 안내와 최신 코스.
5. [재추천] → 생성 중 → 추천안. `globalThis.__devMock.course.failNextProposal()` 뒤 → 실패 화면.
6. S24 [다시 계산] → 가짜 서버가 구간 시간을 채움. `failNextRecalculate()` 뒤 → 실패 안내.

## 실서버(사용자 몫)
로컬 백엔드 + 웹, 안드로이드 기기(지도 핀·선, 달력).
