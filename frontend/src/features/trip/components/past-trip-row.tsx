import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AvatarGroup, Icon } from '@/components/ui';
import { daysBetween } from '@/lib/seoul-date';
import { colors, layout, spacing, typography } from '@/theme';

import { useRegionNames } from '../hooks/use-region-names';
import { destinationLabel, stayLabel } from '../trip-rules';
import type { Trip } from '../types';
import { DateBlock } from './date-block';

type Props = { trip: Trip; today: string; onPress: () => void };

/**
 * S15 다녀온 여행 한 줄(B안). 다음 계획 카드와 같은 달력 칸을 회색 띠로 써서 지난 여행임을 구분한다.
 * 오른쪽은 이름, 아래 "1박 2일 · 여수시". 올해가 아닌 여행은 앞에 연도를 붙인다
 */
export function PastTripRow({ trip, today, onPress }: Props) {
  const place = destinationLabel(useRegionNames(trip.destinationRegionIds));
  const stay =
    trip.startDate && trip.endDate ? stayLabel(daysBetween(trip.startDate, trip.endDate)) : null;
  const year = trip.startDate && trip.startDate.slice(0, 4) !== today.slice(0, 4);
  const when = [year ? trip.startDate?.slice(0, 4) : null, stay].filter(Boolean).join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${trip.title}${trip.startDate ? `, ${trip.startDate}` : ''}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <DateBlock date={trip.startDate} tone="muted" />
      <View style={styles.texts}>
        <Text style={[typography.bodyBold, styles.title]} numberOfLines={1}>
          {trip.title}
        </Text>
        <View style={styles.meta}>
          {when ? <Text style={[typography.caption, styles.sub]}>{when}</Text> : null}
          {place ? (
            <>
              <Icon name="map-pin" size={14} color={colors.text.sub} />
              <Text style={[typography.caption, styles.place]} numberOfLines={1}>
                {place}
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
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[14],
    paddingVertical: spacing[10],
    paddingHorizontal: layout.screenPaddingX,
  },
  pressed: { backgroundColor: colors.surface.subtle },
  texts: { flex: 1, gap: spacing[4] },
  title: { color: colors.text.strong },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  sub: { color: colors.text.sub, marginRight: spacing[6] },
  place: { flexShrink: 1, color: colors.text.sub },
});
