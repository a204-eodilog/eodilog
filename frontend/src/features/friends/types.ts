import type { UserCard } from '@/api/types';

/** docs/api-spec.md Follow. 팔로우 방향은 서로 독립이다. */
export type Follow = {
  id: string;
  follower: UserCard;
  followee: UserCard;
  status: 'REQUESTED' | 'ACCEPTED';
  requestedAt: string;
  acceptedAt: string | null;
};

export type FriendsBoard = {
  following: Follow[];
  followers: Follow[];
  requests: Follow[];
};
