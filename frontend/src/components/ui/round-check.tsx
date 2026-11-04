import { Pressable, StyleSheet } from 'react-native';

import { colors, layout, radius } from '@/theme';

import { Icon } from './icon';

export type RoundCheckProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** 화면 읽기 프로그램이 읽을 이름. "사진도 지우기" */
  accessibilityLabel: string;
  disabled?: boolean;
};

const DIAMETER = 24;

/**
 * 동그란 체크. 줄 오른쪽 끝에 붙여 "이것도 할지" 고른다.
 * 처음 쓰는 곳은 S50 여행 나가기의 사진·채팅 지우기다.
 */
export function RoundCheck({
  checked,
  onChange,
  accessibilityLabel,
  disabled = false,
}: RoundCheckProps) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked, disabled }}
      // 웹은 accessibilityState의 checked를 읽지 않아 같이 넘긴다
      aria-checked={checked}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      hitSlop={(layout.minTouchTarget - DIAMETER) / 2}
      style={[styles.circle, checked && styles.checked, disabled && styles.disabled]}
    >
      {checked ? <Icon name="check" size={14} color={colors.text.inverse} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  circle: {
    width: DIAMETER,
    height: DIAMETER,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.gray[300],
    backgroundColor: colors.surface.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checked: {
    borderColor: colors.brand.primary,
    backgroundColor: colors.brand.primary,
  },
  disabled: { opacity: 0.4 },
});
