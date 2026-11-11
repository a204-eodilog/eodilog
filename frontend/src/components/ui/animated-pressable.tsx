import { Animated, Platform, Pressable, type PressableProps } from 'react-native';

type Props = PressableProps & {
  /** Animated가 붙이는 속성. 화면 그리는 쪽 움직임에서 칸이 합쳐지지 않게 한다 */
  collapsable?: boolean;
};

/**
 * Animated가 Pressable에 붙이는 collapsable 속성을 웹에서만 뗀다.
 * 웹의 Pressable은 이 속성을 그대로 화면 요소에 넘겨, 개발 화면에 "non-boolean attribute" 경고 띠가 뜬다.
 * 안드로이드·iOS에서는 그대로 넘긴다
 */
function PlainPressable({ collapsable, ...rest }: Props) {
  if (Platform.OS === 'web') return <Pressable {...rest} />;
  return <Pressable {...rest} collapsable={collapsable} />;
}

/** 크기·투명도를 움직일 수 있는 Pressable. 버튼과 PressableScale이 쓴다 */
export const AnimatedPressable = Animated.createAnimatedComponent(PlainPressable);
