import type { UserCard } from '@/api/types';
import type { Follow, FriendsBoard } from '@/features/friends/types';
/** 개발 미리보기 전용. 실제 화면에서는 불러오지 않는다. */
const me: UserCard = {
  id: 'preview-me',
  nickname: '여행자',
  profileImageUrl: null,
  accountVisibility: 'PRIVATE',
  followingStatus: 'NONE',
  followedByStatus: 'NONE',
};
const people = ['하늘', '가람', '나래', '다온', '해솔', '지호'].map<UserCard>((nickname, i) => ({
  ...me,
  id: 'preview-person-' + i,
  nickname,
  accountVisibility: 'PUBLIC',
}));
const relation = (
  id: string,
  follower: UserCard,
  followee: UserCard,
  status: Follow['status'],
): Follow => ({
  id,
  follower,
  followee,
  status,
  requestedAt: '2026-11-18T00:00:00Z',
  acceptedAt: status === 'ACCEPTED' ? '2026-11-18T00:00:00Z' : null,
});
export const PREVIEW_BOARD: FriendsBoard = {
  following: people.slice(0, 5).map((p, i) => relation('out-' + i, me, p, 'ACCEPTED')),
  followers: people.slice(0, 5).map((p, i) => relation('in-' + i, p, me, 'ACCEPTED')),
  requests: [relation('request-1', people[5], me, 'REQUESTED')],
};
export const PREVIEW_TRIPS: Record<string, string> = {
  'preview-person-0': '함께 간 여행 2개 · 겨울 여행 동행',
  'preview-person-1': '함께 간 여행 1개 · 겨울 여행 동행',
  'preview-person-2': '연말 강릉 동행',
  'preview-person-3': '함께 간 여행 1개',
  'preview-person-4': '함께 간 여행 1개',
};
