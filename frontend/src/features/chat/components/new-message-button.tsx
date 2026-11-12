import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { colors, radius, spacing, typography } from '@/theme';

/** 이전 대화를 읽는 중에 새 메시지가 오면 아래에 뜨는 버튼(US2 시나리오 4). 누르면 맨 아래로 간다 */
export function NewMessageButton({ onPress, bottom }: { onPress: () => void; bottom: number }) {
  return (
    <View style={[styles.wrap, { bottom }]} pointerEvents="box-none">
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="새 메시지로 내려가기"
        onPress={onPress}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <Text style={[typography.captionBold, styles.text]}>새 메시지</Text>
        <View style={styles.down}>
          <Icon name="chevron-right" size={16} color={colors.text.inverse} />
        </View>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
    height: 36,
    paddingLeft: spacing[14],
    paddingRight: spacing[10],
    borderRadius: radius.full,
    backgroundColor: colors.brand.primary,
  },
  // 아래 화살표 아이콘이 없어 오른쪽 꺾쇠를 90도 돌려 쓴다
  down: { transform: [{ rotate: '90deg' }] },
  text: { color: colors.text.inverse },
  pressed: { opacity: 0.8 },
});
