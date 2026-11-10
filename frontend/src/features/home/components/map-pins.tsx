import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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

import { Icon } from '@/components/ui';
import { colors, radius, spacing, typography } from '@/theme';

import { markFill } from '../home-rules';
import type { RegionGroup, RegionMark } from '../types';

const SHADOW = `0 2px 10px ${colors.shadow}`;

/** 전국 보기 핀. 흰 알약(지역 이름 + 친구 수) 아래 지역 점. pulse면 점에서 원이 퍼진다 */
export function RegionPill({
  mark,
  onPress,
  pulse = false,
  pulseDelayMs = 0,
}: {
  mark: RegionMark;
  onPress?: () => void;
  pulse?: boolean;
  /** 퍼지는 원을 시작할 때(ms). 핀이 다 올라온 뒤에 시작해야 나타나는 동안 버벅이지 않는다 */
  pulseDelayMs?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${mark.name}, 친구 ${mark.memberCount}명`}
      style={styles.pillWrap}
    >
      <View style={styles.pill}>
        <Text style={styles.pillName}>{mark.name}</Text>
        <Icon name="people" size={14} color={colors.text.icon} />
        <Text style={styles.pillCount}>{mark.memberCount}</Text>
      </View>
      <View style={styles.dotWrap}>
        {/* 시군구가 작으면(전주·해운대) 칠한 면적이 안 보여서 점 둘레에도 같은 색을 깐다 */}
        <View style={[styles.halo, { backgroundColor: markFill(mark.memberCount) }]} />
        {pulse ? <Ripple delayMs={pulseDelayMs} /> : null}
        <View style={styles.dot} />
      </View>
    </Pressable>
  );
}

/** 여러 지역을 묶은 핀. "강원 8곳 · 친구 5", "강릉·평창 외 1곳 · 친구 6". 누르면 그곳으로 한 단계 확대 */
export function GroupPill({
  group,
  onPress,
  pulse = false,
  pulseDelayMs = 0,
}: {
  group: RegionGroup;
  onPress?: () => void;
  pulse?: boolean;
  pulseDelayMs?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${group.label}, 친구 ${group.memberCount}명. 눌러서 확대`}
      style={styles.pillWrap}
    >
      <View style={styles.pill}>
        <Text style={styles.pillName}>{group.label}</Text>
        <Icon name="people" size={14} color={colors.text.icon} />
        <Text style={styles.pillCount}>{group.memberCount}</Text>
      </View>
      <View style={styles.dotWrap}>
        <View style={[styles.halo, { backgroundColor: markFill(group.memberCount) }]} />
        {pulse ? <Ripple delayMs={pulseDelayMs} /> : null}
        <View style={styles.dot} />
      </View>
    </Pressable>
  );
}

// Figma S05 '퍼지는 원': 1.6초 동안 0.6배 → 2.6배로 퍼지며 사라지고, 3.5초마다 반복
const RIPPLE = { growMs: 1600, cycleMs: 3500, from: 0.6, to: 2.6, opacity: 0.9 } as const;

function Ripple({ delayMs }: { delayMs: number }) {
  const reduced = useReducedMotion();
  const scale = useSharedValue<number>(RIPPLE.from);
  // 시작 전에는 숨겨 둔다(핀이 나타나는 동안 돌면 핀 전체를 매 순간 다시 그려 버벅인다)
  const opacity = useSharedValue<number>(reduced || delayMs > 0 ? 0 : RIPPLE.opacity);
  useEffect(() => {
    if (reduced) return;
    const ease = { duration: RIPPLE.growMs, easing: Easing.out(Easing.quad) };
    const rest = RIPPLE.cycleMs - RIPPLE.growMs;
    const reset = (v: number) => withDelay(rest, withTiming(v, { duration: 0 }));
    scale.set(
      withDelay(
        delayMs,
        withRepeat(withSequence(withTiming(RIPPLE.to, ease), reset(RIPPLE.from)), -1),
      ),
    );
    opacity.set(
      withDelay(
        delayMs,
        withSequence(
          withTiming(RIPPLE.opacity, { duration: 0 }),
          withRepeat(withSequence(withTiming(0, ease), reset(RIPPLE.opacity)), -1),
        ),
      ),
    );
    // 처음 한 번만 시작하면 계속 반복된다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));
  return <Animated.View style={[styles.ripple, style]} pointerEvents="none" />;
}

/** 친구 없음: 친구가 생기면 들어올 자리 (점선 동그라미 + 더하기) */
export function InviteSpot() {
  return (
    <View style={styles.invite}>
      <Icon name="plus" size={18} color={colors.brand.primary} />
    </View>
  );
}

/** 공개된 기록 없음: 친구 얼굴 + 자물쇠 (미리보기 예시에서만 위치를 안다) */
export function LockedFace({ name }: { name: string }) {
  return (
    <View style={styles.locked}>
      <Text style={styles.lockedText}>{name.slice(0, 1)}</Text>
      <View style={styles.lockBadge}>
        <Icon name="lock" size={10} color={colors.text.inverse} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pillWrap: { alignItems: 'center', gap: spacing[4], marginBottom: -6 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
    paddingHorizontal: spacing[10],
    height: 28,
    borderRadius: radius.full,
    backgroundColor: colors.surface.white,
    boxShadow: SHADOW,
  },
  pillName: { ...typography.captionBold, color: colors.text.default, marginRight: spacing[2] },
  pillCount: { ...typography.captionBold, color: colors.brand.primary },
  dotWrap: { width: 12, height: 12, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: 30, height: 30, borderRadius: radius.full, opacity: 0.55 },
  ripple: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: radius.full,
    backgroundColor: colors.brand.primarySoft,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: radius.full,
    backgroundColor: colors.text.default,
    borderWidth: 2,
    borderColor: colors.surface.white,
  },
  invite: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.text.muted,
    backgroundColor: colors.surface.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locked: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.surface.default,
    borderWidth: 2,
    borderColor: colors.surface.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockedText: { ...typography.bodyBold, color: colors.text.muted },
  lockBadge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 18,
    height: 18,
    borderRadius: radius.full,
    backgroundColor: colors.text.icon,
    borderWidth: 2,
    borderColor: colors.surface.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
