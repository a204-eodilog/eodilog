import { StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui';
import { colors, radius, spacing, typography } from '@/theme';

import { PillButton } from './pill-button';
import { StarRow } from './stars';

export type ReviewCardData = {
  id: string;
  name: string;
  imageUrl: string | null;
  score: number;
  /** "11.15(일)" */
  date: string;
  body: string;
};

type ReviewCardProps = {
  review: ReviewCardData;
  /** 내 평가 카드. 연파랑 바탕, 얼굴도 연파랑, 아래 [수정] [삭제] */
  mine?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
};

/**
 * S34 평가 카드. 동행 평가는 회색, 내 평가는 연파랑. 둥글기 16, 안쪽 18/20, 세로 10.
 * 머리 줄: 얼굴 28 · 이름 · 작은 별 · 오른쪽 끝 날짜
 */
export function ReviewCard({ review, mine = false, onEdit, onDelete }: ReviewCardProps) {
  return (
    <View style={[styles.card, mine && styles.mine]}>
      <View style={styles.head}>
        <Avatar name={review.name} imageUrl={review.imageUrl} size={28} me={mine} />
        <Text style={[typography.bodyBold, styles.name]} numberOfLines={1}>
          {review.name}
        </Text>
        <StarRow score={review.score} />
        <Text style={[typography.caption, styles.date]}>{review.date}</Text>
      </View>
      <Text style={[typography.body, styles.body]}>{review.body}</Text>
      {mine && onEdit && onDelete ? (
        <View style={styles.actions}>
          <PillButton label="수정" icon="pencil" tone="white" size="sm" onPress={onEdit} />
          <PillButton label="삭제" icon="trash" tone="white" size="sm" onPress={onDelete} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface.default,
    borderRadius: radius.lg,
    paddingVertical: spacing[18],
    paddingHorizontal: spacing[20],
    gap: spacing[10],
  },
  mine: { backgroundColor: colors.brand.primaryBg },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing[10] },
  name: { color: colors.text.default, flexShrink: 1 },
  date: { color: colors.text.sub, marginLeft: 'auto' },
  body: { color: colors.text.default },
  actions: { flexDirection: 'row', gap: spacing[6], marginTop: spacing[4] },
});
