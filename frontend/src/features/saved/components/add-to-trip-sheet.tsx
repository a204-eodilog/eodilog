import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BottomSheet, Button, Icon } from '@/components/ui';
import { colors, layout, spacing, typography } from '@/theme';

import { TripPickList, type TripOption } from './trip-pick-list';

type AddToTripSheetProps = {
  visible: boolean;
  placeName: string;
  trips: TripOption[];
  selectedId: string | null;
  onSelect: (tripId: string) => void;
  adding?: boolean;
  onClose: () => void;
  onAdd: () => void;
};

/**
 * S14 그룹 즐겨찾기에 추가 시트. 여행 하나를 골라 그 여행의 그룹 즐겨찾기에 내 저장으로 담는다.
 * 참여 중인 여행이 없으면 안내를 보이고 [추가]를 막는다
 */
export function AddToTripSheet({
  visible,
  placeName,
  trips,
  selectedId,
  onSelect,
  adding = false,
  onClose,
  onAdd,
}: AddToTripSheetProps) {
  const empty = trips.length === 0;
  return (
    <BottomSheet visible={visible} onClose={onClose} locked={adding}>
      <View style={styles.titleRow}>
        <View style={styles.titles}>
          <Text style={[typography.title1, styles.text]}>어느 여행에 추가할까요?</Text>
          <View style={styles.inline}>
            <Icon name="map-pin" size={16} color={colors.text.icon} />
            <Text style={[typography.caption, styles.sub]} numberOfLines={1}>
              {placeName}
            </Text>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="닫기"
          hitSlop={8}
          disabled={adding}
          onPress={onClose}
          style={styles.close}
        >
          <Icon name="close" color={colors.text.default} />
        </Pressable>
      </View>

      <View style={styles.body}>
        {empty ? (
          <View style={styles.empty}>
            <Icon name="trip" size={16} color={colors.text.icon} />
            <Text style={[typography.caption, styles.sub, styles.center]}>
              {'참여 중인 여행이 없어요\n여행을 만들면 여기에 담을 수 있어요'}
            </Text>
          </View>
        ) : (
          <TripPickList trips={trips} selectedId={selectedId} onSelect={onSelect} />
        )}
        <View style={styles.inline}>
          <Icon name="lock" size={16} color={colors.text.icon} />
          <Text style={[typography.caption, styles.sub]}>고른 여행의 동행만 볼 수 있어요</Text>
        </View>
      </View>

      <View style={[styles.footer, empty && styles.dim]}>
        <Button
          label="추가"
          weight="medium"
          disabled={empty || selectedId === null}
          loading={adding}
          onPress={onAdd}
          leading={<Icon name="plus" size={20} color={colors.text.inverse} />}
          style={styles.add}
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[8] },
  titles: { flex: 1, gap: spacing[2] },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  close: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -spacing[12],
    marginTop: -spacing[6],
  },
  body: { paddingTop: spacing[16], gap: spacing[12] },
  empty: { alignItems: 'center', gap: spacing[4], paddingVertical: spacing[24] },
  center: { textAlign: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', paddingTop: spacing[20] },
  // 값 문서: 여행이 없으면 버튼 줄을 흐림 0.40
  dim: { opacity: 0.4 },
  add: { paddingLeft: spacing[20], paddingRight: spacing[24] },
  text: { color: colors.text.default },
  sub: { color: colors.text.icon, flexShrink: 1 },
});
