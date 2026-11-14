import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Icon } from '@/components/ui';
import { colors, radius, spacing, typography } from '@/theme';

/** 번호 동그라미 지름 */
const DOT = 28;
/** 지금 단계 동그라미 바깥에서 도는 테두리와의 간격 */
const SPIN_GAP = 4;

/**
 * S12 진행 중 세로 단계 표시(FE 제안). 번호 동그라미를 세로선으로 잇고, 끝난 구간은 선을 채운다.
 * 끝난 단계 = 파란 동그라미 + 체크, 지금 단계 = 연파랑 동그라미 + 도는 테두리, 남은 단계 = 회색 테두리 + 번호.
 * 모든 단계 아래에 무엇을 하는지 한 줄이 있다. 지금 단계는 "…하고 있어요"로 또렷하게, 나머지는 옅게
 */
export function ExtractSteps({
  steps,
  current,
  detail,
  guides,
}: {
  steps: readonly string[];
  /** 지금 하고 있는 단계(0부터) */
  current: number;
  /** 지금 단계 아래 "지금 하는 일" 한 줄 */
  detail: string;
  /** 단계마다 무엇을 하는지 한 줄. 끝났거나 남은 단계 아래에 옅게 보인다 */
  guides: readonly string[];
}) {
  return (
    <View accessibilityLiveRegion="polite">
      {steps.map((label, i) => {
        const done = i < current;
        const now = i === current;
        const last = i === steps.length - 1;
        return (
          <View
            key={label}
            style={[styles.row, !last && styles.rowGap]}
            accessible
            accessibilityLabel={`${i + 1}단계 ${label}, ${done ? '끝남' : now ? `하는 중, ${detail}` : `남음, ${guides[i]}`}`}
          >
            {!last ? (
              <View
                style={[
                  styles.line,
                  done && styles.lineDone,
                  // 다음 단계가 지금 단계면 그 동그라미 바깥을 도는 테두리에 닿지 않게 선을 일찍 끊는다
                  i + 1 === current && styles.lineBeforeNow,
                ]}
              />
            ) : null}
            <View style={[styles.dot, done && styles.dotDone, now && styles.dotNow]}>
              {now ? <Spinner /> : null}
              {done ? (
                <Icon name="check" size={16} color={colors.text.inverse} />
              ) : (
                <Text style={[typography.captionBold, now ? styles.numNow : styles.num]}>
                  {i + 1}
                </Text>
              )}
            </View>
            <View style={styles.texts}>
              <Text
                style={[
                  now ? typography.bodyBold : typography.body,
                  done ? styles.labelDone : now ? styles.labelNow : styles.label,
                ]}
              >
                {label}
              </Text>
              <Text style={[typography.caption, now ? styles.detail : styles.guide]}>
                {now ? detail : guides[i]}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** 지금 단계 동그라미 바깥을 도는 파란 테두리. 움직임 줄이기를 켜면 돌지 않고 멈춰 있다 */
function Spinner() {
  const reduceMotion = useReducedMotion();
  const turn = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    turn.value = withRepeat(withTiming(1, { duration: 1000, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(turn);
  }, [reduceMotion, turn]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 360}deg` }] }));
  return <Animated.View pointerEvents="none" style={[styles.spin, style]} />;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[14] },
  rowGap: { paddingBottom: spacing[24] },
  // 동그라미 가운데 아래에서 다음 동그라미까지 잇는 선
  line: {
    position: 'absolute',
    left: DOT / 2 - 1,
    top: DOT + spacing[4],
    bottom: spacing[4],
    width: 2,
    borderRadius: 1,
    backgroundColor: colors.line.default,
  },
  lineDone: { backgroundColor: colors.brand.primary },
  lineBeforeNow: { bottom: SPIN_GAP + 2 + spacing[4] },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.line.strong,
    backgroundColor: colors.surface.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: { backgroundColor: colors.brand.primary, borderColor: colors.brand.primary },
  dotNow: { backgroundColor: colors.brand.primaryBg, borderColor: colors.brand.primary },
  spin: {
    position: 'absolute',
    top: -SPIN_GAP - 1.5,
    left: -SPIN_GAP - 1.5,
    width: DOT + SPIN_GAP * 2,
    height: DOT + SPIN_GAP * 2,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: 'transparent',
    borderTopColor: colors.brand.primary,
  },
  num: { color: colors.text.muted },
  numNow: { color: colors.brand.primary },
  // 이름 줄(26)이 동그라미(28) 가운데에 오게 1 내린다. 설명 줄은 그 아래로 붙는다
  texts: { flex: 1, paddingTop: 1 },
  label: { color: colors.text.muted },
  labelDone: { color: colors.text.icon },
  labelNow: { color: colors.text.default },
  detail: { color: colors.text.sub, marginTop: spacing[2] },
  guide: { color: colors.text.muted, marginTop: spacing[2] },
});
