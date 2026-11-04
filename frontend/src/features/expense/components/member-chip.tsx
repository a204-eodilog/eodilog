import { Pressable, StyleSheet, Text } from 'react-native';

import { Avatar, Icon } from '@/components/ui';
import { colors, radius, spacing, typography } from '@/theme';

type MemberChipProps = {
  name: string;
  me?: boolean;
  selected: boolean;
  /** 여러 명 고르기(나눌 사람)면 고른 칩 이름 뒤에 체크를 붙인다 */
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
    <Pressable
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
      {multiple && selected ? (
        <Icon name="check" size={16} color={colors.brand.primaryDark} />
      ) : null}
    </Pressable>
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
