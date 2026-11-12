import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Spinner } from '@/components/ui/spinner';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Avatar,
  Button,
  Card,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  Header,
  Icon,
  Tag,
} from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { SkeletonList } from '@/components/ui/skeleton';
import { requestDate, type FriendsAction } from '@/features/friends/friends-rules';
import type { Follow, FriendsBoard } from '@/features/friends/types';
import { colors, layout, radius, size, spacing, typography } from '@/theme';

export type FriendsTab = 'following' | 'followers';
export type FriendsViewProps = {
  board: FriendsBoard;
  loading?: boolean;
  error?: boolean;
  retry: () => void;
  pendingIds: string[];
  accepted?: Follow | null;
  onAction: (action: FriendsAction) => Promise<boolean>;
  /** 사람 줄을 누르면 그 사람(요청은 보낸 사람, 팔로잉은 받는 사람, 팔로워는 보낸 사람) */
  onPerson: (person: Follow['follower']) => void;
  onFind: () => void;
  initialTab?: FriendsTab;
  initialConfirm?: Follow;
  /** API 계약에 없는 여행 정보는 개발 미리보기에서만 전달한다. */
  previewTrips?: Record<string, string>;
  controls?: ReactNode;
};

export function FriendsView({
  board,
  loading,
  error,
  retry,
  pendingIds,
  accepted,
  onAction,
  onPerson,
  onFind,
  initialTab = 'following',
  initialConfirm,
  previewTrips,
  controls,
}: FriendsViewProps) {
  const [tab, setTab] = useState<FriendsTab>(initialTab);
  const [confirm, setConfirm] = useState<{ follow: Follow; kind: 'unfollow' | 'remove' } | null>(
    initialConfirm ? { follow: initialConfirm, kind: 'unfollow' } : null,
  );
  const insets = useSafeAreaInsets();
  const rows = board[tab];
  const allEmpty =
    board.followers.length === 0 && board.following.length === 0 && board.requests.length === 0;
  const act = async (kind: FriendsAction['kind'], follow: Follow) => {
    const success = await onAction({ kind, follow, at: new Date().toISOString() });
    if (success && kind === 'accept') setTab('followers');
  };
  const confirmationName = confirm
    ? confirm.kind === 'unfollow'
      ? confirm.follow.followee.nickname
      : confirm.follow.follower.nickname
    : '';
  return (
    <View style={styles.screen}>
      <Header title="친구" />
      {controls}
      {loading ? (
        <SkeletonList accessibilityLabel="친구 목록 불러오는 중" style={styles.fill} />
      ) : error ? (
        <ErrorState title="친구 목록을 불러오지 못했어요" onRetry={retry} />
      ) : allEmpty ? (
        <EmptyState
          title="아직 팔로우한 사람이 없어요"
          description="닉네임으로 찾아 팔로우해 보세요"
          icon="people"
          actionLabel="친구 찾기"
          onAction={onFind}
        />
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Math.max(insets.bottom, spacing[24]) },
          ]}
        >
          <Card onPress={onFind} accessibilityLabel="친구 찾기" style={styles.find}>
            <View style={styles.findIcon}>
              <Icon name="people" size={size.icon.md} color={colors.brand.primary} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.name}>친구 찾기</Text>
              <Text style={styles.caption}>추천 친구와 닉네임 검색</Text>
            </View>
            <Icon name="chevron-right" size={size.icon.sm} color={colors.text.muted} />
          </Card>
          {board.requests.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.heading}>받은 팔로우 요청 {board.requests.length}</Text>
              {board.requests.map((follow) => (
                <View key={follow.id} style={styles.request}>
                  <PressableScale
                    accessibilityRole="button"
                    accessibilityLabel={follow.follower.nickname + ' 프로필'}
                    onPress={() => onPerson(follow.follower)}
                    disabled={pendingIds.includes(follow.follower.id)}
                    style={styles.person}
                  >
                    <Avatar
                      name={follow.follower.nickname}
                      imageUrl={follow.follower.profileImageUrl}
                      size="lg"
                    />
                    <View style={styles.flex}>
                      <Text numberOfLines={1} style={styles.name}>
                        {follow.follower.nickname}
                      </Text>
                      <Text style={styles.caption}>
                        팔로우 요청 · {requestDate(follow.requestedAt)}
                      </Text>
                    </View>
                  </PressableScale>
                  <View style={styles.actions}>
                    <Button
                      label="거절"
                      size="sm"
                      variant="neutral"
                      style={styles.reject}
                      disabled={pendingIds.includes(follow.follower.id)}
                      onPress={() => void act('reject', follow)}
                    />
                    <Button
                      label="수락"
                      size="sm"
                      style={styles.action}
                      disabled={pendingIds.includes(follow.follower.id)}
                      leading={
                        <Icon name="check" size={size.icon.sm} color={colors.text.inverse} />
                      }
                      onPress={() => void act('accept', follow)}
                    />
                  </View>
                </View>
              ))}
              <View style={styles.notice}>
                <Icon name="lock" size={size.icon.sm} color={colors.text.icon} />
                <Text style={[styles.caption, styles.flex]}>
                  수락해도 여행 그룹·채팅은 공개되지 않아요
                </Text>
              </View>
            </View>
          ) : null}
          {accepted ? (
            <Card>
              <View style={styles.notice}>
                <Icon name="lock" size={size.icon.sm} color={colors.text.icon} />
                <Text style={[styles.name, styles.flex]}>
                  {accepted.follower.nickname}님에게 자동으로 열리지 않아요
                </Text>
              </View>
              <Text style={styles.caption}>여행 그룹과 채팅 이력은 그대로 닫혀 있어요</Text>
            </Card>
          ) : null}
          <View accessibilityRole="tablist" style={styles.tabs}>
            {(['following', 'followers'] as const).map((key, order) => (
              <PressableScale
                appear={order}
                appearFrom="pop"
                key={key}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === key }}
                onPress={() => setTab(key)}
                style={[styles.tab, tab === key && styles.selectedTab]}
              >
                <Text style={[styles.name, tab === key && styles.selectedText]}>
                  {key === 'following' ? '팔로잉' : '팔로워'}{' '}
                  <Text style={styles.caption}>{board[key].length}</Text>
                </Text>
              </PressableScale>
            ))}
          </View>
          <View style={styles.peopleSection}>
            <View style={styles.listHeading}>
              <Text style={styles.heading}>
                {tab === 'following' ? '팔로잉' : '팔로워'} {rows.length}
              </Text>
              <Text style={styles.caption}>
                {tab === 'followers'
                  ? '나를 팔로우하는 사람'
                  : previewTrips
                    ? '함께 간 여행과 동행 중인 여행'
                    : ''}
              </Text>
            </View>
            {rows.length === 0 ? (
              <View style={styles.emptyList}>
                <EmptyState
                  icon="people"
                  title={
                    tab === 'following' ? '아직 팔로우한 사람이 없어요' : '아직 팔로워가 없어요'
                  }
                  description={
                    tab === 'following'
                      ? '닉네임으로 찾아 팔로우해 보세요'
                      : '나를 팔로우하는 사람이 여기에 보여요'
                  }
                />
              </View>
            ) : (
              rows.map((follow) => {
                const person = tab === 'following' ? follow.followee : follow.follower;
                const fresh = tab === 'followers' && accepted?.follower.id === person.id;
                const blocked = pendingIds.includes(person.id);
                return (
                  <View key={follow.id} style={styles.row}>
                    <PressableScale
                      style={[styles.person, styles.flex]}
                      accessibilityRole="button"
                      accessibilityLabel={person.nickname + ' 프로필'}
                      disabled={blocked}
                      onPress={() => onPerson(person)}
                    >
                      <Avatar name={person.nickname} imageUrl={person.profileImageUrl} size="lg" />
                      <View style={styles.flex}>
                        <View style={styles.names}>
                          <Text style={[styles.name, styles.shrink]} numberOfLines={1}>
                            {person.nickname}
                          </Text>
                          {fresh ? <Tag label="새 팔로워" tone="brand" /> : null}
                        </View>
                        {fresh ? (
                          <Text style={styles.caption}>
                            {requestDate(follow.acceptedAt ?? follow.requestedAt)}부터 나를
                            팔로우해요
                          </Text>
                        ) : previewTrips?.[person.id] ? (
                          <Text style={styles.caption}>{previewTrips[person.id]}</Text>
                        ) : null}
                      </View>
                    </PressableScale>
                    <PressableScale
                      style={styles.more}
                      accessibilityRole="button"
                      accessibilityLabel={
                        person.nickname + (tab === 'following' ? ' 팔로우 해제' : ' 팔로워 삭제')
                      }
                      accessibilityState={{ disabled: blocked }}
                      disabled={blocked}
                      onPress={() =>
                        setConfirm({ follow, kind: tab === 'following' ? 'unfollow' : 'remove' })
                      }
                    >
                      {blocked ? (
                        <Spinner color={colors.brand.primary} />
                      ) : (
                        <Icon name="more" size={22} color={colors.text.default} />
                      )}
                    </PressableScale>
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      )}
      <ConfirmSheet
        visible={confirm !== null}
        onClose={() => setConfirm(null)}
        title={
          confirmationName +
          (confirm?.kind === 'remove' ? '님을 팔로워에서 삭제할까요?' : '님 팔로우를 끊을까요?')
        }
        description={
          confirm?.kind === 'remove'
            ? '나를 향한 팔로우만 해제돼요. 함께한 여행은 유지돼요'
            : '이 사람의 여행을 더 이상 팔로우하지 않아요. 함께한 여행은 유지돼요'
        }
        confirmLabel={confirm?.kind === 'remove' ? '팔로워 삭제' : '팔로우 해제'}
        onConfirm={() => {
          if (!confirm) return;
          const action = confirm;
          setConfirm(null);
          void act(action.kind, action.follow);
        }}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  fill: { flex: 1 },
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  content: { paddingHorizontal: layout.screenPaddingX, paddingTop: spacing[16], gap: spacing[24] },
  find: { flexDirection: 'row', alignItems: 'center', gap: spacing[16] },
  findIcon: {
    width: size.avatar.lg,
    height: size.avatar.lg,
    borderRadius: radius.full,
    backgroundColor: colors.brand.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { ...typography.bodyBold, color: colors.text.default },
  heading: { ...typography.title3, color: colors.text.default },
  caption: { ...typography.caption, color: colors.text.icon },
  section: { gap: spacing[12] },
  peopleSection: { gap: spacing[20] },
  request: {
    backgroundColor: colors.brand.primaryBg,
    borderRadius: radius.lg,
    padding: spacing[20],
    gap: spacing[20],
  },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[14],
    minHeight: layout.minTouchTarget,
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing[8] },
  action: { height: layout.minTouchTarget },
  reject: { height: layout.minTouchTarget, backgroundColor: colors.surface.white },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[8] },
  tabs: { flexDirection: 'row', gap: spacing[8] },
  tab: {
    flex: 1,
    minHeight: layout.minTouchTarget,
    borderRadius: radius.md,
    backgroundColor: colors.surface.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedTab: { backgroundColor: colors.brand.primaryLight },
  selectedText: { color: colors.brand.primaryDark },
  listHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[8],
    flexWrap: 'wrap',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[8] },
  names: { flexDirection: 'row', alignItems: 'center', gap: spacing[8] },
  more: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyList: { paddingVertical: spacing[32] },
});
