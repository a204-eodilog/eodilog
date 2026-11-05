import type { TextStyle } from 'react-native';

/**
 * 글꼴은 Noto Sans KR 세 굵기만 쓴다. 이름은 @expo-google-fonts/noto-sans-kr가 등록하는 이름이다.
 * 앱 시작 때 src/app/_layout.tsx에서 불러온다.
 */
export const fontFamily = {
  regular: 'NotoSansKR_400Regular',
  medium: 'NotoSansKR_500Medium',
  bold: 'NotoSansKR_700Bold',
} as const;

const style = (family: string, fontSize: number, lineHeight: number): TextStyle => ({
  fontFamily: family,
  fontSize,
  lineHeight,
});

/**
 * 글자 스타일. Figma 화면에서 실제로 쓴 크기·줄 높이를 모아 정했다.
 * 쓰는 곳 예시는 각 줄의 설명을 본다.
 */
export const typography = {
  /** 화면 맨 위 큰 제목. "어떤 여행을 떠나시나요?" */
  title1: style(fontFamily.bold, 23, 32),
  /** 결과·요약 제목. "234,000원을 3명이 나눴어요" */
  title2: style(fontFamily.bold, 20, 30),
  /** 상단 바 제목, 시트 제목 */
  title3: style(fontFamily.bold, 18, 26),
  /** 카드 제목, 강조 본문, 버튼 글자 */
  bodyBold: style(fontFamily.bold, 16, 26),
  /** 입력값, 목록 항목 */
  bodyMedium: style(fontFamily.medium, 16, 26),
  /** 일반 본문 */
  body: style(fontFamily.regular, 16, 26),
  /** 섹션 이름, 작은 버튼 */
  label: style(fontFamily.bold, 13, 20),
  /** 보조 설명 강조, 배지 */
  captionBold: style(fontFamily.bold, 12, 20),
  /** 칩, 태그, 보조 정보 */
  captionMedium: style(fontFamily.medium, 12, 20),
  /** 안내 문구, 시각, 출처 */
  caption: style(fontFamily.regular, 12, 20),
  /** 알림 숫자처럼 아주 작은 글자 */
  micro: style(fontFamily.bold, 11, 16),

  // 아래는 여행 화면(S15·S16·S17) 피그마가 위 토큰과 다른 크기로 그린 글자. 2026-11-05 피그마 값 그대로
  /** 여행 목록 카드 D-day "D-17"(S15) */
  display: style(fontFamily.bold, 32, 43),
  /** 여행 상세 파랑 블록 큰 제목 "두근두근, 부산 여행 D-17"(S17) */
  hero: style(fontFamily.bold, 30, 39),
  /** 새 여행 큰 질문 "어떤 여행을 떠나시나요?"(S16) */
  question: style(fontFamily.bold, 28, 38),
  /** 새 여행 이름 입력(S16) */
  heading: style(fontFamily.bold, 22, 30),
  /** 새 여행 줄 값 "나중에 정할게요"(S16) */
  bodyLarge: style(fontFamily.regular, 17, 26),
  /** 새 여행 안내 "이름만 정하면 바로 시작할 수 있어요"(S16) */
  bodySmall: style(fontFamily.regular, 15, 22),
  /** 새 여행 줄 이름 "언제"(S16) */
  sub: style(fontFamily.regular, 14, 22),
  /** 여행 상세 작은 굵은 글자: 여행 이름, "세은·승기와 함께"(S17) */
  subBold: style(fontFamily.bold, 14, 20),
  /** 여행 상세 단계 버튼 "코스 짜기"(S17) */
  subMedium: style(fontFamily.medium, 14, 22),
} as const;

export type TypographyVariant = keyof typeof typography;
