import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/ui';
import { colors, layout, radius, spacing, typography } from '@/theme';

import { type AddStart, MAX_CAPTURES } from '../extract-rules';
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
  /** [+] → S11. 저장 없음의 두 카드는 S11을 링크 칸 / 사진 고르기로 바로 시작한다 */
  onAdd: (start?: AddStart) => void;
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
        <KindButton icon="person" label="개인" selected onPress={() => undefined} />
        <KindButton icon="people" label="그룹" selected={false} onPress={onGroup} />
      </View>

      {offlineSince ? (
        <View style={styles.offline} accessibilityLiveRegion="polite">
          <View style={styles.boxIcon}>
            <Icon name="wifi-off" size={22} color={colors.text.icon} />
          </View>
          <View style={styles.flex}>
            <Text style={[typography.bodyBold, styles.text]}>인터넷에 연결되지 않았어요</Text>
            <Text style={[typography.caption, styles.sub]}>{offlineSince}</Text>
          </View>
        </View>
      ) : null}

      {empty ? (
        <View style={styles.empty}>
          <Text style={[typography.title1, styles.text, styles.center]}>
            가고 싶은 곳을 모아 보세요
          </Text>
          <Text style={[typography.body, styles.sub, styles.center, styles.emptySub]}>
            링크나 캡처에서 장소를 찾아 줘요
          </Text>
          <View style={styles.starts}>
            <StartCard
              icon="link"
              title="링크 붙여넣기"
              hint="SNS 게시물·블로그 글"
              onPress={() => onAdd('link')}
            />
            <StartCard
              icon="image"
              title="캡처 올리기"
              hint={`한 번에 ${MAX_CAPTURES}장까지`}
              onPress={() => onAdd('capture')}
            />
          </View>
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
          onPress={() => onAdd()}
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
  const color = selected ? colors.brand.primaryDark : colors.text.icon;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} 즐겨찾기`}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.kind,
        { backgroundColor: selected ? colors.brand.primaryLight : colors.surface.default },
        pressed && styles.pressed,
      ]}
    >
      <Icon name={icon} size={18} color={color} />
      <Text style={[typography.captionMedium, { color }]}>{label}</Text>
    </Pressable>
  );
}

/** 저장 없음의 시작 카드. 누르면 S11을 그 입력으로 바로 시작한다 */
function StartCard({
  icon,
  title,
  hint,
  onPress,
}: {
  icon: IconName;
  title: string;
  hint: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={hint}
      onPress={onPress}
      style={({ pressed }) => [styles.start, pressed && styles.pressed]}
    >
      <View style={styles.startIcon}>
        <Icon name={icon} size={22} color={colors.brand.primary} />
      </View>
      <View style={styles.flex}>
        <Text style={[typography.bodyBold, styles.text]}>{title}</Text>
        <Text style={[typography.caption, styles.sub2]}>{hint}</Text>
      </View>
      <Icon name="chevron-right" size={20} color={colors.text.muted} />
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
  // 아이콘만으로는 뜻을 알기 어려워 글자를 붙인다(피그마는 아이콘만, 52x36)
  kind: {
    height: 36,
    flexDirection: 'row',
    gap: spacing[4],
    paddingHorizontal: spacing[14],
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // README 안내 상자(회색): 둥글기 20, 안쪽 20, 간격 14
  offline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[14],
    marginHorizontal: layout.screenPaddingX,
    marginBottom: spacing[12],
    padding: spacing[20],
    borderRadius: radius.xl,
    backgroundColor: colors.surface.subtle,
  },
  // README 안내 상자(회색): 흰 동그라미 44 안에 아이콘 22
  boxIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.surface.white,
    alignItems: 'center',
    justifyContent: 'center',
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
  // 피그마의 장식 그림(sns 링크 칩·아이콘)과 가운데 [+] 대신, 바로 누를 수 있는 시작 카드 두 개
  starts: { alignSelf: 'stretch', gap: spacing[10], marginTop: spacing[24] },
  start: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[14],
    padding: spacing[16],
    borderRadius: radius.lg,
    backgroundColor: colors.brand.primaryBg,
  },
  startIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.white,
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
