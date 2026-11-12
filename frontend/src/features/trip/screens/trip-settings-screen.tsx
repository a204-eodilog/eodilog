import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Spinner } from '@/components/ui/spinner';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isWaitingOffline } from '@/api/query-focus';
import {
  Avatar,
  ConfirmSheet,
  ErrorState,
  Header,
  Icon,
  type IconName,
  OfflineNotice,
  TextField,
  toast,
} from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { useMe } from '@/hooks/use-me';
import { formatRange } from '@/lib/seoul-date';
import { colors, layout, radius, spacing, typography } from '@/theme';

import {
  isAlone,
  myMember,
  nextOwner,
  pickableMembers,
  settingsActions,
  tripRole,
  type SettingsAction,
} from '../companion-rules';
import { DateRangeSheet } from '../components/date-range-sheet';
import { LeaveTripSheet, type LeaveTripOptions } from '../components/leave-trip-sheet';
import { MemberPickSheet, type MemberPickMode } from '../components/member-pick-sheet';
import { TripGoneState } from '../components/trip-gone-state';
import { exitTrip, refreshTripAfterConflict } from '../hooks/trip-cache';
import { leaveTripFailure, useLeaveTrip } from '../hooks/use-leave-trip';
import { useDeleteTrip, useRemoveMember, useTransferOwner } from '../hooks/use-member-actions';
import { useRegions } from '../hooks/use-region-names';
import { useTrip } from '../hooks/use-trip';
import { useSyncEditDraft, useTripEditDraft } from '../hooks/use-trip-edit-draft';
import { useUpdateTrip } from '../hooks/use-update-trip';
import { shortRegionName } from '../trip-rules';
import type { TripMember } from '../types';

const TITLE_MAX = 200;

/**
 * S19 여행 설정. 동행 누구나 이름·기간·여행지를 고치고 [완료] 한 번으로 저장한다(research R6).
 * 아래 메뉴는 방장이면 넘기기·내보내기·나가기·삭제, 동행이면 나가기만 있다(FR-016, R7).
 */
export function TripSettingsScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const insets = useSafeAreaInsets();
  const { data: trip, isPending, isError, notFound, refetch, fetchStatus } = useTrip(tripId);
  const { data: me } = useMe();
  const {
    regions: tripRegions,
    ready: regionsReady,
    waitingOffline: regionsOffline,
    failed: regionsFailed,
    retry: retryRegions,
  } = useRegions(trip?.destinationRegionIds ?? []);
  const draft = useTripEditDraft();
  const { reset } = draft;
  const update = useUpdateTrip(tripId);
  const transfer = useTransferOwner(tripId);
  const kick = useRemoveMember(tripId);
  const removeTrip = useDeleteTrip(tripId);
  const queryClient = useQueryClient();
  const [titleError, setTitleError] = useState<string | null>(null);
  const [rangeOpen, setRangeOpen] = useState(false);
  /** 넘기기·내보내기 고르기 시트. fromLeave면 나가기 시트에서 연 넘기기다(spec US3-4) */
  const [pick, setPick] = useState<{ mode: MemberPickMode; fromLeave: boolean } | null>(null);
  const [kickTarget, setKickTarget] = useState<TripMember | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const leave = useLeaveTrip();
  const navigation = useNavigation();
  /** [완료] 저장 중. 두 번째 누름을 막는다 */
  const saving = useRef(false);

  // 처음 열 때 한 번만 채운다. 수정 중 여행을 새로 받아도 다시 채우지 않아야 고치던 값이 남는다(research R6).
  // 다만 버전만 오른 여행(동행이 들어오거나 나감)을 받으면 기준만 옮긴다. 409 뒤에는 useUpdateTrip이 다시 채운다
  useSyncEditDraft(tripId, trip, tripRegions, regionsReady);

  // 상세에서 받아 둔 여행이 30초 안이면 다시 받지 않는다. 그사이 동행이 들어와 버전이 올랐으면 [완료]가 409를 받으므로
  // 설정을 열 때 한 번 새로 받는다. 받은 여행은 위에서 기준만 옮긴다
  useEffect(() => {
    void refetch();
  }, [refetch]);

  // 화면이 닫히면(뒤로 가기 포함) 고친 값을 버린다. 여행지 검색은 이 화면 위에 쌓여 값이 남는다
  useEffect(() => reset, [reset]);

  if (isPending || (trip && draft.base?.id !== tripId)) {
    // 여행이나 여행지 이름을 아직 못 받았는데 연결이 끊겼다. 다 받아야 입력 칸을 채우므로 로딩만 돌지 않게 안내한다.
    // 연결되면 자동으로 다시 받아 채운다
    if (isWaitingOffline({ data: trip, fetchStatus }) || (trip && regionsOffline)) {
      return (
        <View style={styles.screen}>
          <Header title="여행 설정" largeTitle />
          <OfflineNotice />
        </View>
      );
    }
    // 여행지 이름 하나를 잠깐 못 받았다. 빼고 채우면 [완료]가 그 여행지를 지우므로 채우지 않고 다시 받게 한다
    if (trip && regionsFailed) {
      return (
        <View style={styles.screen}>
          <Header title="여행 설정" largeTitle />
          <ErrorState onRetry={retryRegions} />
        </View>
      );
    }
    return (
      <View style={styles.center}>
        <Spinner color={colors.brand.primary} />
      </View>
    );
  }

  if (notFound || update.failure === 'tripGone' || (isError && !trip)) {
    return (
      <View style={styles.screen}>
        <Header title="여행 설정" largeTitle />
        {isError && !notFound && update.failure !== 'tripGone' ? (
          <ErrorState onRetry={() => refetch()} />
        ) : (
          <TripGoneState />
        )}
      </View>
    );
  }
  if (!trip) return null;

  const role = tripRole(trip, me?.id);
  const actions = settingsActions(role, trip.members.length);
  const shownTitleError = titleError ?? update.titleError ?? undefined;

  const done = async () => {
    // 빨리 두 번 누르면 저장이 끝난 뒤 뒤로 가기가 두 번 되어 여행 상세까지 닫혔다
    if (saving.current) return;
    if (draft.title.trim().length === 0) {
      setTitleError('여행 이름을 입력해 주세요');
      return;
    }
    setTitleError(null);
    saving.current = true;
    try {
      const result = await update.save();
      // 저장하는 사이 사용자가 먼저 뒤로 갔으면 이 화면은 이미 닫혔다. 그때 또 뒤로 가면 여행 상세까지 닫힌다(2026-11-10 점검)
      if (result !== 'failed' && navigation.isFocused()) router.back();
    } finally {
      saving.current = false;
    }
  };

  const my = myMember(trip, me?.id);
  const others = my ? pickableMembers(trip, my.id) : [];

  const onAction = (action: SettingsAction) => {
    switch (action.key) {
      case 'handover':
        setPick({ mode: 'handover', fromLeave: false });
        break;
      case 'kick':
        setPick({ mode: 'kick', fromLeave: false });
        break;
      case 'delete':
        setDeleteOpen(true);
        break;
      case 'leave':
        openLeave();
        break;
    }
  };

  const openLeave = () => {
    leave.reset();
    setLeaveOpen(true);
  };

  const confirmLeave = (options: LeaveTripOptions) => {
    leave.mutate(
      { tripId, expectedVersion: trip.version, ...options },
      {
        onSuccess: async (result) => {
          setLeaveOpen(false);
          // null은 이미 나간 여행(404). 나간 것과 같이 본다(FR-032)
          toast.show(result?.tripDeleted ? '여행을 삭제했어요' : `${trip.title}에서 나왔어요`);
          // 정리 작업(내 채팅 지우기·여행 삭제)은 기다리지 않는다(FR-028)
          await exitTrip(queryClient, tripId);
        },
        onError: async (e) => {
          // 그 사이 누가 들어오거나 나갔다. 시트를 연 채 최신 이어받을 사람·혼자 여부로 다시 그린다(FR-029)
          if (leaveTripFailure(e) === 'conflict')
            await refreshTripAfterConflict(queryClient, tripId);
        },
      },
    );
  };

  const isOwner = role === 'owner';
  const alone = isAlone(trip);

  const onPick = async (member: TripMember) => {
    if (!pick) return;
    if (pick.mode === 'kick') {
      // 내보내기는 고른 뒤 한 번 더 묻는다(FR-021)
      setPick(null);
      setKickTarget(member);
      return;
    }
    const fromLeave = pick.fromLeave;
    const ok = await transfer.run({ targetMemberId: member.id, expectedVersion: trip.version });
    // 성공하면 여행이 다시 그려지며 동행 화면이 된다(FR-019). 실패해도 최신 화면을 보이도록 닫는다
    setPick(null);
    if (!ok) return;
    toast.show(`${member.user.nickname}님이 방장이 됐어요`);
    // 나가기 시트에서 넘겼으면 나가기를 이어서 묻는다. 이제 동행이라 이어받을 사람 안내는 없다(spec US3-4)
    if (fromLeave) openLeave();
  };

  const confirmKick = async () => {
    if (!kickTarget) return;
    const ok = await kick.run({ memberId: kickTarget.id, expectedVersion: trip.version });
    if (ok) toast.show(`${kickTarget.user.nickname}님을 내보냈어요`);
    setKickTarget(null);
  };

  const confirmDelete = async () => {
    const ok = await removeTrip.run(trip.version);
    setDeleteOpen(false);
    if (!ok) return;
    toast.show('여행을 삭제했어요');
    await exitTrip(queryClient, tripId);
  };

  return (
    <View style={styles.screen}>
      <Header
        title="여행 설정"
        largeTitle
        right={
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="완료"
            accessibilityState={{ disabled: update.isPending }}
            disabled={update.isPending}
            onPress={done}
            hitSlop={spacing[8]}
            style={styles.doneButton}
          >
            {update.isPending ? (
              <Spinner color={colors.brand.primary} />
            ) : (
              <Icon name="check" size={24} color={colors.brand.primaryDark} />
            )}
          </PressableScale>
        }
      />
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing[24] }]}
        keyboardShouldPersistTaps="handled"
      >
        {update.failure === 'error' ? (
          <View style={styles.failure} accessibilityLiveRegion="polite">
            <View style={styles.failureIcon}>
              <Icon name="alert" size={20} color={colors.status.danger} />
            </View>
            <View style={styles.failureTexts}>
              <Text style={[typography.bodyBold, styles.failureTitle]}>
                여행 정보를 저장하지 못했어요
              </Text>
              <Text style={[typography.caption, styles.failureDescription]}>
                저장하지 못했어요. 다시 눌러 주세요
              </Text>
            </View>
          </View>
        ) : null}

        <TextField
          label="여행 이름"
          value={draft.title}
          onChangeText={(text) => {
            draft.setTitle(text);
            if (titleError) setTitleError(null);
            if (update.titleError) update.clearTitleError();
          }}
          maxLength={TITLE_MAX}
          // 피그마 S19에는 글자 수가 없다. 200자 제한은 그대로 막는다
          hideCount
          error={shownTitleError}
          returnKeyType="done"
          variant="filled"
          accessibilityLabel="여행 이름"
        />

        <View style={styles.rows}>
          <FieldRow
            icon="calendar"
            label="기간"
            value={draft.range ? formatRange(draft.range.start, draft.range.end) : '기간 미정'}
            onPress={() => setRangeOpen(true)}
          />
          <FieldRow
            icon="map-pin"
            label="여행지"
            value={
              draft.regions.length > 0
                ? draft.regions.map((r) => shortRegionName(r.name)).join(', ')
                : '미정'
            }
            onPress={() => router.push(`/trips/${tripId}/settings-region`)}
          />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={[typography.title3, styles.sectionTitle]}>구성원</Text>
            <Text style={[typography.caption, styles.sub]}>{trip.members.length}명</Text>
          </View>
          <View style={styles.faces}>
            {[...trip.members]
              .sort((a, b) => a.joinOrder - b.joinOrder)
              .map((m) => (
                <Avatar
                  key={m.id}
                  name={m.user.nickname}
                  imageUrl={m.user.profileImageUrl}
                  size="lg"
                  me={m.user.id === me?.id}
                />
              ))}
          </View>
        </View>

        <View style={styles.menu}>
          {actions.map((action) => (
            <MenuRow key={action.key} action={action} onPress={() => onAction(action)} />
          ))}
        </View>
      </ScrollView>

      <DateRangeSheet
        visible={rangeOpen}
        value={draft.range}
        onClose={() => setRangeOpen(false)}
        onDone={(next) => {
          draft.setRange(next);
          setRangeOpen(false);
        }}
      />

      <MemberPickSheet
        visible={pick !== null}
        onClose={() => setPick(null)}
        mode={pick?.mode ?? 'handover'}
        members={others}
        onPick={onPick}
        loading={transfer.isPending}
      />
      <ConfirmSheet
        visible={kickTarget !== null}
        onClose={() => setKickTarget(null)}
        onConfirm={confirmKick}
        title={`${kickTarget?.user.nickname ?? ''}님을 내보낼까요?`}
        description="이 여행을 더 볼 수 없어요. 경비 기록은 남아요"
        confirmLabel="내보내기"
        confirmIcon="leave"
        loading={kick.isPending}
      />
      <ConfirmSheet
        visible={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={confirmDelete}
        title="여행을 삭제할까요?"
        description="모든 동행에게서 여행이 사라져요. 되돌릴 수 없어요"
        confirmLabel="삭제하기"
        confirmIcon="trash"
        loading={removeTrip.isPending}
      />
      {/* S50 여행 나가기(B의 공통 시트). 일반 동행 / 방장일 때 / 혼자 남았을 때 */}
      <LeaveTripSheet
        visible={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        onConfirm={confirmLeave}
        tripTitle={trip.title}
        alone={alone}
        nextOwnerName={isOwner && !alone && my ? nextOwner(trip, my.id)?.user.nickname : undefined}
        onHandOver={
          isOwner && !alone
            ? () => {
                setLeaveOpen(false);
                setPick({ mode: 'handover', fromLeave: true });
              }
            : undefined
        }
        loading={leave.isPending}
        failure={leave.isError ? leaveTripFailure(leave.error) : undefined}
      />
    </View>
  );
}

function FieldRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: IconName;
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}`}
      onPress={onPress}
      style={({ pressed }) => [styles.fieldRow, pressed && styles.pressed]}
    >
      <Icon name={icon} size={20} color={colors.text.icon} />
      <Text style={[typography.body, styles.fieldValue]} numberOfLines={1}>
        {value}
      </Text>
      <Icon name="chevron-right" size={16} color={colors.text.muted} />
    </PressableScale>
  );
}

/** 메뉴마다 하는 일을 아이콘으로 구분한다 */
const MENU_ICON: Record<SettingsAction['key'], IconName> = {
  handover: 'crown',
  kick: 'person-minus',
  leave: 'leave',
  delete: 'trash',
};

function MenuRow({ action, onPress }: { action: SettingsAction; onPress: () => void }) {
  const color = action.danger ? colors.status.danger : colors.text.default;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={action.label}
      accessibilityHint={action.reason}
      accessibilityState={{ disabled: !!action.disabled }}
      disabled={action.disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.menuRow, (pressed || action.disabled) && styles.pressed]}
    >
      <Icon name={MENU_ICON[action.key]} size={20} color={color} />
      <View style={styles.menuTexts}>
        <Text style={[typography.body, { color }]}>{action.label}</Text>
        {action.reason ? (
          <Text style={[typography.caption, styles.sub]}>{action.reason}</Text>
        ) : null}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // 피그마 S19: 위 16, 묶음 사이 28, 줄 사이 12
  body: { paddingHorizontal: layout.screenPaddingX, paddingTop: spacing[16], gap: spacing[28] },
  // [완료]는 체크 아이콘으로 둔다(2026-11-05 사용자 요청: 글보다 아이콘). 누르는 칸 44, 안쪽 좌우 12
  doneButton: {
    minWidth: layout.minTouchTarget,
    height: layout.minTouchTarget,
    paddingHorizontal: spacing[12],
    alignItems: 'center',
    justifyContent: 'center',
  },
  failure: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[12],
    padding: spacing[16],
    borderRadius: radius.lg,
    backgroundColor: colors.status.dangerBg,
  },
  failureIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.white,
  },
  failureTexts: { flex: 1 },
  failureTitle: { color: colors.text.default },
  failureDescription: { color: colors.text.sub },
  rows: { gap: spacing[12] },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[10],
    minHeight: 52,
    paddingHorizontal: spacing[16],
    borderRadius: radius.md,
    backgroundColor: colors.surface.default,
  },
  fieldValue: { flex: 1, color: colors.text.default },
  pressed: { opacity: 0.5 },
  section: { gap: spacing[12] },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: colors.text.default },
  sub: { color: colors.text.sub },
  faces: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[8],
    padding: spacing[14],
    borderRadius: radius.lg,
    backgroundColor: colors.status.warningBg2,
  },
  // 피그마 S19 메뉴 줄: 높이 48, 줄 사이 없음
  menu: { gap: 0 },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[14],
    minHeight: 48,
  },
  menuTexts: { flex: 1 },
});
