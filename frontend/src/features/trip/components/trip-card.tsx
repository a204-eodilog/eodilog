import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { colors, radius, spacing, typography } from '@/theme';

import { useRegionNames } from '../hooks/use-region-names';
import { tripListLead, type TripListKind } from '../trip-list-rules';
import { destinationLabel } from '../trip-rules';
import type { Trip } from '../types';
import { DateBlock } from './date-block';

type Props = { trip: Trip; kind: TripListKind; today: string; onPress: () => void };

/** 카드 폭. 옆 카드가 반쯤 보여 넘길 수 있다는 걸 알 수 있게 화면보다 좁게 둔다 */
export const TRIP_CARD_WIDTH = 236;

/**
 * S15 여행 카드 한 장. 옆으로 넘기는 줄에 놓는다.
 * 왼쪽 달력 칸에 시작 날짜, 오른쪽에 이름과 둘째 줄(D-N이나 몇 박 며칠, 여행지)을 둔다.
 * 2026-11-11부터 다녀온 여행이 이 모양을 쓴다(회색 달력 칸). 그전에는 다음 계획이 썼다(파랑 달력 칸).
 * 사진 배경은 넣지 않는다
 */
export function TripCard({ trip, kind, today, onPress }: Props) {
  const place = destinationLabel(useRegionNames(trip.destinationRegionIds));
  const lead = tripListLead(trip, kind, today);
  const next = kind === 'next';

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${trip.title}, ${lead ?? '기간 미정'}, ${place ?? '여행지 미정'}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <DateBlock date={trip.startDate} tone={next ? 'brand' : 'muted'} />
      <View style={styles.texts}>
        <Text style={[typography.bodyBold, styles.title]} numberOfLines={1}>
          {trip.title}
        </Text>
        <View style={styles.meta}>
          {lead ? (
            <Text
              style={
                next ? [typography.captionBold, styles.badge] : [typography.caption, styles.sub]
              }
            >
              {lead}
            </Text>
          ) : null}
          <Icon name="map-pin" size={14} color={place ? colors.text.icon : colors.text.muted} />
          <Text
            style={[typography.caption, place ? styles.place : styles.placeEmpty]}
            numberOfLines={1}
          >
            {place ?? '미정'}
          </Text>
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    width: TRIP_CARD_WIDTH,
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
  sub: { color: colors.text.sub, marginRight: spacing[4] },
  place: { flexShrink: 1, color: colors.text.icon },
  placeEmpty: { color: colors.text.muted },
});
