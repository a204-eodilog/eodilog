import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, radius, size, spacing, typography } from '@/theme';

export type ChipProps = {
  label: string;
  /** 눌러서 고르는 칩이면 선택 여부 */
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  /** sm 36(필터) / md 40(취향·동행 고르기) */
  size?: 'sm' | 'md';
};

/**
 * 알약 칩. 필터([전체 5] [겹친 곳 3])와 선택(취향 키워드, 나눌 사람)에 쓴다.
 * 선택되면 연파랑 바탕에 진파랑 글자, 아니면 회색 바탕이다.
 */
export function Chip({
  label,
  selected = false,
  onPress,
  disabled = false,
  size: sz = 'sm',
}: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled || !onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { height: size.button[sz] },
        selected ? styles.selected : styles.idle,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[typography.bodyMedium, selected ? styles.textSelected : styles.textIdle]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: spacing[16],
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  idle: { backgroundColor: colors.surface.default },
  selected: { backgroundColor: colors.brand.primaryLight },
  textIdle: { color: colors.text.icon },
  textSelected: { color: colors.brand.primaryDark },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.4 },
});
