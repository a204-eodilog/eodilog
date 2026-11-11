import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { colors } from '@/theme';
import { motion } from '@/theme/motion';

/** 한 바퀴 도는 시간. 처음부터 끝까지 같은 속도로 돈다 */
export const SPINNER_TURN_MS = 800;

const SIZE = { small: 20, large: 36 } as const;

export type SpinnerProps = {
  /** small 20, large 36. 숫자를 주면 그 크기 */
  size?: keyof typeof SIZE | number;
  color?: string;
  /** 자리를 잡는 스타일. 동그라미는 이 칸의 한가운데에 놓인다. flex: 1을 주면 남은 화면의 정중앙이다 */
  style?: StyleProp<ViewStyle>;
  /** 화면 읽어 주기에 들려 줄 말 */
  accessibilityLabel?: string;
};

/**
 * 로딩 동그라미. 기기 기본 로딩(ActivityIndicator)은 안드로이드에서 빨라졌다 느려졌다 하며 돌아서,
 * 모든 화면이 같은 속도로 돌도록 직접 그린다(2026-11-11 사용자 요청).
 * ActivityIndicator와 받는 값이 같아 그대로 바꿔 쓸 수 있다.
 * 로딩 중임을 알려 주는 표시라 "동작 줄이기"가 켜져 있어도 돈다
 */
export function Spinner({
  size = 'small',
  color = colors.brand.primary,
  style,
  accessibilityLabel,
}: SpinnerProps) {
  const box = typeof size === 'number' ? size : SIZE[size];
  const turn = useState(() => new Animated.Value(0))[0];

  useEffect(() => {
    const spinning = Animated.loop(
      Animated.timing(turn, {
        toValue: 1,
        duration: SPINNER_TURN_MS,
        easing: Easing.linear,
        useNativeDriver: motion.native,
      }),
    );
    spinning.start();
    return () => spinning.stop();
  }, [turn]);

  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  // 24 칸 기준. 선 굵기 3, 반지름 10이라 둘레는 62.8쯤. 그 가운데 70%만 그려 한쪽이 트인 고리로 보인다
  return (
    <View
      style={[styles.center, style]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
    >
      <Animated.View style={{ width: box, height: box, transform: [{ rotate }] }}>
        <Svg width={box} height={box} viewBox="0 0 24 24" fill="none">
          <Circle cx={12} cy={12} r={10} stroke={color} strokeOpacity={0.2} strokeWidth={3} />
          <Circle
            cx={12}
            cy={12}
            r={10}
            stroke={color}
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray="44 62.8"
          />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});
