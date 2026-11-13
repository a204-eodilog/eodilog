import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { colors, layout, radius, spacing, typography } from '@/theme';

import { dayDate, itemCount, placedIds, type CourseDraft } from '../course-rules';
import type { Place, SavedPlace } from '../types';

import { ItemSheet } from './item-sheet';

type Props = {
  draft: CourseDraft;
  startDate: string | null;
  /** 장소를 놓을 날. 처음에는 1일차 */
  day: number;
  onSelectDay(day: number): void;
  saved: SavedPlace[];
  /** 날짜별 지역(여러 지역일 때). 그 날 지역 장소를 칩 줄 앞에 둔다 */
  dayRegionIds?: string[];
  dayRegionNames?: string[];
  onPlace(place: Place): void;
  /** 그룹 즐겨찾기가 비었을 때 장소 검색 */
  onFind(): void;
  onBuild(): void;
  sheetIndex: number | null;
  onMore(day: number, index: number): void;
  onCloseSheet(): void;
  onReplace(): void;
  onMove(delta: -1 | 1): void;
  onRemove(): void;
  /** 날짜별 지역 줄 같은 덧붙임 */
  extra?: React.ReactNode;
};

/**
 * S23 직접 만들기(Figma 201-12753, 523-349). 날짜 칸을 눌러 고르고 아래 그룹 즐겨찾기 칩을 누르면
 * 그 날 끝에 놓인다(가정 Q-6-1: 끌어다 놓기 대신 누르기). 놓은 장소는 칩 줄에서 빠진다.
 */
export function ManualBuilder(props: Props) {
  const { draft, day } = props;
  const insets = useSafeAreaInsets();
  const placed = placedIds(draft);
  const region = props.dayRegionIds?.[day];
  const left = props.saved
    .filter((s) => !placed.has(s.place.id))
    .sort((a, b) => Number(b.place.regionId === region) - Number(a.place.regionId === region));
  const items = draft.days[day] ?? [];

  return (
    <>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[typography.caption, styles.guide]}>
          날짜를 고르고 그룹 즐겨찾기 장소를 눌러 놓아요
        </Text>
        {props.extra}
        {draft.days.map((list, d) => {
          const on = d === day;
          const date = dayDate(props.startDate, d + 1);
          const regionName = props.dayRegionNames?.[d];
          return (
            // 줄 안 더보기와 버튼이 겹치지 않게 날짜 머리와 놓는 칸만 눌러 고르게 한다
            <View key={d} style={styles.daySection}>
              <PressableScale
                style={styles.dayHead}
                onPress={() => props.onSelectDay(d)}
                accessibilityRole="button"
                accessibilityLabel={`${d + 1}일차에 놓기`}
                accessibilityState={{ selected: on }}
              >
                <Text style={[typography.bodyBold, styles.dayTitle]}>{d + 1}일차</Text>
                {[date, regionName].filter(Boolean).length > 0 ? (
                  <Text style={[typography.caption, styles.dayDate]}>
                    {[date, regionName].filter(Boolean).join(' · ')}
                  </Text>
                ) : null}
              </PressableScale>
              {list.map((it, i) => (
                <View key={it.key} style={styles.placed}>
                  <View style={styles.number}>
                    <Text style={[typography.captionBold, styles.numberText]}>{i + 1}</Text>
                  </View>
                  <Text style={[typography.bodyMedium, styles.placedName]} numberOfLines={1}>
                    {it.place.name}
                  </Text>
                  <PressableScale
                    style={styles.handle}
                    onPress={() => props.onMore(d, i)}
                    accessibilityRole="button"
                    accessibilityLabel={`${it.place.name} 고치기`}
                  >
                    <Icon name="more" size={20} color={colors.text.muted} />
                  </PressableScale>
                </View>
              ))}
              {on ? (
                <View style={[styles.drop, styles.dropOn]}>
                  <Icon name="plus" size={16} color={colors.brand.primary} />
                  <Text style={[typography.captionMedium, styles.dropOnText]}>여기에 놓아요</Text>
                </View>
              ) : list.length === 0 ? (
                <PressableScale
                  style={styles.drop}
                  onPress={() => props.onSelectDay(d)}
                  accessibilityRole="button"
                  accessibilityLabel={`${d + 1}일차 빈 칸 고르기`}
                >
                  <Icon name="list" size={16} color={colors.text.muted} />
                  <Text style={[typography.caption, styles.dropText]}>눌러서 이 날을 골라요</Text>
                </PressableScale>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
      <View style={[styles.tray, { paddingBottom: Math.max(insets.bottom, spacing[16]) }]}>
        <View style={styles.trayHead}>
          <Icon name="people" size={18} color={colors.text.icon} />
          <Text style={[typography.bodyBold, styles.trayTitle]}>그룹 즐겨찾기</Text>
          {props.saved.length > 0 ? (
            <Text style={[typography.caption, styles.left]}>{left.length}곳 남았어요</Text>
          ) : null}
        </View>
        {props.saved.length === 0 ? (
          <View style={styles.emptyTray}>
            <Text style={[typography.caption, styles.dropText]}>그룹 즐겨찾기가 비어 있어요</Text>
            <PressableScale
              accessibilityLabel="장소 찾기"
              style={styles.find}
              onPress={props.onFind}
              accessibilityRole="button"
            >
              <Icon name="search" size={16} color={colors.brand.primary} />
            </PressableScale>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            {left.map((s, order) => (
              <PressableScale
                appear={order}
                appearFrom="pop"
                key={s.place.id}
                style={styles.chip}
                onPress={() => props.onPlace(s.place)}
                accessibilityRole="button"
                accessibilityLabel={`${s.place.name}, ${day + 1}일차에 놓기`}
              >
                <View style={styles.chipDot}>
                  <Icon name="map-pin" size={14} color={colors.brand.primary} />
                </View>
                <Text style={[typography.bodyMedium, styles.chipText]} numberOfLines={1}>
                  {s.place.name}
                </Text>
              </PressableScale>
            ))}
          </ScrollView>
        )}
        <View style={styles.buildRow}>
          <PressableScale
            accessibilityLabel="코스 만들기"
            style={[styles.build, itemCount(draft) === 0 && styles.buildOff]}
            onPress={props.onBuild}
            disabled={itemCount(draft) === 0}
            accessibilityRole="button"
            accessibilityState={{ disabled: itemCount(draft) === 0 }}
          >
            <Icon name="route" size={18} color={colors.text.inverse} />
          </PressableScale>
        </View>
      </View>
      <ItemSheet
        target={
          props.sheetIndex !== null && items[props.sheetIndex]
            ? {
                name: items[props.sheetIndex].place.name,
                day,
                index: props.sheetIndex,
                count: items.length,
              }
            : null
        }
        onClose={props.onCloseSheet}
        onReplace={props.onReplace}
        onMove={props.onMove}
        onRemove={props.onRemove}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing[16],
    paddingBottom: spacing[24],
    gap: spacing[16],
  },
  guide: { color: colors.text.sub },
  daySection: { gap: spacing[8] },
  dayHead: { flexDirection: 'row', alignItems: 'baseline', gap: spacing[6], minHeight: 32 },
  dayTitle: { color: colors.text.default },
  dayDate: { color: colors.text.sub },
  placed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[12],
    minHeight: 52,
    paddingLeft: spacing[14],
    borderRadius: radius.md,
    backgroundColor: colors.surface.default,
  },
  number: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    backgroundColor: colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberText: { color: colors.text.inverse },
  placedName: { flex: 1, color: colors.text.default },
  handle: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  drop: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[4],
    minHeight: 64,
    borderRadius: radius.md,
    backgroundColor: colors.surface.default,
  },
  dropOn: {
    flexDirection: 'row',
    minHeight: 44,
    backgroundColor: colors.brand.primaryBg,
    borderWidth: 1.5,
    borderColor: colors.brand.primaryLight,
    borderStyle: 'dashed',
  },
  dropText: { color: colors.text.muted },
  dropOnText: { color: colors.brand.primary },
  tray: {
    paddingTop: spacing[14],
    paddingHorizontal: layout.screenPaddingX,
    gap: spacing[12],
    borderTopWidth: 1,
    borderTopColor: colors.line.default,
    backgroundColor: colors.surface.white,
  },
  trayHead: { flexDirection: 'row', alignItems: 'center', gap: spacing[6] },
  trayTitle: { flex: 1, color: colors.text.default },
  left: { color: colors.text.sub },
  chips: { gap: spacing[8] },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[8],
    height: 40,
    paddingLeft: spacing[6],
    paddingRight: spacing[14],
    borderRadius: radius.full,
    backgroundColor: colors.surface.default,
    maxWidth: 220,
  },
  chipDot: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: colors.surface.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: { color: colors.text.default, flexShrink: 1 },
  emptyTray: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  find: { flexDirection: 'row', alignItems: 'center', gap: spacing[4], minHeight: 44 },
  findText: { color: colors.brand.primary },
  buildRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  build: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[8],
    height: 48,
    paddingLeft: spacing[20],
    paddingRight: spacing[24],
    borderRadius: radius.full,
    backgroundColor: colors.brand.primary,
  },
  buildOff: { opacity: 0.4 },
  buildText: { color: colors.text.inverse },
});
