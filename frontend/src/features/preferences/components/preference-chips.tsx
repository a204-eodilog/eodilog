import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { colors, radius, spacing, typography } from '@/theme';

const CHIP_HEIGHT = 40;

/**
 * "내 취향" 칩. 목록에서 할 일은 빼기뿐이라 오른쪽에 X만 둔다. 칩 자체는 누르지 않는다.
 * chosen: 내가 고른 취향(연파랑, Figma S03 바다·맛집·카페)
 * inferred: 저장한 장소로 찾은 취향(아주 연한 파랑, 골목·국밥)
 */
function MyPreferenceChip({
  label,
  tone,
  onRemove,
}: {
  label: string;
  tone: 'chosen' | 'inferred';
  onRemove: () => void;
}) {
  return (
    <View
      style={[styles.chip, styles.removable, tone === 'chosen' ? styles.chosen : styles.inferred]}
    >
      <Text style={[typography.bodyMedium, styles.chosenText]}>{label}</Text>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`${label} 빼기`}
        hitSlop={6}
        onPress={onRemove}
        style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}
      >
        <Icon name="close" size={16} color={colors.brand.primaryDark} />
      </PressableScale>
    </View>
  );
}

/** 내가 고른 취향. X를 누르면 뺀다 */
export function ChosenChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return <MyPreferenceChip label={label} tone="chosen" onRemove={onRemove} />;
}

/** 저장한 장소로 찾은 취향. X를 누르면 서버에서도 뺀다 */
export function InferredChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return <MyPreferenceChip label={label} tone="inferred" onRemove={onRemove} />;
}

/** 더할 수 있는 추천 취향(흰 바탕 테두리 "+ 산"). Figma S03 "이런 취향은 어때요?" */
export function SuggestChip({ label, onAdd }: { label: string; onAdd: () => void }) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${label} 더하기`}
      onPress={onAdd}
      style={({ pressed }) => [styles.suggest, pressed && styles.pressed]}
    >
      <Text style={[typography.bodyMedium, styles.suggestText]}>+ {label}</Text>
    </PressableScale>
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
    <PressableScale
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
    </PressableScale>
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
  // X 버튼이 오른쪽 여백을 차지해서 왼쪽 12, 오른쪽 4(Figma 골목·국밥 칩)
  removable: { paddingLeft: spacing[12], paddingRight: spacing[4], gap: 0 },
  inferred: { backgroundColor: colors.brand.primaryBg },
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
