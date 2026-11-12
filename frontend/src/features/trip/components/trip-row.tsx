import { StyleSheet, Text, View } from 'react-native';

import { AvatarGroup, Icon } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { colors, spacing, typography } from '@/theme';

import { useRegionNames } from '../hooks/use-region-names';
import { tripListLead, type TripListKind } from '../trip-list-rules';
import { destinationLabel } from '../trip-rules';
import type { Trip } from '../types';
import { DateBlock } from './date-block';

type Props = { trip: Trip; kind: TripListKind; today: string; onPress: () => void };

/**
 * S15 여행 한 줄. 세로로 늘어놓는다.
 * 왼쪽 달력 칸, 가운데 이름과 둘째 줄(D-N이나 몇 박 며칠, 여행지), 오른쪽 동행 얼굴.
 * 2026-11-11부터 다음 계획이 이 모양을 쓴다(파랑 달력 칸). 그전에는 다녀온 여행이 썼다(회색 달력 칸)
 */
export function TripRow({ trip, kind, today, onPress }: Props) {
  const place = destinationLabel(useRegionNames(trip.destinationRegionIds));
  const lead = tripListLead(trip, kind, today);
  const next = kind === 'next';

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${trip.title}, ${lead ?? '기간 미정'}, ${place ?? '여행지 미정'}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
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
          {place || next ? (
            <>
              <Icon name="map-pin" size={14} color={place ? colors.text.sub : colors.text.muted} />
              <Text
                style={[typography.caption, place ? styles.place : styles.placeEmpty]}
                numberOfLines={1}
              >
                {place ?? '미정'}
              </Text>
            </>
          ) : null}
        </View>
      </View>
      <AvatarGroup
        people={trip.members.map((m) => ({
          name: m.user.nickname,
          imageUrl: m.user.profileImageUrl,
        }))}
        max={3}
      />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[14],
    paddingVertical: spacing[12],
    paddingHorizontal: spacing[16],
  },
  pressed: { backgroundColor: colors.surface.subtle },
  texts: { flex: 1, gap: spacing[4] },
  title: { color: colors.text.strong },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  // D-day는 연파랑 알약으로 띄운다
  badge: {
    color: colors.brand.primary,
    marginRight: spacing[6],
    paddingHorizontal: spacing[8],
    borderRadius: 11,
    overflow: 'hidden',
    backgroundColor: colors.brand.primaryBg,
  },
  sub: { color: colors.text.sub, marginRight: spacing[6] },
  place: { flexShrink: 1, color: colors.text.sub },
  placeEmpty: { color: colors.text.muted },
});
