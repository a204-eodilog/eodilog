import { StyleSheet, Text, View } from 'react-native';
import { Spinner } from '@/components/ui/spinner';

import { BottomSheet, Button, Icon } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { colors, layout, spacing, typography } from '@/theme';

import type { TripsStatus } from '../hooks/use-trip-options';

import { TripPickList, type TripOption } from './trip-pick-list';

type AddToTripSheetProps = {
  visible: boolean;
  placeName: string;
  trips: TripOption[];
  /** 내 여행 목록 조회 상태. ready일 때만 목록(비었으면 여행 없음 안내)을 보여 준다 */
  tripsStatus: TripsStatus;
  /** 내 여행 목록 다시 불러오기 */
  onRetryTrips: () => void;
  selectedId: string | null;
  onSelect: (tripId: string) => void;
  adding?: boolean;
  onClose: () => void;
  onAdd: () => void;
};

/**
 * S14 그룹 즐겨찾기에 추가 시트. 여행 하나를 골라 그 여행의 그룹 즐겨찾기에 내 저장으로 담는다.
 * 목록을 불러오는 중이면 돌아가는 표시, 실패하면 [다시 시도], 불러왔는데 여행이 없을 때만 여행 없음 안내를 보이고 [추가]를 막는다.
 * 다녀온 여행도 담을 수 있어 "참여 중인 여행" 대신 "내 여행"이라고 쓴다(!137 리뷰)
 */
export function AddToTripSheet({
  visible,
  placeName,
  trips,
  tripsStatus,
  onRetryTrips,
  selectedId,
  onSelect,
  adding = false,
  onClose,
  onAdd,
}: AddToTripSheetProps) {
  const ready = tripsStatus === 'ready';
  const empty = ready && trips.length === 0;
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
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="닫기"
          hitSlop={8}
          disabled={adding}
          onPress={onClose}
          style={styles.close}
        >
          <Icon name="close" color={colors.text.default} />
        </PressableScale>
      </View>

      <View style={styles.body}>
        {tripsStatus === 'loading' ? (
          <Spinner
            accessibilityLabel="내 여행 불러오는 중"
            style={styles.empty}
            color={colors.brand.primary}
          />
        ) : tripsStatus === 'error' ? (
          <View style={styles.empty}>
            <Icon name="alert" size={16} color={colors.text.icon} />
            <Text style={[typography.caption, styles.sub, styles.center]}>
              내 여행을 불러오지 못했어요
            </Text>
            <Button
              label="다시 시도"
              size="sm"
              variant="secondary"
              onPress={onRetryTrips}
              leading={<Icon name="refresh" size={16} color={colors.brand.primary} />}
            />
          </View>
        ) : empty ? (
          <View style={styles.empty}>
            <Icon name="trip" size={16} color={colors.text.icon} />
            <Text style={[typography.caption, styles.sub, styles.center]}>
              {'아직 내 여행이 없어요\n여행을 만들면 여기에 담을 수 있어요'}
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

      <View style={[styles.footer, !ready || empty ? styles.dim : null]}>
        <Button
          label="추가"
          weight="medium"
          disabled={!ready || empty || selectedId === null}
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
