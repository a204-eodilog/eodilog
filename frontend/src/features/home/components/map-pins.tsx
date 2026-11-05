import { Image } from 'expo-image';
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
}: {
  mark: RegionMark;
  onPress?: () => void;
  pulse?: boolean;
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
        {pulse ? <Ripple /> : null}
        <View style={styles.dot} />
      </View>
    </Pressable>
  );
}

/** 여러 지역을 묶은 핀. "강원 8곳 · 친구 5", "강릉 외 2곳 · 친구 6". 누르면 그곳으로 한 단계 확대 */
export function GroupPill({
  group,
  onPress,
  pulse = false,
}: {
  group: RegionGroup;
  onPress?: () => void;
  pulse?: boolean;
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
        {pulse ? <Ripple /> : null}
        <View style={styles.dot} />
      </View>
    </Pressable>
  );
}

// Figma S05 '퍼지는 원': 1.6초 동안 0.6배 → 2.6배로 퍼지며 사라지고, 3.5초마다 반복
const RIPPLE = { growMs: 1600, cycleMs: 3500, from: 0.6, to: 2.6, opacity: 0.9 } as const;

function Ripple() {
  const reduced = useReducedMotion();
  const scale = useSharedValue<number>(RIPPLE.from);
  const opacity = useSharedValue<number>(reduced ? 0 : RIPPLE.opacity);
  useEffect(() => {
    if (reduced) return;
    const ease = { duration: RIPPLE.growMs, easing: Easing.out(Easing.quad) };
    const rest = RIPPLE.cycleMs - RIPPLE.growMs;
    const reset = (v: number) => withDelay(rest, withTiming(v, { duration: 0 }));
    scale.set(withRepeat(withSequence(withTiming(RIPPLE.to, ease), reset(RIPPLE.from)), -1));
    opacity.set(withRepeat(withSequence(withTiming(0, ease), reset(RIPPLE.opacity)), -1));
    // 처음 한 번만 시작하면 계속 반복된다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));
  return <Animated.View style={[styles.ripple, style]} pointerEvents="none" />;
}

/** 확대 보기 핀. 지역 점 옆에 표지 사진 + 지역 이름 + 다녀간 친구 얼굴 카드. side는 카드가 놓일 쪽 */
export function PhotoPin({
  mark,
  side,
  onPress,
}: {
  mark: RegionMark;
  side: 'left' | 'right';
  onPress?: () => void;
}) {
  const faces = mark.memberNames.slice(0, 3);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${mark.name}, 친구 ${mark.memberCount}명`}
      style={[styles.photoWrap, side === 'left' ? styles.photoWrapLeft : styles.photoWrapRight]}
    >
      <View style={styles.ringDot} />
      <View style={styles.photoCard}>
        {mark.coverUrl ? (
          <Image source={{ uri: mark.coverUrl }} style={styles.photo} contentFit="cover" />
        ) : (
          <View style={[styles.photo, styles.photoEmpty]}>
            <Icon name="image" size={20} color={colors.brand.primary} />
          </View>
        )}
        <View style={styles.photoText}>
          <Text style={styles.photoName}>{mark.name}</Text>
          {faces.length > 0 ? (
            <View style={styles.faces}>
              {faces.map((name, i) => (
                <View key={`${name}-${i}`} style={styles.face}>
                  <Text style={styles.faceText}>{name.slice(0, 1)}</Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.countRow}>
              <Icon name="people" size={14} color={colors.text.icon} />
              <Text style={styles.pillCount}>{mark.memberCount}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
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
  // 점(16)의 가운데가 지도 위 지역 자리에 오게 반 칸(8)만큼 바깥으로 민다
  photoWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing[6] },
  photoWrapRight: { marginLeft: -8 },
  photoWrapLeft: { flexDirection: 'row-reverse', marginRight: -8 },
  ringDot: {
    width: 16,
    height: 16,
    borderRadius: radius.full,
    backgroundColor: colors.surface.white,
    borderWidth: 3,
    borderColor: colors.brand.primary,
  },
  photoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[10],
    padding: spacing[6],
    paddingRight: spacing[14],
    borderRadius: radius.lg,
    backgroundColor: colors.surface.white,
    boxShadow: SHADOW,
  },
  photo: { width: 52, height: 52, borderRadius: radius.md },
  photoEmpty: {
    backgroundColor: colors.brand.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoText: { gap: spacing[4] },
  photoName: { ...typography.bodyBold, color: colors.text.default },
  faces: { flexDirection: 'row', gap: spacing[2] },
  face: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    backgroundColor: colors.surface.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  faceText: { ...typography.micro, color: colors.text.icon },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
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
