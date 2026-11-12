import { useEffect, useState } from 'react';
import {
  Animated,
  StyleSheet,
  View,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { isReduceMotion } from '@/hooks/use-reduce-motion';
import { colors, radius as radii, spacing } from '@/theme';
import { motion } from '@/theme/motion';

export type SkeletonProps = {
  width?: DimensionValue;
  height?: number;
  /** 모서리 둥글기. 기본은 글자 줄 모양 */
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

/** 뼈대 한 조각. 글자 줄, 사진, 동그라미 자리를 회색으로 채운다. 깜빡임은 SkeletonList가 한꺼번에 준다 */
export function Skeleton({ width = '100%', height = 14, radius = radii.sm, style }: SkeletonProps) {
  return <View style={[styles.block, { width, height, borderRadius: radius }, style]} />;
}

export type SkeletonListProps = {
  /** rows 동그라미와 글 두 줄(목록) / cards 사진과 글 한 줄(카드 목록) */
  variant?: 'rows' | 'cards';
  /** 줄 수. 기본 6 */
  count?: number;
  /** 자리를 잡는 스타일. 화면 전체 로딩이면 flex: 1을 준다. 넘치는 줄은 잘린다 */
  style?: StyleProp<ViewStyle>;
  /** 화면 읽어 주기에 들려 줄 말 */
  accessibilityLabel?: string;
};

/**
 * 화면 전체가 불러오는 동안 보이는 뼈대. 돌아가는 동그라미 대신 내용 자리 모양을 미리 보여 준다.
 * 줄 전체가 800ms마다 흐려졌다 돌아온다(theme/motion). "동작 줄이기"가 켜져 있으면 가만히 보인다.
 * 버튼 안이나 더 불러오기처럼 작은 자리에는 Spinner를 쓴다
 */
export function SkeletonList({
  variant = 'rows',
  count = 6,
  style,
  accessibilityLabel = '불러오는 중',
}: SkeletonListProps) {
  const glow = useState(() => new Animated.Value(1))[0];

  useEffect(() => {
    if (isReduceMotion()) return;
    const half = {
      duration: motion.skeleton.pulse,
      easing: motion.easing.inOut,
      useNativeDriver: motion.native,
    };
    const pulsing = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: motion.skeleton.dim, ...half }),
        Animated.timing(glow, { toValue: 1, ...half }),
      ]),
    );
    pulsing.start();
    return () => pulsing.stop();
  }, [glow]);

  return (
    <View
      style={[styles.list, style]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
    >
      <Animated.View style={[styles.inner, { opacity: glow }]}>
        {Array.from({ length: count }, (_, i) =>
          variant === 'cards' ? (
            <View key={i} style={styles.card} testID="skeleton-item">
              <Skeleton height={120} radius={radii.md} />
              <Skeleton width="55%" />
            </View>
          ) : (
            <View key={i} style={styles.row} testID="skeleton-item">
              <Skeleton width={44} height={44} radius={radii.full} />
              <View style={styles.lines}>
                <Skeleton width={i % 2 ? '50%' : '65%'} />
                <Skeleton width={i % 2 ? '80%' : '40%'} height={12} />
              </View>
            </View>
          ),
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: colors.line.default },
  list: { overflow: 'hidden' },
  inner: { paddingHorizontal: spacing[20], paddingTop: spacing[16], gap: spacing[20] },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[12] },
  lines: { flex: 1, gap: spacing[8] },
  card: { gap: spacing[10] },
});
