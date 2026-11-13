import { StyleSheet, Text, View } from 'react-native';

import { BottomSheet, Button, Icon } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Spinner } from '@/components/ui/spinner';
import { colors, layout, spacing, typography } from '@/theme';

import type { TripsStatus } from '../hooks/use-trip-options';

import { TripPickList, type TripOption } from './trip-pick-list';

type GroupTripSheetProps = {
  visible: boolean;
  trips: TripOption[];
  /** 내 여행 목록 조회 상태. ready일 때만 목록(비었으면 여행 없음 안내)을 보여 준다 */
  tripsStatus: TripsStatus;
  onRetryTrips: () => void;
  onClose: () => void;
  /** 여행을 누르면 바로 그 여행의 그룹 즐겨찾기로 간다 */
  onPick: (tripId: string) => void;
};

/**
 * S10 [그룹] → 여행 고르기 시트. 그룹 즐겨찾기는 여행마다 따로라 어느 여행인지 먼저 고른다.
 * 고르는 즉시 이동하므로 확인 버튼이 없다. 모양은 S14 그룹에 추가 시트(AddToTripSheet)와 맞춘다
 */
export function GroupTripSheet({
  visible,
  trips,
  tripsStatus,
  onRetryTrips,
  onClose,
  onPick,
}: GroupTripSheetProps) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.titleRow}>
        <View style={styles.titles}>
          <Text style={[typography.title1, styles.text]}>어느 여행의 장소를 볼까요?</Text>
          <View style={styles.inline}>
            <Icon name="people" size={16} color={colors.text.icon} />
            <Text style={[typography.caption, styles.sub]}>동행과 함께 모은 장소예요</Text>
          </View>
        </View>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="닫기"
          hitSlop={8}
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
              icon="refresh"
              size="sm"
              variant="secondary"
              onPress={onRetryTrips}
            />
          </View>
        ) : trips.length === 0 ? (
          <View style={styles.empty}>
            <Icon name="trip" size={16} color={colors.text.icon} />
            <Text style={[typography.caption, styles.sub, styles.center]}>
              {'아직 내 여행이 없어요\n여행을 만들면 동행과 장소를 모을 수 있어요'}
            </Text>
          </View>
        ) : (
          <TripPickList trips={trips} selectedId={null} onSelect={onPick} />
        )}
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
  body: { paddingTop: spacing[16], paddingBottom: spacing[8] },
  empty: { alignItems: 'center', gap: spacing[4], paddingVertical: spacing[24] },
  center: { textAlign: 'center' },
  text: { color: colors.text.default },
  sub: { color: colors.text.sub },
});
