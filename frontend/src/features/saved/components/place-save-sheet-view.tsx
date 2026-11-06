import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { BottomSheet, Button, Icon, type IconName } from '@/components/ui';
import { colors, layout, radius, spacing, typography } from '@/theme';

import type { TripsStatus } from '../hooks/use-trip-options';
import { placeSaveState, type SaveChoice } from '../saved-rules';

import { TripPickList, type TripOption } from './trip-pick-list';

type PlaceSaveSheetViewProps = {
  visible: boolean;
  /** 저장할 장소 이름. 한 곳이면 핀 + 이름, 여러 곳(S12에서 찾은 장소)이면 "장소 2곳" */
  placeNames: string[];
  choice: SaveChoice;
  onChoose: (choice: SaveChoice) => void;
  trips: TripOption[];
  tripsStatus: TripsStatus;
  onRetryTrips: () => void;
  selectedTripId: string | null;
  onSelectTrip: (tripId: string) => void;
  saving?: boolean;
  /** 저장 실패. 오류 띠를 띄우고 저장 버튼이 [다시 저장]이 된다 */
  failed?: boolean;
  onClose: () => void;
  onSave: () => void;
};

/**
 * S08 장소 저장 시트(그리기만). 나만 보기 / 동행과 같이를 고르고, 동행과 같이면 담을 여행 하나를 고른다.
 * 내 여행이 없으면 동행과 같이를 막고 개인 즐겨찾기에만 저장한다(결정 F-10).
 * 서버 연결은 place-save-sheet.tsx가 하고, 이 파일은 개발용 상태 보기(/dev/place-save)에서도 쓴다
 */
export function PlaceSaveSheetView({
  visible,
  placeNames,
  choice,
  onChoose,
  trips,
  tripsStatus,
  onRetryTrips,
  selectedTripId,
  onSelectTrip,
  saving = false,
  failed = false,
  onClose,
  onSave,
}: PlaceSaveSheetViewProps) {
  const { target, tripDisabled, canSave } = placeSaveState({
    choice,
    tripsStatus,
    tripCount: trips.length,
    selectedTripId,
  });
  const single = placeNames.length === 1;

  return (
    <BottomSheet visible={visible} onClose={onClose} locked={saving}>
      <View style={styles.titleRow}>
        <View style={styles.titles}>
          <Text style={[typography.title1, styles.text]}>어디에 저장할까요?</Text>
          <View style={styles.inline}>
            {single ? <Icon name="map-pin" size={16} color={colors.text.icon} /> : null}
            <Text style={[typography.caption, styles.sub]} numberOfLines={1}>
              {single ? placeNames[0] : `장소 ${placeNames.length}곳`}
            </Text>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="닫기"
          hitSlop={8}
          disabled={saving}
          onPress={onClose}
          style={styles.close}
        >
          <Icon name="close" color={colors.text.default} />
        </Pressable>
      </View>

      <View style={styles.choices} accessibilityRole="radiogroup">
        <ChoiceCell
          icon="person"
          label="나만 보기"
          selected={target === 'personal'}
          disabled={saving}
          onPress={() => onChoose('personal')}
        />
        <ChoiceCell
          icon="people"
          label="동행과 같이"
          selected={target === 'trip'}
          disabled={saving || tripDisabled}
          dim={tripDisabled}
          onPress={() => onChoose('trip')}
        />
      </View>

      <View style={styles.body}>
        {tripDisabled ? (
          <View style={styles.noTrip}>
            <View style={styles.noTripIcon}>
              <Icon name="trip" size={20} color={colors.text.icon} />
            </View>
            <Text style={[typography.bodyBold, styles.text, styles.shrink]}>
              {'아직 내 여행이 없어요\n개인 즐겨찾기에만 저장돼요'}
            </Text>
          </View>
        ) : target === 'trip' ? (
          tripsStatus === 'loading' ? (
            <ActivityIndicator
              accessibilityLabel="내 여행 불러오는 중"
              style={styles.status}
              color={colors.brand.primary}
            />
          ) : tripsStatus === 'error' ? (
            <View style={styles.status}>
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
          ) : (
            <TripPickList trips={trips} selectedId={selectedTripId} onSelect={onSelectTrip} />
          )
        ) : null}

        {tripDisabled ? null : (
          <View style={styles.inline}>
            <Icon name="lock" size={16} color={colors.text.icon} />
            <Text style={[typography.caption, styles.sub]}>
              {target === 'trip'
                ? '고른 여행의 동행만 볼 수 있어요'
                : '개인 즐겨찾기는 나만 볼 수 있어요'}
            </Text>
          </View>
        )}

        {failed ? (
          <View style={styles.error} accessibilityLiveRegion="polite">
            <Icon name="alert" size={20} color={colors.status.danger} />
            <View style={styles.shrink}>
              <Text style={[typography.bodyBold, styles.errorTitle]}>저장하지 못했어요</Text>
              <Text style={[typography.caption, styles.sub]}>
                담지 못했어요. 다시 시도해 주세요
              </Text>
            </View>
          </View>
        ) : null}
      </View>

      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={failed ? '다시 저장' : '저장'}
          accessibilityState={{ disabled: !canSave || saving, busy: saving }}
          disabled={!canSave || saving}
          onPress={onSave}
          style={({ pressed }) => [styles.save, !canSave && styles.dim, pressed && styles.pressed]}
        >
          {saving ? (
            <ActivityIndicator color={colors.text.inverse} />
          ) : (
            <Icon name="check" size={24} color={colors.text.inverse} />
          )}
        </Pressable>
      </View>
    </BottomSheet>
  );
}

function ChoiceCell({
  icon,
  label,
  selected,
  disabled,
  dim = false,
  onPress,
}: {
  icon: IconName;
  label: string;
  selected: boolean;
  disabled: boolean;
  dim?: boolean;
  onPress: () => void;
}) {
  const color = selected ? colors.text.default : colors.text.icon;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.choice, selected && styles.choiceOn, dim && styles.choiceDim]}
    >
      <Icon name={icon} size={24} color={color} />
      <Text style={[typography.captionMedium, { color }]}>{label}</Text>
    </Pressable>
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
  // 값 문서: 두 칸 170x56, 둥글기 16, 칸 안 세로 간격 3(토큰에 없어 2)
  choices: { flexDirection: 'row', gap: spacing[10], paddingTop: spacing[16] },
  choice: {
    flex: 1,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    paddingVertical: spacing[6],
    borderRadius: radius.lg,
    backgroundColor: colors.surface.default,
  },
  choiceOn: { backgroundColor: colors.brand.primaryBg },
  // 값 문서: 내 여행이 없으면 "동행과 같이" 칸 흐림 0.45
  choiceDim: { opacity: 0.45 },
  body: { paddingTop: spacing[16], gap: spacing[12] },
  status: { alignItems: 'center', gap: spacing[4], paddingVertical: spacing[24] },
  center: { textAlign: 'center' },
  // 값 문서: 연회색 상자 둥글기 24, 안쪽 18, 흰 동그라미 40 + 글 간격 14
  noTrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[14],
    padding: spacing[18],
    borderRadius: radius.xxl,
    backgroundColor: colors.surface.subtle,
  },
  noTripIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.white,
  },
  // 오류 띠(docs/design/screens README 상태 공통 모양). 피그마 둥글기 14는 토큰에 없어 12로 맞춘다(S50과 같음)
  error: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[16],
    paddingVertical: spacing[16],
    paddingHorizontal: spacing[18],
    borderRadius: radius.md,
    backgroundColor: colors.surface.subtle,
    marginTop: spacing[4],
  },
  errorTitle: { color: colors.status.danger },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', paddingTop: spacing[20] },
  // 값 문서: 오른쪽 끝 동그라미 주 버튼 48 + 체크 24. 공통 Button에 동그라미 아이콘 버튼이 없어 여기서 그린다
  save: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand.primary,
  },
  dim: { opacity: 0.4 },
  pressed: { opacity: 0.8 },
  text: { color: colors.text.default },
  sub: { color: colors.text.icon, flexShrink: 1 },
  shrink: { flex: 1 },
});
