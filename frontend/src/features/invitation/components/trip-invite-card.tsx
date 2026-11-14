import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { Icon, type IconName } from '@/components/ui';
import { formatTripNights, formatTripPeriod } from '@/lib/format-date';
import { colors, fontFamily, radius, spacing, typography } from '@/theme';

import { TRIP_STATUS_LABEL, guessTripStatus } from '../invite-rules';

type Props = {
  title: string;
  startDate: string | null;
  endDate: string | null;
};

/** 파란 그라데이션 여행 카드(Figma S04 유효). 지역은 미리보기 API가 주지 않아 기간만 보여 준다 */
export function TripInviteCard({ title, startDate, endDate }: Props) {
  const status = guessTripStatus(startDate, endDate);
  const nights = formatTripNights(startDate, endDate);

  return (
    <View style={styles.card}>
      {/* 안드로이드에서 100% 크기 그림이 카드보다 작게 그려져 잘렸다. 0~100 좌표를 카드 크기로 늘린다 */}
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="trip-card" x1="0" y1="0" x2="0.3" y2="1">
            <Stop offset="0.14" stopColor="#3B82F0" />
            <Stop offset="0.86" stopColor="#2A66D6" />
          </LinearGradient>
        </Defs>
        <Rect width="100" height="100" fill="url(#trip-card)" />
      </Svg>
      <View style={styles.statusPill}>
        <Text style={[typography.captionMedium, styles.statusLabel]}>
          {TRIP_STATUS_LABEL[status]}
        </Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        <View style={styles.meta}>
          <Meta icon="calendar" label={formatTripPeriod(startDate, endDate)} />
          {nights ? <Meta icon="clock" label={nights} /> : null}
        </View>
      </View>
    </View>
  );
}

function Meta({ icon, label }: { icon: IconName; label: string }) {
  return (
    <View style={styles.metaItem}>
      <Icon name={icon} size={16} color={META_COLOR} />
      <Text style={[typography.caption, styles.metaLabel]}>{label}</Text>
    </View>
  );
}

const META_COLOR = 'rgba(255, 255, 255, 0.9)';

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    // 그라데이션이 늦게 그려져도 흰 글자가 보이게 끝 색을 바탕으로 깐다
    backgroundColor: '#2A66D6',
    padding: spacing[20],
    gap: spacing[20],
  },
  statusPill: {
    alignSelf: 'flex-start',
    height: 24,
    paddingHorizontal: spacing[10],
    borderRadius: radius.full,
    backgroundColor: colors.surface.white,
    justifyContent: 'center',
  },
  statusLabel: { color: colors.brand.primary },
  body: { gap: spacing[8] },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.5,
    color: colors.text.inverse,
  },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing[14] },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: spacing[6] },
  metaLabel: { color: META_COLOR },
});
