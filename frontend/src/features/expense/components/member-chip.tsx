import { StyleSheet, Text } from 'react-native';

import { Avatar } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { colors, radius, spacing, typography } from '@/theme';

type MemberChipProps = {
  name: string;
  me?: boolean;
  selected: boolean;
  /**
   * 여러 명 고르기(나눌 사람). 화면 읽기 기능에 체크 상자로 알린다.
   * 보이는 모양은 낸 사람 칩과 같게 색만 바꾼다(2026-11-13 사용자 결정: 체크 표시 뺌. "N명 선택"이 여러 명 고르기를 알려 준다)
   */
  multiple?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

/** S35 낸 사람·나눌 사람 칩. 얼굴(28) + 이름, 나는 이름 뒤에 " (나)" */
export function MemberChip({
  name,
  me = false,
  selected,
  multiple = false,
  disabled = false,
  onPress,
}: MemberChipProps) {
  const label = me ? `${name} (나)` : name;
  return (
    <PressableScale
      accessibilityRole={multiple ? 'checkbox' : 'radio'}
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, disabled }}
      aria-checked={selected}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected ? styles.selected : styles.idle,
        pressed && styles.pressed,
      ]}
    >
      <Avatar name={name} me={me} size="md" />
      <Text style={[typography.bodyMedium, selected ? styles.textSelected : styles.textIdle]}>
        {label}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[8],
    height: 40,
    paddingLeft: spacing[6],
    paddingRight: spacing[14],
    borderRadius: radius.full,
  },
  idle: { backgroundColor: colors.surface.default },
  selected: { backgroundColor: colors.brand.primaryLight },
  textIdle: { color: colors.text.icon },
  textSelected: { color: colors.brand.primaryDark },
  pressed: { opacity: 0.8 },
});
