/**
 * 간격·둥글기·크기 토큰. Figma 화면에서 실제로 쓴 값을 모았다.
 * 간격은 Figma 숫자를 그대로 키로 쓴다(spacing[12] = 12). Figma 값을 옮길 때 헷갈리지 않게 하려는 것이다.
 */
export const spacing = {
  0: 0,
  2: 2,
  4: 4,
  6: 6,
  8: 8,
  10: 10,
  12: 12,
  14: 14,
  16: 16,
  18: 18,
  20: 20,
  24: 24,
  28: 28,
  32: 32,
} as const;

export const radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  /** 알약 모양 버튼·칩, 동그라미 얼굴 */
  full: 9999,
} as const;

export const layout = {
  /** 화면 좌우 여백 */
  screenPaddingX: 20,
  /** 손가락으로 누를 수 있는 최소 크기 */
  minTouchTarget: 44,
} as const;

export const size = {
  /** 버튼 높이. md는 칩·작은 버튼, xl은 화면 아래 큰 버튼 */
  button: { sm: 36, md: 40, lg: 48, xl: 56 },
  icon: { sm: 16, md: 20, lg: 24 },
  /** 동행 얼굴 지름 */
  avatar: { sm: 24, md: 28, lg: 40 },
} as const;

export const borderWidth = {
  hairline: 1,
  /** 선택된 칩·입력칸 테두리 */
  focus: 2,
} as const;
