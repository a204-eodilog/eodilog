import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Icon } from '@/components/ui';
import { colors, radius, spacing, typography } from '@/theme';

type SettlementFailedViewProps = {
  /** "지출 3건은 그대로예요" */
  expenseCount: number;
  onRetry: () => void;
  retrying?: boolean;
  /** [경비 목록 보기] → S35 */
  onBack: () => void;
};

/**
 * S36 계산 실패. README 상태 공통 모양의 가운데 안내 화면(좌우 36, 위 16).
 * 공통 ErrorState는 아이콘·버튼 모양과 두 번째 글자 버튼 자리가 달라 여기서 그린다.
 */
export function SettlementFailedView({
  expenseCount,
  onRetry,
  retrying = false,
  onBack,
}: SettlementFailedViewProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.iconCircle}>
        <Icon name="calculator" size={32} color={colors.text.icon} />
      </View>
      <Text style={[typography.title1, styles.title]}>정산을 계산하지 못했어요</Text>
      <Text style={[typography.body, styles.description]}>
        지출 {expenseCount}건은 그대로예요. 다시 계산해 주세요
      </Text>
      <Button
        label="다시 계산"
        onPress={onRetry}
        loading={retrying}
        leading={<Icon name="refresh" size={20} color={colors.text.inverse} />}
        style={styles.retry}
      />
      <Pressable
        accessibilityRole="button"
        onPress={onBack}
        style={({ pressed }) => [styles.back, pressed && styles.pressed]}
      >
        <Text style={[typography.bodyMedium, styles.backText]}>경비 목록 보기</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    paddingTop: spacing[16],
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: colors.surface.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { marginTop: spacing[20], textAlign: 'center', color: colors.text.default },
  description: { marginTop: spacing[8], textAlign: 'center', color: colors.text.icon },
  retry: { alignSelf: 'center', marginTop: spacing[24] },
  back: { marginTop: spacing[10], paddingHorizontal: spacing[16], paddingVertical: spacing[12] },
  backText: { color: colors.text.icon },
  pressed: { opacity: 0.6 },
});
