/**
 * 디자인 토큰. 기준은 Figma 어디로그(파랑) 페이지다.
 *
 * import { colors, typography, spacing } from '@/theme';
 *
 * - 색: colors.brand.primary, colors.text.sub …
 * - 글자: <Text style={typography.bodyBold}>
 * - 간격: Figma 숫자 그대로 spacing[12]
 * - 움직임: motion.duration.fast, motion.easing.out (기준값은 theme/motion)
 */
export { colors } from './colors';
export { motion } from './motion';
export type { Colors } from './colors';
export { fontFamily, typography } from './typography';
export type { TypographyVariant } from './typography';
export { borderWidth, layout, radius, size, spacing } from './spacing';
