import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { Spinner } from '@/components/ui/spinner';
// 시트 안 가로 목록은 제스처 핸들러 스크롤이어야 시트 끌기와 손가락을 나눠 가진다(안드로이드)
import { ScrollView } from 'react-native-gesture-handler';

import { Icon } from '@/components/ui';
import { assetSource } from '@/lib/asset-image';
import { colors, layout, radius, spacing, typography } from '@/theme';

import type { RegionTripCard, RegionTrips } from '../types';

export type RegionTripsSheetProps = {
  /** 누른 핀의 지역들. 하나면 필터 칩 없이 그 지역만 */
  groups: readonly RegionTrips[];
  onClose: () => void;
  onTrip: (card: RegionTripCard) => void;
  onRetry: () => void;
};

/**
 * S06 같은 지역 여행 목록(WD-FR-24). 화면이 아니라 홈 지도 위 시트다.
 * 지역 핀이나 확대한 묶음 핀을 누르면 추천 시트 대신 열리고, 닫으면 추천 시트로 돌아간다.
 * 위로 끌면 82%, 아래로 끌거나 X·뒤로 가기로 닫는다
 */
export function RegionTripsSheet({ groups, onClose, onTrip, onRetry }: RegionTripsSheetProps) {
  const snapPoints = useMemo(() => ['60%', '82%'], []);
  const [selected, setSelected] = useState<string | null>(null);
  // 홈이 보일 때만 뒤로 가기를 가로챈다. S07로 넘어간 뒤에도 남아 있으면 S07 대신 시트가 닫힌다(!144 리뷰)
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        onClose();
        return true;
      });
      return () => sub.remove();
    }, [onClose]),
  );

  const shown = selected ? groups.filter((g) => g.mark.regionCode === selected) : groups;
  // 여러 지역에 걸친 여행은 지역마다 오므로 한 번만 둔다(!144 리뷰)
  const seen = new Set<string>();
  const cards = shown
    .flatMap((g) => g.cards.map((c) => ({ card: c, region: g.mark.name })))
    .filter(({ card }) => !seen.has(card.feedId) && Boolean(seen.add(card.feedId)));
  const loading = shown.some((g) => g.state === 'loading');
  // 한 지역이라도 실패하면 다시 시도를 보이고, 여행 없음은 모두 받았을 때만(!144 리뷰)
  const failed = shown.some((g) => g.state === 'error');
  const many = groups.length > 1;

  return (
    <BottomSheet
      index={0}
      // 하단 탭이 안전 영역을 처리하므로 시트 아래에 다시 여백을 넣지 않는다.
      snapPoints={snapPoints}
      enableDynamicSizing={false}
      enablePanDownToClose
      onClose={onClose}
      activeOffsetY={[-10, 10]}
      failOffsetX={[-10, 10]}
      backgroundStyle={styles.sheet}
    >
      <View style={styles.heading}>
        <View style={styles.flex}>
          <Text style={styles.title}>
            {many ? '이 근처 친구들의 여행' : `${groups[0]?.mark.name ?? ''} 친구 여행`}
          </Text>
          {many ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {groups.map((g) => g.mark.name).join(' · ')}
            </Text>
          ) : null}
        </View>
        <Pressable
          onPress={onClose}
          style={styles.close}
          accessibilityRole="button"
          accessibilityLabel="지역 여행 닫기"
        >
          <Icon name="close" size={22} color={colors.text.default} />
        </Pressable>
      </View>

      {many ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filters}
          contentContainerStyle={styles.chips}
        >
          {[null, ...groups.map((g) => g.mark)].map((mark) => {
            const code = mark?.regionCode ?? null;
            const on = selected === code;
            return (
              <Pressable
                key={code ?? 'all'}
                onPress={() => setSelected(code)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>
                  {mark?.name ?? '전체'}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      <BottomSheetScrollView
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      >
        {cards.map(({ card, region }) => (
          <TripCard
            key={card.feedId}
            card={card}
            region={many ? region : null}
            onPress={() => onTrip(card)}
          />
        ))}
        {loading ? <Spinner color={colors.brand.primary} style={styles.loading} /> : null}
        {!loading && failed ? (
          <View style={styles.note}>
            <Text style={styles.noteTitle}>
              {many
                ? '여행을 불러오지 못했어요'
                : `${groups[0]?.mark.name ?? ''} 여행을 불러오지 못했어요`}
            </Text>
            <Text style={styles.noteText}>지도는 그대로 볼 수 있어요</Text>
            <Pressable onPress={onRetry} accessibilityRole="button" style={styles.retry}>
              <Text style={styles.retryText}>다시 시도</Text>
            </Pressable>
          </View>
        ) : null}
        {!loading && !failed && cards.length === 0 ? (
          <View style={styles.note}>
            <Text style={styles.noteText}>볼 수 있는 여행이 없어요</Text>
          </View>
        ) : null}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

function TripCard({
  card,
  region,
  onPress,
}: {
  card: RegionTripCard;
  region: string | null;
  onPress: () => void;
}) {
  const src = assetSource(card.coverUrl);
  const meta = [region, card.period, card.nights].filter(Boolean).join(' · ');
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${card.title}${meta ? `, ${meta}` : ''}`}
      onPress={onPress}
    >
      <View style={styles.photo}>
        <Icon name="image" size={28} color={colors.brand.primary} />
        {src ? <Image source={src} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {card.title}
          </Text>
          <Icon name="chevron-right" size={18} color={colors.text.icon} />
        </View>
        {meta ? <Text style={styles.meta}>{meta}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: { backgroundColor: colors.surface.white, borderRadius: radius.xxl },
  flex: { flex: 1, gap: spacing[6] },
  pressed: { opacity: 0.7 },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.screenPaddingX,
    paddingBottom: spacing[16],
  },
  title: { ...typography.title3, color: colors.text.default },
  subtitle: { ...typography.caption, color: colors.text.icon },
  close: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 목록이 길어져도 필터 높이를 줄이지 않는다(글자 아래쪽 잘림 방지)
  filters: {
    flexGrow: 0,
    flexShrink: 0,
    minHeight: layout.minTouchTarget,
    marginBottom: spacing[16],
  },
  chips: { paddingHorizontal: layout.screenPaddingX, gap: spacing[8], alignItems: 'center' },
  chip: {
    minHeight: layout.minTouchTarget,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[16],
    paddingVertical: spacing[10],
    backgroundColor: colors.surface.default,
    borderRadius: radius.full,
  },
  chipOn: { backgroundColor: colors.brand.primary },
  chipText: { ...typography.captionBold, color: colors.text.icon },
  chipTextOn: { color: colors.text.inverse },
  list: { paddingHorizontal: layout.screenPaddingX, paddingBottom: spacing[32], gap: spacing[20] },
  card: { backgroundColor: colors.surface.default, borderRadius: radius.lg, overflow: 'hidden' },
  photo: {
    width: '100%',
    height: 160,
    backgroundColor: colors.brand.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { padding: spacing[16], gap: spacing[8] },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[8],
  },
  cardTitle: { ...typography.bodyBold, color: colors.text.default, flexShrink: 1 },
  meta: { ...typography.caption, color: colors.text.icon },
  loading: { marginVertical: spacing[24] },
  note: { alignItems: 'center', gap: spacing[10], paddingVertical: spacing[24] },
  noteTitle: { ...typography.bodyBold, color: colors.text.default, textAlign: 'center' },
  noteText: { ...typography.caption, color: colors.text.sub },
  retry: {
    paddingHorizontal: spacing[16],
    height: 36,
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.surface.default,
  },
  retryText: { ...typography.captionBold, color: colors.text.default },
});
