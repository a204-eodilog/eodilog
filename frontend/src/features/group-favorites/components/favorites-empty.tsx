import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import { colors, radius, spacing, typography } from '@/theme';

type Props = { onAdd(): void; onRecommend(): void };

/** S20 장소 없음(Figma 201-9686). 큰 [+], 흐린 [투표 열기], [추천 받기] */
export function FavoritesEmpty({ onAdd, onRecommend }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.badge}>
        <Icon name="bookmark" size={28} color={colors.text.icon} />
      </View>
      <Text style={[typography.title2, styles.title]}>아직 모은 장소가 없어요</Text>
      <Text style={[typography.body, styles.body]}>담은 사람이 함께 보여요</Text>
      <Pressable
        style={styles.add}
        onPress={onAdd}
        accessibilityRole="button"
        accessibilityLabel="장소 추가"
      >
        <Icon name="plus" size={28} color={colors.text.inverse} />
      </Pressable>
      {/* 장소가 없으면 후보도 없어 투표는 열 수 없다 */}
      <View style={styles.poll} accessibilityRole="button" accessibilityState={{ disabled: true }}>
        <Text style={[typography.bodyBold, styles.pollText]}>투표 열기</Text>
      </View>
      <Pressable style={styles.recommend} onPress={onRecommend} accessibilityRole="button">
        <Icon name="bulb" size={18} color={colors.text.icon} />
        <Text style={[typography.bodyMedium, styles.recommendText]}>추천 받기</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 },
  badge: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: colors.surface.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: colors.text.default, marginTop: spacing[20] },
  body: { color: colors.text.icon, marginTop: spacing[6] },
  add: {
    width: 64,
    height: 64,
    marginTop: spacing[24],
    borderRadius: radius.full,
    backgroundColor: colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: `0 4px 12px ${colors.shadow}`,
  },
  poll: {
    marginTop: spacing[16],
    height: 44,
    paddingHorizontal: spacing[20],
    borderRadius: radius.full,
    backgroundColor: colors.brand.primaryBg,
    justifyContent: 'center',
  },
  pollText: { color: colors.brand.primary },
  recommend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[6],
    minHeight: 48,
    paddingHorizontal: spacing[16],
    marginTop: spacing[8],
  },
  recommendText: { color: colors.text.icon },
});
