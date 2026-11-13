import BottomSheet, {
  BottomSheetScrollView,
  useBottomSheetTimingConfigs,
} from '@gorhom/bottom-sheet';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Spinner } from '@/components/ui/spinner';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import { Icon } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { EasyPager } from '@/components/ui/easy-pager';
import { assetSource } from '@/lib/asset-image';
import { colors, layout, motion, radius, spacing, typography } from '@/theme';

import { recommendMetaLabel } from '../home-rules';
import type { HomeRecommendation } from '../types';

/** 접힌 시트 높이. 제목 + 카드 한 장 + 쪽 점 */
export const SHEET_COLLAPSED = 192;

type Props = {
  items: readonly HomeRecommendation[];
  status: 'loading' | 'error' | 'ready';
  /** 처음 펼친 채로 보여 줄지 (미리보기 '추천 시트 펼침') */
  initialExpanded?: boolean;
  onPress: (item: HomeRecommendation) => void;
  /** 접힌 창에서 지금 보고 있는 카드. 지도에 그 지역을 표시하는 데 쓴다. 창을 펼치면 null */
  onFocus?: (item: HomeRecommendation | null) => void;
};

/** S05 아래 시트 "좋아요한 여행과 비슷해요". 접으면 가로 카드, 펼치면 세로 목록 */
export function RecommendSheet({
  items,
  status,
  initialExpanded = false,
  onPress,
  onFocus,
}: Props) {
  const { width } = useWindowDimensions();
  // 카드 한 장이 화면 한 쪽이다. 옆으로 밀면 한 장씩 넘어간다
  const page = width;
  const [current, setCurrent] = useState(0);
  const shown = Math.min(current, Math.max(items.length - 1, 0));
  const focused = items[shown];
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

  // 접힌 창에서 보고 있는 카드를 알린다. 펼치면 여러 줄이 한꺼번에 보이므로 표시를 거둔다
  useEffect(() => {
    onFocus?.(expanded || status !== 'ready' ? null : (focused ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, status, focused?.id]);

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
        {/* 피드 좋아요와 같은 코랄 레드. 이 섹션 하트에만 쓴다 */}
        <Icon name="heart" size={20} color={colors.brand.accent} />
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
              {items.map((item, order) => (
                <PressableScale
                  appear={order}
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
            {/* 조금만 밀어도 한 장씩, 늘 같은 빠르기로 넘어간다(easy-pager) */}
            <EasyPager step={page} count={items.length} onPage={setCurrent}>
              {items.map((item, order) => (
                <View key={item.id} style={[styles.page, { width: page }]}>
                  <PressableScale
                    appear={order === 0 ? 0 : undefined}
                    appearFrom="pop"
                    onPress={() => onPress(item)}
                    style={styles.card}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.title}, ${order + 1} / ${items.length}`}
                  >
                    <Thumb item={item} size={56} />
                    <View style={styles.rowText}>
                      <Text style={styles.name} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Meta item={item} />
                    </View>
                    <Icon name="chevron-right" size={20} color={colors.text.muted} />
                  </PressableScale>
                </View>
              ))}
            </EasyPager>
            {/* 몇 번째 카드인지. 지금 카드의 점만 길고 파랗다 */}
            {items.length > 1 ? (
              <View style={styles.dots} pointerEvents="none">
                {items.map((item, order) => (
                  <View key={item.id} style={[styles.dot, order === shown && styles.dotOn]} />
                ))}
              </View>
            ) : null}
          </Animated.View>
        </View>
      )}
    </BottomSheet>
  );
}

/**
 * 추천 항목 사진. 사진이 보이면 사진 + 모서리 종류 배지(여행가방·위치 핀).
 * 사진이 없거나, 불러오는 중이거나, 못 불러왔으면 연한 블루그레이 타일 가운데에 종류 아이콘 하나만 둔다(배지는 숨김)
 */
function Thumb({ item, size }: { item: HomeRecommendation; size: number }) {
  // 같은 지역 여행 시트와 같은 방식. 서버 사진 경로에 주소와 로그인 토큰을 붙이고, 테스트 모드에서는 샘플 사진으로 그린다
  const src = assetSource(item.imageUrl);
  const uri = src?.uri ?? null;
  // 어느 주소가 그려졌는지·실패했는지로 기억한다. 주소가 바뀌면 저절로 다시 불러오는 중이 된다
  const [loadedUri, setLoadedUri] = useState<string | null>(null);
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const showImage = src !== null && uri !== failedUri;
  const loaded = showImage && uri === loadedUri;
  const icon = item.kind === 'trip' ? 'trip' : 'map-pin';

  return (
    <View style={[styles.tile, { width: size, height: size }]}>
      {loaded ? null : <Icon name={icon} size={22} color={colors.text.icon} />}
      {showImage ? (
        <Image
          source={src}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          onLoad={() => setLoadedUri(uri)}
          onError={() => setFailedUri(uri)}
        />
      ) : null}
      {loaded ? (
        <View style={styles.badge}>
          <Icon name={icon} size={14} color={colors.text.default} />
        </View>
      ) : null}
    </View>
  );
}

/** 설명 한 줄(아이콘 없이 글자만) */
function Meta({ item }: { item: HomeRecommendation }) {
  return (
    <Text style={styles.metaText} numberOfLines={1}>
      {recommendMetaLabel(item)}
    </Text>
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
  // 한 쪽에 카드 한 장. 카드는 화면 여백만 남기고 가로를 채운다
  page: { paddingHorizontal: layout.screenPaddingX },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing[6],
    paddingTop: spacing[10],
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.gray[300] },
  dotOn: { width: 18, backgroundColor: colors.brand.primary },
  card: {
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
  metaText: { ...typography.caption, color: colors.text.icon },
  // 사진 자리. 사진이 없으면 이 타일과 아이콘만 보인다. 접힌 카드 배경(surface.default)과 구분되는 블루그레이
  tile: {
    flexShrink: 0,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.map.seaEdge,
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
