import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '@/theme';

import { Button } from './button';
import { Icon, type IconName } from './icon';

export type CenterNoticeProps = {
  icon: IconName;
  /** 아이콘 동그라미 바탕. neutral 회색(surface.default) / brand 연파랑(brand.primaryBg) */
  tone?: 'neutral' | 'brand';
  /** "내 여행 목록을 불러오지 못했어요" */
  title: string;
  description?: string;
  /** 알약 주 버튼. "다시 시도" */
  actionLabel?: string;
  actionIcon?: IconName;
  onAction?: () => void;
  actionLoading?: boolean;
  /** 주 버튼 아래 글자 버튼. "돌아가기", "경비 목록 보기" */
  secondaryLabel?: string;
  onSecondary?: () => void;
};

/**
 * 가운데 안내 화면(docs/design/screens README "상태 공통 모양"). 빈 화면·오류·권한 안내에 쓴다.
 * 동그라미 64 + 아이콘 32 → 위 20 제목 title1 → 위 8 설명 → 위 24 알약 주 버튼 48 → 간격 10 글자 버튼.
 * 공통 EmptyState·ErrorState와 달리 아이콘 바탕 색과 두 번째 글자 버튼을 고를 수 있다(S36 계산 실패, N4 불러오기 실패)
 */
export function CenterNotice({
  icon,
  tone = 'neutral',
  title,
  description,
  actionLabel,
  actionIcon,
  onAction,
  actionLoading = false,
  secondaryLabel,
  onSecondary,
}: CenterNoticeProps) {
  return (
    <View style={styles.wrap}>
      <View style={[styles.iconCircle, tone === 'brand' && styles.iconCircleBrand]}>
        <Icon
          name={icon}
          size={32}
          color={tone === 'brand' ? colors.brand.primary : colors.text.icon}
        />
      </View>
      <Text style={[typography.title1, styles.title]}>{title}</Text>
      {description ? (
        <Text style={[typography.body, styles.description]}>{description}</Text>
      ) : null}
      {actionLabel ? (
        <Button
          label={actionLabel}
          onPress={onAction}
          loading={actionLoading}
          icon={actionIcon}
          style={styles.action}
        />
      ) : null}
      {secondaryLabel ? (
        <Pressable
          accessibilityRole="button"
          onPress={onSecondary}
          style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
        >
          <Text style={[typography.bodyMedium, styles.secondaryText]}>{secondaryLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // 좌우 36(문서 36~40 중 작은 값), 위 16
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    paddingTop: spacing[16],
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: colors.surface.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleBrand: { backgroundColor: colors.brand.primaryBg },
  title: { marginTop: spacing[20], textAlign: 'center', color: colors.text.default },
  description: { marginTop: spacing[8], textAlign: 'center', color: colors.text.icon },
  action: { alignSelf: 'center', marginTop: spacing[24] },
  secondary: {
    marginTop: spacing[10],
    paddingHorizontal: spacing[16],
    paddingVertical: spacing[12],
  },
  secondaryText: { color: colors.text.icon },
  pressed: { opacity: 0.6 },
});
