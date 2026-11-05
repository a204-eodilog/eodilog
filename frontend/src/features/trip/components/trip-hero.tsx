import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AvatarGroup, Icon } from '@/components/ui';
import { formatRange } from '@/lib/seoul-date';
import { colors, layout, radius, spacing, typography } from '@/theme';

import type { Trip } from '../types';

type Props = {
  trip: Trip;
  headline: string;
  companions: string | null;
};

/**
 * S17 맨 위 파랑 블록. 여행 이름, 상태별 큰 제목, 날짜 칩, 동행 얼굴과 초대 버튼.
 * 다녀온 여행은 여행 사진을 배경으로 쓰는데, 사진 기능(S31) 전까지는 파랑 블록을 쓴다.
 * 초대 버튼은 S18 초대 링크 공유로, 설정 버튼은 S19 여행 설정으로 간다.
 */
export function TripHero({ trip, headline, companions }: Props) {
  const insets = useSafeAreaInsets();
  const dateLabel =
    trip.startDate && trip.endDate ? formatRange(trip.startDate, trip.endDate) : '기간 미정';

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <IconButton
          label="뒤로"
          icon="back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/trips'))}
        />
        <IconButton
          label="여행 설정"
          icon="gear"
          onPress={() => router.push(`/trips/${trip.id}/settings`)}
        />
      </View>

      <View style={styles.body}>
        {/* 피그마 S17: 여행 이름 14, 큰 제목 30, 날짜 칩 13 */}
        <Text style={[typography.subBold, styles.tripName]} numberOfLines={1}>
          {trip.title}
        </Text>
        <Text style={[typography.hero, styles.headline]}>{headline}</Text>
        <View style={styles.dateChip}>
          <Text style={[typography.label, styles.dateText]}>{dateLabel}</Text>
        </View>

        <View style={styles.people}>
          {/* 4명까지 얼굴, 나머지는 "+n"(정원 20명) */}
          <AvatarGroup
            people={trip.members.map((m) => ({
              name: m.user.nickname,
              imageUrl: m.user.profileImageUrl,
            }))}
            max={4}
            size="md"
          />
          <Text style={[typography.subBold, styles.peopleText]} numberOfLines={1}>
            {companions ?? '동행을 초대해 보세요'}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="동행 초대"
            // 동그라미는 피그마대로 32지만 누르는 범위는 손가락 크기(44)에 맞춘다
            hitSlop={6}
            onPress={() => router.push(`/trips/${trip.id}/invite`)}
            style={styles.invite}
          >
            <Icon name="person-plus" size={18} color={colors.brand.primary} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function IconButton({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: 'back' | 'gear';
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      style={styles.iconButton}
    >
      <Icon name={icon} color={colors.text.inverse} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.brand.primary },
  bar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[8],
  },
  iconButton: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 피그마 S17 파랑 블록: 위 14, 아래 24, 줄 사이 10
  body: {
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing[14],
    paddingBottom: spacing[24],
    gap: spacing[10],
  },
  tripName: { color: colors.onBrand.textSoft },
  headline: { color: colors.text.inverse },
  dateChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[12],
    paddingVertical: spacing[6],
    borderRadius: radius.lg,
    backgroundColor: colors.onBrand.chip,
  },
  dateText: { color: colors.text.inverse },
  // 피그마 S17 동행 줄: 상자 없이 파랑 위에 바로, 높이 36, 위 4, 간격 10
  people: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[10],
    minHeight: 36,
    paddingTop: spacing[4],
  },
  peopleText: { flex: 1, color: colors.text.inverse },
  invite: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.white,
  },
});
