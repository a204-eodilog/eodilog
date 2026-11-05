import type { Follow } from '@/api/types';

export type { Follow };

/** docs/api-spec.md Follow. 팔로우 방향은 서로 독립이다. */
export type FriendsBoard = {
  following: Follow[];
  followers: Follow[];
  requests: Follow[];
};
