import type { UserCard } from '@/api/types';
import { findMapRegion } from '@/lib/korea-map';

import type { FollowButtonState, PublicProfile, UserFeedCard } from './types';

/** 내가 그 사람을 팔로우한 상태 → 버튼 */
export function followButtonState(user: Pick<UserCard, 'followingStatus'>): FollowButtonState {
  if (user.followingStatus === 'ACCEPTED') return 'following';
  if (user.followingStatus === 'REQUESTED') return 'requested';
  return 'follow';
}

/** 팔로우를 누른 뒤 상태. 비공개 계정은 요청됨, 공개 계정은 바로 팔로잉 */
export function afterFollow(user: UserCard): UserCard {
  return {
    ...user,
    followingStatus: user.accountVisibility === 'PRIVATE' ? 'REQUESTED' : 'ACCEPTED',
  };
}

/** N9 한 줄. "공동 피드 3개 · 팔로워 12 · 팔로잉 9", 비공개는 앞에 "비공개 계정". 모르는 수는 뺀다 */
export function profileStats(p: PublicProfile, locked: boolean): string {
  const parts: string[] = [];
  if (locked) parts.push('비공개 계정');
  else if (p.feedCount !== undefined) parts.push(`공동 피드 ${p.feedCount}개`);
  if (p.followerCount !== undefined) parts.push(`팔로워 ${p.followerCount}`);
  if (p.followingCount !== undefined) parts.push(`팔로잉 ${p.followingCount}`);
  return parts.join(' · ');
}

/** 비공개 계정을 아직 팔로우하지 않아 여행을 볼 수 없는지 */
export function isLocked(p: Pick<UserCard, 'accountVisibility' | 'followingStatus'>): boolean {
  return p.accountVisibility === 'PRIVATE' && p.followingStatus !== 'ACCEPTED';
}

/** N9 지도 핀. 공동 피드의 첫 지역, 같은 지역은 묶는다 */
export function feedPins(feeds: readonly UserFeedCard[]) {
  const byRegion = new Map<string, UserFeedCard[]>();
  for (const f of feeds) {
    const code = f.regions[0]?.code;
    if (!code || !findMapRegion(code)) continue;
    byRegion.set(code, [...(byRegion.get(code) ?? []), f]);
  }
  return [...byRegion.entries()].map(([regionCode, list]) => ({
    regionCode,
    label: list.length === 1 ? list[0].title : `${list[0].title} 외 ${list.length - 1}개`,
    posted: true,
    tripIds: list.map((f) => f.tripId),
    feedIds: list.map((f) => f.id),
  }));
}
