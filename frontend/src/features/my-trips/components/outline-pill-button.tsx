import { StyleSheet, Text } from 'react-native';

import { Icon, type IconName } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { colors, radius, spacing, typography } from '@/theme';

type OutlinePillButtonProps = {
  label: string;
  icon: IconName;
  /** sm 40(기록 관리, 아이콘 16 + captionMedium) / lg 48(내 노출 설정, 아이콘 20 + bodyMedium) */
  size?: 'sm' | 'lg';
  /** 글자·아이콘 색. 기본 text.default, 기록 삭제는 status.danger */
  color?: string;
  onPress: () => void;
};

/**
 * S38 흰 바탕 테두리 알약 버튼. 공통 Button에 테두리 모양이 없어 여기 따로 둔다
 * (값 문서 "공통 부품과 맞지 않는 점")
 */
export function OutlinePillButton({
  label,
  icon,
  size = 'sm',
  color = colors.text.default,
  onPress,
}: OutlinePillButtonProps) {
  const lg = size === 'lg';
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.pill, lg && styles.lg, pressed && styles.pressed]}
    >
      <Icon name={icon} size={lg ? 20 : 16} color={color} />
      <Text style={[lg ? typography.bodyMedium : typography.captionMedium, { color }]}>
        {label}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
    height: 40,
    paddingLeft: spacing[10],
    paddingRight: spacing[14],
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.line.default,
    backgroundColor: colors.surface.white,
  },
  lg: { height: 48, paddingLeft: spacing[16], paddingRight: spacing[20], gap: spacing[6] },
  pressed: { opacity: 0.7 },
});
