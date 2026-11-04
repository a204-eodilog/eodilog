import { useMutation, useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, ErrorState, Header, Icon, type IconName, toast } from '@/components/ui';
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
  const insets = useSafeAreaInsets();

  const preview = useQuery({
    queryKey: ['invitation', token],
    queryFn: () => getInvitationPreview(token),
    retry: false,
  });

  const leave = (href: ReturnType<typeof tripHref>) => {
    setPendingInvite(null);
    router.replace(href);
  };

  const accept = useMutation({
    mutationFn: () => acceptInvitation(token),
    onSuccess: (trip) => leave(first ? '/preferences' : tripHref(trip.id)),
    onError: (error) => {
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
      <SafeAreaView style={styles.screen}>
        <Header />
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (preview.isError) {
    return (
      <SafeAreaView style={styles.screen}>
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

  if (alreadyMember) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.notice}>
          <View style={[styles.circle, styles.circleSuccess]}>
            <Icon name="check" size={32} color={colors.status.success} />
          </View>
          <Text style={[typography.title1, styles.noticeTitle]}>이미 참여한 여행이에요</Text>
          <Text style={[typography.body, styles.noticeDescription]}>
            {tripTitle}(으)로 바로 이동할게요.
          </Text>
          <View style={styles.moving}>
            <ActivityIndicator size="small" color={colors.text.icon} />
            <Text style={[typography.caption, styles.noticeDescription]}>이동하는 중</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
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
      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, spacing[24]) }]}>
        <Pressable
          accessibilityRole="button"
          onPress={() => leave('/home')}
          style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
        >
          <Text style={[typography.bodyMedium, styles.cancelLabel]}>취소</Text>
        </Pressable>
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

/** 가운데 안내 화면(무효·만료, 인원 가득 참). 회색 동그라미 아이콘 + 제목 + 설명 + 홈으로 */
function Notice({
  icon,
  title,
  description,
  onHome,
}: {
  icon: IconName;
  title: string;
  description: string;
  onHome: () => void;
}) {
  return (
    <SafeAreaView style={styles.screen}>
      <Header onBack={onHome} />
      <View style={styles.notice}>
        <View style={styles.circle}>
          <Icon name={icon} size={32} color={colors.text.icon} />
        </View>
        <Text style={[typography.title1, styles.noticeTitle]}>{title}</Text>
        <Text style={[typography.body, styles.noticeDescription]}>{description}</Text>
        <Button label="홈으로" variant="neutral" size="lg" onPress={onHome} style={styles.home} />
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
  home: { marginTop: spacing[24] },
});
