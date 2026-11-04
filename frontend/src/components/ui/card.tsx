import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, radius, spacing } from '@/theme';

export type CardProps = {
  children: ReactNode;
  /** outline 흰 바탕 테두리(S38·S42) / filled 회색 바탕(S35 합계, S14 메모) */
  variant?: 'outline' | 'filled';
  /** md 16(S38 요약) / lg 20(S35 합계) / xl 24(S42 요약 카드) */
  rounded?: 'md' | 'lg' | 'xl';
  /** 있으면 누를 수 있는 카드가 된다 */
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: ViewStyle;
};

const RADIUS = { md: radius.lg, lg: radius.xl, xl: radius.xxl } as const;

/** 내용을 묶는 상자. 안쪽 여백 기본 18·20, 필요하면 style로 바꾼다. */
export function Card({
  children,
  variant = 'outline',
  rounded = 'md',
  onPress,
  accessibilityLabel,
  style,
}: CardProps) {
  const box = [
    styles.card,
    variant === 'outline' ? styles.outline : styles.filled,
    { borderRadius: RADIUS[rounded] },
    style,
  ];
  if (!onPress) return <View style={box}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [box, pressed && styles.pressed]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: spacing[18], paddingHorizontal: spacing[20], gap: spacing[12] },
  outline: {
    backgroundColor: colors.surface.white,
    borderWidth: 1,
    borderColor: colors.line.default,
  },
  filled: { backgroundColor: colors.surface.default },
  pressed: { opacity: 0.85 },
});
