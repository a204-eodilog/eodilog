import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, type TextProps } from 'react-native';

import { isReduceMotion } from '@/hooks/use-reduce-motion';
import { motion } from '@/theme/motion';

export type CountUpProps = Omit<TextProps, 'children'> & {
  value: number;
  /** 숫자를 글자로 바꾼다. "3표", "12,000원"처럼. 기본은 숫자 그대로 */
  format?: (n: number) => string;
};

/**
 * 굴러가며 바뀌는 숫자. 값이 바뀌면 300ms 동안 지금 보이는 수에서 새 수까지 센다(theme/motion).
 * 처음 그릴 때는 움직이지 않는다. 도중에 또 바뀌면 지금 보이는 수에서 이어 간다.
 * "동작 줄이기"가 켜져 있으면 바로 바뀐다
 */
export function CountUp({ value, format = String, style, ...rest }: CountUpProps) {
  const [shown, setShown] = useState(value);
  const rolling = useState(() => new Animated.Value(value))[0];
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const id = rolling.addListener(({ value: v }) => setShown(Math.round(v)));
    const moving = Animated.timing(rolling, {
      toValue: value,
      // "동작 줄이기"에서는 세지 않고 바로 새 수가 된다
      duration: isReduceMotion() ? 0 : motion.duration.slow,
      easing: motion.easing.out,
      useNativeDriver: false,
    });
    moving.start(({ finished }) => {
      if (finished) setShown(value);
    });
    return () => {
      moving.stop();
      rolling.removeListener(id);
    };
  }, [rolling, value]);

  return (
    <Text {...rest} style={[styles.digits, style]}>
      {format(shown)}
    </Text>
  );
}

const styles = StyleSheet.create({
  // 숫자마다 폭이 같다. 세는 동안 글자가 좌우로 떨리지 않는다
  digits: { fontVariant: ['tabular-nums'] },
});
