import { Image } from 'expo-image';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

const camperVan = require('@/assets/images/login/camper-van.png');

/**
 * Figma S01 '캠핑카 이미지'(308:178) 움직임. 3초 타임라인 값 그대로.
 * 0~1.2초 오른쪽 320에서 달려와 멈춤(ease-out) → 멈출 때 앞으로 3도, 뒤로 1도 기울었다 바로 섬
 * → 1.8~3초 위로 2 들썩였다 내려옴. 달려오기는 한 번만, 들썩임은 계속 반복한다.
 */
const DRIVE_IN_FROM_X = 320;
const DRIVE_MS = 1200;
const BRAKE_START_MS = 1000;
const BRAKE_FORWARD_DEG = -2.98; // -0.052rad
const BRAKE_BACK_DEG = 0.97; // 0.017rad
const BRAKE_FORWARD_MS = 200;
const BRAKE_BACK_MS = 200;
const BRAKE_SETTLE_MS = 150;
const BOB_DELAY_MS = 600;
const BOB_Y = -2;
const BOB_HALF_MS = 600;

const easeOut = Easing.out(Easing.ease);
const easeInOut = Easing.inOut(Easing.ease);

export function CamperVanIntro() {
  const reduceMotion = useReducedMotion();
  const x = useSharedValue(reduceMotion ? 0 : DRIVE_IN_FROM_X);
  const y = useSharedValue(0);
  const rotate = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    x.value = withTiming(0, { duration: DRIVE_MS, easing: easeOut });
    rotate.value = withDelay(
      BRAKE_START_MS,
      withSequence(
        withTiming(BRAKE_FORWARD_DEG, { duration: BRAKE_FORWARD_MS, easing: easeOut }),
        withTiming(BRAKE_BACK_DEG, { duration: BRAKE_BACK_MS, easing: easeInOut }),
        withTiming(0, { duration: BRAKE_SETTLE_MS, easing: easeInOut }),
      ),
    );
    y.value = withDelay(
      DRIVE_MS,
      withRepeat(
        withSequence(
          withDelay(BOB_DELAY_MS, withTiming(BOB_Y, { duration: BOB_HALF_MS, easing: easeInOut })),
          withTiming(0, { duration: BOB_HALF_MS, easing: easeInOut }),
        ),
        -1,
      ),
    );
  }, [reduceMotion, x, y, rotate]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { rotate: `${rotate.value}deg` }],
  }));

  return (
    <Animated.View style={[styles.van, style]}>
      <Image source={camperVan} style={styles.image} contentFit="contain" accessible={false} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  van: { width: 200, height: 140 },
  image: { width: '100%', height: '100%' },
});
