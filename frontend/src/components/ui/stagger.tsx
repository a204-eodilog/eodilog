import { Children, useEffect, useState, type ReactNode } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';

import { isReduceMotion } from '@/hooks/use-reduce-motion';
import { motion } from '@/theme/motion';

export type StaggerProps = {
  /**
   * 나타나기 시작할지. false면 모두 감춘 채 기다리고, true가 되는 순간 첫 줄부터 차례로 나타난다.
   * 시트·창처럼 열릴 때마다 다시 보여야 하면 visible을 넘긴다. 기본은 처음 그릴 때 한 번
   */
  active?: boolean;
  /** 줄 사이 간격(ms). 기본은 기준값 60 */
  gap?: number;
  /** 줄마다 감싸는 칸의 모양. 부모의 간격(gap)을 그대로 쓰려면 비워 둔다 */
  itemStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
};

/**
 * 순서대로 나오는 글. 자식을 위에서부터 한 줄씩, 60ms 간격으로 통 하고 올라오며 나타나게 한다(theme/motion).
 * 제목 → 설명 → 내용 순서가 눈에 들어오게 하려고 바텀시트, 가운데 창, 빈 화면·오류 안내, 큰 제목이 있는 입력 화면에 쓴다.
 * 일반 목록 화면의 머리글에는 쓰지 않는다(화면을 열 때마다 글이 하나씩 나오면 느리게 느껴진다).
 * 빈 자식(null, false)은 건너뛰어 간격이 비지 않는다. "동작 줄이기"가 켜져 있으면 바로 보인다
 */
export function Stagger({
  active = true,
  gap = motion.stagger.gap,
  itemStyle,
  children,
}: StaggerProps) {
  const items = Children.toArray(children);
  return (
    <>
      {items.map((child, index) => (
        <StaggerItem key={index} index={index} active={active} gap={gap} style={itemStyle}>
          {child}
        </StaggerItem>
      ))}
    </>
  );
}

function StaggerItem({
  index,
  active,
  gap,
  style,
  children,
}: {
  index: number;
  active: boolean;
  gap: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const shown = useState(() => new Animated.Value(active && isReduceMotion() ? 1 : 0))[0];

  useEffect(() => {
    if (!active) {
      shown.setValue(0);
      return;
    }
    if (isReduceMotion()) {
      shown.setValue(1);
      return;
    }
    shown.setValue(0);
    const appearing = Animated.timing(shown, {
      toValue: 1,
      duration: motion.appear.duration,
      delay: index * gap,
      easing: motion.appear.easing,
      useNativeDriver: motion.native,
    });
    appearing.start();
    return () => appearing.stop();
  }, [active, index, gap, shown]);

  return (
    <Animated.View
      style={[
        style,
        {
          // 넘치는 곡선이라 값이 1을 넘는다. 투명도는 앞 절반에서 다 찬다
          opacity: shown.interpolate({
            inputRange: [0, 0.5],
            outputRange: [0, 1],
            extrapolate: 'clamp',
          }),
          transform: [
            {
              translateY: shown.interpolate({
                inputRange: [0, 1],
                outputRange: [motion.stagger.rise, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
