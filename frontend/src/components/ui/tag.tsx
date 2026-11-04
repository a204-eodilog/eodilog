import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '@/theme';

import { Icon, type IconName } from './icon';

type Tone = 'neutral' | 'line' | 'brand' | 'brandSoft' | 'success' | 'outline';

export type TagProps = {
  label: string;
  /**
   * neutral 회색(키워드, 비공개, 게시 전) / line 조금 진한 회색 바탕·진한 글자(S36 "이전 정산 · 지금과 달라요")
   * / brand 연파랑(게시됨) / brandSoft 아주 연한 파랑(계획 중)
   * / success 초록(사진으로 확인됨) / outline 흰 바탕 테두리(지도 핀 없음)
   */
  tone?: Tone;
  /** 글자 앞 작은 아이콘(14) */
  icon?: IconName;
};

const BG: Record<Tone, string> = {
  neutral: colors.surface.default,
  line: colors.line.default,
  brand: colors.brand.primaryLight,
  brandSoft: colors.brand.primaryBg,
  success: colors.status.successBg2,
  outline: colors.surface.white,
};

const FG: Record<Tone, string> = {
  neutral: colors.text.icon,
  line: colors.text.default,
  brand: colors.brand.primaryDark,
  brandSoft: colors.brand.primaryDark,
  success: colors.status.success,
  outline: colors.text.icon,
};

/**
 * 작은 상태·키워드 표시. 누를 수 없다(누르는 것은 `Chip`).
 * Figma S12·S14 키워드, S33 확인 표시, N4·S38·S41 공개 상태. 높이 24, 둥글기 8.
 */
export function Tag({ label, tone = 'neutral', icon }: TagProps) {
  return (
    <View style={[styles.tag, { backgroundColor: BG[tone] }, tone === 'outline' && styles.outline]}>
      {icon ? <Icon name={icon} size={14} color={FG[tone]} /> : null}
      <Text style={[typography.captionMedium, { color: FG[tone] }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[6],
    height: 24,
    paddingHorizontal: spacing[8],
    borderRadius: radius.sm,
  },
  outline: { borderWidth: 1, borderColor: colors.line.default },
});
