import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { colors, radius, spacing, typography } from '@/theme';

import type { SavedItem } from '../saved-rules';

/** 지도 아래 가로 카드 폭. 넘길 때 몇 번째 카드인지 계산하는 데도 쓴다 */
export const MAP_CARD_WIDTH = 248;

type MapPlaceCardProps = {
  item: SavedItem;
  highlighted?: boolean;
  onPress: () => void;
};

/**
 * S10 지도 보기 아래 가로 카드(248x84). 사진 56 · 이름 + [핀 + 지역] [출처].
 * 사진이 없어 값 문서의 "없으면 colors.line.default" 모양으로 둔다
 */
export function MapPlaceCard({ item, highlighted = false, onPress }: MapPlaceCardProps) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={[item.name, item.area, item.source].filter(Boolean).join(', ')}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        highlighted && styles.highlighted,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.photo} />
      <View style={styles.texts}>
        <Text style={[typography.bodyBold, styles.name]} numberOfLines={1}>
          {item.name}
        </Text>
        <View style={styles.meta}>
          {item.area ? (
            <View style={styles.metaItem}>
              <Icon name="map-pin" size={16} color={colors.text.icon} />
              <Text style={[typography.caption, styles.area]} numberOfLines={1}>
                {item.area.split(' ').slice(-1)[0]}
              </Text>
            </View>
          ) : null}
          {item.source ? (
            <View style={styles.metaItem}>
              <Icon name="link" size={16} color={colors.text.sub} />
              <Text style={[typography.caption, styles.source]} numberOfLines={1}>
                {item.source}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    width: MAP_CARD_WIDTH,
    height: 84,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[18],
    padding: spacing[14],
    borderRadius: radius.lg,
    backgroundColor: colors.surface.white,
    borderWidth: 1,
    borderColor: colors.surface.white,
  },
  highlighted: { borderColor: colors.brand.primary },
  pressed: { opacity: 0.85 },
  photo: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.line.default,
  },
  texts: { flex: 1, gap: spacing[8] },
  name: { color: colors.text.default },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing[14] },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: spacing[4], flexShrink: 1 },
  area: { color: colors.text.icon, flexShrink: 1 },
  source: { color: colors.text.sub, flexShrink: 1 },
});
