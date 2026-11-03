import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';

import { colors, radius, size, spacing, typography } from '@/theme';

type Variant = 'primary' | 'secondary' | 'neutral' | 'danger' | 'text';
type Size = 'sm' | 'md' | 'lg' | 'xl';

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  /** primary 파랑 / secondary 연파랑 / neutral 회색 / danger 빨강 / text 바탕 없음 */
  variant?: Variant;
  /** sm 36 / md 40 / lg 48 / xl 56(화면 아래 큰 버튼) */
  size?: Size;
  disabled?: boolean;
  /** 서버 응답을 기다리는 동안. 누를 수 없고 돌아가는 표시가 뜬다 */
  loading?: boolean;
  /** 가로로 꽉 채우기 */
  block?: boolean;
  /** 글자 왼쪽 아이콘 */
  leading?: ReactNode;
  style?: ViewStyle;
};

const BG: Record<Variant, string> = {
  primary: colors.brand.primary,
  secondary: colors.brand.primaryBg,
  neutral: colors.surface.default,
  danger: colors.status.dangerMid,
  text: 'transparent',
};

const FG: Record<Variant, string> = {
  primary: colors.text.inverse,
  secondary: colors.brand.primary,
  neutral: colors.text.icon,
  danger: colors.text.inverse,
  text: colors.brand.primary,
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size: sz = 'lg',
  disabled = false,
  loading = false,
  block = false,
  leading,
  style,
}: ButtonProps) {
  const inactive = disabled || loading;
  const fg = FG[variant];
  const labelStyle = sz === 'sm' ? typography.label : typography.bodyBold;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { height: size.button[sz], backgroundColor: BG[variant] },
        sz === 'sm' && styles.sm,
        block && styles.block,
        pressed && styles.pressed,
        inactive && styles.inactive,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {leading}
          <Text style={[labelStyle, { color: fg }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[6],
    paddingHorizontal: spacing[20],
    borderRadius: radius.full,
    alignSelf: 'flex-start',
  },
  sm: { paddingHorizontal: spacing[14] },
  block: { alignSelf: 'stretch' },
  pressed: { opacity: 0.8 },
  inactive: { opacity: 0.4 },
});
