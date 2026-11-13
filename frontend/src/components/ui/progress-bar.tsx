import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { isReduceMotion } from '@/hooks/use-reduce-motion';
import { colors, radius } from '@/theme';
import { motion } from '@/theme/motion';

export type ProgressBarProps = {
  /** 찬 비율 0~1 */
  ratio: number;
  /** 찬 부분 색. 기본 앱 파란색 */
  color?: string;
  /** 바탕 색 */
  trackColor?: string;
  /** 막대 굵기. 기본 6 */
  height?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

const clamp = (n: number) => (Number.isFinite(n) ? Math.min(Math.max(n, 0), 1) : 0);

/**
 * 진행 막대. 비율이 바뀌면 300ms 동안 스르륵 늘거나 준다(theme/motion).
 * 처음 그릴 때는 움직이지 않고 그 비율로 보인다. "동작 줄이기"가 켜져 있으면 바로 바뀐다.
 * 찬 부분은 바탕과 같은 폭으로 두고 왼쪽 밖에서 밀어 넣는다. 폭을 바꾸면 자바스크립트가 매 장면 일해야 해서 버벅인다
 */
export function ProgressBar({
  ratio,
  color = colors.brand.primary,
  trackColor = colors.surface.default,
  height = 6,
  style,
  accessibilityLabel,
}: ProgressBarProps) {
  const target = clamp(ratio);
  const filled = useState(() => new Animated.Value(target))[0];
  const first = useRef(true);
  // 바탕의 폭. 재기 전에는 찬 부분을 감춘다
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (isReduceMotion()) {
      filled.setValue(target);
      return;
    }
    const moving = Animated.timing(filled, {
      toValue: target,
      duration: motion.duration.slow,
      easing: motion.easing.out,
      useNativeDriver: motion.native,
    });
    moving.start();
    return () => moving.stop();
  }, [filled, target]);

  return (
    <View
      style={[styles.track, { height, backgroundColor: trackColor }, style]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(target * 100) }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      <Animated.View
        testID="progress-fill"
        style={[
          styles.fill,
          {
            height,
            backgroundColor: color,
            opacity: width > 0 ? 1 : 0,
            transform: [
              {
                // 0일 때 왼쪽 끝이 1px 비치지 않게 1px 더 민다
                translateX: filled.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-(width + 1), 0],
                }),
              },
            ],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { borderRadius: radius.full, overflow: 'hidden' },
  fill: { width: '100%', borderRadius: radius.full },
});
