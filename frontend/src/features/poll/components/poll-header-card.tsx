import { StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/ui';
import { colors, radius, spacing, typography } from '@/theme';

type OpenProps = {
  /** "2일 남았어요". 마감 시각이 지났으면 null */
  remaining: string | null;
  title: string;
  votedCount: number;
  notVotedCount: number;
};

/**
 * S22 진행 중 위쪽 카드(Figma 201-10941). '투표 중' 표시, 남은 시간, 제목, 투표한 인원과 아직 안 한 인원.
 * 투표한 동행 얼굴은 서버가 주지 않아 인원 수만 보인다 (가정 — 사용자 확인 필요, Q-4-2)
 */
export function PollOpenHeaderCard({ remaining, title, votedCount, notVotedCount }: OpenProps) {
  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <View style={styles.badge}>
          <View style={styles.dot} />
          <Text style={styles.badgeText}>투표 중</Text>
        </View>
        {remaining ? <Text style={styles.remaining}>{remaining}</Text> : null}
      </View>
      <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>
        {title}
      </Text>
      <View style={styles.bottom}>
        <Text style={styles.voted}>{`${votedCount}명 투표했어요`}</Text>
        {notVotedCount > 0 ? (
          <Text style={styles.notVoted}>{`${notVotedCount}명 아직이에요`}</Text>
        ) : null}
      </View>
    </View>
  );
}

/** 아이콘 + 작은 글자 한 줄 */
function IconLine({
  icon,
  text,
  tone = 'sub',
}: {
  icon: IconName;
  text: string;
  tone?: 'sub' | 'success';
}) {
  const color = tone === 'success' ? colors.status.success : colors.text.icon;
  return (
    <View style={styles.iconLine}>
      <Icon name={icon} size={16} color={color} />
      <Text style={[styles.iconLineText, { color }]}>{text}</Text>
    </View>
  );
}

type ClosedProps = {
  /** "10.27(화) 18:40" */
  closedAt: string;
  title: string;
  /** 사람 아이콘 줄. 빈 문자열이면 숨긴다 */
  sub: string;
};

/** S22 마감 카드(Figma 201-11073·201-11213). 어두운 '마감' 표시, 마감 시각, 결과 제목, 보조 줄 */
export function PollClosedHeaderCard({ closedAt, title, sub }: ClosedProps) {
  return (
    <View style={[styles.card, styles.closedCard]}>
      <View style={styles.top}>
        <View style={[styles.badge, styles.closedBadge]}>
          <Icon name="clock" size={14} color={colors.text.inverse} />
          <Text style={styles.badgeText}>마감</Text>
        </View>
        <IconLine icon="clock" text={`${closedAt} 마감`} />
      </View>
      <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>
        {title}
      </Text>
      {sub ? <IconLine icon="people" text={sub} /> : null}
    </View>
  );
}

type DecidedProps = {
  /** "10.27(화)" */
  closedDate: string;
  /** "겨울 여행 여행지" */
  label: string;
  name: string;
  votes: string;
  voters: string;
};

/** S22 여행지 확정 카드(Figma 201-11569). 초록 '확정', 자동 확정 날짜, 지도 핀 원, 여행지 이름, 득표와 투표 인원 */
export function PollDecidedCard({ closedDate, label, name, votes, voters }: DecidedProps) {
  return (
    <View style={[styles.card, styles.decidedCard]}>
      <View style={styles.top}>
        <View style={[styles.badge, styles.decidedBadge]}>
          <Icon name="check" size={14} color={colors.status.success} />
          <Text style={[styles.badgeText, styles.decidedBadgeText]}>확정</Text>
        </View>
        <IconLine icon="calendar" text={`${closedDate} 마감 후 자동 확정됐어요`} tone="success" />
      </View>
      <View style={styles.place}>
        <View style={styles.pin}>
          <Icon name="map-pin" size={24} color={colors.status.success} />
        </View>
        <View style={styles.placeTexts}>
          <Text style={styles.placeLabel}>{label}</Text>
          <Text style={styles.placeName} accessibilityRole="header" numberOfLines={1}>
            {name}
          </Text>
        </View>
      </View>
      <View style={styles.lines}>
        <IconLine icon="check" text={votes} />
        <IconLine icon="people" text={voters} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // 피그마: 연파랑 면, 둥글기 24, 안쪽 22, 줄 사이 18
  card: {
    backgroundColor: colors.brand.primaryBg,
    borderRadius: radius.xxl,
    padding: 22,
    gap: spacing[18],
  },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // 피그마: 파랑 알약 높이 28, 좌우 12, 흰 점 6과 반투명 테두리 3
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[8],
    height: 28,
    paddingHorizontal: spacing[12],
    borderRadius: radius.full,
    backgroundColor: colors.brand.primary,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surface.white,
    boxShadow: '0 0 0 3px rgba(255, 255, 255, 0.32)',
  },
  badgeText: { ...typography.captionMedium, color: colors.text.inverse },
  remaining: { ...typography.subBold, color: colors.brand.primaryDark },
  title: { ...typography.title1, color: colors.text.default },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  voted: { ...typography.body, color: colors.text.default },
  closedCard: { backgroundColor: colors.surface.default },
  closedBadge: { backgroundColor: colors.text.default, gap: spacing[6] },
  decidedCard: { backgroundColor: colors.status.successBg2 },
  decidedBadge: { backgroundColor: colors.status.successBg, gap: spacing[6] },
  decidedBadgeText: { color: colors.status.success },
  iconLine: { flexDirection: 'row', alignItems: 'center', gap: spacing[6] },
  iconLineText: { ...typography.caption, flexShrink: 1 },
  // 피그마: 흰 원 56 안 지도 핀, 이름은 큰 굵은 글자
  place: { flexDirection: 'row', alignItems: 'center', gap: spacing[16] },
  pin: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.surface.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeTexts: { flex: 1 },
  placeLabel: { ...typography.captionMedium, color: colors.status.success },
  placeName: { ...typography.hero, color: colors.text.default },
  lines: { flexDirection: 'row', alignItems: 'center', gap: spacing[16] },
  notVoted: { ...typography.captionMedium, color: colors.brand.primaryDark },
});
