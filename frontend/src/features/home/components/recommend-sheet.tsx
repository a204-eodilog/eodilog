import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import { colors, layout, radius, spacing, typography } from '@/theme';

import type { HomeRecommendation } from '../types';

/** 접힌 시트 높이. 제목 + 가로 카드 한 줄 */
export const SHEET_COLLAPSED = 176;

type Props = {
  items: readonly HomeRecommendation[];
  /** 처음 펼친 채로 보여 줄지 (미리보기 '추천 시트 펼침') */
  initialExpanded?: boolean;
  onPress: (item: HomeRecommendation) => void;
};

/** S05 아래 시트 "좋아요한 여행과 비슷해요". 접으면 가로 카드, 펼치면 세로 목록 */
export function RecommendSheet({ items, initialExpanded = false, onPress }: Props) {
  const snapPoints = useMemo(() => [SHEET_COLLAPSED, '80%'], []);
  const [expanded, setExpanded] = useState(initialExpanded);

  return (
    <BottomSheet
      index={initialExpanded ? 1 : 0}
      snapPoints={snapPoints}
      enableDynamicSizing={false}
      onChange={(i) => setExpanded(i > 0)}
      backgroundStyle={styles.sheet}
      handleIndicatorStyle={styles.handle}
    >
      <View style={styles.head}>
        <Icon name="heart" size={20} color={colors.brand.primary} />
        <Text style={styles.title}>좋아요한 여행과 비슷해요</Text>
      </View>
      {items.length === 0 ? (
        <Text style={styles.empty}>여행에 좋아요를 누르면 비슷한 곳을 추천해 드려요</Text>
      ) : expanded ? (
        <BottomSheetScrollView contentContainerStyle={styles.list}>
          {items.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => onPress(item)}
              style={styles.row}
              accessibilityRole="button"
            >
              <Thumb item={item} size={64} />
              <View style={styles.rowText}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.title}
                </Text>
                <Meta item={item} />
              </View>
              <Icon name="chevron-right" size={20} color={colors.text.muted} />
            </Pressable>
          ))}
        </BottomSheetScrollView>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.cardsScroll}
          contentContainerStyle={styles.cards}
        >
          {items.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => onPress(item)}
              style={styles.card}
              accessibilityRole="button"
            >
              <Thumb item={item} size={56} />
              <View style={styles.rowText}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.title}
                </Text>
                <Meta item={item} />
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </BottomSheet>
  );
}

function Thumb({ item, size }: { item: HomeRecommendation; size: number }) {
  return (
    <View style={{ width: size, height: size }}>
      {item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} style={styles.thumb} contentFit="cover" />
      ) : (
        <View style={[styles.thumb, styles.thumbEmpty]}>
          <Icon name="image" size={20} color={colors.brand.primary} />
        </View>
      )}
      <View style={styles.badge}>
        <Icon
          name={item.kind === 'trip' ? 'trip' : 'map-pin'}
          size={14}
          color={colors.text.default}
        />
      </View>
    </View>
  );
}

function Meta({ item }: { item: HomeRecommendation }) {
  return (
    <View style={styles.meta}>
      <Icon name={item.kind === 'trip' ? 'people' : 'map-pin'} size={14} color={colors.text.icon} />
      <Text style={styles.metaText} numberOfLines={1}>
        {item.meta}
      </Text>
      {item.nights ? (
        <>
          <Icon name="moon" size={14} color={colors.text.icon} />
          <Text style={styles.metaText}>{item.nights}</Text>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { backgroundColor: colors.surface.white, borderRadius: radius.xxl },
  handle: { width: 36, height: 4, backgroundColor: colors.gray[300] },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[8],
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing[4],
    paddingBottom: spacing[12],
  },
  title: { ...typography.title3, color: colors.text.default },
  empty: {
    ...typography.caption,
    color: colors.text.icon,
    paddingHorizontal: layout.screenPaddingX,
  },
  cardsScroll: { flexGrow: 0 },
  cards: { paddingHorizontal: layout.screenPaddingX, gap: spacing[12], alignItems: 'flex-start' },
  card: {
    width: 260,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[14],
    padding: spacing[12],
    borderRadius: radius.lg,
    backgroundColor: colors.surface.default,
  },
  list: { paddingHorizontal: layout.screenPaddingX, paddingBottom: spacing[24], gap: spacing[20] },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[16] },
  rowText: { flex: 1, gap: spacing[6] },
  name: { ...typography.bodyBold, color: colors.text.default },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  metaText: { ...typography.caption, color: colors.text.icon, marginRight: spacing[8] },
  thumb: { width: '100%', height: '100%', borderRadius: radius.md },
  thumbEmpty: {
    backgroundColor: colors.brand.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    left: spacing[6],
    bottom: spacing[6],
    width: 24,
    height: 24,
    borderRadius: radius.full,
    backgroundColor: colors.surface.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
