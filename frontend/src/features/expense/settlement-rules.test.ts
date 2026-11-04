import { describe, expect, it } from '@jest/globals';

import { balanceDirection, formatCalculatedAt, recalculationReason } from './settlement-rules';
import type { Expense, Settlement } from './types';

function expense(id: string, title: string, amountMinor: number, version = 1): Expense {
  return {
    id,
    title,
    memo: null,
    amountMinor,
    currency: 'KRW',
    payerMemberId: 'm1',
    participantMemberIds: ['m1'],
    spentAt: '2026-11-14T10:00:00Z',
    registeredByMemberId: 'm1',
    shares: [],
    version,
  };
}

const settlement: Settlement = {
  id: 's1',
  expenseVersion: 3,
  stale: true,
  totalAmountMinor: 213_000,
  includedExpenses: [
    {
      expenseId: 'e1',
      expenseVersion: 1,
      title: '숙소 1박',
      amountMinor: 180_000,
      payerMemberId: 'm1',
      shares: [],
    },
    {
      expenseId: 'e2',
      expenseVersion: 1,
      title: '서면 돼지국밥집',
      amountMinor: 33_000,
      payerMemberId: 'm1',
      shares: [],
    },
  ],
  members: [],
  transfers: [],
  calculatedAt: '2026-11-16T12:10:00Z',
};
const before = [expense('e1', '숙소 1박', 180_000), expense('e2', '서면 돼지국밥집', 33_000)];

describe('recalculationReason', () => {
  it('한 건 추가면 이름과 금액', () => {
    expect(recalculationReason(settlement, [expense('e4', '택시', 12_000), ...before])).toBe(
      '정산 뒤 택시 12,000원이 추가됐어요',
    );
  });

  it('한 건 삭제·수정은 받침에 맞춰 이/가', () => {
    expect(recalculationReason(settlement, [before[0]])).toBe(
      '정산 뒤 서면 돼지국밥집이 지워졌어요',
    );
    expect(
      recalculationReason(settlement, [expense('e1', '숙소 1박', 200_000, 2), before[1]]),
    ).toBe('정산 뒤 숙소 1박이 바뀌었어요');
  });

  it('여러 건이면 건수만', () => {
    expect(recalculationReason(settlement, [expense('e4', '택시', 12_000), before[0]])).toBe(
      '정산 뒤 지출 2건이 바뀌었어요',
    );
  });
});

it('계산 시각은 "MM.DD(요일) HH:mm 계산"', () => {
  const local = new Date(2026, 10, 16, 21, 10).toISOString();
  expect(formatCalculatedAt(local)).toBe('11.16(월) 21:10 계산');
});

it('잔액이 +면 받고 -면 보낸다', () => {
  expect(balanceDirection(98_500)).toBe('receive');
  expect(balanceDirection(-38_000)).toBe('send');
  expect(balanceDirection(0)).toBe('none');
});
