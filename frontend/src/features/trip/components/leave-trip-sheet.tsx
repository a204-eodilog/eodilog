import { type ReactNode, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ConfirmSheet, Icon, type IconName, RoundCheck } from '@/components/ui';
import { colors, radius, spacing, typography } from '@/theme';

import type { LeaveTripFailure } from '../hooks/use-leave-trip';

/** 서버가 지우기를 받기 전 안내. 명세 trip-members-leave 가정의 문구 */
const SOON = '지우기는 곧 지원돼요';

export type LeaveTripOptions = { deleteOwnPhotos: boolean; deleteOwnMessages: boolean };

export type LeaveTripSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** [나가기]를 누르면 고른 지우기 옵션과 함께 부른다. useLeaveTrip().mutate로 넘긴다 */
  onConfirm: (options: LeaveTripOptions) => void;
  /** "겨울 여행" */
  tripTitle: string;
  /** 내가 방장일 때, 나가면 방장을 받을 동행 이름(가장 먼저 참여한 동행). 아니면 비운다 */
  nextOwnerName?: string;
  /** 동행 없이 혼자 남았으면 true. 나가면 여행이 지워진다 */
  alone?: boolean;
  /** 내가 올린 사진 수. 모르면 비운다 */
  ownPhotoCount?: number;
  /** 방장일 때 [다른 사람에게 넘기기]. S19 방장 넘기기 대상 선택으로 간다 */
  onHandOver?: () => void;
  /**
   * 사진 줄을 보일지. 사진 기능(S30·S31) 전에는 서버가 사진 지우기를 받지 않아(true면 400) 줄째 숨긴다
   * (동행 명세 FR-025). 보이더라도 지우기는 아직 고를 수 없고 "곧 지원돼요"로 안내한다. 기본 false
   */
  showPhotos?: boolean;
  /**
   * 내 채팅 지우기를 고를 수 있는지. 서버가 받는다(LEAVE_CLEANUP 작업, 202). 기본 true.
   * 혼자 남았을 때는 채팅방이 함께 사라지므로 고르지 않는다
   */
  messageCleanupSupported?: boolean;
  /** useLeaveTrip().isPending */
  loading?: boolean;
  /**
   * 실패하면 leaveTripFailure(useLeaveTrip().error)를 넘긴다. 오류 띠가 뜨고 버튼이 [다시 시도]가 된다.
   * conflict면 부르는 쪽이 여행을 다시 불러와 새 version으로 다시 보낸다.
   */
  failure?: LeaveTripFailure;
};

const FAILURE_TITLE: Record<LeaveTripFailure, string> = {
  error: '나가지 못했어요',
  conflict: '다른 동행이 먼저 바꿨어요',
};

/**
 * S50 여행 나가기 확인. 무엇이 바뀌고 무엇이 남는지 보여 주고 나간다.
 * 여행 설정(S19)에서 연다. 요청과 이동은 부르는 쪽에서 한다.
 *
 * const leave = useLeaveTrip();
 * <LeaveTripSheet
 *   onConfirm={(options) => leave.mutate({ tripId, expectedVersion, ...options }, { onSuccess })}
 *   loading={leave.isPending}
 *   failure={leave.isError ? leaveTripFailure(leave.error) : undefined}
 * />
 *
 * onSuccess(결과): null(이미 나간 여행)이어도 나간 것과 같이 S15 여행 목록으로 간다.
 */
export function LeaveTripSheet({
  visible,
  onClose,
  onConfirm,
  tripTitle,
  nextOwnerName,
  alone = false,
  ownPhotoCount,
  onHandOver,
  showPhotos = false,
  messageCleanupSupported = true,
  loading = false,
  failure,
}: LeaveTripSheetProps) {
  const [deleteOwnMessages, setDeleteOwnMessages] = useState(false);
  const canChooseMessages = messageCleanupSupported && !alone;

  // 다시 열 때마다 지우지 않는 쪽에서 시작한다
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setDeleteOwnMessages(false);
    }
  }

  const photos = ownPhotoCount === undefined ? '사진' : `사진 ${ownPhotoCount}장`;

  return (
    <ConfirmSheet
      visible={visible}
      onClose={onClose}
      onConfirm={() =>
        onConfirm({
          // 사진 지우기는 서버가 아직 받지 않아 언제나 false다
          deleteOwnPhotos: false,
          deleteOwnMessages: canChooseMessages && deleteOwnMessages,
        })
      }
      title={alone ? '혼자 남아서 나가면 여행이 삭제돼요' : `${tripTitle}에서 나갈까요?`}
      // 혼자 남았을 때도 버튼은 "나가기"로 짧게 둔다. 여행이 삭제된다는 것은 제목과 설명이 알려 준다(2026-11-05 사용자 요청)
      confirmLabel={failure ? '다시 시도' : '나가기'}
      confirmIcon={failure ? 'refresh' : 'leave'}
      loading={loading}
      error={failure ? FAILURE_TITLE[failure] : undefined}
      errorDescription="다시 시도해 주세요"
    >
      <View style={styles.subline}>
        <Icon name="info" size={16} color={colors.text.icon} />
        <Text style={[typography.caption, styles.sublineText]}>
          {alone ? (
            // 혼자 남은 사람이 나가면 여행 삭제와 같아 되돌릴 수 없다(동행 명세 FR-027)
            `${tripTitle}의 기록이 모두 지워져요. 되돌릴 수 없어요`
          ) : nextOwnerName ? (
            <>
              {`나가면 ${nextOwnerName}님이 방장이 돼요`}
              {onHandOver ? (
                <>
                  {' · '}
                  <Text
                    accessibilityRole="link"
                    onPress={loading ? undefined : onHandOver}
                    style={styles.link}
                  >
                    다른 사람에게 넘기기
                  </Text>
                </>
              ) : null}
            </>
          ) : (
            '나가면 이렇게 바뀌어요'
          )}
        </Text>
      </View>

      <View style={styles.list}>
        <ChangeRow icon="map-pin" name="지도" description="내 지도에서 이 여행이 빠져요" />
        {showPhotos ? (
          <ChangeRow
            icon="image"
            name="사진"
            description={alone ? '여행 사진이 모두 지워져요' : `올린 ${photos} · ${SOON}`}
            check={
              alone ? null : (
                <RoundCheck
                  checked={false}
                  onChange={() => undefined}
                  disabled
                  accessibilityLabel="내가 올린 사진도 지우기"
                />
              )
            }
          />
        ) : null}
        <ChangeRow
          icon="chat"
          name="채팅"
          description={
            alone
              ? '그룹 채팅방이 사라져요'
              : !canChooseMessages
                ? `보낸 메시지 · ${SOON}`
                : deleteOwnMessages
                  ? '보낸 메시지도 지워요'
                  : '보낸 메시지, 지울지 골라요'
          }
          check={
            alone ? null : (
              <RoundCheck
                checked={canChooseMessages && deleteOwnMessages}
                onChange={setDeleteOwnMessages}
                disabled={!canChooseMessages || loading}
                accessibilityLabel="내가 보낸 메시지도 지우기"
              />
            )
          }
        />
        <ChangeRow
          icon="card"
          name="정산"
          description={alone ? '경비 기록도 함께 지워져요' : '경비 기록은 남아요'}
        />
      </View>
    </ConfirmSheet>
  );
}

function ChangeRow({
  icon,
  name,
  description,
  check,
}: {
  icon: IconName;
  name: string;
  description: string;
  check?: ReactNode;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.iconCircle}>
        <Icon name={icon} size={18} color={colors.text.icon} />
      </View>
      <View style={styles.rowTexts}>
        <Text style={[typography.bodyBold, styles.name]}>{name}</Text>
        <Text style={[typography.caption, styles.description]}>{description}</Text>
      </View>
      {check}
    </View>
  );
}

const styles = StyleSheet.create({
  subline: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  sublineText: { flex: 1, color: colors.text.icon },
  link: { color: colors.brand.primary, textDecorationLine: 'underline' },
  list: { gap: spacing[14] },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 48, gap: spacing[14] },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.surface.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTexts: { flex: 1 },
  name: { color: colors.text.default },
  description: { color: colors.text.icon },
});
