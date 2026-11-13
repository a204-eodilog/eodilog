import { type ReactNode, useEffect } from 'react';
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { EASY_SWIPE, nextPage } from './use-easy-paging';

/** 다음 장으로 넘어가는 시간(ms). 스크롤이 튕겨 가는 것보다 느리고 일정하다 */
const TURN_MS = 320;
/** 처음과 끝에서 더 밀 때 따라오는 정도. 다 따라오지 않아 끝이라는 것을 알린다 */
const EDGE_PULL = 0.3;

type EasyPagerProps = {
  /** 한 장의 폭(카드 폭 + 사이 간격) */
  step: number;
  count: number;
  /** 넘어갈 장이 정해지면 알린다(움직임이 끝나기 전에) */
  onPage?: (index: number) => void;
  /** 밖에서 정하는 쪽. 바뀌면 그 장으로 넘어간다(지도 핀을 눌렀을 때 그 카드로) */
  page?: number;
  /** 바뀌면 첫 장으로 돌아간다. 목록이 통째로 바뀔 때 쓴다 */
  resetKey?: string | number | null;
  style?: StyleProp<ViewStyle>;
  /** 카드가 놓이는 줄. 좌우 여백과 사이 간격을 여기에 준다 */
  contentStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
};

/**
 * 옆으로 한 장씩 넘기는 카드 줄. 손가락을 따라 움직이다가, 조금만(EASY_SWIPE) 밀고 놓아도 다음 장으로 넘어간다.
 * 스크롤 부품으로 만들면 스크롤이 스스로 멈추려는 움직임과 "다음 장으로 보내기"가 부딪혀 빠르고 어색했다.
 * 그래서 스크롤 없이 줄 전체를 옮긴다. 넘어가는 빠르기는 늘 같다.
 * 위아래로 끄는 손짓은 받지 않아, 아래 창 안에 두어도 창 끌기와 다투지 않는다
 */
export function EasyPager({
  step,
  count,
  onPage,
  page,
  resetKey,
  style,
  contentStyle,
  children,
}: EasyPagerProps) {
  const x = useSharedValue(0);
  const start = useSharedValue(0);
  const index = useSharedValue(0);

  useEffect(() => {
    index.set(0);
    x.set(0);
  }, [resetKey, index, x]);

  // 밖에서 쪽을 바꾸면 그 장으로 넘어간다. 이미 그 장이면 가만히 있는다
  useEffect(() => {
    if (page === undefined || page < 0 || page >= count || page === index.get()) return;
    index.set(page);
    x.set(withTiming(-page * step, { duration: TURN_MS, easing: Easing.out(Easing.cubic) }));
  }, [page, count, step, index, x]);

  const report = (next: number) => onPage?.(next);

  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-12, 12])
    .onStart(() => {
      start.set(x.get());
    })
    .onUpdate((e) => {
      const min = -(count - 1) * step;
      const raw = start.get() + e.translationX;
      // 처음과 끝을 넘어서는 만큼은 조금만 따라온다
      x.set(raw > 0 ? raw * EDGE_PULL : raw < min ? min + (raw - min) * EDGE_PULL : raw);
    })
    .onEnd((e) => {
      // 민 거리가 짧아도 빠르게 튕겼으면 넘긴다. 왼쪽으로 밀면 다음 장이다
      const dragged =
        Math.abs(e.velocityX) > 400 ? -Math.sign(e.velocityX) * EASY_SWIPE : -e.translationX;
      const next = nextPage(index.get(), dragged, count);
      index.set(next);
      x.set(withTiming(-next * step, { duration: TURN_MS, easing: Easing.out(Easing.cubic) }));
      runOnJS(report)(next);
    });

  const moved = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  return (
    <GestureDetector gesture={pan}>
      <View style={[styles.window, style]}>
        <Animated.View style={[styles.row, contentStyle, moved]}>{children}</Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  window: { overflow: 'hidden' },
  row: { flexDirection: 'row' },
});
