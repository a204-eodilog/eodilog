import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { colors, radius, spacing, typography } from '@/theme';

import { MODE_LABEL } from '../course-rules';
import type { TransportMode } from '../types';

import { MODE_ICON } from './course-day-list';

const MODES: TransportMode[] = ['TRANSIT', 'CAR', 'WALK'];

type Props = {
  /** 고른 구간의 수단. 고른 구간이 없으면 null(칩을 누를 수 없다) */
  value: TransportMode | null;
  onChange(mode: TransportMode): void;
};

/**
 * 이동 수단 칩 셋(Figma 201-12879 일차 아래). 고른 구간 하나의 수단을 바꾼다(가정 Q-6-2).
 * 고른 수단은 진한 바탕에 흰 글자.
 */
export function TransportChips({ value, onChange }: Props) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {MODES.map((m) => {
        const on = value === m;
        return (
          <PressableScale
            key={m}
            disabled={value === null}
            onPress={() => onChange(m)}
            style={[styles.chip, on ? styles.on : styles.off, value === null && styles.disabled]}
            accessibilityRole="radio"
            accessibilityState={{ checked: on, disabled: value === null }}
          >
            <Icon
              name={MODE_ICON[m]}
              size={16}
              color={on ? colors.text.inverse : colors.text.icon}
            />
            <Text style={[typography.captionMedium, on ? styles.onText : styles.offText]}>
              {MODE_LABEL[m]}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing[8] },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[6],
    height: 36,
    paddingHorizontal: spacing[14],
    borderRadius: radius.full,
  },
  on: { backgroundColor: colors.text.default },
  off: { backgroundColor: colors.surface.default },
  disabled: { opacity: 0.5 },
  onText: { color: colors.text.inverse },
  offText: { color: colors.text.icon },
});
