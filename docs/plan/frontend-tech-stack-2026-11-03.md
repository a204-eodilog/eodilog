# 어디로그 프론트엔드 라이브러리·기술 정리 (검토 반영본)

2026-11-03 기준. 영광님 「프론트엔드 라이브러리·기술 정리」(2차)에 두 검토를 합치고, 갈린 항목은 11-03에 팀에서 정했다.

- 검토 A: 프론트 팀원 「라이브러리 검토 의견」 — npm 버전·peer 의존성(11-03 확인), `docs/api-spec.md`, `EodiLog/docs/plan`, PRD v0.6 기준
- 검토 B: PRD(WD-FR)·`docs/flow/screen-list.md`·머지 전 `feature/EODI-58-design-tokens`·`-59-ui-components` 브랜치 기준

## 11-03 확정한 것

1. **지도·장소: 네이버로 확정.** 장소 공급자 재검토(-162)에서 카카오 장소명·주소 저장이 약관상 안 된다는 확인이 있었다(검토 A). 장소 ID는 추출·즐겨찾기·투표·코스·지도에 모두 걸려 있어 검색·ID·지도·길찾기를 네이버 하나로 통일한다.
   - 앱 지도: `@mj-studio/react-native-naver-map`. 비공식 라이브러리이고 RN 0.88은 미확인이라 개발 빌드로 먼저 확인한다
   - 개발 빌드에서 마커 묶기(WD-FR-24), 시·군·구 폴리곤(WD-FR-25), 경로 선(WD-FR-14)을 같이 확인한다
   - 자동차 길찾기는 유료(건당 5원)이고 백엔드가 호출한다. 대중교통·도보는 공식 API가 없어 1차는 거리 기반 추정(백엔드가 정함)
   - 로그인은 그대로 카카오라 카카오·네이버 계정 두 개를 쓴다
   - `EodiLog/docs/plan/places-regions-contract-to-B-2026-11-02.md`는 아직 카카오 기준이다. 백엔드 -162에 이 결정을 전달한다
2. **아이콘: 직접 그린 SVG(`components/ui/icon.tsx`)로 확정.** react-native-svg로 그리고, 모자란 아이콘은 icon.tsx에 추가한다. lucide-react-native는 쓰지 않는다.
3. **다른 앱에서 링크 공유받기(expo-share-intent): 후순위.** 1차는 S11 명세대로 링크 붙여넣기·캡처 선택으로 만든다. 나중에 넣을 때 S11 명세에 진입 경로를 추가한다.

## 아직 정할 것

- **글꼴:** 화면을 보고 나중에 정한다. 후보는 Pretendard(정리본·검토 A)와 Noto Sans KR(58 브랜치, `@expo-google-fonts/noto-sans-kr`). 바꿔도 `src/theme/typography.ts`와 글꼴 불러오기만 바뀐다.

## 이미 설치됨

- 앱: Expo SDK 58, React Native 0.88, React 19.3, TypeScript 6, expo-dev-client, React Compiler(`app.json` experiments)
- 화면 이동: expo-router, expo-linking
- 서버 데이터: @tanstack/react-query, axios
- 앱 상태: zustand
- 이미지: expo-image
- 애니메이션·제스처: react-native-reanimated, react-native-gesture-handler 3.3, react-native-worklets 0.13
- 로그인 창: expo-web-browser
- 글꼴: expo-font
- 코드 검사: ESLint, Prettier

## 확정 (설치할 것)

- 지도: @mj-studio/react-native-naver-map (개발 빌드로 확인)
- 스타일: StyleSheet + `src/theme` 토큰 + 자체 공통 컴포넌트. 추가 설치 없음
  - Uniwind 무료판은 Reanimated 4 애니메이션을 className으로 못 쓴다(Pro 전용). 한 앱에 두 방식이 섞인다
  - Uniwind 공식 지원 범위가 RN 0.81~0.86이다
  - HeroUI는 Uniwind 1.13 + Tailwind 4 + @gorhom/bottom-sheet + expo-blur가 묶음으로 필요하다
  - 59 브랜치에 Button·Chip·TextField·Header·TabBar·EmptyState·Icon이 이미 이 방식으로 있다
  - 토큰 이름·속성 오류를 타입 검사가 잡는다. Tailwind 클래스는 문자열이라 오타가 안 걸린다
- 아이콘: react-native-svg + `components/ui/icon.tsx`
- 로그인: 카카오 웹 로그인 + PKCE (expo-web-browser, expo-crypto). 백엔드 authorization-requests → sessions가 PKCE verifier를 받는 구조와 맞다
- 채팅: @stomp/stompjs. 1차는 채팅만, 즐겨찾기·투표 실시간 신호는 그다음. RN에서는 `forceBinaryWSFrames`, `appendMissingNULLonIncoming` 옵션을 켠다
- 초대·정산·장소 공유: React Native Share (설치 없음)
- 바텀시트: @gorhom/bottom-sheet 5.2.14 (Reanimated ≥4, 제스처 ≥2.16.1 확인)
- 토스트: sonner-native 0.27 (Reanimated ^4.1.1 확인)
- 조작감: react-native-keyboard-controller, expo-haptics
- 저장: expo-secure-store (토큰), react-native-mmkv (그 외)
- 사진: expo-image-picker, expo-file-system (업로드 진행률). **원본 그대로 올린다**
  - 백엔드가 `/assets/{assetId}/complete`에서 원본 EXIF의 위치·촬영 시각을 추출한다(`docs/api-spec.md`). AI 방문 판정(300m)도 이 값을 쓴다
  - 앱에서 줄이거나 변환하면 EXIF가 사라진다. HEIC는 백엔드가 받는다(TRIP_PHOTO: JPG·PNG·HEIC)
  - expo-image-manipulator는 미리보기 썸네일이 꼭 필요할 때만 쓴다
- 사진 확대: 1차는 expo-image 확대로 처리
- 목록: @shopify/flash-list
- 기타: expo-clipboard, @react-native-community/netinfo
- 날짜: react-native-calendars, @react-native-community/datetimepicker, dayjs
- 폼·오류: react-hook-form, zod, react-error-boundary (화면 단위 오류는 expo-router의 `ErrorBoundary` 내보내기로도 된다)
- 테스트: jest-expo 58 + @testing-library/react-native 14. 정산 올림(WD-FR-23) 같은 계산 로직부터 (정책은 팀에서 정한다)

## 코스 화면 만들 때 확인

- 순서 바꾸기: react-native-reanimated-dnd. peer 의존성이 제스처 >=2.28.0, Reanimated >=4.2.0이고 제스처 3은 명시가 없다. 개발 빌드로 확인한다. 대안은 react-native-reorderable-list
- 다른 날로 옮기기: WD-FR-13은 날짜별 배치라 목록 사이 이동이 필요하다. 드래그 라이브러리는 대부분 한 목록 안에서만 된다. 같은 날 안에서는 드래그, 다른 날로는 "다른 날로 옮기기" 시트로 나누는 안을 검토한다

## 추천 (아직 미정)

- API 코드 자동 생성: orval (백엔드 springdoc 명세에서 타입·zod 스키마·mock 생성)
- 가짜 API: msw. RN에서는 URL·TextEncoder polyfill과 `msw/native` 설정이 필요하다. API가 없어 막힐 때 도입해도 된다
- 커밋 전 자동 검사: husky + lint-staged. git 루트가 저장소 전체라 백엔드 커밋에도 hook이 걸리지 않게 `frontend/**`만 대상으로 잡고 `frontend`에서 실행한다
- 부품 카탈로그: Storybook (실제로 쓸 때만, 웹 배포까지)
- 편의: es-toolkit, ts-pattern (필요할 때)

## 나중에

- 다른 앱에서 링크 공유받기: expo-share-intent (9.0, Expo 58용. 개발 빌드·scheme 변경 선행)
- 성능 측정: @welldone-software/why-did-you-render, react-native-performance, Flashlight. React Compiler가 켜져 있고 1차 범위 밖이다. 느려지면 추가
- lottie-react-native
- react-native-view-shot + expo-sharing
- @sentry/react-native
- expo-updates

## 쓰지 않음

- Uniwind, prettier-plugin-tailwindcss, HeroUI Native: 위 「스타일」 근거
- lucide-react-native: 아이콘은 직접 그린 SVG로 확정
- expo-notifications, EAS 푸시 토큰, FCM 키: PRD WD-FR-34·api-spec §9에서 푸시는 범위 밖. 백엔드에 푸시 발송이 없다
- expo-location: PRD §6-5 "현재 위치를 수집하거나 실시간 위치를 공유하기로 정한 것은 아니다". S28 편의시설은 코스의 기준 장소로 조회한다. 현재 위치를 쓰는 화면이 없다
- expo-media-library: 백엔드가 원본 EXIF에서 추출한다. 앱에서 읽어 보내면 서버 값과 이중이 되고 사진첩 전체 권한을 요구한다
- expo-blur, expo-linear-gradient: Figma에 블러·그라데이션이 없다
- @benschac/react-native-awesome-gallery: peer 의존성이 제스처 ^2.0.0, 워클릿 >=0.7.0 <0.9.0이라 우리(제스처 3.3, 워클릿 0.13)와 충돌한다
- @react-native-kakao/user: 백엔드에 맞춰 웹 로그인으로 감
- moti: Reanimated 4의 CSS식 애니메이션과 겹침
- pressto: Reanimated로 공통 버튼을 직접 만듦
- @shopify/react-native-skia: 필요한 화면이 없고 앱 용량이 늘어남

## 이미 있는 것으로 해결

- 권한 거절 시 설정 열기: expo-linking의 openSettings
- 정산 결과·장소 공유 (S36, S47): React Native Share
- 무한 스크롤 피드: TanStack Query useInfiniteQuery
- 인앱 알림 팝업 (S48): AppState 복귀 시 다시 불러오기

## 백엔드 명세를 따르는 공통 처리 (`src/api`)

- 로그인 유지: access 1시간·refresh 14일, 갱신 API → secure-store 저장, 만료 시 자동 갱신
- 프로필 미완성: 403 PROFILE_INCOMPLETE → 프로필 입력 시트
- 중복 요청: 생성 API Idempotency-Key 필수 → 요청마다 UUID
- 동시 수정: expectedVersion, 다르면 409 VERSION_CONFLICT → "먼저 바뀐 게 있어요" + 최신 불러오기
- 비참여자: 404 TRIP_NOT_FOUND → "볼 수 없는 여행"
- 시간 걸리는 작업: 202 + jobId, GET /jobs/{id} → 작업 상태 확인 훅 하나
- 오류 형식: {error:{code,message,fields,traceId}} → 공통 변환 하나
- 지역: 법정동 코드 10자리, 시드 완료, GET /regions?query=
- 채팅: sequence 페이지, clientMessageId 중복 방지
- 투표: 자동 마감, version은 후보 추가·마감 때만
- 나가기 1단계: 삭제 옵션 400, 혼자 남은 방장 409
- 코스: 전체 교체 + 버전 충돌(-164 구현 중). 실시간 공동 편집은 Q-15 이후
- 사진 업로드: 업로드 의도 → 직접 올리기 → 완료 알림, JPG·PNG·HEIC

## 프론트에서 필요한 외부 키

- 네이버 클라우드 지도 Client ID: 지도 SDK에 넣는다
- 카카오 키는 필요 없음: 웹 로그인이라 백엔드만 가진다
- 날씨·길찾기·장소 검색은 백엔드·AI 서버가 호출한다. 프론트는 우리 API만 부른다
- EAS projectId: EAS 빌드·Update에 필요

## 백엔드에 요청할 것

- 장소 공급자 네이버 확정을 -162에 반영 (장소 ID·검색·길찾기 계약 갱신)
- 운영용 카카오 로그인 브리지 GET /oauth/kakao/callback. 지금은 `@Profile("local")`인 `LocalKakaoController`만 있다
- 앱 scheme `eodilog`를 allowedRedirects에 등록
- 코스 구간 응답에 추정/정확 구분 값(예: `estimated: boolean`). 화면에 "약" 표시용
- STOMP 연결 방식·인증 토큰 전달. 채팅 REST가 끝났으니 지금 정한다

## 지금 할 일

- 앱 이름·scheme·번들 ID를 지금 `eodilog`로 바꾼다(`app.json`: 지금 `이어행 / ieohaeng / com.eodilog.app`). 초대 링크, 로그인 뒤 앱 복귀, 공유받기가 모두 이 값이고 카카오 콘솔 redirect·백엔드 allowedRedirects·app.json 세 곳에 들어간다. 미루면 세 곳을 다시 등록해야 하고 이미 보낸 초대 링크가 무효가 된다
- 네이버 클라우드 지도 Client ID를 발급하고 개발 빌드로 지도 라이브러리를 확인한다
- `frontend/CONVENTION.md`의 기능 폴더 목록(camper·family·wrap·driver 등)을 어디로그 기능 묶음으로 고친다
- 58·59 브랜치를 dev에 머지한다. 글꼴은 나중에 typography.ts만 바꾸면 되므로 머지를 막지 않는다

## 협업·배포

- GitLab MR → dev
- Jira (MR 병합 시 자동 완료)
- Figma
- spec-kit
- EAS 개발 빌드, EAS Update
- MR에 화면 스크린샷 첨부
