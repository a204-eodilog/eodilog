import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AvatarGroup } from '@/components/ui';
import { formatDay } from '@/lib/seoul-date';
import { colors, layout, spacing, typography } from '@/theme';

import { useRegionNames } from '../hooks/use-region-names';
import { destinationLabel } from '../trip-rules';
import type { Trip } from '../types';

type Props = { trip: Trip; onPress: () => void };

/** S15 목록 한 줄. 왼쪽 날짜(기간이 없으면 "미정"), 가운데 이름·여행지, 오른쪽 동행 얼굴 */
export function TripRow({ trip, onPress }: Props) {
  const place = destinationLabel(useRegionNames(trip.destinationRegionIds));
  const dateLabel = trip.startDate ? formatDay(trip.startDate) : '미정';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${trip.title}, ${dateLabel}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Text style={[typography.label, styles.date]}>{dateLabel}</Text>
      <View style={styles.text}>
        <Text style={[typography.bodyBold, styles.title]} numberOfLines={1}>
          {trip.title}
        </Text>
        <Text style={[typography.caption, styles.sub]} numberOfLines={1}>
          {place ?? '여행지 미정'}
        </Text>
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
    gap: spacing[12],
    minHeight: 64,
    paddingHorizontal: layout.screenPaddingX,
  },
  pressed: { backgroundColor: colors.surface.subtle },
  date: { width: 64, color: colors.text.sub },
  text: { flex: 1 },
  title: { color: colors.text.default },
  sub: { color: colors.text.muted },
});
