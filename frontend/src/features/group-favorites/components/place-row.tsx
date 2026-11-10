import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AvatarGroup, Icon, Tag } from '@/components/ui';
import { colors, radius, spacing, typography } from '@/theme';

import { overlapLabel, saverNames, shortAddress } from '../group-rules';
import type { SavedPlace } from '../types';

type Props = {
  item: SavedPlace;
  members: readonly { id: string; name: string; me?: boolean }[];
  onPress(item: SavedPlace): void;
  /** 후보 고르기 모드면 체크 상자를 보인다 */
  selecting?: boolean;
  selected?: boolean;
};

/**
 * 그룹 즐겨찾기 장소 한 줄(Figma 201-9344). 사진 자리, 이름, 짧은 주소, 담은 사람 얼굴과 이름, 겹침 표시.
 * 서버가 장소 사진을 주지 않아 사진 자리에 핀 그림을 둔다.
 */
export function PlaceRow({ item, members, onPress, selecting = false, selected = false }: Props) {
  const names = saverNames(item, members);
  const overlap = overlapLabel(item);
  const address = shortAddress(item.place.address);
  return (
    <Pressable
      style={styles.row}
      onPress={() => onPress(item)}
      accessibilityRole={selecting ? 'checkbox' : 'button'}
      accessibilityState={selecting ? { checked: selected } : undefined}
      accessibilityLabel={item.place.name}
      accessibilityHint={[names.join(', '), overlap].filter(Boolean).join(', ')}
    >
      {selecting ? (
        <View style={[styles.box, selected ? styles.boxOn : styles.boxOff]}>
          {selected ? <Icon name="check" size={16} color={colors.text.inverse} /> : null}
        </View>
      ) : null}
      <View style={styles.thumb}>
        <Icon name="map-pin" size={22} color={colors.text.muted} />
      </View>
      <View style={styles.texts}>
        <Text style={[typography.bodyBold, styles.name]} numberOfLines={1}>
          {item.place.name}
        </Text>
        {address ? (
          <View style={styles.line}>
            <Icon name="map-pin" size={14} color={colors.text.icon} />
            <Text style={[typography.caption, styles.sub]} numberOfLines={1}>
              {address}
            </Text>
          </View>
        ) : null}
        <View style={styles.line}>
          <AvatarGroup
            people={item.savedBy.map((s, i) => {
              const m = members.find((x) => x.id === s.memberId);
              return { name: names[i], me: m?.me };
            })}
            max={3}
            size="sm"
          />
          <Text style={[typography.caption, styles.sub]} numberOfLines={1}>
            {names.join(', ')}
          </Text>
          {overlap ? (
            <View>
              <Tag label={overlap} tone="brandSoft" icon="people" small />
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[14],
    paddingVertical: spacing[10],
  },
  box: { width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colors.brand.primary },
  boxOff: { backgroundColor: colors.line.default },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    backgroundColor: colors.surface.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: { flex: 1, gap: spacing[4] },
  name: { color: colors.text.default },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing[6] },
  sub: { color: colors.text.icon, flexShrink: 1 },
});
