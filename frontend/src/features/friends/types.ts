import type { Follow } from '@/api/types';

export type { Follow };

/** docs/api-spec.md Follow. 팔로우 방향은 서로 독립이다. */
export type FriendsBoard = {
  following: Follow[];
  followers: Follow[];
  requests: Follow[];
  /** 내가 보냈고 아직 수락되지 않은 팔로우 요청(GET /me/follow-requests?direction=SENT) */
  sent: Follow[];
};
