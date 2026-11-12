import { StyleSheet } from 'react-native';

import { Icon, type IconName } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { colors, radius } from '@/theme';

type OutlinePillButtonProps = {
  /** 화면에는 그리지 않는다. 화면 읽어 주기가 읽는 이름이다 */
  label: string;
  icon: IconName;
  /** sm 40(기록 관리, 아이콘 18) / lg 48(내 노출 설정, 아이콘 20) */
  size?: 'sm' | 'lg';
  /** 글자·아이콘 색. 기본 text.default, 기록 삭제는 status.danger */
  color?: string;
  onPress: () => void;
};

/**
 * S38 흰 바탕 테두리 동그라미 버튼. 공통 Button에 테두리 모양이 없어 여기 따로 둔다
 * (값 문서 "공통 부품과 맞지 않는 점"). 2026-11-12부터 글자 없이 아이콘만 그린다
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
      <Icon name={icon} size={lg ? 20 : 18} color={color} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.line.default,
    backgroundColor: colors.surface.white,
  },
  lg: { width: 48, height: 48 },
  pressed: { opacity: 0.7 },
});
