import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { colors, radius, spacing, typography } from '@/theme';

type MyTripRowProps = {
  title: string;
  /** "11.14 – 11.15". 기간을 안 정했으면 줄에서 뺀다 */
  period: string | null;
  /** "서연, 민준". 혼자면 줄에서 뺀다 */
  companions: string;
  onPress: () => void;
};

/**
 * N4 여행 한 줄. 대표 사진 · 이름 · 기간과 동행.
 * 대표 사진·공동 피드 상태 태그("비공개"·"게시됨")·셋째 줄("친구 4명이 봐요", "지도 핀 없음")은
 * GET /me/trips에 값이 없어 아직 그리지 않는다. 사진 자리는 값 문서의 "사진이 없으면" 모양이다
 */
export function MyTripRow({ title, period, companions, onPress }: MyTripRowProps) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={[title, period, companions].filter(Boolean).join(', ')}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.photo}>
        <Icon name="trip" size={24} color={colors.brand.primary} />
      </View>
      <View style={styles.texts}>
        <Text style={[typography.bodyBold, styles.title]} numberOfLines={1}>
          {title}
        </Text>
        {period || companions ? (
          <View style={styles.info}>
            {period ? (
              <View style={styles.infoItem}>
                <Icon name="calendar" size={16} color={colors.text.icon} />
                <Text style={[typography.caption, styles.sub]}>{period}</Text>
              </View>
            ) : null}
            {companions ? (
              <View style={[styles.infoItem, styles.shrink]}>
                <Icon name="people" size={16} color={colors.text.icon} />
                <Text style={[typography.caption, styles.sub, styles.shrink]} numberOfLines={1}>
                  {companions}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 72, gap: spacing[18] },
  pressed: { opacity: 0.7 },
  // 피그마 둥글기 14는 토큰에 없어 radius.md(12)
  photo: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.brand.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: { flex: 1, gap: spacing[8] },
  title: { color: colors.text.default },
  info: { flexDirection: 'row', alignItems: 'center', gap: spacing[12] },
  infoItem: { flexDirection: 'row', alignItems: 'center', gap: spacing[6] },
  shrink: { flexShrink: 1 },
  sub: { color: colors.text.icon },
});
