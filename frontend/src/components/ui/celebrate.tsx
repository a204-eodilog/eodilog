import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';

import { isReduceMotion } from '@/hooks/use-reduce-motion';
import { colors } from '@/theme';
import { motion } from '@/theme/motion';

/**
 * 색종이. 기쁜 순간(여행 만들기 완료, 초대로 참여, 준비물 모두 챙김)에만 `celebrate()`로 부른다.
 * 화면 위에서 조각 24개가 흩날리며 떨어지고 1.1초 뒤 사라진다(theme/motion).
 * 화면 누르기를 막지 않는다. 겹쳐 불리면 한 번만 보인다. "동작 줄이기"가 켜져 있으면 나오지 않는다.
 * 자리는 뿌리 레이아웃의 CelebrateHost 하나다
 */
const listeners = new Set<() => void>();

export function celebrate() {
  for (const fire of listeners) fire();
}

const COLORS = [
  colors.brand.primary,
  colors.brand.primarySoft,
  colors.brand.accent,
  colors.friend.apricot,
  colors.friend.mint,
  colors.friend.pink,
];

type Piece = {
  /** 출발하는 가로 위치(0~1) */
  x: number;
  /** 옆으로 흘러가는 거리(px) */
  drift: number;
  /** 떨어지는 깊이(화면 높이의 비율) */
  fall: number;
  /** 도는 각도 */
  turn: number;
  color: string;
  size: number;
};

function makePieces(): Piece[] {
  return Array.from({ length: motion.celebrate.pieces }, (_, i) => ({
    x: Math.random(),
    drift: (Math.random() - 0.5) * 120,
    fall: 0.45 + Math.random() * 0.4,
    turn: Math.round(360 + Math.random() * 720),
    color: COLORS[i % COLORS.length],
    size: 6 + Math.round(Math.random() * 5),
  }));
}

export function CelebrateHost() {
  const { width, height } = useWindowDimensions();
  const [pieces, setPieces] = useState<Piece[] | null>(null);
  const flown = useState(() => new Animated.Value(0))[0];

  useEffect(() => {
    const fire = () => {
      if (isReduceMotion()) return;
      // 흩날리는 중이면 그대로 둔다
      setPieces((now) => now ?? makePieces());
    };
    listeners.add(fire);
    return () => {
      listeners.delete(fire);
    };
  }, []);

  useEffect(() => {
    if (!pieces) return;
    flown.setValue(0);
    const flying = Animated.timing(flown, {
      toValue: 1,
      duration: motion.celebrate.duration,
      easing: Easing.out(Easing.quad),
      useNativeDriver: motion.native,
    });
    flying.start(() => setPieces(null));
    return () => flying.stop();
  }, [flown, pieces]);

  if (!pieces) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" testID="celebrate">
      {pieces.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            top: -p.size * 2,
            left: p.x * width,
            width: p.size,
            height: p.size * 1.6,
            borderRadius: 2,
            backgroundColor: p.color,
            opacity: flown.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
            transform: [
              {
                translateY: flown.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, height * p.fall],
                }),
              },
              { translateX: flown.interpolate({ inputRange: [0, 1], outputRange: [0, p.drift] }) },
              {
                rotate: flown.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0deg', `${p.turn}deg`],
                }),
              },
            ],
          }}
        />
      ))}
    </View>
  );
}
