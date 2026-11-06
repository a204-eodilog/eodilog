import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import type { UserCard } from '@/api/types';
import { toast } from '@/components/ui';

import {
  followUser,
  getSuggestions,
  getUser,
  getUserFeeds,
  hideSuggestion,
  searchUsers,
  unfollowUser,
} from '../api';
import { FindFriendsView } from '../components/find-friends-view';
import { ProfileView } from '../components/profile-view';
import { afterFollow, isLocked } from '../people-rules';
import type { FriendSuggestion, PublicProfile, UserFeedCard } from '../types';

const SUGGESTIONS_KEY = ['me', 'friend-suggestions'] as const;
const stateOf = (q: { isError: boolean; data: unknown }) =>
  q.isError ? ('error' as const) : q.data ? ('ready' as const) : ('loading' as const);

/** 팔로우 버튼 동작. 팔로잉·요청됨이면 끊기(요청 취소), 아니면 팔로우. 끝나면 친구 목록도 새로 받는다 */
function useFollowToggle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (user: UserCard) => {
      if (user.followingStatus === 'NONE') {
        await followUser(user.id);
        return afterFollow(user);
      }
      await unfollowUser(user.id);
      return { ...user, followingStatus: 'NONE' as const };
    },
    onSuccess: (next) => {
      if (next.followingStatus === 'REQUESTED') toast.show('팔로우 요청을 보냈어요');
      void queryClient.invalidateQueries({ queryKey: ['me', 'following'] });
      void queryClient.invalidateQueries({ queryKey: ['me', 'following-count'] });
      void queryClient.invalidateQueries({ queryKey: SUGGESTIONS_KEY });
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: () => toast.show('팔로우하지 못했어요. 다시 시도해 주세요'),
  });
}

/** S44 친구 추천·검색 /find-friends. S43·S05에서 들어온다 */
export function FindFriendsScreen() {
  const queryClient = useQueryClient();
  const suggestions = useQuery({ queryKey: SUGGESTIONS_KEY, queryFn: getSuggestions });
  const [query, setQuery] = useState<string | null>(null);
  const search = useQuery({
    queryKey: ['users', 'search', query],
    queryFn: () => searchUsers(query ?? ''),
    enabled: !!query,
  });
  const follow = useFollowToggle();
  const hide = useMutation({
    mutationFn: (user: UserCard) => hideSuggestion(user.id),
    onMutate: (user) => {
      // 먼저 목록에서 뺀다. 실패해도 이번 화면에서는 다시 보이지 않게 둔다
      queryClient.setQueryData<FriendSuggestion[]>(SUGGESTIONS_KEY, (old) =>
        old?.filter((s) => s.user.id !== user.id),
      );
    },
    onSuccess: () => toast.show('이 친구는 다시 추천하지 않아요'),
  });
  return (
    <FindFriendsView
      suggestions={{ state: stateOf(suggestions), items: suggestions.data ?? [] }}
      search={query ? { query, state: stateOf(search), items: search.data ?? [] } : null}
      pendingUserId={follow.isPending ? (follow.variables?.id ?? null) : null}
      onSearch={setQuery}
      onClearSearch={() => setQuery(null)}
      onFollow={(u) => follow.mutate(u)}
      onHide={(u) => hide.mutate(u)}
      onPerson={(u) => router.push(`/users/${u.id}`)}
      onRetry={() => void suggestions.refetch()}
    />
  );
}

/** N9 다른 사용자 프로필 /users/[userId]. S43·S44·S07에서 들어온다 */
export function UserProfileScreen() {
  const { userId = '' } = useLocalSearchParams<{ userId: string }>();
  const user = useQuery({ queryKey: ['users', userId], queryFn: () => getUser(userId) });
  const locked = user.data ? isLocked(user.data) : true;
  const feeds = useQuery({
    queryKey: ['users', userId, 'feeds'],
    queryFn: () => getUserFeeds(userId),
    enabled: !!user.data && !locked,
  });
  const follow = useFollowToggle();
  return (
    <ProfileView
      state={stateOf(user)}
      profile={user.data}
      feeds={feeds.data ?? []}
      following={follow.isPending}
      onFollow={() => user.data && follow.mutate(user.data)}
      onFeed={(id) => router.push(`/feeds/${id}`)}
      onRetry={() => void user.refetch()}
    />
  );
}

// ── 미리보기 ──

const person = (id: string, nickname: string, extra: Partial<UserCard> = {}): UserCard => ({
  id,
  nickname,
  profileImageUrl: null,
  accountVisibility: 'PUBLIC',
  followingStatus: 'NONE',
  followedByStatus: 'NONE',
  ...extra,
});

/** Figma S44: 취향이 같은 두 명, 공개 여행을 올린 한 명 */
const SUGGESTIONS: FriendSuggestion[] = [
  { user: person('s1', '도윤'), reason: { kind: 'taste', tags: ['바다', '카페'] } },
  { user: person('s2', '하린'), reason: { kind: 'taste', tags: ['맛집'] } },
  {
    user: person('s3', '서준', { accountVisibility: 'PRIVATE' }),
    reason: { kind: 'trips', count: 4 },
  },
];

/** /dev/find-friends?state=basic|no-suggestions|no-results */
export function FindFriendsPreviewScreen() {
  const { state = 'basic' } = useLocalSearchParams<{ state?: string }>();
  const [items, setItems] = useState(state === 'no-suggestions' ? [] : SUGGESTIONS);
  const [query, setQuery] = useState<string | null>(state === 'no-results' ? '바닷가' : null);
  if (!__DEV__) return <Redirect href="/" />;
  const results = items.map((s) => s.user).filter((u) => query && u.nickname.includes(query));
  return (
    <FindFriendsView
      suggestions={{ state: 'ready', items }}
      search={query ? { query, state: 'ready', items: results } : null}
      pendingUserId={null}
      onSearch={setQuery}
      onClearSearch={() => setQuery(null)}
      onFollow={(u) => {
        const next =
          u.followingStatus === 'NONE'
            ? afterFollow(u)
            : { ...u, followingStatus: 'NONE' as const };
        if (next.followingStatus === 'REQUESTED') toast.show('팔로우 요청을 보냈어요');
        setItems((list) => list.map((s) => (s.user.id === u.id ? { ...s, user: next } : s)));
      }}
      onHide={(u) => setItems((list) => list.filter((s) => s.user.id !== u.id))}
      onPerson={(u) => toast.show(`${u.nickname}: N9 프로필로 가요`)}
      onRetry={() => toast.show('다시 불러와요')}
    />
  );
}

const feed = (id: string, title: string, code: string): UserFeedCard => ({
  id,
  tripId: `t-${id}`,
  title,
  regions: [{ id: `r-${code}`, code, name: title }],
});

/** /dev/user?state=public|private */
export function UserProfilePreviewScreen() {
  const { state = 'public' } = useLocalSearchParams<{ state?: string }>();
  const isPrivate = state === 'private';
  const [profile, setProfile] = useState<PublicProfile>(
    isPrivate
      ? {
          ...person('u9', '나래', { accountVisibility: 'PRIVATE' }),
          followerCount: 5,
          followingCount: 7,
        }
      : {
          ...person('u8', '가람', { followingStatus: 'ACCEPTED' }),
          feedCount: 3,
          followerCount: 12,
          followingCount: 9,
        },
  );
  if (!__DEV__) return <Redirect href="/" />;
  return (
    <ProfileView
      state="ready"
      profile={profile}
      feeds={[
        feed('f1', '봄 경주', '4713000000'),
        feed('f2', '강릉 겨울 바다', '5211000000'),
        feed('f3', '겨울 여행', '2635000000'),
      ]}
      following={false}
      onFollow={() =>
        setProfile((p) =>
          p.followingStatus === 'NONE'
            ? (toast.show(isPrivate ? '팔로우 요청을 보냈어요' : '팔로우했어요'),
              { ...p, ...afterFollow(p) })
            : { ...p, followingStatus: 'NONE' },
        )
      }
      onFeed={(id) => toast.show(`${id}: S07로 가요`)}
      onRetry={() => toast.show('다시 불러와요')}
    />
  );
}
