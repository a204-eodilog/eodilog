import BottomSheet, {
  BottomSheetScrollView,
  useBottomSheetTimingConfigs,
} from '@gorhom/bottom-sheet';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Spinner } from '@/components/ui/spinner';
// 시트 안 가로 목록은 제스처 핸들러 스크롤이어야 시트 끌기와 손가락을 나눠 가진다(안드로이드)
import { ScrollView } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import { Icon } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { assetSource } from '@/lib/asset-image';
import { colors, layout, motion, radius, spacing, typography } from '@/theme';

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

/** S05 아래 시트 "좋아요한 여행과 비슷해요". 접으면 가로 카드, 펼치면 세로 목록 */
export function RecommendSheet({ items, status, initialExpanded = false, onPress }: Props) {
  const snapPoints = useMemo(() => [SHEET_COLLAPSED, '80%'], []);
  // 어느 쪽을 누를 수 있는지. 올라가기 시작할 때 바로 바꾼다(다 올라온 뒤에 바꾸면 그동안 목록을 못 누른다)
  const [expanded, setExpanded] = useState(initialExpanded);
  // 시트가 튕기지 않고 기준 속도(느림)로 올라오게 한다
  const animationConfigs = useBottomSheetTimingConfigs({
    duration: motion.duration.slow,
    easing: Easing.out(Easing.cubic),
  });
  /**
   * 시트 위치(0 접힘 ~ 1 펼침). 세로 목록을 처음부터 그려 두고 이 값에 맞춰 가로 카드와 바꿔 보인다.
   * 전에는 시트가 다 올라왔다는 신호를 받은 뒤에야 목록을 그리기 시작해, 올라오는 동안 시트가 비어 보였다
   */
  const position = useSharedValue(initialExpanded ? 1 : 0);
  const cardsStyle = useAnimatedStyle(() => ({
    opacity: interpolate(position.value, [0, 0.35], [1, 0], Extrapolation.CLAMP),
  }));
  const listStyle = useAnimatedStyle(() => ({
    opacity: interpolate(position.value, [0.1, 0.6], [0, 1], Extrapolation.CLAMP),
  }));

  return (
    <BottomSheet
      index={initialExpanded ? 1 : 0}
      snapPoints={snapPoints}
      enableDynamicSizing={false}
      animationConfigs={animationConfigs}
      animatedIndex={position}
      onAnimate={(_from, to) => setExpanded(to > 0)}
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
        <Spinner color={colors.brand.primary} style={styles.loading} />
      ) : status === 'error' && items.length === 0 ? (
        <Text style={styles.empty}>추천을 불러오지 못했어요</Text>
      ) : items.length === 0 ? (
        <Text style={styles.empty}>여행에 좋아요를 누르면 비슷한 곳을 추천해 드려요</Text>
      ) : (
        <View style={styles.body}>
          <Animated.View
            style={[styles.fill, listStyle]}
            pointerEvents={expanded ? 'auto' : 'none'}
            accessibilityElementsHidden={!expanded}
            importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'}
          >
            <BottomSheetScrollView
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
            >
              {items.map((item) => (
                <PressableScale
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
                </PressableScale>
              ))}
            </BottomSheetScrollView>
          </Animated.View>
          <Animated.View
            style={[styles.cardsLayer, cardsStyle]}
            pointerEvents={expanded ? 'none' : 'auto'}
            accessibilityElementsHidden={expanded}
            importantForAccessibility={expanded ? 'no-hide-descendants' : 'auto'}
          >
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.cardsScroll}
              contentContainerStyle={styles.cards}
            >
              {items.map((item) => (
                <PressableScale
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
                </PressableScale>
              ))}
            </ScrollView>
          </Animated.View>
        </View>
      )}
    </BottomSheet>
  );
}

function Thumb({ item, size }: { item: HomeRecommendation; size: number }) {
  // 같은 지역 여행 시트와 같은 방식. 서버 사진 경로에 주소와 로그인 토큰을 붙이고, 테스트 모드에서는 샘플 사진으로 그린다
  const src = assetSource(item.imageUrl);
  return (
    <View style={{ width: size, height: size }}>
      {src ? (
        <Image source={src} style={styles.thumb} contentFit="cover" />
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
  body: { flex: 1 },
  fill: { flex: 1 },
  // 가로 카드는 세로 목록 위에 겹쳐 둔다. 시트가 올라가면 흐려지며 목록이 드러난다
  cardsLayer: { position: 'absolute', top: 0, left: 0, right: 0 },
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
