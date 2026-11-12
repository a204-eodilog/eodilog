import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';

import { isReduceMotion } from '@/hooks/use-reduce-motion';
import { motion } from '@/theme/motion';

export type PopProps = {
  /** 이 값이 바뀔 때마다 한 번 튄다. 배지의 수, 북마크 여부처럼 */
  trigger: unknown;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

/**
 * 값이 바뀌면 톡 튀는 칸. 1.2배로 커졌다가 스프링으로 돌아온다(theme/motion).
 * 알림 배지, 북마크처럼 작은 표시가 바뀌었음을 알릴 때 감싼다.
 * 처음 그릴 때는 튀지 않는다. "동작 줄이기"가 켜져 있으면 튀지 않는다
 */
export function Pop({ trigger, style, children }: PopProps) {
  const scale = useState(() => new Animated.Value(1))[0];
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (isReduceMotion()) return;
    const popping = Animated.sequence([
      Animated.timing(scale, {
        toValue: motion.pop.toScale,
        duration: motion.duration.fast,
        easing: motion.easing.out,
        useNativeDriver: motion.native,
      }),
      Animated.spring(scale, {
        toValue: 1,
        ...motion.press.spring,
        useNativeDriver: motion.native,
      }),
    ]);
    popping.start();
    return () => popping.stop();
  }, [scale, trigger]);

  return <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>;
}
