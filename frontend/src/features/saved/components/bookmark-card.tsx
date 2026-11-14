import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { Icon, Tag } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { placeKindLook } from '@/features/place/place-kind';
import { assetSource } from '@/lib/asset-image';
import { colors, radius, spacing, typography } from '@/theme';

import type { SavedItem } from '../saved-rules';

type BookmarkCardProps = {
  item: SavedItem;
  onPress: () => void;
};

/**
 * S10 목록 보기의 장소 한 줄. 왼쪽 종류 아이콘 칸, 가운데 종류 이름·장소 이름·지역·메모, 오른쪽 >.
 *
 * 전에는 사진이 큰 엇갈린 2열 카드였다. 서버의 즐겨찾기 응답에 사진이 없어 진짜 서버에서는 빈 연파랑 상자만
 * 크게 늘어서 이상했다(2026-11-14 사용자 지적). 사진 없이도 읽히게 글 중심의 한 줄 카드로 바꿨다.
 * 사진이 오면 아이콘 칸에 사진을 덮어 보인다
 */
export function BookmarkCard({ item, onPress }: BookmarkCardProps) {
  const src = assetSource(item.imageUrl);
  // 어떤 곳인지 알리는 아이콘과 이름(음식점·카페·숙소…). 서버가 분류를 주지 않아 장소 이름으로 짐작한다
  const kind = placeKindLook(item.name, item.category);
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={[item.name, kind.label, item.area, item.source, item.memo]
        .filter(Boolean)
        .join(', ')}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={[styles.tile, { backgroundColor: kind.bg }]}>
        <Icon name={kind.icon} size={26} color={kind.color} />
        {src ? <Image source={src} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
      </View>
      <View style={styles.texts}>
        <View style={styles.top}>
          <Text style={[typography.captionMedium, { color: kind.color }]}>{kind.label}</Text>
          {item.source ? <Tag label={item.source} tone="neutral" small /> : null}
        </View>
        <Text style={[typography.bodyBold, styles.name]} numberOfLines={1}>
          {item.name}
        </Text>
        {item.area ? (
          <View style={styles.line}>
            <Icon name="map-pin" size={14} color={colors.text.icon} />
            <Text style={[typography.caption, styles.sub]} numberOfLines={1}>
              {item.area}
            </Text>
          </View>
        ) : null}
        {item.memo ? (
          <View style={styles.line}>
            <Icon name="pencil" size={14} color={colors.text.icon} />
            <Text style={[typography.caption, styles.sub]} numberOfLines={1}>
              {item.memo}
            </Text>
          </View>
        ) : null}
      </View>
      <Icon name="chevron-right" size={18} color={colors.text.muted} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[14],
    padding: spacing[14],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line.default,
    backgroundColor: colors.surface.white,
  },
  pressed: { opacity: 0.8 },
  tile: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    // 사진이 둥근 모서리 밖으로 나가지 않게
    overflow: 'hidden',
  },
  texts: { flex: 1, minWidth: 0, gap: spacing[2] },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing[8] },
  name: { color: colors.text.default },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  sub: { flex: 1, color: colors.text.icon },
});
