import { describe, expect, it } from '@jest/globals';

import {
  addedAfterSettlement,
  changedAfterSettlement,
  payerLabel,
  splitLabel,
  toExpenseInput,
} from './expense-rules';
import type { SettlementState, TripMember } from './types';

function member(id: string, nickname: string, joinOrder: number, status = 'ACTIVE'): TripMember {
  return {
    id,
    role: joinOrder === 1 ? 'OWNER' : 'MEMBER',
    status: status as TripMember['status'],
    joinOrder,
    user: {
      id: `u-${id}`,
      nickname,
      profileImageUrl: null,
      accountVisibility: 'PUBLIC',
      followingStatus: 'NONE',
      followedByStatus: 'NONE',
    },
  };
}

const members = [member('m1', '지우', 1), member('m2', '서연', 2), member('m3', '민준', 3)];

it('낸 사람은 받침에 따라 이/가를 붙인다', () => {
  expect(payerLabel('지우')).toBe('지우가 냄');
  expect(payerLabel('민준')).toBe('민준이 냄');
  expect(payerLabel('Alex')).toBe('Alex가 냄');
});

describe('splitLabel', () => {
  it('지금 동행 모두면 "N명 똑같이"', () => {
    expect(splitLabel(['m3', 'm1', 'm2'], members)).toBe('3명 똑같이');
  });

  it('일부면 참여 순으로 이름과 인원', () => {
    expect(splitLabel(['m1', 'm2'], members)).toBe('지우, 서연 2명');
  });

  it('나간 동행이 들어 있으면 모두가 아니다', () => {
    const withLeft = [...members, member('m4', '하늘', 4, 'LEFT')];
    expect(splitLabel(['m1', 'm2', 'm3', 'm4'], withLeft)).toBe('지우, 서연, 민준, 하늘 4명');
  });
});

describe('정산 후 지출 변경', () => {
  const state: SettlementState = {
    current: {
      id: 's1',
      expenseVersion: 3,
      stale: true,
      totalAmountMinor: 180_000,
      includedExpenses: [
        {
          expenseId: 'e1',
          expenseVersion: 1,
          title: '숙소 1박',
          amountMinor: 180_000,
          payerMemberId: 'm1',
          shares: [],
        },
      ],
      members: [],
      transfers: [],
      calculatedAt: '2026-11-16T12:10:00Z',
    },
    currentExpenseVersion: 4,
    recalculationRequired: true,
  };

  it('계산에 없던 지출만 "정산 후 추가"', () => {
    expect(addedAfterSettlement('e2', state)).toBe(true);
    expect(addedAfterSettlement('e1', state)).toBe(false);
  });

  it('계산한 적이 없거나 다시 계산할 필요가 없으면 표시하지 않는다', () => {
    expect(changedAfterSettlement({ ...state, current: null })).toBe(false);
    expect(changedAfterSettlement({ ...state, recalculationRequired: false })).toBe(false);
    expect(addedAfterSettlement('e2', { ...state, recalculationRequired: false })).toBe(false);
    expect(changedAfterSettlement(state)).toBe(true);
  });
});

describe('toExpenseInput', () => {
  const form = {
    amount: '21,000',
    title: ' 광안리 카페 ',
    payerMemberId: 'm2',
    participantMemberIds: ['m1', 'm2'],
  };

  it('쉼표를 빼고 이름 앞뒤 공백을 지운다', () => {
    expect(toExpenseInput(form)).toEqual({
      input: {
        title: '광안리 카페',
        amountMinor: 21000,
        payerMemberId: 'm2',
        participantMemberIds: ['m1', 'm2'],
      },
    });
  });

  it('규칙에 어긋나면 문제를 알려 준다', () => {
    expect(toExpenseInput({ ...form, amount: '0' })).toEqual({ problem: 'amount' });
    expect(toExpenseInput({ ...form, amount: '9,999,999,999,999,999' })).toEqual({
      problem: 'amountTooLarge',
    });
    expect(toExpenseInput({ ...form, title: '   ' })).toEqual({ problem: 'title' });
    expect(toExpenseInput({ ...form, payerMemberId: null })).toEqual({ problem: 'payer' });
    expect(toExpenseInput({ ...form, participantMemberIds: [] })).toEqual({
      problem: 'participants',
    });
  });
});
