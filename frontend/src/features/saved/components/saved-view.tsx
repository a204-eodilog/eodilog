import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/ui';
import { colors, layout, radius, spacing, typography } from '@/theme';

import type { SavedView as ViewMode } from '../hooks/use-bookmarks';
import { masonryColumns, type SavedItem } from '../saved-rules';

import { BookmarkCard } from './bookmark-card';
import { SavedMap } from './saved-map';

export type SavedViewProps = {
  items: SavedItem[];
  view: ViewMode;
  onView: (view: ViewMode) => void;
  /** 연결이 끊긴 채 저장된 목록을 보여 줄 때 "10:20 기준이에요". 연결돼 있으면 null */
  offlineSince: string | null;
  /** [그룹] → 여행 골라 S20(C) */
  onGroup: () => void;
  /** 장소 카드·핀 → S14 */
  onOpen: (item: SavedItem) => void;
  /** [+] → S11 */
  onAdd: () => void;
};

const FAB = 56;
const FAB_GAP = spacing[20];

/**
 * S10 개인 즐겨찾기(저장 탭 첫 화면). 상태: 목록 보기 / 지도 보기 / 저장 없음 / 연결 끊김.
 * 처음 불러오기 중·실패는 화면(SavedScreen)이 그린다
 */
export function SavedView({
  items,
  view,
  onView,
  offlineSince,
  onGroup,
  onOpen,
  onAdd,
}: SavedViewProps) {
  const insets = useSafeAreaInsets();
  const empty = items.length === 0;
  const [left, right] = masonryColumns(items);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <Text style={[typography.title1, styles.text]}>저장</Text>
        <View style={styles.toggle} accessibilityRole="tablist">
          <ToggleButton
            icon="list"
            label="목록 보기"
            selected={view === 'list'}
            onPress={() => onView('list')}
          />
          <ToggleButton
            icon="map"
            label="지도 보기"
            selected={view === 'map'}
            onPress={() => onView('map')}
          />
        </View>
      </View>

      <View style={styles.kinds}>
        <KindButton icon="person" label="개인 즐겨찾기" selected onPress={() => undefined} />
        <KindButton icon="people" label="그룹 즐겨찾기" selected={false} onPress={onGroup} />
      </View>

      {offlineSince ? (
        <View style={styles.offline} accessibilityLiveRegion="polite">
          <Icon name="wifi-off" size={20} color={colors.text.icon} />
          <View style={styles.flex}>
            <Text style={[typography.bodyBold, styles.text]}>인터넷에 연결되지 않았어요</Text>
            <Text style={[typography.caption, styles.sub]}>{offlineSince}</Text>
          </View>
        </View>
      ) : null}

      {empty ? (
        <View style={styles.empty}>
          <View style={styles.art}>
            <View style={styles.chip}>
              <Icon name="link" size={16} color={colors.brand.primary} />
              <Text style={[typography.captionMedium, styles.text]}>sns 링크</Text>
            </View>
            <Icon name="link" size={36} color={colors.brand.primary} />
            <Icon name="image" size={34} color={colors.brand.primary} />
          </View>
          <Text style={[typography.title1, styles.text, styles.center]}>
            가고 싶은 곳 링크를 붙여 넣어 보세요
          </Text>
          <Text style={[typography.body, styles.sub, styles.center, styles.emptySub]}>
            링크·캡처로 장소를 찾아요
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="링크·캡처 등록"
            onPress={onAdd}
            style={({ pressed }) => [styles.bigAdd, pressed && styles.pressed]}
          >
            <Icon name="plus" size={28} color={colors.text.inverse} />
          </Pressable>
        </View>
      ) : view === 'list' ? (
        <ScrollView contentContainerStyle={styles.list}>
          <View style={styles.listHead}>
            <Text style={[typography.captionMedium, styles.sub]}>{items.length}곳</Text>
            <Text style={[typography.caption, styles.sub2]}>최근 저장한 순</Text>
          </View>
          <View style={styles.columns}>
            {[left, right].map((column, c) => (
              <View key={c} style={styles.column}>
                {column.map(({ item, photoHeight }) => (
                  <BookmarkCard
                    key={item.key}
                    item={item}
                    photoHeight={photoHeight}
                    onPress={() => onOpen(item)}
                  />
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      ) : (
        <SavedMap items={items} onOpen={onOpen} bottomInset={FAB + FAB_GAP * 2} />
      )}

      {empty ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="링크·캡처 등록"
          onPress={onAdd}
          style={({ pressed }) => [styles.fab, pressed && styles.pressed]}
        >
          <Icon name="plus" size={28} color={colors.text.inverse} />
        </Pressable>
      )}
    </View>
  );
}

function ToggleButton({
  icon,
  label,
  selected,
  onPress,
}: {
  icon: IconName;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.toggleButton, selected && styles.toggleSelected]}
    >
      <Icon name={icon} size={20} color={selected ? colors.text.default : colors.text.icon} />
    </Pressable>
  );
}

function KindButton({
  icon,
  label,
  selected,
  onPress,
}: {
  icon: IconName;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.kind,
        { backgroundColor: selected ? colors.brand.primaryLight : colors.surface.default },
        pressed && styles.pressed,
      ]}
    >
      <Icon name={icon} size={20} color={selected ? colors.brand.primaryDark : colors.text.icon} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  flex: { flex: 1 },
  pressed: { opacity: 0.8 },
  text: { color: colors.text.default },
  sub: { color: colors.text.icon },
  sub2: { color: colors.text.sub },
  center: { textAlign: 'center' },
  emptySub: { marginTop: spacing[8] },
  bar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: layout.screenPaddingX,
    paddingRight: spacing[16],
  },
  toggle: {
    flexDirection: 'row',
    gap: spacing[6],
    padding: spacing[4],
    borderRadius: radius.full,
    backgroundColor: colors.surface.default,
  },
  toggleButton: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleSelected: { backgroundColor: colors.surface.white },
  kinds: {
    flexDirection: 'row',
    gap: spacing[10],
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing[4],
    paddingBottom: spacing[12],
  },
  kind: {
    width: 52,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[16],
    marginHorizontal: layout.screenPaddingX,
    marginBottom: spacing[12],
    paddingVertical: spacing[16],
    paddingHorizontal: spacing[18],
    borderRadius: radius.md,
    backgroundColor: colors.surface.subtle,
  },
  list: {
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing[16],
    // [+] 버튼에 마지막 카드가 가리지 않게
    paddingBottom: FAB + FAB_GAP * 2,
    gap: spacing[24],
  },
  listHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  columns: { flexDirection: 'row', gap: spacing[16] },
  // 값 문서 열 안 카드 간격 22는 토큰에 없어 24
  column: { flex: 1, gap: spacing[24] },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[32],
  },
  art: {
    width: 248,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[16],
    paddingVertical: spacing[20],
    borderRadius: radius.xl,
    backgroundColor: colors.brand.primaryBg,
    marginBottom: spacing[24],
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
    paddingHorizontal: spacing[10],
    paddingVertical: spacing[6],
    borderRadius: radius.full,
    backgroundColor: colors.surface.white,
  },
  bigAdd: {
    width: 64,
    height: 64,
    marginTop: spacing[24],
    borderRadius: radius.full,
    backgroundColor: colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fab: {
    position: 'absolute',
    right: FAB_GAP,
    bottom: FAB_GAP,
    width: FAB,
    height: FAB,
    borderRadius: radius.full,
    backgroundColor: colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
