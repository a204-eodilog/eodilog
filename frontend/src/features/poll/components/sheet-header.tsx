import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { colors, layout, spacing, typography } from '@/theme';

/**
 * 투표 시트 머리(Figma 385-1017·418-527). 제목 20 굵게, 지도 핀 + 보조 줄, 오른쪽 닫기 44.
 * 공통 BottomSheet 제목에는 닫기 버튼이 없어 시트 안에서 그린다
 */
export function SheetHeader({
  title,
  subtitle,
  onClose,
  closeDisabled = false,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  closeDisabled?: boolean;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.texts}>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        <View style={styles.subtitle}>
          <Icon name="map-pin" size={16} color={colors.text.icon} />
          <Text style={styles.subtitleText}>{subtitle}</Text>
        </View>
      </View>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="닫기"
        disabled={closeDisabled}
        onPress={onClose}
        style={({ pressed }) => [styles.close, pressed && styles.pressed]}
      >
        <Icon name="close" size={24} color={colors.text.default} />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  texts: { flex: 1, gap: spacing[2], paddingTop: spacing[4] },
  title: { ...typography.title2, color: colors.text.default },
  subtitle: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  subtitleText: { ...typography.caption, color: colors.text.icon },
  // 피그마: 닫기 누르는 자리 44, 아이콘 24. 오른쪽 끝을 시트 여백에 맞춘다
  close: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -spacing[10],
  },
  pressed: { opacity: 0.6 },
});
