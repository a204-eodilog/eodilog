import { useState } from 'react';
import { type GestureResponderEvent, type PressableProps } from 'react-native';

import { motion } from '@/theme/motion';

import { AnimatedPressable } from './animated-pressable';
import { useAppear, type AppearFrom } from './fade-in';
import { usePressScale } from './use-press-scale';

/** Pressable과 받는 값이 같다. 이름만 바꿔 끼울 수 있다 */
export type PressableScaleProps = PressableProps & {
  /**
   * 처음 그려질 때 통 하고 나타난다. 목록에서 몇 번째인지를 넘기면 차례로 나타난다(theme/motion).
   * 감싸는 칸 없이 이 칸이 스스로 움직여, 가로로 늘어선 칸이나 격자에서도 배치가 바뀌지 않는다
   */
  appear?: number;
  /** 어디서 나타나는가. 기본 up. 타일·칩처럼 작은 칸은 pop */
  appearFrom?: Exclude<AppearFrom, 'mask'>;
};

/** 눌린 칸의 폭(px). 잴 수 없는 환경에서는 0을 돌려줘 좁은 칸으로 본다 */
function widthOf(e: GestureResponderEvent): number {
  const target = e?.currentTarget as unknown as
    { getBoundingClientRect?: () => { width: number } } | null | undefined;
  try {
    return target?.getBoundingClientRect?.().width ?? 0;
  } catch {
    return 0;
  }
}

/**
 * 누르면 살짝 줄었다가 스프링으로 돌아오는 Pressable(theme/motion).
 * 화면의 누를 수 있는 칸은 모두 Pressable 대신 이것을 쓴다.
 *
 * - 폭이 넓은 칸(목록 줄, 큰 카드)은 0.98배로 덜 줄어든다. 폭은 누르는 순간에 스스로 잰다.
 *   그릴 때마다 재면 화면을 열 때 누르는 칸 수만큼 일이 생겨 버벅인다
 * - 누르는 동안 모양을 바꾸는 스타일(`({ pressed }) => ...`)도 그대로 받는다.
 *   움직이는 Pressable은 함수형 스타일을 받지 못해, 눌림 상태를 여기서 기억하고 풀어서 넘긴다
 * - appear를 주면 처음 그려질 때 나타나는 움직임을 한다
 * - "동작 줄이기"가 켜져 있으면 크기를 바꾸지 않는다
 */
export function PressableScale({
  style,
  onPressIn,
  onPressOut,
  appear,
  appearFrom = 'up',
  ...rest
}: PressableScaleProps) {
  const entering = useAppear(appear ?? 0, appearFrom, appear !== undefined);
  const [pressed, setPressed] = useState(false);
  const press = usePressScale();
  const byPress = typeof style === 'function';
  const resolved = typeof style === 'function' ? style({ pressed, hovered: false }) : style;

  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(e: GestureResponderEvent) => {
        press.onPressIn(
          widthOf(e) > motion.press.wideFrom ? motion.press.wideScale : motion.press.scale,
        );
        if (byPress) setPressed(true);
        onPressIn?.(e);
      }}
      onPressOut={(e: GestureResponderEvent) => {
        press.onPressOut();
        if (byPress) setPressed(false);
        onPressOut?.(e);
      }}
      style={[
        resolved,
        appear === undefined
          ? { transform: [{ scale: press.scale }] }
          : {
              opacity: entering.opacity,
              transform: [...entering.transform, { scale: press.scale }],
            },
      ]}
    />
  );
}
