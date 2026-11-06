import { useQuery } from '@tanstack/react-query';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import type { UserCard } from '@/api/types';
import { toast } from '@/components/ui';
import { getMyFollowers, getOwnFeeds, type OwnFeedLite } from '@/features/feed';

import { FriendPreviewView } from '../components/friend-preview-view';
import { viewFor } from '../preview-rules';

/** S40 친구에게 보이는 모습 /visible-to. S37·S39에서 들어온다 */
export function FriendPreviewScreen() {
  const followers = useQuery({ queryKey: ['me', 'followers', 'all'], queryFn: getMyFollowers });
  const feeds = useQuery({ queryKey: ['me', 'feeds', 'own'], queryFn: getOwnFeeds });
  const [picked, setPicked] = useState<string | null>(null);
  const friends = followers.data ?? [];
  const selectedId = picked ?? friends[0]?.id ?? null;
  const state =
    followers.isError || feeds.isError
      ? 'error'
      : !followers.data || !feeds.data
        ? 'loading'
        : friends.length === 0
          ? 'no-friends'
          : 'ready';
  return (
    <FriendPreviewView
      state={state}
      friends={friends}
      selectedId={selectedId}
      view={selectedId && feeds.data ? viewFor(selectedId, feeds.data) : undefined}
      onSelect={setPicked}
      onFeed={(c) => router.push(`/feeds/${c.id}`)}
      onRetry={() => {
        void followers.refetch();
        void feeds.refetch();
      }}
    />
  );
}

const person = (id: string, nickname: string): UserCard => ({
  id,
  nickname,
  profileImageUrl: null,
  accountVisibility: 'PUBLIC',
  followingStatus: 'ACCEPTED',
  followedByStatus: 'ACCEPTED',
});
const FRIENDS = [
  person('u1', '하늘'),
  person('u2', '가람'),
  person('u3', '나래'),
  person('u4', '바다'),
];
const feed = (
  id: string,
  title: string,
  code: string,
  hidden: string[],
  start: string,
  end: string,
) =>
  ({
    id,
    tripId: `trip-${id}`,
    title,
    startDate: start,
    endDate: end,
    regions: [{ id: `r-${code}`, code, name: title }],
    photos: [{ id: `${id}-p`, imageUrl: '' }],
    publicItinerary: { items: [1] },
    publicReviews: [1],
    visibility: { feedId: id, hiddenViewerUserIds: hidden, version: 1, updatedAt: '' },
  }) as OwnFeedLite;
// Figma S40: 하늘에게는 봄 경주만 보이고 3개는 숨김
const FEEDS = [
  feed('f1', '봄 경주', '4713000000', [], '2026-04-11', '2026-04-12'),
  feed('f2', '추석 전주', '5211000000', ['u1'], '2026-09-27', '2026-09-28'),
  feed('f3', '겨울 여행', '2635000000', ['u1', 'u2'], '2026-01-17', '2026-01-18'),
  feed('f4', '여름 제주', '5011000000', ['u1'], '2026-07-20', '2026-07-23'),
];

/** /dev/visible-to?state=basic|no-friends|loading|error */
export function FriendPreviewPreviewScreen() {
  const { state = 'basic' } = useLocalSearchParams<{ state?: string }>();
  const [selectedId, setSelectedId] = useState('u1');
  if (!__DEV__) return <Redirect href="/" />;
  return (
    <FriendPreviewView
      state={state === 'no-friends' || state === 'loading' || state === 'error' ? state : 'ready'}
      friends={FRIENDS}
      selectedId={selectedId}
      view={viewFor(selectedId, FEEDS)}
      onSelect={setSelectedId}
      onFeed={(c) => toast.show(`${c.title}: S07로 가요`)}
      onRetry={() => toast.show('다시 불러와요')}
    />
  );
}
