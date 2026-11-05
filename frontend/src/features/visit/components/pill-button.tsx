import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { Icon, type IconName } from '@/components/ui';
import { colors, radius, spacing, typography } from '@/theme';

type Tone = 'gray' | 'white' | 'brand';

type PillButtonProps = {
  label: string;
  icon: IconName;
  /** gray 장소 줄 [평가하기]·[다녀옴] / white 안내 상자 [사진 올리기] / brand 내 점수 */
  tone?: Tone;
  loading?: boolean;
  accessibilityLabel?: string;
  onPress: () => void;
};

const BG: Record<Tone, string> = {
  gray: colors.surface.default,
  white: colors.surface.white,
  brand: colors.brand.primaryBg,
};

const FG: Record<Tone, string> = {
  gray: colors.text.default,
  white: colors.text.default,
  brand: colors.brand.primaryDark,
};

/**
 * S33 오른쪽 알약 버튼. 높이 36, 좌우 12/16, 아이콘 16 + bodyMedium.
 * 공통 Button의 sm은 label 글자(13 굵게)라 값 문서와 달라 여기 따로 둔다
 */
export function PillButton({
  label,
  icon,
  tone = 'gray',
  loading = false,
  accessibilityLabel,
  onPress,
}: PillButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: loading, busy: loading }}
      disabled={loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: BG[tone] },
        tone === 'brand' && styles.brand,
        pressed && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={FG[tone]} />
      ) : (
        <Icon name={icon} size={16} color={FG[tone]} />
      )}
      <Text style={[typography.bodyMedium, { color: FG[tone] }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
    height: 36,
    paddingLeft: spacing[12],
    paddingRight: spacing[16],
    borderRadius: radius.full,
  },
  // 내 점수 알약은 좌우 12
  brand: { paddingRight: spacing[12] },
  pressed: { opacity: 0.7 },
});
