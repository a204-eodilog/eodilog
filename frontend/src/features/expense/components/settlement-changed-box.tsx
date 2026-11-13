import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { colors, radius, spacing, typography } from '@/theme';

/**
 * S35 정산 후 지출 변경 안내. README 상태 공통 모양의 진행 상자(연파랑) 변형:
 * 설명 줄 없이 제목만, 오른쪽 아래 [이전 정산 보기] 글자 링크.
 */
export function SettlementChangedBox({ onPrevious }: { onPrevious: () => void }) {
  return (
    <View style={styles.box}>
      <View style={styles.row}>
        <View style={styles.iconCircle}>
          <Icon name="refresh" size={22} color={colors.brand.primary} />
        </View>
        <Text style={[typography.bodyBold, styles.title]}>정산한 뒤에 지출이 바뀌었어요</Text>
      </View>
      <PressableScale
        accessibilityRole="link"
        onPress={onPrevious}
        hitSlop={8}
        style={({ pressed }) => [styles.link, pressed && styles.pressed]}
      >
        <Text style={[typography.captionMedium, styles.linkText]}>이전 정산 보기</Text>
        <Icon name="chevron-right" size={14} color={colors.brand.primaryDark} />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.brand.primaryBg,
    borderRadius: radius.xl,
    padding: spacing[20],
    gap: spacing[12],
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[14] },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.surface.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1, color: colors.text.default },
  link: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', gap: spacing[2] },
  linkText: { color: colors.brand.primaryDark },
  pressed: { opacity: 0.6 },
});
