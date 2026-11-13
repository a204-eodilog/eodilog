import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stagger } from '@/components/ui/stagger';
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
          <Stagger itemStyle={styles.staggerItem}>
            {board.requests.length > 0 ? (
              <View style={styles.section}>
                <View style={styles.headingRow}>
                  <Text style={styles.heading}>받은 팔로우 요청</Text>
                  <View style={styles.countPill}>
                    <Text style={styles.countText}>{board.requests.length}</Text>
                  </View>
                </View>
                {board.requests.map((follow) => (
                  <View key={follow.id} style={styles.request}>
                    <PressableScale
                      accessibilityRole="button"
                      accessibilityLabel={follow.follower.nickname + ' 프로필'}
                      onPress={() => onPerson(follow.follower)}
                      disabled={pendingIds.includes(follow.follower.id)}
                      style={[styles.person, styles.flex]}
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
                        icon="close"
                        size="sm"
                        variant="neutral"
                        style={styles.reject}
                        disabled={pendingIds.includes(follow.follower.id)}
                        onPress={() => void act('reject', follow)}
                      />
                      <Button
                        label="수락"
                        icon="check"
                        size="sm"
                        style={styles.action}
                        disabled={pendingIds.includes(follow.follower.id)}
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
            <View style={styles.tabGroup}>
              {/* 머리 카드. 큰 숫자 두 개가 곧 탭이다. 오른쪽 동그라미는 친구 찾기.
                탭이 바꾸는 목록 바로 위에 둔다(받은 요청은 그 위, 2026-11-13 사용자 결정: 탭과 목록이 떨어져 헷갈림) */}
              <View style={styles.hero}>
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
                      <Text style={styles.tabCount}>{board[key].length}</Text>
                      <Text style={styles.tabLabel}>
                        {key === 'following' ? '팔로잉' : '팔로워'}
                      </Text>
                    </PressableScale>
                  ))}
                </View>
                <PressableScale
                  onPress={onFind}
                  accessibilityRole="button"
                  accessibilityLabel="친구 찾기"
                  style={styles.find}
                >
                  <Icon name="person-plus" size={22} color={colors.brand.primary} />
                </PressableScale>
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
                  rows.map((follow, order) => {
                    const person = tab === 'following' ? follow.followee : follow.follower;
                    const fresh = tab === 'followers' && accepted?.follower.id === person.id;
                    const blocked = pendingIds.includes(person.id);
                    return (
                      <View key={follow.id} style={[styles.row, order > 0 && styles.rowRule]}>
                        <PressableScale
                          style={[styles.person, styles.flex]}
                          accessibilityRole="button"
                          accessibilityLabel={person.nickname + ' 프로필'}
                          disabled={blocked}
                          onPress={() => onPerson(person)}
                        >
                          <Avatar
                            name={person.nickname}
                            imageUrl={person.profileImageUrl}
                            size="lg"
                          />
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
                            person.nickname +
                            (tab === 'following' ? ' 팔로우 해제' : ' 팔로워 삭제')
                          }
                          accessibilityState={{ disabled: blocked }}
                          disabled={blocked}
                          onPress={() =>
                            setConfirm({
                              follow,
                              kind: tab === 'following' ? 'unfollow' : 'remove',
                            })
                          }
                        >
                          {blocked ? (
                            <Spinner color={colors.brand.primary} />
                          ) : (
                            <Icon name="more" size={20} color={colors.text.muted} />
                          )}
                        </PressableScale>
                      </View>
                    );
                  })
                )}
              </View>
            </View>
          </Stagger>
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
  // 차례로 나타나는 구역을 감싼 칸. 한 구역이 여러 줄이면 그 사이 간격을 스크롤 내용과 같게 둔다
  staggerItem: { gap: spacing[24] },
  // 바탕은 옅은 회색, 내용은 흰 카드에 담는다(여행 탭·마이페이지와 같은 방식)
  screen: { flex: 1, backgroundColor: colors.surface.subtle },
  fill: { flex: 1 },
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  content: { paddingHorizontal: layout.screenPaddingX, paddingTop: spacing[16], gap: spacing[24] },
  // 머리 카드(파랑). 숫자 탭 둘과 친구 찾기 동그라미
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[12],
    padding: spacing[12],
    borderRadius: radius.xxl,
    backgroundColor: colors.brand.primary,
  },
  find: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.white,
  },
  tabCount: { ...typography.display, color: colors.text.inverse },
  tabLabel: { ...typography.captionMedium, color: colors.onBrand.textSoft },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[8] },
  countPill: {
    minWidth: 24,
    height: 22,
    paddingHorizontal: spacing[8],
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand.primaryBg,
  },
  countText: { ...typography.captionBold, color: colors.brand.primary },
  rowRule: { borderTopWidth: 1, borderTopColor: colors.line.default, paddingTop: spacing[12] },
  name: { ...typography.bodyBold, color: colors.text.default },
  heading: { ...typography.title3, color: colors.text.default },
  caption: { ...typography.caption, color: colors.text.icon },
  section: { gap: spacing[12] },
  // 파란 탭 카드와 그 탭이 바꾸는 목록을 가깝게 붙인다
  tabGroup: { gap: spacing[12] },
  peopleSection: {
    gap: spacing[12],
    padding: spacing[16],
    borderRadius: radius.xl,
    backgroundColor: colors.surface.white,
  },
  // 요청 하나가 흰 카드 한 줄이다. 얼굴·이름 옆에 거절·수락이 바로 붙는다
  request: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[10],
    padding: spacing[14],
    borderRadius: radius.xl,
    backgroundColor: colors.surface.white,
  },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[14],
    minHeight: layout.minTouchTarget,
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing[8] },
  action: { height: layout.minTouchTarget, width: layout.minTouchTarget },
  reject: { height: layout.minTouchTarget, width: layout.minTouchTarget },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[8] },
  tabs: { flex: 1, flexDirection: 'row', gap: spacing[8] },
  tab: {
    flex: 1,
    paddingVertical: spacing[10],
    paddingHorizontal: spacing[16],
    borderRadius: radius.xl,
  },
  // 고른 탭은 반투명 흰 바탕이 깔린다
  selectedTab: { backgroundColor: colors.onBrand.chip },
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
