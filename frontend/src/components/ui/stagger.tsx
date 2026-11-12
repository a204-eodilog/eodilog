import { Children, isValidElement, useEffect, useState, type ReactNode } from 'react';
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
 * 부수적인 화면(설정, 기록, 프로필 등)의 스크롤 내용도 감싸 구역이 위에서부터 차례로 나타나게 한다.
 * 줄이 많은 목록에는 쓰지 않는다. 목록의 줄은 FadeIn으로 감싼다.
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
        // 자식의 제 이름(key)으로 구분한다. 순서 번호로 구분하면 위쪽에 안내 띠 같은 것이 나중에 생길 때
        // 아래 줄이 모두 새로 그려져, 다시 나타나고 입력하던 글도 사라진다
        <StaggerItem
          key={isValidElement(child) && child.key != null ? child.key : index}
          index={index}
          active={active}
          gap={gap}
          style={itemStyle}
        >
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
  // 처음 그려질 때의 순서만 쓴다. 나중에 순서가 바뀌어도 다시 나타나지 않는다
  const delay = useState(() => Math.min(index, motion.stagger.max) * gap)[0];

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
      delay,
      easing: motion.appear.easing,
      useNativeDriver: motion.native,
    });
    appearing.start();
    return () => appearing.stop();
  }, [active, delay, shown]);

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
