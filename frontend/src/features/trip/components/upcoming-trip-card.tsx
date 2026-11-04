import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AvatarGroup, Icon } from '@/components/ui';
import { formatRange } from '@/lib/seoul-date';
import { colors, radius, spacing, typography } from '@/theme';

import { useRegionNames } from '../hooks/use-region-names';
import { dayIndex, dDay, destinationLabel, nextTodoLabel, tripStatus } from '../trip-rules';
import type { Trip, TripStatus } from '../types';

// '게시됨'은 공동 피드 기능이 여행별 게시 여부를 줄 때 연결한다. 그전에는 강조하지 않는다
const STAGES: { key: TripStatus | 'PUBLISHED'; label: string }[] = [
  { key: 'PLANNING', label: '계획 중' },
  { key: 'ONGOING', label: '여행 중' },
  { key: 'COMPLETED', label: '다녀옴' },
  { key: 'PUBLISHED', label: '게시됨' },
];

type Props = { trip: Trip; today: string; onPress: () => void };

/** S15 맨 위 파랑 카드. 여행 중이면 "여행 중", 아니면 "다가오는 여행" */
export function UpcomingTripCard({ trip, today, onPress }: Props) {
  const place = destinationLabel(useRegionNames(trip.destinationRegionIds));
  const d = dDay(trip, today);
  const n = dayIndex(trip, today);
  // 서버 status 대신 날짜로 정한다. 화면을 열어 둔 채 자정이 지나도 맞게 바뀐다
  const status = tripStatus(trip, today);
  const ongoing = status === 'ONGOING';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${ongoing ? '여행 중' : '다가오는 여행'} ${trip.title}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <Text style={[typography.captionMedium, styles.kicker]}>
        {ongoing ? '여행 중' : '다가오는 여행'}
      </Text>
      <View style={styles.titleRow}>
        <View style={styles.titleText}>
          {d !== null ? <Text style={[typography.title1, styles.white]}>D-{d}</Text> : null}
          {n !== null ? <Text style={[typography.title1, styles.white]}>{n}일차</Text> : null}
          <Text style={[typography.title2, styles.white]} numberOfLines={1}>
            {trip.title}
          </Text>
        </View>
        <AvatarGroup
          people={trip.members.map((m) => ({
            name: m.user.nickname,
            imageUrl: m.user.profileImageUrl,
          }))}
          size="md"
        />
      </View>
      <View style={styles.metaRow}>
        {trip.startDate && trip.endDate ? (
          <Text style={[typography.caption, styles.meta]}>
            {formatRange(trip.startDate, trip.endDate)}
          </Text>
        ) : null}
        {place ? (
          <Text style={[typography.caption, styles.meta]} numberOfLines={1}>
            · {place}
          </Text>
        ) : null}
      </View>

      <View style={styles.todo}>
        <Icon name="map-pin" size={20} color={colors.brand.primary} />
        <View style={styles.todoText}>
          <Text style={[typography.micro, styles.todoKicker]}>지금 할 일</Text>
          <Text style={[typography.bodyBold, styles.todoLabel]}>{nextTodoLabel(trip, today)}</Text>
        </View>
        <Icon name="chevron-right" size={20} color={colors.text.muted} />
      </View>

      <View style={styles.stages}>
        {STAGES.map((s) => {
          const on = s.key === status;
          return (
            <View key={s.key} style={[styles.stage, on && styles.stageOn]}>
              <Text style={[typography.micro, on ? styles.stageTextOn : styles.stageText]}>
                {s.label}
              </Text>
            </View>
          );
        })}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.brand.primary,
    borderRadius: radius.xl,
    padding: spacing[20],
    gap: spacing[8],
  },
  pressed: { opacity: 0.9 },
  kicker: { color: colors.brand.primaryLight },
  titleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing[12] },
  titleText: { flex: 1 },
  white: { color: colors.text.inverse },
  metaRow: { flexDirection: 'row', gap: spacing[4] },
  meta: { color: colors.brand.primaryLight, flexShrink: 1 },
  todo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[12],
    marginTop: spacing[8],
    padding: spacing[14],
    borderRadius: radius.md,
    backgroundColor: colors.surface.white,
  },
  todoText: { flex: 1 },
  todoKicker: { color: colors.text.muted },
  todoLabel: { color: colors.text.default },
  stages: { flexDirection: 'row', gap: spacing[6], marginTop: spacing[4] },
  stage: {
    paddingHorizontal: spacing[10],
    paddingVertical: spacing[4],
    borderRadius: radius.full,
    backgroundColor: colors.brand.primaryDark,
  },
  stageOn: { backgroundColor: colors.surface.white },
  stageText: { color: colors.brand.primaryLight },
  stageTextOn: { color: colors.brand.primary },
});
