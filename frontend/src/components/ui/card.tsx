import type { ReactNode } from 'react';
import { Animated, StyleSheet, type ViewStyle } from 'react-native';

import { colors, radius, spacing } from '@/theme';

import { useAppear } from './fade-in';
import { PressableScale } from './pressable-scale';

export type CardProps = {
  children: ReactNode;
  /** outline 흰 바탕 테두리(S38·S42) / filled 회색 바탕(S35 합계, S14 메모) */
  variant?: 'outline' | 'filled';
  /** 둥글기. 테마 radius 토큰 이름 그대로: lg 16(S38 요약) / xl 20(S35 합계) / xxl 24(S42 요약 카드) */
  rounded?: 'lg' | 'xl' | 'xxl';
  /** 있으면 누를 수 있는 카드가 된다 */
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: ViewStyle;
};

const RADIUS = { lg: radius.lg, xl: radius.xl, xxl: radius.xxl } as const;

/**
 * 내용을 묶는 상자. 안쪽 여백 기본 18·20, 필요하면 style로 바꾼다.
 * 누르지 않는 카드는 처음 그려질 때 통 커지며 나타난다(theme/motion). 누르는 카드는 눌림 움직임과 겹쳐 흐려졌다 나타나기만 한다
 */
export function Card({
  children,
  variant = 'outline',
  rounded = 'lg',
  onPress,
  accessibilityLabel,
  style,
}: CardProps) {
  const appear = useAppear(0, 'pop');
  const box = [
    styles.card,
    variant === 'outline' ? styles.outline : styles.filled,
    { borderRadius: RADIUS[rounded] },
    style,
  ];
  if (!onPress) return <Animated.View style={[box, appear]}>{children}</Animated.View>;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={box}
    >
      {children}
    </PressableScale>
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
});
