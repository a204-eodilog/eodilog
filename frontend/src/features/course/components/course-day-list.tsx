import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/ui';
import { colors, radius, spacing, typography } from '@/theme';

import {
  legLabel,
  MODE_LABEL,
  noTimeDefault,
  type DayLeg,
  type DraftItem,
  type NoTime,
} from '../course-rules';
import type { TransportMode } from '../types';

export const MODE_ICON: Record<TransportMode, IconName> = {
  TRANSIT: 'bus',
  CAR: 'car',
  WALK: 'walk',
};

/** 높이 32 알약과 28 구간 칩의 누르는 영역을 44 이상으로 */
const HIT = { top: 6, bottom: 6 };
const HIT_LEG = { top: 8, bottom: 8 };

type Props = {
  items: DraftItem[];
  legs: DayLeg[];
  /** view: S24 [빼기] / edit: S23 더보기와 구간 고르기 */
  mode: 'view' | 'edit';
  /** S24는 초록 번호, S23은 파랑 번호 */
  tone: 'saved' | 'draft';
  onRemove?(index: number): void;
  onMore?(index: number): void;
  selectedLeg?: string | null;
  onSelectLeg?(key: string): void;
  /** 이동 시간을 못 구한 구간의 [다시 계산] */
  onRecalculate?(): void;
  /** 시간이 없는 구간을 계산 전으로 볼지 실패로 볼지. 기본은 noTimeDefault() */
  noTime?: NoTime;
};

/** 고른 날의 장소 줄과 장소 사이 구간 칩(Figma 201-12879 목록, 201-13969 목록, 201-13272 구간) */
export function CourseDayList(props: Props) {
  const { items, legs, mode, tone } = props;
  const numberColor = tone === 'saved' ? colors.status.success : colors.brand.primary;
  return (
    <View style={styles.list}>
      {items.map((item, i) => (
        <View key={item.key}>
          <View style={styles.row}>
            <View style={[styles.number, { backgroundColor: numberColor }]}>
              <Text style={[typography.captionBold, styles.numberText]}>{i + 1}</Text>
            </View>
            <View style={styles.texts}>
              {item.startTime ? (
                <Text style={[typography.caption, styles.time]}>{item.startTime}</Text>
              ) : null}
              <Text style={[typography.bodyBold, styles.name]} lineBreakStrategyIOS="hangul-word">
                {item.place.name}
              </Text>
            </View>
            {mode === 'view' ? (
              <Pressable
                style={styles.remove}
                hitSlop={HIT}
                onPress={() => props.onRemove?.(i)}
                accessibilityRole="button"
                accessibilityLabel={`${item.place.name} 빼기`}
              >
                <Icon name="close" size={14} color={colors.text.icon} />
                <Text style={[typography.captionMedium, styles.removeText]}>빼기</Text>
              </Pressable>
            ) : (
              <Pressable
                style={styles.more}
                onPress={() => props.onMore?.(i)}
                accessibilityRole="button"
                accessibilityLabel={`${item.place.name} 고치기`}
              >
                <Icon name="more" size={20} color={colors.text.icon} />
              </Pressable>
            )}
          </View>
          {legs[i] ? <LegRow leg={legs[i]} {...props} /> : null}
        </View>
      ))}
    </View>
  );
}

function LegRow({
  leg,
  mode,
  selectedLeg,
  onSelectLeg,
  onRecalculate,
  noTime = noTimeDefault(),
}: Props & { leg: DayLeg }) {
  const label = legLabel(leg);
  const selected = mode === 'edit' && selectedLeg === leg.key;
  if (label === null && mode === 'edit' && noTime === 'failed') {
    // 경로를 못 구했으면 0분이나 직선거리로 채우지 않고 그렇게 알린다(Figma 201-13272)
    return (
      <View style={styles.leg}>
        <Pressable
          onPress={() => onSelectLeg?.(leg.key)}
          hitSlop={HIT_LEG}
          style={[styles.legPill, styles.legFail, selected && styles.legSelected]}
          accessibilityRole="button"
          accessibilityLabel={`${MODE_LABEL[leg.mode]} 구간, 이동 시간을 못 구했어요`}
          accessibilityState={{ selected }}
        >
          <Icon name="alert" size={14} color={colors.status.danger} />
          <Text style={[typography.captionMedium, styles.failText]}>이동 시간을 못 구했어요</Text>
        </Pressable>
        {onRecalculate ? (
          <Pressable onPress={onRecalculate} style={styles.recalc} accessibilityRole="button">
            <Icon name="refresh" size={14} color={colors.brand.primary} />
            <Text style={[typography.captionMedium, styles.recalcText]}>다시 계산</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }
  return (
    <View style={styles.leg}>
      <Pressable
        disabled={mode !== 'edit'}
        onPress={() => onSelectLeg?.(leg.key)}
        hitSlop={HIT_LEG}
        style={[styles.legPill, styles.legNormal, selected && styles.legSelected]}
        accessibilityRole={mode === 'edit' ? 'button' : undefined}
        accessibilityState={mode === 'edit' ? { selected } : undefined}
      >
        <Icon name={MODE_ICON[leg.mode]} size={14} color={colors.text.icon} />
        <Text style={[typography.captionMedium, styles.legText]}>
          {label ?? `${MODE_LABEL[leg.mode]} · ${noTime === 'pending' ? '계산 전' : '시간 모름'}`}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing[4] },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[12], minHeight: 52 },
  number: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberText: { color: colors.text.inverse },
  texts: { flex: 1 },
  time: { color: colors.text.sub },
  name: { color: colors.text.default },
  remove: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
    height: 32,
    paddingHorizontal: spacing[10],
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.line.default,
  },
  removeText: { color: colors.text.icon },
  more: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
  leg: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[12],
    paddingLeft: 36,
    paddingVertical: spacing[4],
  },
  legPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[6],
    height: 28,
    paddingHorizontal: spacing[10],
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  legNormal: { backgroundColor: colors.surface.default },
  legFail: { backgroundColor: colors.status.dangerBg },
  legSelected: { borderColor: colors.brand.primary },
  legText: { color: colors.text.icon },
  failText: { color: colors.status.danger },
  recalc: { flexDirection: 'row', alignItems: 'center', gap: spacing[4], minHeight: 44 },
  recalcText: { color: colors.brand.primary },
});
