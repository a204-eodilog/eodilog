import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import { colors, radius, spacing, typography } from '@/theme';

const CHIP_HEIGHT = 40;

/**
 * 내가 고른 취향. 체크되면 연파랑 + 오른쪽 체크(Figma S03 "내 취향" 바다·맛집·카페),
 * 누르면 체크만 풀려 회색으로 남고 다시 누르면 돌아온다. 저장은 체크된 것만 한다.
 * 체크가 풀린 모양은 피그마에 없어 추천 직전 화면의 회색 칩과 같게 했다.
 */
export function ChosenChip({
  label,
  selected,
  onToggle,
}: {
  label: string;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      aria-checked={selected}
      onPress={onToggle}
      style={({ pressed }) => [
        styles.chip,
        selected ? styles.chosen : styles.idle,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[typography.bodyMedium, selected ? styles.chosenText : styles.idleText]}>
        {label}
      </Text>
      {selected ? <Icon name="check" size={16} color={colors.brand.primaryDark} /> : null}
    </Pressable>
  );
}

/**
 * 저장한 장소로 찾은 취향(아주 연한 파랑 + 오른쪽 빼기). 칩 자체는 누르지 않고 X만 누른다.
 * Figma S03 "내 취향" 골목·국밥
 */
export function InferredChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <View style={[styles.chip, styles.inferred]}>
      <Text style={[typography.bodyMedium, styles.chosenText]}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} 빼기`}
        hitSlop={6}
        onPress={onRemove}
        style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}
      >
        <Icon name="close" size={16} color={colors.brand.primaryDark} />
      </Pressable>
    </View>
  );
}

/** 더할 수 있는 추천 취향(흰 바탕 테두리 "+ 산"). Figma S03 "이런 취향은 어때요?" */
export function SuggestChip({ label, onAdd }: { label: string; onAdd: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} 더하기`}
      onPress={onAdd}
      style={({ pressed }) => [styles.suggest, pressed && styles.pressed]}
    >
      <Text style={[typography.bodyMedium, styles.suggestText]}>+ {label}</Text>
    </Pressable>
  );
}

/**
 * 추천 직전 화면의 고르기 칩. 고르면 연파랑 + 왼쪽 체크, 아니면 회색.
 * Figma S03 추천 직전
 */
export function ToggleChip({
  label,
  selected,
  onToggle,
}: {
  label: string;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      aria-checked={selected}
      onPress={onToggle}
      style={({ pressed }) => [
        styles.chip,
        styles.toggle,
        selected ? styles.chosen : styles.idle,
        pressed && styles.pressed,
      ]}
    >
      {selected ? <Icon name="check" size={16} color={colors.brand.primaryDark} /> : null}
      <Text style={[typography.bodyMedium, selected ? styles.chosenText : styles.idleText]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: CHIP_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[6],
    paddingHorizontal: spacing[14],
    borderRadius: radius.full,
  },
  chosen: { backgroundColor: colors.brand.primaryLight },
  chosenText: { color: colors.brand.primaryDark },
  inferred: {
    backgroundColor: colors.brand.primaryBg,
    paddingLeft: spacing[12],
    paddingRight: spacing[4],
    gap: 0,
  },
  removeButton: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggest: {
    height: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing[14],
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.line.strong,
    backgroundColor: colors.surface.white,
  },
  suggestText: { color: colors.text.strong },
  toggle: { minWidth: 80, justifyContent: 'center' },
  idle: { backgroundColor: colors.surface.default },
  idleText: { color: colors.text.default },
  pressed: { opacity: 0.7 },
});
