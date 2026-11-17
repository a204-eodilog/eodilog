import { describe, expect, it } from '@jest/globals';

import type { InvitableFriend } from '@/features/invitation/types';

import {
  filterFriends,
  isPickable,
  remainingSeats,
  sendResultMessage,
  togglePick,
} from './friend-invite-rules';

function friend(id: string, nickname: string, state: InvitableFriend['state']): InvitableFriend {
  return {
    user: {
      id,
      nickname,
      profileImageUrl: null,
      accountVisibility: 'PUBLIC',
      followingStatus: 'ACCEPTED',
      followedByStatus: 'ACCEPTED',
    },
    state,
    invitationId: state === 'INVITED' ? `inv-${id}` : null,
  };
}

describe('remainingSeats', () => {
  it('정원에서 멤버 수를 뺀다', () => {
    expect(remainingSeats(20, 4)).toBe(16);
  });
  it('넘쳐도 0 아래로 가지 않는다', () => {
    expect(remainingSeats(20, 21)).toBe(0);
  });
});

describe('isPickable', () => {
  it('초대 가능한 친구만 고를 수 있다', () => {
    expect(isPickable(friend('a', '민지', 'INVITABLE'))).toBe(true);
    expect(isPickable(friend('b', '철수', 'INVITED'))).toBe(false);
    expect(isPickable(friend('c', '지수', 'MEMBER'))).toBe(false);
  });
});

describe('togglePick', () => {
  it('고르고 다시 누르면 뺀다', () => {
    expect(togglePick([], 'a', 2)).toEqual(['a']);
    expect(togglePick(['a'], 'a', 2)).toEqual([]);
  });
  it('남은 자리를 넘으면 더 고르지 않는다', () => {
    expect(togglePick(['a', 'b'], 'c', 2)).toEqual(['a', 'b']);
  });
});

describe('filterFriends', () => {
  const list = [friend('a', 'Minji', 'INVITABLE'), friend('b', '철수', 'INVITABLE')];
  it('빈 검색어면 모두', () => {
    expect(filterFriends(list, '  ')).toHaveLength(2);
  });
  it('대소문자 없이 일부로 찾는다', () => {
    expect(filterFriends(list, 'min').map((f) => f.user.id)).toEqual(['a']);
  });
});

describe('sendResultMessage', () => {
  it('모두 보냈을 때', () => {
    expect(sendResultMessage([{ result: 'SENT' }, { result: 'SENT' }])).toBe(
      '2명에게 초대를 보냈어요',
    );
  });
  it('일부는 이미 초대했을 때', () => {
    expect(sendResultMessage([{ result: 'SENT' }, { result: 'ALREADY_INVITED' }])).toBe(
      '1명에게 보냈어요. 1명은 이미 초대했어요',
    );
  });
  it('이미 동행과 맞팔 아님을 잇는다', () => {
    expect(sendResultMessage([{ result: 'ALREADY_MEMBER' }, { result: 'NOT_MUTUAL' }])).toBe(
      '1명은 이미 함께하고 있어요. 1명은 서로 팔로우가 아니라 초대하지 못했어요',
    );
  });
});
