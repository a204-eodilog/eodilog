import { StyleSheet, Text, View } from 'react-native';

import { AvatarGroup, Icon, Tag } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { CheckMarkWhen } from '@/components/ui/check-mark';
import { placeKindLook } from '@/features/place/place-kind';
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
 * 서버가 장소 사진을 주지 않아 사진 자리에 장소 종류 아이콘(place-kind)을 둔다.
 */
export function PlaceRow({ item, members, onPress, selecting = false, selected = false }: Props) {
  const names = saverNames(item, members);
  const overlap = overlapLabel(item);
  const address = shortAddress(item.place.address);
  // 어떤 곳인지 알리는 아이콘(음식점·카페·숙소…). 저장 탭 카드와 같은 규칙이다
  const kind = placeKindLook(item.place.name, item.place.category);
  return (
    <PressableScale
      style={styles.row}
      onPress={() => onPress(item)}
      accessibilityRole={selecting ? 'checkbox' : 'button'}
      accessibilityState={selecting ? { checked: selected } : undefined}
      accessibilityLabel={item.place.name}
      accessibilityHint={[kind.label, names.join(', '), overlap].filter(Boolean).join(', ')}
    >
      {selecting ? (
        <View style={[styles.box, selected ? styles.boxOn : styles.boxOff]}>
          <CheckMarkWhen checked={selected} size={16} />
        </View>
      ) : null}
      <View style={[styles.thumb, { backgroundColor: kind.bg }]}>
        <Icon name={kind.icon} size={26} color={kind.color} />
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
    </PressableScale>
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
    width: 56,
    height: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: { flex: 1, gap: spacing[4] },
  name: { color: colors.text.default },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing[6] },
  sub: { color: colors.text.icon, flexShrink: 1 },
});
