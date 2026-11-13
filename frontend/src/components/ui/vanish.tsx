import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  type EntryExitAnimationFunction,
  LayoutAnimationConfig,
  LinearTransition,
  withTiming,
} from 'react-native-reanimated';

const OUT_MS = 220;
const IN_MS = 280;
const easeOut = Easing.bezierFn(0.165, 0.84, 0.44, 1);

/** 사라질 때: 살짝 작아지며 오른쪽으로 밀려 나간다. 나갈 때는 들어올 때보다 빠르게 */
const leave: EntryExitAnimationFunction = () => {
  'worklet';
  return {
    initialValues: { opacity: 1, transform: [{ translateX: 0 }, { scale: 1 }] },
    animations: {
      opacity: withTiming(0, { duration: OUT_MS }),
      transform: [
        { translateX: withTiming(72, { duration: OUT_MS, easing: easeOut }) },
        { scale: withTiming(0.86, { duration: OUT_MS, easing: easeOut }) },
      ],
    },
  };
};

/** 새로 생길 때: 조금 작은 채 아래에서 올라와 제 크기가 된다 */
const arrive: EntryExitAnimationFunction = () => {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ translateY: 16 }, { scale: 0.94 }] },
    animations: {
      opacity: withTiming(1, { duration: IN_MS }),
      transform: [
        { translateY: withTiming(0, { duration: IN_MS, easing: easeOut }) },
        { scale: withTiming(1, { duration: IN_MS, easing: easeOut }) },
      ],
    },
  };
};

/** 한 줄이 빠지면 아래 줄들이 튕기듯 올라와 빈자리를 메운다 */
const settle = LinearTransition.springify().damping(18).stiffness(180);

/**
 * 지우거나 숨길 수 있는 목록을 감싼다. 화면을 처음 열 때는 줄들이 따로 나타나지 않고(차례로 나타나기와 겹치지 않게),
 * 그 뒤에 생기거나 사라지는 줄만 움직인다. 목록이 통째로 바뀔 때(탭 전환)는 줄마다 나가는 움직임도 건너뛴다
 */
export function VanishList({ children }: { children: ReactNode }) {
  return (
    <LayoutAnimationConfig skipEntering skipExiting>
      {children}
    </LayoutAnimationConfig>
  );
}

/**
 * 목록의 한 줄. 목록에서 빠지면 밀려 나가고, 남은 줄이 자리를 메운다.
 * 기기의 동작 줄이기가 켜져 있으면 reanimated가 움직임을 건너뛴다
 */
export function Vanish({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Animated.View entering={arrive} exiting={leave} layout={settle} style={style}>
      {children}
    </Animated.View>
  );
}
