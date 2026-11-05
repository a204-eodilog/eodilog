import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import { colors, radius, spacing, typography } from '@/theme';

import { useRegionNames } from '../hooks/use-region-names';
import { dayIndex, dDay, destinationLabel } from '../trip-rules';
import type { Trip } from '../types';
import { DateBlock } from './date-block';

type Props = { trip: Trip; today: string; onPress: () => void };

/** 카드 폭. 옆 카드가 반쯤 보여 넘길 수 있다는 걸 알 수 있게 화면보다 좁게 둔다 */
export const NEXT_TRIP_CARD_WIDTH = 236;

/**
 * S15 다음 계획 한 장(B안). 옆으로 넘기는 줄에 놓는다.
 * 왼쪽 달력 칸(파랑 띠)에 시작 날짜, 오른쪽에 이름과 D-N·여행지를 둔다.
 * 2026-11-05 사용자 요청으로 세로 회색 카드에서 바꿨다(빈 칸이 크고 아래 목록과 어울리지 않음)
 */
export function NextTripCard({ trip, today, onPress }: Props) {
  const place = destinationLabel(useRegionNames(trip.destinationRegionIds));
  const d = dDay(trip, today);
  const n = dayIndex(trip, today);
  const badge = d !== null ? `D-${d}` : n !== null ? `${n}일차` : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${trip.title}, ${badge ?? '기간 미정'}, ${place ?? '여행지 미정'}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <DateBlock date={trip.startDate} tone="brand" />
      <View style={styles.texts}>
        <Text style={[typography.bodyBold, styles.title]} numberOfLines={1}>
          {trip.title}
        </Text>
        <View style={styles.meta}>
          {badge ? <Text style={[typography.captionBold, styles.badge]}>{badge}</Text> : null}
          <Icon name="map-pin" size={14} color={place ? colors.text.icon : colors.text.muted} />
          <Text
            style={[typography.caption, place ? styles.place : styles.placeEmpty]}
            numberOfLines={1}
          >
            {place ?? '미정'}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: NEXT_TRIP_CARD_WIDTH,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[12],
    padding: spacing[12],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line.default,
    backgroundColor: colors.surface.white,
  },
  pressed: { backgroundColor: colors.surface.subtle },
  texts: { flex: 1, gap: spacing[4] },
  title: { color: colors.text.default },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  badge: { color: colors.brand.primary, marginRight: spacing[4] },
  place: { flexShrink: 1, color: colors.text.icon },
  placeEmpty: { color: colors.text.muted },
});
