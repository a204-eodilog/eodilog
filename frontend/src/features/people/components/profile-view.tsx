import { SCROLL_DECELERATION } from '@/theme/scroll';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stagger } from '@/components/ui/stagger';
import { Spinner } from '@/components/ui/spinner';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, Button, ErrorState, Header, Icon, KoreaMap } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { SkeletonList } from '@/components/ui/skeleton';
import { useTripPinMap } from '@/features/mypage';
import { colors, layout, radius, spacing, typography } from '@/theme';

import { feedPins, followButtonState, isLocked } from '../people-rules';
import type { PublicProfile, UserFeedCard } from '../types';

import { FollowButton } from './follow-button';

export type ProfileViewProps = {
  state: 'loading' | 'error' | 'ready';
  profile?: PublicProfile;
  feeds: readonly UserFeedCard[];
  /** 공동 피드 받는 중·실패. 빈 목록과 나눠 보인다(!145 리뷰). 없으면 ready */
  feedsState?: 'loading' | 'error' | 'ready';
  onRetryFeeds?: () => void;
  following: boolean;
  onFollow: () => void;
  /** 이 사람이 나에게 보낸 팔로우 요청에 답한다. 없으면 요청 띠를 그리지 않는다 */
  onAnswerRequest?: (accept: boolean) => void;
  /** 요청에 답하는 중 */
  answering?: boolean;
  onFeed: (feedId: string) => void;
  onRetry: () => void;
};

/** N9 다른 사용자 프로필. 공개 계정이거나 팔로잉이면 공동 피드 지도, 비공개면 안내 */
export function ProfileView(props: ProfileViewProps) {
  const p = props.profile;
  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right', 'bottom']}>
      <Header title={p?.nickname} />
      {props.state === 'error' ? (
        <ErrorState title="프로필을 불러오지 못했어요" onRetry={props.onRetry} />
      ) : props.state === 'loading' || !p ? (
        <SkeletonList style={styles.flex} />
      ) : (
        <ScrollView decelerationRate={SCROLL_DECELERATION} contentContainerStyle={styles.content}>
          <Stagger itemStyle={styles.staggerItem}>
            {/* 이 사람이 나를 팔로우하겠다고 요청해 둔 상태면 맨 위에서 바로 답한다 */}
            {p.followedByStatus === 'REQUESTED' && props.onAnswerRequest ? (
              <View style={styles.request}>
                <View style={styles.requestIcon}>
                  <Icon name="person-plus" size={18} color={colors.brand.primary} />
                </View>
                <Text style={styles.requestText} numberOfLines={2}>
                  {p.nickname}님이 팔로우를 요청했어요
                </Text>
                <PressableScale
                  onPress={() => props.onAnswerRequest?.(false)}
                  disabled={props.answering}
                  style={({ pressed }) => [styles.requestNo, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel="팔로우 요청 거절"
                >
                  <Icon name="close" size={18} color={colors.text.sub} />
                </PressableScale>
                <PressableScale
                  onPress={() => props.onAnswerRequest?.(true)}
                  disabled={props.answering}
                  style={({ pressed }) => [styles.requestYes, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel="팔로우 요청 수락"
                >
                  {props.answering ? (
                    <Spinner color={colors.text.inverse} />
                  ) : (
                    <Icon name="check" size={18} color={colors.text.inverse} />
                  )}
                </PressableScale>
              </View>
            ) : null}
            {/* 프로필 카드. 마이페이지와 같은 배치: 얼굴 옆에 숫자 셋, 아래에 이름과 팔로우 */}
            <View style={styles.card}>
              <View style={styles.top}>
                <View style={styles.ring}>
                  <Avatar name={p.nickname} imageUrl={p.profileImageUrl} size={76} />
                </View>
                <View style={styles.stats}>
                  <Stat label="공동 피드" value={isLocked(p) ? undefined : p.feedCount} />
                  <Stat label="팔로워" value={p.followerCount} />
                  <Stat label="팔로잉" value={p.followingCount} />
                </View>
              </View>
              <View style={styles.nameRow}>
                <View style={styles.flex}>
                  <Text style={styles.name} numberOfLines={1}>
                    {p.nickname}
                  </Text>
                  {p.accountVisibility === 'PRIVATE' ? (
                    <View style={styles.private}>
                      <Icon name="lock" size={12} color={colors.text.muted} />
                      <Text style={styles.privateText}>비공개 계정</Text>
                    </View>
                  ) : null}
                </View>
                <FollowButton
                  state={followButtonState(p)}
                  privateAccount={p.accountVisibility === 'PRIVATE'}
                  loading={props.following}
                  onPress={props.onFollow}
                />
              </View>
            </View>
            {isLocked(p) ? (
              <View style={styles.locked}>
                <Text style={styles.lockedTitle}>비공개 계정이에요</Text>
                <Text style={styles.lockedDesc}>팔로우가 수락되면 여행을 볼 수 있어요</Text>
              </View>
            ) : (
              <FeedMap
                feeds={props.feeds}
                state={props.feedsState ?? 'ready'}
                onRetry={props.onRetryFeeds}
                onFeed={props.onFeed}
              />
            )}
          </Stagger>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/** 숫자 한 칸. 서버가 주지 않았거나 볼 수 없으면 줄표 */
function Stat({ label, value }: { label: string; value: number | undefined }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${label} ${value ?? '알 수 없음'}`}>
      <Text style={styles.statValue}>{value ?? '–'}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function FeedMap({
  feeds,
  state,
  onRetry,
  onFeed,
}: {
  feeds: readonly UserFeedCard[];
  state: 'loading' | 'error' | 'ready';
  onRetry?: () => void;
  onFeed: (id: string) => void;
}) {
  const pins = feedPins(state === 'ready' ? feeds : []);
  const map = useTripPinMap(pins, (pin) => onFeed(pin.feedIds[0]));
  if (state !== 'ready') {
    return (
      <View style={[styles.map, styles.mapStatus]}>
        {state === 'loading' ? (
          <Spinner color={colors.brand.primary} />
        ) : (
          <>
            <Text style={styles.lockedDesc}>공동 피드를 불러오지 못했어요</Text>
            {onRetry ? (
              <Button
                label="다시 시도"
                icon="refresh"
                size="sm"
                variant="secondary"
                onPress={onRetry}
              />
            ) : null}
          </>
        )}
      </View>
    );
  }
  return (
    <>
      <View style={styles.map} onLayout={map.onLayout}>
        <KoreaMap
          pins={map.pins}
          interactive={false}
          initialFocus={map.focus}
          focus={map.moveTo}
          creditBottom={spacing[6]}
        />
        {pins.length === 0 ? (
          <View style={styles.mapEmpty} pointerEvents="none">
            <Text style={styles.lockedDesc}>아직 공동 피드가 없어요</Text>
          </View>
        ) : null}
      </View>
      {pins.length > 0 ? (
        <View style={styles.legend}>
          <View style={styles.legendDot} />
          <Text style={styles.legendText}>공동 피드 · 눌러서 보기</Text>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  // 차례로 나타나는 구역을 감싼 칸. 한 구역이 여러 줄이면 그 사이 간격을 스크롤 내용과 같게 둔다
  staggerItem: { gap: spacing[16] },
  screen: { flex: 1, backgroundColor: colors.surface.subtle },
  flex: { flex: 1 },
  content: {
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing[16],
    paddingBottom: spacing[32],
    gap: spacing[16],
  },
  pressed: { opacity: 0.7 },
  card: {
    gap: spacing[14],
    padding: spacing[20],
    borderRadius: radius.xxl,
    backgroundColor: colors.surface.white,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing[12] },
  // 얼굴 둘레의 고리. 내 프로필은 파랑, 남의 프로필은 옅은 회색
  ring: {
    padding: 3,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.line.strong,
  },
  stats: { flex: 1, flexDirection: 'row' },
  stat: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 56 },
  statValue: { ...typography.title2, color: colors.text.default, fontVariant: ['tabular-nums'] },
  statLabel: { ...typography.caption, color: colors.text.sub },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[12] },
  name: { ...typography.title3, color: colors.text.default },
  private: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  privateText: { ...typography.caption, color: colors.text.sub },
  // 받은 팔로우 요청 띠. 연파랑 카드에 글과 거절·수락 동그라미
  request: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[10],
    padding: spacing[12],
    borderRadius: radius.xl,
    backgroundColor: colors.brand.primaryBg,
  },
  requestIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.white,
  },
  requestText: { ...typography.bodyBold, flex: 1, color: colors.text.default },
  requestNo: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.white,
  },
  requestYes: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand.primary,
  },
  locked: { alignItems: 'center', gap: spacing[4], paddingVertical: spacing[8] },
  lockedTitle: { ...typography.bodyBold, color: colors.text.strong },
  lockedDesc: { ...typography.caption, color: colors.text.sub },
  map: {
    height: 250,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line.default,
    overflow: 'hidden',
    backgroundColor: colors.map.seaMid,
  },
  mapEmpty: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  mapStatus: { alignItems: 'center', justifyContent: 'center', gap: spacing[10] },
  legend: { flexDirection: 'row', alignItems: 'center', gap: spacing[6], marginTop: -spacing[8] },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
    backgroundColor: colors.brand.primary,
  },
  legendText: { ...typography.caption, color: colors.text.sub },
});
