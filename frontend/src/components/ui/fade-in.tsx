import { useEffect, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { isReduceMotion } from '@/hooks/use-reduce-motion';
import { motion } from '@/theme/motion';

/**
 * 어디서 나타나는가.
 * - up 아래에서 올라온다(목록 줄, 기본)
 * - left / right 옆에서 밀려 들어온다(가로로 넘기는 카드, 번갈아 나오는 줄)
 * - pop 작았다가 통 커진다(카드, 타일, 배지)
 * - mask 가려진 틀 아래에서 글이 솟아오른다(큰 제목)
 */
export type AppearFrom = 'up' | 'left' | 'right' | 'pop' | 'mask';

export type FadeInProps = {
  /** 목록에서 몇 번째인가. 하나마다 60ms씩 늦게 나타난다. 10번째 뒤로는 더 늦추지 않는다 */
  index?: number;
  /** 어디서 나타나는가. 기본 up */
  from?: AppearFrom;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

/** 움직이지 않을 때의 모양 */
const STILL = { opacity: 1, transform: [] as { scale: number }[] };

/** 몇 번째가 얼마나 늦게 나타나는가(ms) */
export function appearDelay(index: number): number {
  return Math.min(Math.max(index, 0), motion.appear.max) * motion.appear.gap;
}

/**
 * 나타나는 움직임. 0에서 1로 가는 값 하나를 만들고, 그 값으로 투명도와 위치·크기를 정한다.
 * 끝에서 살짝 넘쳤다 돌아오는 곡선이라(theme/motion) 통 하고 자리 잡는 느낌이 난다.
 * "동작 줄이기"가 켜져 있으면 움직이지 않고 바로 끝 모양이다
 */
export function useAppear(index = 0, from: AppearFrom = 'up', enabled = true) {
  // 쓰지 않는 칸(appear를 주지 않은 눌림 부품)은 값을 만들지 않는다. 누르는 칸은 화면마다 수십 개다
  const shown = useState(() => (enabled ? new Animated.Value(isReduceMotion() ? 1 : 0) : null))[0];
  // 순서가 바뀌어도 다시 나타나지 않는다. 처음 그려질 때의 순서만 쓴다
  const delay = useState(() => appearDelay(index))[0];

  useEffect(() => {
    if (!shown) return;
    if (isReduceMotion()) {
      shown.setValue(1);
      return;
    }
    const appearing = Animated.timing(shown, {
      toValue: 1,
      duration: motion.appear.duration,
      delay,
      easing: motion.appear.easing,
      useNativeDriver: motion.native,
    });
    appearing.start();
    return () => appearing.stop();
  }, [shown, delay]);

  if (!shown) return STILL;
  const move = (to: number) => shown.interpolate({ inputRange: [0, 1], outputRange: [to, 0] });
  const transform =
    from === 'left'
      ? [{ translateX: move(-motion.appear.slide) }]
      : from === 'right'
        ? [{ translateX: move(motion.appear.slide) }]
        : from === 'pop'
          ? [
              {
                scale: shown.interpolate({
                  inputRange: [0, 1],
                  outputRange: [motion.appear.popFrom, 1],
                }),
              },
            ]
          : [{ translateY: move(from === 'mask' ? motion.appear.maskRise : motion.appear.rise) }];

  return {
    // 넘치는 곡선이라 값이 1을 넘는다. 투명도는 앞 절반에서 다 차고 더 넘지 않는다
    opacity: shown.interpolate({
      inputRange: [0, 0.5],
      outputRange: [0, 1],
      extrapolate: 'clamp' as const,
    }),
    transform,
  };
}

/**
 * 처음 그려질 때 통 하고 나타나는 칸(theme/motion). 목록의 줄, 카드, 큰 제목을 감싼다.
 * 여러 개를 index와 함께 쓰면 차례로 나타난다. 스크롤해서 늦게 그려지는 것은 오래 기다리지 않는다.
 * 시트·빈 화면처럼 제목 → 설명 → 내용 순서가 있는 곳은 Stagger를 쓴다.
 * "동작 줄이기"가 켜져 있으면 바로 보인다
 */
export function FadeIn({ index = 0, from = 'up', style, children }: FadeInProps) {
  const appear = useAppear(index, from);
  if (from === 'mask') {
    // 글이 틀 밖(아래)에 있다가 올라온다. 틀 밖은 잘려서 글이 바닥에서 솟는 것처럼 보인다
    return (
      <View style={[styles.mask, style]}>
        <Animated.View style={appear}>{children}</Animated.View>
      </View>
    );
  }
  return <Animated.View style={[style, appear]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  mask: { overflow: 'hidden' },
});
