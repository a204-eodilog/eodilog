import {
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { AnimatedPressable } from './animated-pressable';
import { usePressScale } from './use-press-scale';

export type PressableScaleProps = Omit<PressableProps, 'style'> & {
  /** 눌림에 따라 바뀌는 모양은 받지 않는다. 눌림은 크기로 보인다 */
  style?: StyleProp<ViewStyle>;
};

/**
 * 누르면 살짝 줄었다가 스프링으로 돌아오는 Pressable(theme/motion).
 * 칩, 카드처럼 누르는 칸 전체가 눌리는 느낌이 필요한 곳에 Pressable 대신 쓴다.
 * 예전에는 흐려지기만 했다. "동작 줄이기"가 켜져 있으면 크기를 바꾸지 않는다
 */
export function PressableScale({ style, onPressIn, onPressOut, ...rest }: PressableScaleProps) {
  const press = usePressScale();
  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(e: GestureResponderEvent) => {
        press.onPressIn();
        onPressIn?.(e);
      }}
      onPressOut={(e: GestureResponderEvent) => {
        press.onPressOut();
        onPressOut?.(e);
      }}
      style={[style, { transform: [{ scale: press.scale }] }]}
    />
  );
}
