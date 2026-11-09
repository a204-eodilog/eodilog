import { StyleSheet, Text, View } from 'react-native';

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
  notVoted: { ...typography.captionMedium, color: colors.brand.primaryDark },
});
