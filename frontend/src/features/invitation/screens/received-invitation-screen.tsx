import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Avatar,
  Button,
  ConfirmSheet,
  ErrorState,
  Header,
  Icon,
  type IconName,
  toast,
} from '@/components/ui';
import { celebrate } from '@/components/ui/celebrate';
import { Spinner } from '@/components/ui/spinner';
import { openOverTabs } from '@/lib/open-over-tabs';
import { colors, layout, radius, spacing, typography } from '@/theme';

import { TripInviteCard } from '../components/trip-invite-card';
import { useAnswerInvitation, useReceivedInvitation } from '../hooks/use-received-invitations';
import { TRIP_MAX_MEMBERS } from '../invite-rules';
import { openJoinedTrip } from '../open-joined-trip';
import { acceptProblem, expiresLabel, receivedView } from '../received-invitation-rules';

/**
 * 앱 안에서 받은 여행 초대(TRIP_INVITED 알림에서 온다). 초대한 친구·여행 카드를 보여 주고 참여하거나 거절한다.
 * 링크 초대(S04)와 같은 카드 모양을 쓴다
 */
export function ReceivedInvitationScreen() {
  const { invitationId } = useLocalSearchParams<{ invitationId: string }>();
  const insets = useSafeAreaInsets();
  const invitation = useReceivedInvitation(invitationId);
  const { accept, decline } = useAnswerInvitation();
  const [confirmDecline, setConfirmDecline] = useState(false);

  // 알림에서 왔으면 뒤로, 바로 열었으면 홈으로
  const close = () => (router.canGoBack() ? router.back() : openOverTabs('/home'));

  const join = () =>
    accept.mutate(invitationId, {
      onSuccess: (trip) => {
        if (!invitation.data?.alreadyMember) celebrate();
        openJoinedTrip(trip.id);
      },
      onError: (error) => {
        if (!acceptProblem(error)) toast.error('참여하지 못했어요. 다시 시도해 주세요');
      },
    });

  const problem = acceptProblem(accept.error);

  if (invitation.isPending) {
    return (
      <SafeAreaView style={styles.screen} edges={['left', 'right', 'bottom']}>
        <Header />
        <View style={styles.center}>
          <Spinner color={colors.brand.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (invitation.isError) {
    const notFound = acceptProblem(invitation.error) === 'notFound';
    return notFound ? (
      <Notice
        icon="link"
        title="찾을 수 없는 초대예요"
        description="여행이 삭제됐을 수 있어요"
        onClose={close}
      />
    ) : (
      <SafeAreaView style={styles.screen} edges={['left', 'right', 'bottom']}>
        <Header />
        <ErrorState
          title="초대를 불러오지 못했어요"
          description="연결을 확인하고 다시 시도해 주세요"
          onRetry={() => invitation.refetch()}
        />
      </SafeAreaView>
    );
  }

  const data = invitation.data;
  const view =
    problem === 'expired' ? 'expired' : problem === 'closed' ? 'closed' : receivedView(data);

  if (problem === 'full') {
    return (
      <Notice
        icon="people"
        title="여행 인원이 가득 찼어요"
        description={`한 여행에는 방장 포함 ${TRIP_MAX_MEMBERS}명까지 함께할 수 있어요`}
        onClose={close}
      />
    );
  }
  if (view === 'expired') {
    return (
      <Notice
        icon="clock"
        title="초대 기간이 지났어요"
        description="동행에게 다시 초대를 받아 주세요"
        onClose={close}
      />
    );
  }
  if (view === 'closed') {
    return (
      <Notice
        icon="link"
        title="더 이상 쓸 수 없는 초대예요"
        description="초대가 취소됐거나 이미 답한 초대예요"
        onClose={close}
      />
    );
  }

  const { trip, inviter } = data;
  const member = view === 'member';

  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right']}>
      <Header title="여행 초대" onBack={close} />
      <View style={styles.content}>
        <View style={styles.inviter}>
          <Avatar name={inviter.nickname} imageUrl={inviter.profileImageUrl} size={56} />
          <View style={styles.headline}>
            <Text style={[typography.title1, styles.title]}>
              {member ? '이미 함께하는 여행이에요' : `${inviter.nickname}님이 여행에 초대했어요`}
            </Text>
            <Text style={[typography.body, styles.subtitle]}>
              {member
                ? '여행으로 바로 갈 수 있어요'
                : `지금 ${trip.memberCount}명이 함께하고 있어요 · ${expiresLabel(data.expiresAt)}`}
            </Text>
          </View>
        </View>
        <TripInviteCard title={trip.title} startDate={trip.startDate} endDate={trip.endDate} />
      </View>
      <View
        style={[
          styles.bottom,
          { paddingBottom: Math.max(insets.bottom + spacing[16], spacing[24]) },
        ]}
      >
        {member ? (
          <Button
            label="여행 보기"
            icon="trip"
            size="xl"
            onPress={() => openJoinedTrip(trip.id)}
            style={styles.join}
          />
        ) : (
          <>
            <Button
              label="거절"
              variant="neutral"
              size="xl"
              disabled={accept.isPending}
              onPress={() => setConfirmDecline(true)}
            />
            <Button
              label="참여하기"
              icon="check"
              size="xl"
              loading={accept.isPending}
              onPress={join}
              style={styles.join}
            />
          </>
        )}
      </View>

      <ConfirmSheet
        visible={confirmDecline}
        onClose={() => setConfirmDecline(false)}
        title="초대를 거절할까요?"
        description="초대한 사람에게 알리지 않아요"
        confirmLabel="거절하기"
        confirmIcon="close"
        onConfirm={() => {
          setConfirmDecline(false);
          decline.mutate(invitationId, {
            onSuccess: () => {
              toast.success('초대를 거절했어요');
              close();
            },
            onError: () => toast.error('거절하지 못했어요. 다시 시도해 주세요'),
          });
        }}
      />
    </SafeAreaView>
  );
}

function Notice({
  icon,
  title,
  description,
  onClose,
}: {
  icon: IconName;
  title: string;
  description: string;
  onClose: () => void;
}) {
  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right', 'bottom']}>
      <Header onBack={onClose} />
      <View style={styles.notice}>
        <View style={styles.circle}>
          <Icon name={icon} size={32} color={colors.text.icon} />
        </View>
        <Text style={[typography.title1, styles.noticeTitle]}>{title}</Text>
        <Text style={[typography.body, styles.noticeDescription]}>{description}</Text>
        <Button
          label="닫기"
          variant="neutral"
          size="lg"
          onPress={onClose}
          style={styles.closeButton}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: {
    flex: 1,
    paddingHorizontal: layout.screenPaddingX,
    paddingVertical: spacing[24],
    gap: spacing[28],
  },
  inviter: { gap: spacing[24] },
  headline: { gap: spacing[8] },
  title: { color: colors.text.default, letterSpacing: -0.5 },
  subtitle: { color: colors.text.icon, letterSpacing: -0.1 },
  bottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[10],
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing[12],
  },
  join: { flex: 1, borderRadius: radius.lg },
  notice: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingBottom: 110,
  },
  circle: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: colors.surface.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeTitle: { color: colors.text.default, textAlign: 'center', marginTop: spacing[20] },
  noticeDescription: { color: colors.text.icon, textAlign: 'center', marginTop: spacing[8] },
  closeButton: { alignSelf: 'center', marginTop: spacing[24] },
});
