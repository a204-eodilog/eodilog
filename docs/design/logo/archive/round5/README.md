# 어디로그 로고 4차 (말랑한 3D 핀 캐릭터)

> 관련 이슈: EODI-95 · 서비스명은 임시

iOS 아이콘 레퍼런스(큰 눈의 말랑한 3D 캐릭터, 그라데이션 하늘)를 참고해 핀 캐릭터를 앱 아이콘 형태로 만들었다. 배경까지 포함된 아이콘이다.

## 4차 수정본 (낮·밤 한 쌍)

| 파일 | 설명 |
| --- | --- |
| [Z-1_straw-hat-pin_day.svg](Z-1_straw-hat-pin_day.svg) | 밀짚모자 핀 · 낮. 연한 살구 배경, 해, 비행기 점선 |
| [Z-2_straw-hat-pin_night.svg](Z-2_straw-hat-pin_night.svg) | 밀짚모자 핀 · 밤. 밤하늘, 달과 별, 불빛 단 비행기 |

캐릭터 위치와 소품이 같아 낮·밤 아이콘으로 바꿔 써도 같은 앱으로 보인다. iOS는 `frontend/assets/expo.icon`의 라이트·다크 모드 아이콘으로 넣을 수 있다. 안드로이드는 다크 모드 아이콘을 지원하지 않으므로 낮 아이콘을 쓴다.

## 4차 후보

| 파일 | 설명 |
| --- | --- |
| [Y-1_sky-pin.svg](Y-1_sky-pin.svg) | 하늘 핀 (기본형) |
| [Y-2_sunny-pin.svg](Y-2_sunny-pin.svg) | 햇살 핀 |
| [Y-3_night-pin.svg](Y-3_night-pin.svg) | 밤하늘 핀 |
| [Y-4_friend-pins.svg](Y-4_friend-pins.svg) | 마주 본 친구 핀 |
| [Y-5_side-eye-pin.svg](Y-5_side-eye-pin.svg) | 곁눈질 핀 |
| [Y-6_walking-pin.svg](Y-6_walking-pin.svg) | 걸어가는 핀 (전신) |

## 참고

- 그라데이션과 블러 필터를 사용한다. 29px 이하에서는 소품이 잘 보이지 않을 수 있다.
- SVG 렌더링은 직접 확인하지 않았다.
