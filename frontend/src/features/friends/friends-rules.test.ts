import { describe, expect, it } from '@jest/globals';
import { actionUserId, applyFriendsAction, requestDate } from '@/features/friends/friends-rules';
import { PREVIEW_BOARD } from '@/features/friends/preview-data';

describe('친구 관계 변경 규칙', () => {
  it('수락은 팔로워만 추가하고 받은 요청을 뺀다', () => {
    const action = {
      kind: 'accept' as const,
      follow: PREVIEW_BOARD.requests[0],
      at: '2026-11-18T00:00:00Z',
    };
    const board = applyFriendsAction(PREVIEW_BOARD, action);
    expect(board.following).toEqual(PREVIEW_BOARD.following);
    expect(board.followers).toHaveLength(6);
    expect(board.requests).toHaveLength(0);
    expect(PREVIEW_BOARD.requests).toHaveLength(1);
    expect(actionUserId(action)).toBe(action.follow.follower.id);
  });
  it('거절은 팔로잉과 팔로워를 바꾸지 않는다', () => {
    const board = applyFriendsAction(PREVIEW_BOARD, {
      kind: 'reject',
      follow: PREVIEW_BOARD.requests[0],
      at: '',
    });
    expect(board.following).toEqual(PREVIEW_BOARD.following);
    expect(board.followers).toEqual(PREVIEW_BOARD.followers);
    expect(board.requests).toHaveLength(0);
  });
  it('팔로우 해제와 팔로워 삭제는 해당 방향만 지운다', () => {
    const board = applyFriendsAction(PREVIEW_BOARD, {
      kind: 'unfollow',
      follow: PREVIEW_BOARD.following[0],
      at: '',
    });
    expect(board.following).toHaveLength(4);
    expect(board.followers).toHaveLength(5);
    const removed = applyFriendsAction(board, {
      kind: 'remove',
      follow: PREVIEW_BOARD.followers[0],
      at: '',
    });
    expect(removed.following).toHaveLength(4);
    expect(removed.followers).toHaveLength(4);
  });
  it('수락 응답 중복으로 팔로워가 늘어나지 않는다', () => {
    const action = { kind: 'accept' as const, follow: PREVIEW_BOARD.requests[0], at: '' };
    expect(
      applyFriendsAction(applyFriendsAction(PREVIEW_BOARD, action), action).followers,
    ).toHaveLength(6);
  });
  it('서울 날짜로 요청일을 표시하고 잘못된 날짜는 숨긴다', () => {
    expect(requestDate('2026-11-17T16:00:00Z')).toBe('11.18(수)');
    expect(requestDate('invalid')).toBe('');
  });
});
