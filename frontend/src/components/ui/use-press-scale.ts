import { useState } from 'react';
import { Animated } from 'react-native';

import { isReduceMotion } from '@/hooks/use-reduce-motion';
import { motion } from '@/theme/motion';

/**
 * 눌림 움직임. 누르는 동안 0.96배로 줄고, 손을 떼면 스프링으로 돌아온다(theme/motion).
 * 돌려준 scale을 Animated.View의 transform에 넣고, onPressIn·onPressOut을 Pressable에 넘긴다.
 * onPressIn에 줄어드는 크기를 넘기면 그 값으로 줄어든다(넓은 칸은 0.98배).
 * "동작 줄이기"가 켜져 있으면 크기를 바꾸지 않는다
 */
export function usePressScale() {
  const scale = useState(() => new Animated.Value(1))[0];

  const onPressIn = (to: number = motion.press.scale) => {
    if (isReduceMotion()) return;
    Animated.timing(scale, {
      toValue: to,
      duration: motion.duration.fast,
      easing: motion.easing.out,
      useNativeDriver: motion.native,
    }).start();
  };

  const onPressOut = () => {
    if (isReduceMotion()) {
      scale.setValue(1);
      return;
    }
    Animated.spring(scale, {
      toValue: 1,
      ...motion.press.spring,
      useNativeDriver: motion.native,
    }).start();
  };

  return { scale, onPressIn, onPressOut };
}
