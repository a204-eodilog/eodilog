import { StyleSheet, View } from 'react-native';

import { AvatarGroup, Chip, Icon } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { colors, layout, spacing } from '@/theme';

import type { SavedFilter } from '../types';

type Props = {
  filter: SavedFilter;
  onFilter(filter: SavedFilter): void;
  allCount: number;
  overlapCount: number;
  people: { name: string; imageUrl?: string | null; me?: boolean }[];
  /** 동행별로 거르는 중이면 사람 버튼을 파랑으로 */
  memberActive: boolean;
  onMember(): void;
};

/** 전체·겹친 곳 칩과 동행 얼굴, 동행 거르기 버튼(Figma 201-9344 머리 아래 줄) */
export function FilterBar(props: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.chips}>
        <Chip
          label={`전체 ${props.allCount}`}
          size="sm"
          selected={props.filter === 'ALL'}
          onPress={() => props.onFilter('ALL')}
        />
        {/* 모은 장소가 없으면 겹칠 곳도 없어 전체 칩만 둔다(Figma 201-9686) */}
        {props.allCount > 0 ? (
          <Chip
            label={`겹친 곳 ${props.overlapCount}`}
            size="sm"
            selected={props.filter === 'OVERLAP'}
            onPress={() => props.onFilter('OVERLAP')}
          />
        ) : null}
      </View>
      <View style={styles.people}>
        {props.people.length > 0 ? <AvatarGroup people={props.people} max={3} /> : null}
        <PressableScale
          style={styles.member}
          onPress={props.onMember}
          accessibilityRole="button"
          accessibilityLabel="동행별로 보기"
          accessibilityState={{ selected: props.memberActive }}
        >
          <Icon
            name="people"
            size={20}
            color={props.memberActive ? colors.brand.primary : colors.text.icon}
          />
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenPaddingX,
    paddingVertical: spacing[8],
  },
  chips: { flexDirection: 'row', gap: spacing[8] },
  people: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  member: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
});
