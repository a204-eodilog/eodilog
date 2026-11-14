import type { Follow, FriendsBoard } from '@/features/friends/types';

export type FriendsAction = {
  kind: 'accept' | 'reject' | 'unfollow' | 'remove' | 'cancel';
  follow: Follow;
  at: string;
};
export function actionUserId(action: FriendsAction): string {
  return action.kind === 'unfollow' || action.kind === 'cancel'
    ? action.follow.followee.id
    : action.follow.follower.id;
}
/** 받은 요청 수락은 팔로워만 늘린다. 반대 방향 팔로잉은 유지한다. */
export function applyFriendsAction(
  board: FriendsBoard,
  action: FriendsAction,
  response?: Follow,
): FriendsBoard {
  const { follow, kind } = action;
  if (kind === 'accept') {
    const accepted = response ?? { ...follow, status: 'ACCEPTED' as const, acceptedAt: action.at };
    return {
      ...board,
      requests: board.requests.filter((f) => f.id !== follow.id),
      followers: [accepted, ...board.followers.filter((f) => f.follower.id !== follow.follower.id)],
    };
  }
  if (kind === 'cancel') return { ...board, sent: board.sent.filter((f) => f.id !== follow.id) };
  if (kind === 'reject')
    return { ...board, requests: board.requests.filter((f) => f.id !== follow.id) };
  if (kind === 'unfollow')
    return {
      ...board,
      following: board.following.filter((f) => f.followee.id !== follow.followee.id),
    };
  return {
    ...board,
    followers: board.followers.filter((f) => f.follower.id !== follow.follower.id),
  };
}

export function requestDate(value: string): string {
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) return '';
  const seoul = new Date(instant.getTime() + 9 * 60 * 60 * 1000);
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  return (
    String(seoul.getUTCMonth() + 1).padStart(2, '0') +
    '.' +
    String(seoul.getUTCDate()).padStart(2, '0') +
    '(' +
    weekdays[seoul.getUTCDay()] +
    ')'
  );
}
