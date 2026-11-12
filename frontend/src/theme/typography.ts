import type { TextStyle } from 'react-native';

/**
 * 글꼴은 둥근 글꼴 두 가지를 쓴다(2026-11-12 사용자 결정: 둥글고 부드럽게, 제목도 함께).
 * - 본문과 보조 글자: 고운돋움. 획 끝이 둥글어 여행 앱답게 친근하다
 * - 제목과 굵은 글자: 주아. 둥글고 도톰한 제목용 글꼴이라 고운돋움과 결이 맞는다
 * 두 글꼴 모두 굵기가 한 가지라, 굵기 단계는 글꼴과 크기로 나눈다.
 * 앱 시작 때 src/app/_layout.tsx에서 같은 이름으로 불러온다.
 */
export const fontFamily = {
  regular: 'GowunDodum_400Regular',
  medium: 'GowunDodum_400Regular',
  semibold: 'Jua_400Regular',
  bold: 'Jua_400Regular',
  extrabold: 'Jua_400Regular',
} as const;

const style = (
  family: string,
  fontSize: number,
  lineHeight: number,
  letterSpacing = 0,
): TextStyle => ({
  fontFamily: family,
  fontSize,
  lineHeight,
  letterSpacing,
});

/**
 * 글자 스타일. Figma 화면에서 실제로 쓴 크기·줄 높이를 모아 정했다.
 * 쓰는 곳 예시는 각 줄의 설명을 본다.
 *
 * 2026-11-12에 화면 전체를 보고 두 가지를 다듬었다(사용자 요청).
 * - 자간: Noto Sans KR은 굵고 큰 글자에서 글자 사이가 벌어져 보인다. 큰 제목일수록 더 좁힌다(글자 크기의 2%쯤).
 *   본문은 조금만, 아주 작은 글자는 좁히지 않는다(좁히면 뭉쳐 보인다)
 * - 보조 글자(caption 세 가지): 12 → 13. 날짜·장소·설명처럼 읽어야 하는 글이 본문 16에 견줘 너무 작았다.
 *   줄 높이는 20 그대로라 화면의 세로 배치는 바뀌지 않는다
 */
export const typography = {
  /** 화면 맨 위 큰 제목. "어떤 여행을 떠나시나요?" */
  title1: style(fontFamily.extrabold, 23, 32, -0.5),
  /** 결과·요약 제목. "234,000원을 3명이 나눴어요" */
  title2: style(fontFamily.bold, 20, 30, -0.4),
  /** 상단 바 제목, 시트 제목 */
  title3: style(fontFamily.bold, 18, 26, -0.3),
  /** 카드 제목, 강조 본문, 버튼 글자 */
  bodyBold: style(fontFamily.semibold, 16, 26, -0.2),
  /** 입력값, 목록 항목 */
  bodyMedium: style(fontFamily.medium, 16, 26, -0.2),
  /** 일반 본문 */
  body: style(fontFamily.regular, 16, 26, -0.2),
  /** 섹션 이름, 작은 버튼 */
  label: style(fontFamily.semibold, 13, 20, -0.1),
  /** 보조 설명 강조, 배지 */
  captionBold: style(fontFamily.semibold, 13, 20, -0.1),
  /** 칩, 태그, 보조 정보 */
  captionMedium: style(fontFamily.medium, 13, 20, -0.1),
  /** 안내 문구, 시각, 출처 */
  caption: style(fontFamily.regular, 13, 20, -0.1),
  /** 알림 숫자처럼 아주 작은 글자 */
  micro: style(fontFamily.bold, 11, 16),

  // 아래는 여행 화면(S15·S16·S17) 피그마가 위 토큰과 다른 크기로 그린 글자. 2026-11-05 피그마 값 그대로
  /** 여행 목록 카드 D-day "D-17"(S15) */
  display: style(fontFamily.extrabold, 32, 43, -0.8),
  /** 여행 상세 파랑 블록 큰 제목 "두근두근, 부산 여행 D-17"(S17) */
  hero: style(fontFamily.extrabold, 30, 39, -0.7),
  /** 새 여행 큰 질문 "어떤 여행을 떠나시나요?"(S16) */
  question: style(fontFamily.extrabold, 28, 38, -0.7),
  /** 새 여행 이름 입력(S16) */
  heading: style(fontFamily.extrabold, 22, 30, -0.5),
  /** 새 여행 줄 값 "나중에 정할게요"(S16) */
  bodyLarge: style(fontFamily.regular, 17, 26, -0.2),
  /** 새 여행 안내 "이름만 정하면 바로 시작할 수 있어요"(S16) */
  bodySmall: style(fontFamily.regular, 15, 22, -0.1),
  /** 새 여행 줄 이름 "언제"(S16) */
  sub: style(fontFamily.regular, 14, 22, -0.1),
  /** 여행 상세 작은 굵은 글자: 여행 이름, "세은·승기와 함께"(S17) */
  subBold: style(fontFamily.semibold, 14, 20, -0.1),
  /** 여행 상세 단계 버튼 "코스 짜기"(S17) */
  subMedium: style(fontFamily.medium, 14, 22, -0.1),
} as const;

export type TypographyVariant = keyof typeof typography;
