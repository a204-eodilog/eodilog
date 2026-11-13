import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { assetSource } from '@/lib/asset-image';
import { colors, radius, spacing, typography } from '@/theme';

import type { SavedItem } from '../saved-rules';

type BookmarkCardProps = {
  item: SavedItem;
  /** 사진 자리 높이(160~220). 엇갈린 2열을 만든다 */
  photoHeight: number;
  onPress: () => void;
};

/**
 * S10 목록 보기 카드. 사진(둥글기 16) + 왼쪽 위 출처 배지, 아래 이름과 지역.
 * 사진이 없으면 연파랑 상자에 북마크 아이콘이 보인다. 서버의 즐겨찾기 응답에는 아직 사진이 없어
 * 진짜 서버에서는 늘 이 모습이고, 테스트 모드에서는 시험 사진이 샘플 사진으로 그려진다
 */
export function BookmarkCard({ item, photoHeight, onPress }: BookmarkCardProps) {
  const src = assetSource(item.imageUrl);
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={[item.name, item.area, item.source].filter(Boolean).join(', ')}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={[styles.photo, { height: photoHeight }]}>
        <Icon name="bookmark" size={28} color={colors.brand.primary} />
        {src ? <Image source={src} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
        {item.source ? (
          <View style={styles.badge}>
            <Text style={[typography.micro, styles.badgeText]}>{item.source}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.texts}>
        <Text style={[typography.bodyBold, styles.name]} numberOfLines={2}>
          {item.name}
        </Text>
        {item.area ? (
          <Text style={[typography.caption, styles.area]} numberOfLines={1}>
            {item.area}
          </Text>
        ) : null}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing[10] },
  pressed: { opacity: 0.8 },
  photo: {
    borderRadius: radius.lg,
    backgroundColor: colors.brand.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
    // 사진이 둥근 모서리 밖으로 나가지 않게
    overflow: 'hidden',
  },
  // 값 문서 배지 둥글기 10·안쪽 3/8, 글자 11/17 보통. 토큰에 없어 둥글기 sm(8)·micro(11/16)로 맞춘다
  badge: {
    position: 'absolute',
    top: spacing[10],
    left: spacing[10],
    backgroundColor: colors.text.default,
    borderRadius: radius.sm,
    paddingVertical: 3,
    paddingHorizontal: spacing[8],
  },
  badgeText: { color: colors.text.inverse },
  texts: { gap: spacing[2] },
  name: { color: colors.text.default },
  area: { color: colors.text.sub2 },
});
