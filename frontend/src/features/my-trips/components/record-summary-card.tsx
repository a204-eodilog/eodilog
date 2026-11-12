import { StyleSheet, Text, View } from 'react-native';

import { Card, Icon, type IconName } from '@/components/ui';
import { colors, spacing, typography } from '@/theme';

type RecordSummaryCardProps = {
  icon: IconName;
  /** "코스" / "평가" / "경비" */
  label: string;
  /** "4곳 다녀옴" */
  value: string;
  /** "계획 5곳" */
  sub: string;
  onPress: () => void;
};

/** S38 요약 카드 하나. 흰 바탕 테두리, 둥글기 16, 안쪽 16/18, 세로 6. 세 장이 가로로 나눠 선다 */
export function RecordSummaryCard({ icon, label, value, sub, onPress }: RecordSummaryCardProps) {
  return (
    <Card onPress={onPress} accessibilityLabel={`${label}, ${value}, ${sub}`} style={styles.card}>
      <View style={styles.head}>
        <Icon name={icon} size={18} color={colors.text.icon} />
        <Text style={[typography.captionMedium, styles.label]}>{label}</Text>
      </View>
      <Text
        style={[typography.bodyBold, styles.value]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.85}
      >
        {value}
      </Text>
      <Text style={[typography.caption, styles.sub]} numberOfLines={2}>
        {sub}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  // 값 문서는 안쪽 좌우 16. 375 폭 기기에서 카드가 106이 되어 "4곳 다녀옴"이 두 줄로 꺾여 12로 줄인다
  card: {
    flex: 1,
    minHeight: 136,
    paddingVertical: spacing[18],
    paddingHorizontal: spacing[12],
    gap: spacing[6],
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  label: { color: colors.text.icon },
  value: { color: colors.text.default },
  sub: { color: colors.text.sub },
});
