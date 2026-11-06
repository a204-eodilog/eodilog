import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, ErrorState, Header, KoreaMap } from '@/components/ui';
import { useTripPinMap } from '@/features/mypage';
import { colors, layout, radius, spacing, typography } from '@/theme';

import { feedPins, followButtonState, isLocked, profileStats } from '../people-rules';
import type { PublicProfile, UserFeedCard } from '../types';

import { FollowButton } from './follow-button';

export type ProfileViewProps = {
  state: 'loading' | 'error' | 'ready';
  profile?: PublicProfile;
  feeds: readonly UserFeedCard[];
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
        <ActivityIndicator style={styles.flex} color={colors.brand.primary} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.profile}>
            <Avatar name={p.nickname} imageUrl={p.profileImageUrl} size={48} me />
            <View style={styles.profileText}>
              <Text style={styles.name}>{p.nickname}</Text>
              <Text style={styles.stats}>{profileStats(p, isLocked(p))}</Text>
            </View>
          </View>
          <View style={styles.follow}>
            <FollowButton
              state={followButtonState(p)}
              privateAccount={p.accountVisibility === 'PRIVATE'}
              loading={props.following}
              onPress={props.onFollow}
            />
          </View>
          {isLocked(p) ? (
            <View style={styles.locked}>
              <Text style={styles.lockedTitle}>비공개 계정이에요</Text>
              <Text style={styles.lockedDesc}>팔로우가 수락되면 여행을 볼 수 있어요</Text>
            </View>
          ) : (
            <FeedMap feeds={props.feeds} onFeed={props.onFeed} />
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function FeedMap({
  feeds,
  onFeed,
}: {
  feeds: readonly UserFeedCard[];
  onFeed: (id: string) => void;
}) {
  const pins = feedPins(feeds);
  const map = useTripPinMap(pins, (pin) => onFeed(pin.feedIds[0]));
  return (
    <>
      <View style={styles.map} onLayout={map.onLayout}>
        <KoreaMap
          pins={map.pins}
          interactive={false}
          initialFocus={map.focus}
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
  screen: { flex: 1, backgroundColor: colors.surface.white },
  flex: { flex: 1 },
  content: {
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing[16],
    paddingBottom: spacing[32],
    gap: spacing[16],
  },
  profile: { flexDirection: 'row', alignItems: 'center', gap: spacing[14] },
  profileText: { flex: 1, minWidth: 0, gap: 2 },
  name: { ...typography.title2, color: colors.text.default },
  stats: { ...typography.caption, color: colors.text.sub },
  follow: { flexDirection: 'row' },
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
  legend: { flexDirection: 'row', alignItems: 'center', gap: spacing[6], marginTop: -spacing[8] },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
    backgroundColor: colors.brand.primary,
  },
  legendText: { ...typography.caption, color: colors.text.sub },
});
