import { StyleSheet, Text, View } from 'react-native';

import { AvatarGroup, Icon } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { formatRange } from '@/lib/seoul-date';
import { colors, layout, radius, spacing, typography } from '@/theme';

import { useRegionNames } from '../hooks/use-region-names';
import {
  dayIndex,
  dDay,
  destinationLabel,
  nextTodoLabel,
  periodPlaceLabel,
  tripStatus,
} from '../trip-rules';
import type { Trip, TripStatus } from '../types';

// 단계 막대. 글 대신 막대로 지금 어디쯤인지 보인다(2026-11-05 사용자 요청: 글보다 아이콘·그림)
const STAGES: { key: TripStatus; label: string }[] = [
  { key: 'PLANNING', label: '계획 중' },
  { key: 'ONGOING', label: '여행 중' },
  { key: 'COMPLETED', label: '다녀옴' },
];

type Props = { trip: Trip; today: string; onPress: () => void };

/**
 * S15 맨 위 대표 여행 카드(B안 "지금 여행 집중", 2026-11-05 사용자 선택).
 * 밝은 상단 바 아래 따로 떨어진 파랑 카드다. 여백·둥글기는 채팅 탭 맨 위 카드(FeaturedRoomCard)와 맞춘다.
 * 여행 중이면 "여행 중 · N일차", 아니면 "다가오는 여행 · D-N"
 */
export function UpcomingTripCard({ trip, today, onPress }: Props) {
  const place = destinationLabel(useRegionNames(trip.destinationRegionIds));
  const d = dDay(trip, today);
  const n = dayIndex(trip, today);
  // 서버 status 대신 날짜로 정한다. 화면을 열어 둔 채 자정이 지나도 맞게 바뀐다
  const status = tripStatus(trip, today);
  const ongoing = status === 'ONGOING';
  const stageIndex = STAGES.findIndex((s) => s.key === status);
  const kicker = ongoing
    ? `여행 중${n !== null ? ` · ${n}일차` : ''}`
    : `다가오는 여행${d !== null ? ` · D-${d}` : ''}`;
  const range = trip.startDate && trip.endDate ? formatRange(trip.startDate, trip.endDate) : null;
  const periodPlace = periodPlaceLabel(range, place);

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${kicker} ${trip.title}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.head}>
        <Text style={[typography.captionMedium, styles.kicker]}>{kicker}</Text>
        <View style={styles.titleRow}>
          <Text style={[typography.title2, styles.white, styles.titleText]} numberOfLines={2}>
            {trip.title}
          </Text>
          <AvatarGroup
            people={trip.members.map((m) => ({
              name: m.user.nickname,
              imageUrl: m.user.profileImageUrl,
            }))}
            size="md"
          />
        </View>
        {periodPlace ? (
          <Text style={[typography.subMedium, styles.kicker]} numberOfLines={1}>
            {periodPlace}
          </Text>
        ) : null}
      </View>

      <View style={styles.todo}>
        <Icon name="map-pin" size={20} color={colors.brand.primary} />
        <View style={styles.todoText}>
          <Text style={[typography.captionMedium, styles.todoKicker]}>지금 할 일</Text>
          <Text style={[typography.bodyBold, styles.todoLabel]}>{nextTodoLabel(trip, today)}</Text>
        </View>
        <Icon name="chevron-right" size={16} color={colors.text.muted} />
      </View>

      <View
        style={styles.stages}
        accessible
        accessibilityLabel={`단계 ${STAGES[stageIndex]?.label ?? ''}`}
      >
        {STAGES.map((s, i) => (
          <View key={s.key} style={[styles.stage, i <= stageIndex && styles.stageOn]} />
        ))}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  // 채팅 탭 맨 위 카드와 같은 좌우 20·둥글기 xl·안쪽 16. 묶음 사이 16
  card: {
    marginHorizontal: layout.screenPaddingX,
    padding: spacing[16],
    gap: spacing[16],
    borderRadius: radius.xl,
    backgroundColor: colors.brand.primary,
  },
  pressed: { opacity: 0.9 },
  head: { gap: spacing[4] },
  kicker: { color: colors.onBrand.textSoft },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[12] },
  titleText: { flex: 1 },
  white: { color: colors.text.inverse },
  // 지금 할 일: 흰 상자 둥글기 16, 안쪽 왼 18·오른 14·위아래 14, 간격 18
  todo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[18],
    paddingLeft: spacing[18],
    paddingRight: spacing[14],
    paddingVertical: spacing[14],
    borderRadius: radius.lg,
    backgroundColor: colors.surface.white,
  },
  todoText: { flex: 1 },
  todoKicker: { color: colors.text.default },
  todoLabel: { color: colors.text.default },
  stages: { flexDirection: 'row', gap: spacing[4] },
  stage: { flex: 1, height: 4, borderRadius: radius.full, backgroundColor: colors.onBrand.chip },
  stageOn: { backgroundColor: colors.surface.white },
});
