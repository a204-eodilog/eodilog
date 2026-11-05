import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConfirmSheet, ErrorState, Header, Icon, toast, type IconName } from '@/components/ui';
import { useMe } from '@/hooks/use-me';
import { colors, layout, radius, spacing, typography } from '@/theme';

import { canInvite, memberActionFailure, memberLabel, TRIP_CAPACITY } from '../companion-rules';
import { MemberRow } from '../components/member-row';
import { TripGoneState } from '../components/trip-gone-state';
import { useInviteLink } from '../hooks/use-invite-link';
import { useTrip } from '../hooks/use-trip';
import { inviteExpiryLabel } from '../invite-storage';

/** 안드로이드 13(API 33)부터는 클립보드에 복사하면 시스템이 확인 안내를 띄운다 */
const systemShowsCopyNotice = Platform.OS === 'android' && Number(Platform.Version) >= 33;

/**
 * S18 초대 링크 공유. 동행 누구나 링크를 만들어 카카오톡으로 보내거나 복사한다.
 * 화면에 들어올 때 링크를 만들지 않는다. 이 기기에서 만든 링크만 다시 보여 준다(research R1·R13).
 * 이름이 A 담당 S04 화면(features/invitation)과 겹치지 않게 TripInviteScreen으로 내보낸다.
 */
export function TripInviteScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const insets = useSafeAreaInsets();
  const { data: trip, isPending, isError, notFound, refetch } = useTrip(tripId);
  const { data: me } = useMe();
  // 링크 취소는 화면에서 뺐다(2026-11-05 사용자 요청). 새로 만들면 전 링크가 무효가 되어 같은 일을 한다
  const { link, isLoading: linkLoading, create } = useInviteLink(tripId);
  const [confirm, setConfirm] = useState(false);

  if (isPending || linkLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brand.primary} />
      </View>
    );
  }

  if (notFound || (isError && !trip)) {
    return (
      <View style={styles.screen}>
        <Header title="동행 초대" largeTitle />
        {notFound ? <TripGoneState /> : <ErrorState onRetry={() => refetch()} />}
      </View>
    );
  }
  if (!trip) return null;

  // 만들기 요청이 이 여행에서 빠졌다고 답하면 같은 안내를 보인다
  const gone = !!create.error && memberActionFailure(create.error) === 'tripGone';
  if (gone) {
    return (
      <View style={styles.screen}>
        <Header title="동행 초대" largeTitle />
        <TripGoneState />
      </View>
    );
  }

  const full = !canInvite(trip.members.length);
  const members = [...trip.members].sort((a, b) => a.joinOrder - b.joinOrder);
  const busy = create.isPending;
  const canShare = !!link && !full && !busy;

  const share = async () => {
    if (!link) return;
    try {
      await Share.share({ message: `${trip.title}에 함께 가요\n${link.url}` });
    } catch {
      // 공유 창을 닫거나 취소해도 오류로 보지 않는다
    }
  };

  const copy = async () => {
    if (!link) return;
    await Clipboard.setStringAsync(link.url);
    // 안드로이드 13 이상은 시스템이 "클립보드에 복사했어요"를 직접 띄운다. 앱 안내까지 띄우면 두 번 보이므로
    // 그때는 앱 안내를 띄우지 않는다(안드로이드 개발 가이드 '복사 확인 중복 피하기')
    if (!systemShowsCopyNotice) toast.success('링크를 복사했어요');
  };

  const makeLink = () => create.mutate();

  const failure = create.isError ? '링크를 만들지 못했어요' : null;

  return (
    <View style={styles.screen}>
      <Header title="동행 초대" largeTitle />
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing[24] }]}
      >
        <View style={styles.tripLine}>
          <View style={styles.tripName}>
            <Icon name="trip" size={20} color={colors.text.icon} />
            <Text style={[typography.body, styles.tripTitle]} numberOfLines={1}>
              {trip.title}
            </Text>
          </View>
          {link ? (
            <View style={styles.expiry}>
              <Icon name="clock" size={16} color={colors.text.icon} />
              <Text style={[typography.caption, styles.subText]}>
                {inviteExpiryLabel(link.expiresAt)}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.shareRow}>
          <ShareButton
            label="카카오톡"
            icon="chat"
            background={colors.external.kakao}
            iconColor={colors.external.black}
            disabled={!canShare}
            onPress={share}
          />
          <ShareButton
            label="링크 복사"
            icon="copy"
            background={colors.surface.default}
            iconColor={colors.text.icon}
            disabled={!canShare}
            onPress={copy}
          />
        </View>

        {full ? (
          <View style={styles.notice} accessibilityLiveRegion="polite">
            <Icon name="info" size={16} color={colors.text.icon} />
            <Text style={[typography.caption, styles.noticeText]}>
              인원이 가득 찼어요. 누가 나가야 새로 들어올 수 있어요
            </Text>
          </View>
        ) : null}

        {failure ? (
          <View style={styles.failure} accessibilityLiveRegion="polite">
            <Icon name="alert" size={16} color={colors.status.danger} />
            <Text style={[typography.caption, styles.failureText]}>
              {failure}. 다시 시도해 주세요
            </Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.sectionLabel}>
            <Icon name="link" size={16} color={colors.text.icon} />
            <Text style={[typography.captionMedium, styles.subText]}>초대 링크</Text>
          </View>
          {/* 링크 취소·새 링크 만들기 글 버튼 대신 링크 칸 오른쪽 아이콘 하나로 둔다(2026-11-05 사용자 요청).
              링크가 없으면 더하기(바로 만들기), 있으면 새로고침(확인 뒤 새로 만들기) */}
          <View style={styles.linkBox}>
            {create.isPending ? (
              <ActivityIndicator color={colors.brand.primary} style={styles.grow} />
            ) : (
              <Text
                style={[typography.body, styles.grow, link ? styles.linkText : styles.linkEmpty]}
                numberOfLines={1}
              >
                {link ? link.url : '아직 만든 링크가 없어요'}
              </Text>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={link ? '새 링크 만들기' : '링크 만들기'}
              accessibilityState={{ disabled: busy || full }}
              disabled={busy || full}
              onPress={link ? () => setConfirm(true) : makeLink}
              hitSlop={spacing[8]}
              style={({ pressed }) => [styles.linkIcon, (pressed || busy || full) && styles.dim]}
            >
              <Icon name={link ? 'refresh' : 'plus'} size={20} color={colors.brand.primary} />
            </Pressable>
          </View>
        </View>

        <View style={styles.members}>
          <View style={styles.membersHead}>
            <Text style={[typography.title3, styles.membersTitle]}>함께하는 사람</Text>
            <Text style={[typography.caption, styles.subText]}>
              {trip.members.length}/{TRIP_CAPACITY}명
            </Text>
          </View>
          {members.map((m) => (
            <MemberRow key={m.id} member={m} labels={memberLabel(m, trip, me?.id)} />
          ))}
        </View>
      </ScrollView>

      <ConfirmSheet
        visible={confirm}
        onClose={() => setConfirm(false)}
        title="새 링크를 만들까요?"
        description="새로 만들면 전에 보낸 링크로는 들어올 수 없어요"
        confirmLabel="새로 만들기"
        confirmIcon="refresh"
        onConfirm={() => {
          setConfirm(false);
          makeLink();
        }}
      />
    </View>
  );
}

function ShareButton({
  label,
  icon,
  background,
  iconColor,
  disabled,
  onPress,
}: {
  label: string;
  icon: IconName;
  background: string;
  iconColor: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.shareButton, (pressed || disabled) && styles.dim]}
    >
      <View style={[styles.shareCircle, { backgroundColor: background }]}>
        <Icon name={icon} size={22} color={iconColor} />
      </View>
      <Text style={[typography.captionMedium, styles.shareLabel]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // 피그마 S18: 위 16, 묶음 사이 28
  body: { paddingHorizontal: layout.screenPaddingX, paddingTop: spacing[16], gap: spacing[28] },
  // 피그마는 이름 옆에 만료 날짜를 둔다. 이름이 길면 이름을 자르지 않고 만료 날짜를 다음 줄로 내린다
  tripLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: spacing[14],
    rowGap: spacing[4],
  },
  tripName: { flexDirection: 'row', alignItems: 'center', gap: spacing[6], maxWidth: '100%' },
  tripTitle: { flexShrink: 1, color: colors.text.default },
  expiry: { flexDirection: 'row', alignItems: 'center', gap: spacing[6] },
  // 피그마 S18 보조 글자·아이콘은 text.icon(#4A5260)
  subText: { color: colors.text.icon },
  shareRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing[32] },
  shareButton: { alignItems: 'center', gap: spacing[10] },
  shareCircle: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareLabel: { color: colors.text.default },
  dim: { opacity: 0.4 },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[6],
    padding: spacing[12],
    borderRadius: radius.md,
    backgroundColor: colors.surface.subtle,
  },
  noticeText: { flex: 1, color: colors.text.icon },
  failure: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[6],
    padding: spacing[12],
    borderRadius: radius.md,
    backgroundColor: colors.status.dangerBg,
  },
  failureText: { flex: 1, color: colors.status.danger },
  section: { gap: spacing[12] },
  // 피그마 S18 함께하는 사람: 제목과 목록 사이 8
  members: { gap: spacing[8] },
  sectionLabel: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  grow: { flex: 1 },
  linkBox: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[8],
    paddingLeft: spacing[16],
    paddingRight: spacing[4],
    borderRadius: radius.md,
    backgroundColor: colors.surface.default,
  },
  linkText: { color: colors.text.default },
  linkEmpty: { color: colors.text.muted },
  // 아이콘 버튼 누르는 칸 44
  linkIcon: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  membersHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  membersTitle: { color: colors.text.default },
});
