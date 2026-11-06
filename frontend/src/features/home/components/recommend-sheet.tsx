import BottomSheet, {
  BottomSheetScrollView,
  useBottomSheetTimingConfigs,
} from '@gorhom/bottom-sheet';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
// 시트 안 가로 목록은 제스처 핸들러 스크롤이어야 시트 끌기와 손가락을 나눠 가진다(안드로이드)
import { ScrollView } from 'react-native-gesture-handler';
import Animated, { Easing, FadeInDown } from 'react-native-reanimated';

import { Icon } from '@/components/ui';
import { colors, layout, radius, spacing, typography } from '@/theme';

import type { HomeRecommendation } from '../types';

/** 접힌 시트 높이. 제목 + 가로 카드 한 줄 */
export const SHEET_COLLAPSED = 176;

type Props = {
  items: readonly HomeRecommendation[];
  status: 'loading' | 'error' | 'ready';
  /** 처음 펼친 채로 보여 줄지 (미리보기 '추천 시트 펼침') */
  initialExpanded?: boolean;
  onPress: (item: HomeRecommendation) => void;
};

/**
 * 시트 펼침 모션. 시트가 0.32초 동안 올라오는 사이 목록이 위에서부터 한 줄씩(0.05초 간격)
 * 아래에서 살짝 올라오며 나타난다. '동작 줄이기'가 켜져 있으면 reanimated가 바로 보여 준다
 */
const SHEET_MOTION = {
  sheetMs: 320,
  rowStartMs: 60,
  rowGapMs: 50,
  rowMs: 260,
  maxRows: 8,
} as const;

const rowEntering = (i: number) =>
  FadeInDown.duration(SHEET_MOTION.rowMs)
    .delay(SHEET_MOTION.rowStartMs + Math.min(i, SHEET_MOTION.maxRows) * SHEET_MOTION.rowGapMs)
    .easing(Easing.out(Easing.cubic));

/** S05 아래 시트 "좋아요한 여행과 비슷해요". 접으면 가로 카드, 펼치면 세로 목록 */
export function RecommendSheet({ items, status, initialExpanded = false, onPress }: Props) {
  const snapPoints = useMemo(() => [SHEET_COLLAPSED, '80%'], []);
  const [expanded, setExpanded] = useState(initialExpanded);
  // 시트가 튕기지 않고 목록 모션과 같은 속도로 올라오게 한다
  const animationConfigs = useBottomSheetTimingConfigs({
    duration: SHEET_MOTION.sheetMs,
    easing: Easing.out(Easing.cubic),
  });

  return (
    <BottomSheet
      index={initialExpanded ? 1 : 0}
      snapPoints={snapPoints}
      enableDynamicSizing={false}
      animationConfigs={animationConfigs}
      onChange={(i) => setExpanded(i > 0)}
      // 시트는 위아래로 끌 때만 움직인다. 옆으로 밀면 시트 끌기를 포기해 가로 카드가 넘어간다
      activeOffsetY={[-10, 10]}
      failOffsetX={[-10, 10]}
      backgroundStyle={styles.sheet}
      handleIndicatorStyle={styles.handle}
    >
      <View style={styles.head}>
        <Icon name="heart" size={20} color={colors.brand.primary} />
        <Text style={styles.title}>좋아요한 여행과 비슷해요</Text>
      </View>
      {status === 'loading' ? (
        <ActivityIndicator color={colors.brand.primary} style={styles.loading} />
      ) : status === 'error' && items.length === 0 ? (
        <Text style={styles.empty}>추천을 불러오지 못했어요</Text>
      ) : items.length === 0 ? (
        <Text style={styles.empty}>여행에 좋아요를 누르면 비슷한 곳을 추천해 드려요</Text>
      ) : expanded ? (
        <BottomSheetScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        >
          {items.map((item, i) => (
            <Animated.View key={item.id} entering={initialExpanded ? undefined : rowEntering(i)}>
              <Pressable
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
            </Animated.View>
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
  loading: { marginTop: spacing[16] },
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
