import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { assetSource } from '@/lib/asset-image';
import { colors, radius, spacing, typography } from '@/theme';

import { placeKindLook } from '@/features/place/place-kind';
import type { SavedItem } from '../saved-rules';

type MapPlaceCardProps = {
  item: SavedItem;
  onPress: () => void;
};

/**
 * S10 지도 보기 아래 가로 카드(248x84). 사진 56 · 이름 + [핀 + 지역] [출처].
 * 사진이 있으면 목록 카드와 같은 사진을 보이고, 없으면 값 문서의 "없으면 colors.line.default" 모양으로 둔다.
 * 서버의 즐겨찾기 응답에는 아직 사진이 없어 진짜 서버에서는 늘 빈 칸이다
 */
export function MapPlaceCard({ item, onPress }: MapPlaceCardProps) {
  const photo = assetSource(item.imageUrl);
  const kind = placeKindLook(item.name, item.category);
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={[item.name, kind.label, item.area, item.source]
        .filter(Boolean)
        .join(', ')}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={[styles.photo, { backgroundColor: kind.bg }]}>
        <Icon name={kind.icon} size={26} color={kind.color} />
        {photo ? <Image source={photo} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
      </View>
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
    // 지도 아래 카드는 한 쪽에 한 장이라 가로를 채운다
    height: 84,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[14],
    padding: spacing[14],
    borderRadius: radius.lg,
    backgroundColor: colors.surface.white,
  },
  pressed: { opacity: 0.85 },
  photo: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    // 사진이 둥근 모서리 밖으로 나가지 않게
    overflow: 'hidden',
  },
  texts: { flex: 1, gap: spacing[8] },
  name: { color: colors.text.default },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing[14] },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: spacing[4], flexShrink: 1 },
  area: { color: colors.text.icon, flexShrink: 1 },
  source: { color: colors.text.sub, flexShrink: 1 },
});
