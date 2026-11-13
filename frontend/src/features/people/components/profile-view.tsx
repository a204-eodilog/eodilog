import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stagger } from '@/components/ui/stagger';
import { Spinner } from '@/components/ui/spinner';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, Button, ErrorState, Header, KoreaMap } from '@/components/ui';
import { SkeletonList } from '@/components/ui/skeleton';
import { useTripPinMap } from '@/features/mypage';
import { colors, layout, radius, spacing, typography } from '@/theme';

import { feedPins, followButtonState, isLocked, profileStats } from '../people-rules';
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
        <ScrollView contentContainerStyle={styles.content}>
          <Stagger itemStyle={styles.staggerItem}>
            {/* 프로필 카드. 파랑 띠 위에 얼굴이 걸치고, 이름·숫자·팔로우가 가운데에 모인다 */}
            <View style={styles.card}>
              <View style={styles.band} />
              <View style={styles.face}>
                <Avatar name={p.nickname} imageUrl={p.profileImageUrl} size={76} />
              </View>
              <Text style={styles.name} numberOfLines={1}>
                {p.nickname}
              </Text>
              <Text style={styles.stats}>{profileStats(p, isLocked(p))}</Text>
              <View style={styles.follow}>
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
  card: {
    alignItems: 'center',
    paddingBottom: spacing[20],
    borderRadius: radius.xxl,
    overflow: 'hidden',
    backgroundColor: colors.surface.white,
  },
  band: { alignSelf: 'stretch', height: 72, backgroundColor: colors.brand.primary },
  // 얼굴이 띠에 반쯤 걸친다. 흰 테두리로 띠와 나눈다
  face: {
    marginTop: -42,
    padding: 4,
    borderRadius: radius.full,
    backgroundColor: colors.surface.white,
  },
  name: { ...typography.title1, color: colors.text.default, marginTop: spacing[8] },
  stats: { ...typography.caption, color: colors.text.sub, marginTop: spacing[2] },
  follow: { marginTop: spacing[14] },
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
