import type { UserCard } from '@/api/types';

/**
 * S44 추천 친구 한 명(명세 `GET /me/follow-suggestions`의 FollowSuggestion).
 * reason은 공개해도 되는 이유만 온다. 글자는 앱이 붙인다(people-rules의 suggestionReason).
 * CO_TRAVELER: 같은 여행을 함께한 사람(count = 함께한 여행 수) / FOLLOWS_YOU: 나를 팔로우하는데 내가 팔로우하지 않은 사람
 */
export type FriendSuggestion = {
  user: UserCard;
  reason: { kind: 'CO_TRAVELER'; count?: number } | { kind: 'FOLLOWS_YOU' };
};

/**
 * N9 다른 사용자 프로필. `GET /users/{userId}`는 UserCard만 주고 수는 없다(백엔드 요청).
 * 수가 오면 보이고, 없으면 그 칸을 뺀다
 */
export type PublicProfile = UserCard & {
  feedCount?: number;
  followerCount?: number;
  followingCount?: number;
};

/** GET /users/{userId}/feeds 한 줄(FeedCard)에서 쓰는 값 */
export type UserFeedCard = {
  id: string;
  tripId: string;
  title: string;
  regions: { id: string; code: string; name: string }[];
};

/** 팔로우 버튼 글자. 결정 Q-2: 팔로우 · 요청됨 · 팔로잉 */
export type FollowButtonState = 'follow' | 'requested' | 'following';
