import { StyleSheet, Text, View } from 'react-native';

import { Icon, Tag } from '@/components/ui';
import { colors, radius, spacing, typography } from '@/theme';

import type { VisitRow as VisitRowData } from '../visit-rules';

import { PillButton } from './pill-button';

type VisitRowProps = {
  row: VisitRowData;
  /** [다녀옴]을 보내는 중 */
  checking?: boolean;
  onCheck: () => void;
  /** [평가하기]·내 점수 → S34 */
  onReview: () => void;
};

/**
 * S33 장소 한 줄. 번호 동그라미 · 시각·이름·상태 · 오른쪽 버튼.
 * 사진으로 확인 / 직접 체크 → [평가하기](평가했으면 내 점수), 계획에만 있음 → [다녀옴]
 */
export function VisitRow({ row, checking = false, onCheck, onReview }: VisitRowProps) {
  const visited = row.state !== 'planned';
  const score = row.visit?.reviewScore ?? null;

  return (
    <View style={styles.row}>
      <View
        style={[
          styles.number,
          { backgroundColor: visited ? colors.brand.primary : colors.text.muted },
        ]}
      >
        <Text style={[typography.captionBold, styles.numberText]}>{row.number}</Text>
      </View>

      <View style={styles.texts}>
        {row.time ? <Text style={[typography.captionMedium, styles.time]}>{row.time}</Text> : null}
        <Text style={[typography.bodyBold, styles.name]} numberOfLines={1}>
          {row.placeName}
        </Text>
        {row.state === 'photo' ? (
          <Tag label="사진으로 확인됨" tone="success" icon="check" />
        ) : row.state === 'manual' ? (
          <Tag label="직접 체크함" tone="success" icon="check" />
        ) : (
          <View style={styles.planned}>
            <Icon name="calendar" size={14} color={colors.text.sub} />
            <Text style={[typography.caption, styles.plannedText]}>계획에만 있어요</Text>
          </View>
        )}
      </View>

      {!visited ? (
        <PillButton
          label="다녀옴"
          icon="check"
          loading={checking}
          accessibilityLabel={`${row.placeName} 다녀옴`}
          onPress={onCheck}
        />
      ) : score !== null ? (
        <PillButton
          label={String(score)}
          icon="star"
          tone="brand"
          accessibilityLabel={`${row.placeName} 내 평가 ${score}점`}
          onPress={onReview}
        />
      ) : (
        <PillButton
          label="평가하기"
          icon="star"
          accessibilityLabel={`${row.placeName} 평가하기`}
          onPress={onReview}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[18] },
  number: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberText: { color: colors.text.inverse },
  texts: { flex: 1, gap: spacing[8] },
  time: { color: colors.text.icon },
  name: { color: colors.text.default },
  planned: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  plannedText: { color: colors.text.sub },
});
