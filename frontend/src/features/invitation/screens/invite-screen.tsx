import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type Href, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { celebrate } from '@/components/ui/celebrate';
import { Spinner } from '@/components/ui/spinner';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, ErrorState, Header, Icon, type IconName, toast } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { withRo } from '@/lib/korean';
import { openOverTabs } from '@/lib/open-over-tabs';
import { invalidateAfterJoin } from '@/features/trip/hooks/trip-cache';
import { useSessionStore } from '@/stores/session-store';
import { colors, layout, radius, spacing, typography } from '@/theme';

import { acceptInvitation, getInvitationPreview } from '../api';
import { TripInviteCard } from '../components/trip-invite-card';
import { TRIP_MAX_MEMBERS, invitationProblem, tripHref } from '../invite-rules';

/** 이미 참여한 여행이면 안내를 잠깐 보여 준 뒤 넘어간다 */
const ALREADY_MEMBER_HOLD_MS = 1200;

/**
 * S04 초대 참여 확인. 카카오톡 초대 링크(eodilog://invitations/{token})나 S02 가입 직후에 온다.
 * 상태: 유효 / 무효·만료 / 이미 참여 / 인원 가득 참. 취소·무효면 S05 홈으로.
 * 참여하면 첫 가입(first=1)은 S03 취향 입력, 기존 회원은 여행 상세로 간다.
 */
export function InviteScreen() {
  const { token, first } = useLocalSearchParams<{ token: string; first?: string }>();
  // 다른 링크로 바뀌면 화면 상태(참여 결과 등)를 처음부터 다시 시작한다
  return <InviteContent key={token} token={token} first={first === '1'} />;
}

function InviteContent({ token, first }: { token: string; first: boolean }) {
  const setPendingInvite = useSessionStore((s) => s.setPendingInvite);
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();

  const preview = useQuery({
    queryKey: ['invitation', token],
    queryFn: () => getInvitationPreview(token),
    retry: false,
  });

  // replace를 쓰면 앱을 쓰던 중 링크를 열었을 때 탭 묶음이 하나 더 생긴다. 이미 있는 탭 화면 위로 돌아가 연다
  const leave = (href: Href) => {
    setPendingInvite(null);
    openOverTabs(href);
  };

  const accept = useMutation({
    mutationFn: () => acceptInvitation(token),
    // 첫 가입은 S03으로 가고, 어느 여행에 참여했는지 넘겨 S03 뒤에 그 여행으로 간다. 그 밖에는 바로 그 여행(S17)으로
    onSuccess: (trip) => {
      // 참여하면 서버가 대화방에도 넣는다. 여행 목록·홈·채팅 탭이 새 여행을 바로 보이게 새로 받는다
      void invalidateAfterJoin(queryClient);
      // 새로 참여했을 때만 축하한다. 이미 동행이라 여행으로 넘어가기만 할 때는 하지 않는다
      if (!preview.data?.alreadyMember) celebrate();
      leave(first ? { pathname: '/preferences', params: { tripId: trip.id } } : tripHref(trip.id));
    },
    onError: (error) => {
      // 이미 동행이면 화면이 이동 실패 안내로 바뀐다. 참여하지 못했다는 띠까지 겹쳐 띄우지 않는다
      if (preview.data?.alreadyMember) return;
      if (!invitationProblem(error)) toast.error('참여하지 못했어요. 다시 시도해 주세요');
    },
  });

  // 이미 동행이면 참여 요청을 그대로 보내 여행 id를 받고(바뀌는 것 없음) 잠깐 뒤 여행으로 간다
  const alreadyMember = preview.data?.alreadyMember === true;
  const autoJoined = useRef(false);
  const { mutate: join } = accept;
  useEffect(() => {
    if (!alreadyMember || autoJoined.current) return;
    autoJoined.current = true;
    const timer = setTimeout(() => join(), ALREADY_MEMBER_HOLD_MS);
    return () => clearTimeout(timer);
  }, [alreadyMember, join]);

  const problem = invitationProblem(preview.error) ?? invitationProblem(accept.error);

  if (problem === 'unusable') {
    return (
      <Notice
        icon="link"
        title="초대 링크를 쓸 수 없어요"
        description="새 링크를 받아 주세요"
        onHome={() => leave('/home')}
      />
    );
  }

  if (problem === 'full') {
    return (
      <Notice
        icon="people"
        title="여행 인원이 가득 찼어요"
        description={`한 여행에는 방장 포함 ${TRIP_MAX_MEMBERS}명까지 함께할 수 있어요`}
        onHome={() => leave('/home')}
      />
    );
  }

  if (preview.isPending) {
    return (
      <SafeAreaView style={styles.screen} edges={['left', 'right', 'bottom']}>
        <Header />
        <View style={styles.center}>
          <Spinner color={colors.brand.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (preview.isError) {
    return (
      <SafeAreaView style={styles.screen} edges={['left', 'right', 'bottom']}>
        <Header />
        <ErrorState
          title="초대를 불러오지 못했어요"
          description="연결을 확인하고 다시 시도해 주세요"
          onRetry={() => preview.refetch()}
        />
      </SafeAreaView>
    );
  }

  const { tripTitle, startDate, endDate, inviter } = preview.data;

  // 자동 참여가 실패했다. 예전에는 "이동하는 중"에 머물렀고 이 화면에는 뒤로 갈 길도 없었다(2026-11-10 점검).
  // 자동 요청은 한 번만 보내므로 다시 시도는 사용자가 누른다
  if (alreadyMember && accept.isError) {
    return (
      <Notice
        icon="alert"
        title="여행으로 이동하지 못했어요"
        description="연결을 확인하고 다시 시도해 주세요"
        onRetry={() => accept.mutate()}
        onHome={() => leave('/home')}
      />
    );
  }

  if (alreadyMember) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.notice}>
          <View style={[styles.circle, styles.circleSuccess]}>
            <Icon name="check" size={32} color={colors.status.success} />
          </View>
          <Text style={[typography.title1, styles.noticeTitle]}>이미 참여한 여행이에요</Text>
          <Text style={[typography.body, styles.noticeDescription]}>
            {withRo(tripTitle)} 바로 이동할게요.
          </Text>
          <View style={styles.moving}>
            <Spinner size="small" color={colors.text.icon} />
            <Text style={[typography.caption, styles.noticeDescription]}>이동하는 중</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right']}>
      <Header title="여행 초대" onBack={() => leave('/home')} />
      <View style={styles.content}>
        <View style={styles.inviter}>
          <View style={styles.inviterAvatar} accessibilityLabel={inviter.nickname}>
            <Text style={[typography.title2, styles.inviterInitial]}>
              {inviter.nickname.trim().charAt(0)}
            </Text>
          </View>
          <View style={styles.headline}>
            <Text style={[typography.title1, styles.title]}>
              {inviter.nickname}님이 여행에 초대했어요
            </Text>
            <Text style={[typography.body, styles.subtitle]}>
              장소 모으기부터 코스까지 함께 해요
            </Text>
          </View>
        </View>
        <View style={styles.article}>
          <TripInviteCard title={tripTitle} startDate={startDate} endDate={endDate} />
          <Text style={[typography.caption, styles.publicNote]}>
            동행이 공동 피드로 게시하면 모두에게 공개될 수 있어요
          </Text>
        </View>
      </View>
      {/* 안드로이드 하단 버튼 줄(내비게이션 바) 높이만 주면 버튼이 바에 붙는다. 바 위로 16을 더 띄우고, 바가 없을 때는 원래 최소 여백을 쓴다 */}
      <View
        style={[
          styles.bottom,
          { paddingBottom: Math.max(insets.bottom + spacing[16], spacing[24]) },
        ]}
      >
        <PressableScale
          accessibilityRole="button"
          onPress={() => leave('/home')}
          style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
        >
          <Text style={[typography.bodyMedium, styles.cancelLabel]}>취소</Text>
        </PressableScale>
        <Button
          label="참여하기"
          size="xl"
          loading={accept.isPending}
          onPress={() => accept.mutate()}
          style={styles.join}
        />
      </View>
    </SafeAreaView>
  );
}

/** 가운데 안내 화면(무효·만료, 인원 가득 참, 이동 실패). 회색 동그라미 아이콘 + 제목 + 설명 + 홈으로. onRetry가 있으면 다시 시도가 위에 붙는다 */
function Notice({
  icon,
  title,
  description,
  onRetry,
  onHome,
}: {
  icon: IconName;
  title: string;
  description: string;
  onRetry?: () => void;
  onHome: () => void;
}) {
  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right', 'bottom']}>
      <Header onBack={onHome} />
      <View style={styles.notice}>
        <View style={styles.circle}>
          <Icon name={icon} size={32} color={colors.text.icon} />
        </View>
        <Text style={[typography.title1, styles.noticeTitle]}>{title}</Text>
        <Text style={[typography.body, styles.noticeDescription]}>{description}</Text>
        {onRetry ? (
          <Button label="다시 시도" size="lg" onPress={onRetry} style={styles.home} />
        ) : null}
        <Button
          label="홈으로"
          variant="neutral"
          size="lg"
          onPress={onHome}
          style={onRetry ? styles.homeAfterRetry : styles.home}
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
  inviterAvatar: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.line.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviterInitial: { color: colors.text.strong },
  headline: { gap: spacing[8] },
  title: { color: colors.text.default, letterSpacing: -0.5 },
  subtitle: { color: colors.text.icon, letterSpacing: -0.1 },
  article: { gap: spacing[18] },
  publicNote: { color: colors.text.sub2, fontSize: 13 },
  bottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[10],
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing[12],
  },
  cancel: { height: 48, paddingHorizontal: spacing[16], justifyContent: 'center' },
  cancelLabel: { color: colors.text.icon },
  pressed: { opacity: 0.6 },
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
  circleSuccess: { backgroundColor: colors.status.successBg },
  noticeTitle: { color: colors.text.default, textAlign: 'center', marginTop: spacing[20] },
  noticeDescription: { color: colors.text.icon, textAlign: 'center', marginTop: spacing[8] },
  moving: { flexDirection: 'row', alignItems: 'center', gap: spacing[10], marginTop: spacing[24] },
  // Button은 기본이 왼쪽 붙음(alignSelf flex-start)이라 가운데로 다시 맞춘다
  home: { alignSelf: 'center', marginTop: spacing[24] },
  homeAfterRetry: { alignSelf: 'center', marginTop: spacing[8] },
});
