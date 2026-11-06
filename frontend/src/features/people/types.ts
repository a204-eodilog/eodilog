import type { UserCard } from '@/api/types';

/**
 * S44 추천 친구 한 명. 명세에 추천 API가 아직 없어(백엔드 요청) 테스트 모드 값으로 그린다.
 * reason은 공개 가능한 이유만: 공개 취향이 같음(겹치는 낱말) / 공개 여행 수
 */
export type FriendSuggestion = {
  user: UserCard;
  reason: { kind: 'taste'; tags: string[] } | { kind: 'trips'; count: number };
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
