import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AvatarGroup, Icon, toast } from '@/components/ui';
import { formatRange } from '@/lib/seoul-date';
import { colors, layout, radius, spacing, typography } from '@/theme';

import type { Trip } from '../types';

type Props = {
  trip: Trip;
  headline: string;
  companions: string | null;
};

const comingSoon = () => toast.show('준비 중이에요');

/**
 * S17 맨 위 파랑 블록. 여행 이름, 상태별 큰 제목, 날짜 칩, 동행 얼굴과 초대 버튼.
 * 다녀온 여행은 여행 사진을 배경으로 쓰는데, 사진 기능(S31) 전까지는 파랑 블록을 쓴다.
 * 초대(S18)·설정(S19)은 다음 명세에서 만든다.
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
        <IconButton label="여행 설정" icon="person" onPress={comingSoon} />
      </View>

      <View style={styles.body}>
        <Text style={[typography.captionMedium, styles.tripName]} numberOfLines={1}>
          {trip.title}
        </Text>
        <Text style={[typography.title1, styles.headline]}>{headline}</Text>
        <View style={styles.dateChip}>
          <Icon name="calendar" size={16} color={colors.text.inverse} />
          <Text style={[typography.captionMedium, styles.dateText]}>{dateLabel}</Text>
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
          <Text style={[typography.caption, styles.peopleText]} numberOfLines={1}>
            {companions ?? '동행을 초대해 보세요'}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="동행 초대"
            onPress={comingSoon}
            style={styles.invite}
          >
            <Icon name="plus" size={16} color={colors.brand.primary} />
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
  icon: 'back' | 'person';
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
  wrap: { backgroundColor: colors.brand.primary, paddingBottom: spacing[20] },
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
  body: { paddingHorizontal: layout.screenPaddingX, gap: spacing[8] },
  tripName: { color: colors.brand.primaryLight },
  headline: { color: colors.text.inverse },
  dateChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
    paddingHorizontal: spacing[10],
    paddingVertical: spacing[4],
    borderRadius: radius.full,
    backgroundColor: colors.brand.primaryDark,
  },
  dateText: { color: colors.text.inverse },
  people: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[8],
    marginTop: spacing[8],
    padding: spacing[10],
    borderRadius: radius.lg,
    backgroundColor: colors.brand.primaryDark,
  },
  peopleText: { flex: 1, color: colors.text.inverse, marginLeft: spacing[8] },
  invite: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.white,
  },
});
