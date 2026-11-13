import { describe, expect, it } from '@jest/globals';

import { nextCreateAttempt } from './create-attempt';
import type { ExpenseInput } from './types';

const LUNCH: ExpenseInput = {
  title: '점심',
  amountMinor: 30000,
  payerMemberId: 'm-me',
  participantMemberIds: ['m-me', 'm-seeun'],
};

/** 부를 때마다 다른 키와 시각을 준다 */
function maker() {
  let n = 0;
  return () => {
    n += 1;
    return { key: `key-${n}`, spentAt: `2026-11-13T04:00:0${n}.000Z` };
  };
}

describe('지출 등록 시도', () => {
  it('처음에는 키와 지출 시각을 새로 만든다', () => {
    const attempt = nextCreateAttempt(null, LUNCH, maker());
    expect(attempt.key).toBe('key-1');
    expect(attempt.spentAt).toBe('2026-11-13T04:00:01.000Z');
  });

  it('같은 입력을 다시 보내면 키와 지출 시각을 그대로 쓴다', () => {
    const make = maker();
    const first = nextCreateAttempt(null, LUNCH, make);
    const again = nextCreateAttempt(first, { ...LUNCH }, make);
    expect(again.key).toBe(first.key);
    // 시각이 달라지면 서버가 같은 키에 다른 본문으로 보고 거절한다
    expect(again.spentAt).toBe(first.spentAt);
  });

  it('금액이나 이름을 고치면 둘 다 새로 만든다', () => {
    const make = maker();
    const first = nextCreateAttempt(null, LUNCH, make);
    const edited = nextCreateAttempt(first, { ...LUNCH, amountMinor: 31000 }, make);
    expect(edited.key).toBe('key-2');
    expect(edited.spentAt).not.toBe(first.spentAt);
    const renamed = nextCreateAttempt(
      edited,
      { ...LUNCH, amountMinor: 31000, title: '저녁' },
      make,
    );
    expect(renamed.key).toBe('key-3');
  });

  it('낸 사람이나 나눌 사람이 바뀌어도 새로 만든다. 순서만 달라도 다른 본문이다', () => {
    const make = maker();
    const first = nextCreateAttempt(null, LUNCH, make);
    expect(nextCreateAttempt(first, { ...LUNCH, payerMemberId: 'm-seeun' }, make).key).toBe(
      'key-2',
    );
    expect(
      nextCreateAttempt(first, { ...LUNCH, participantMemberIds: ['m-seeun', 'm-me'] }, make).key,
    ).toBe('key-3');
  });

  it('성공해서 앞 시도를 비운 뒤에는 같은 입력이어도 새 지출로 본다', () => {
    const make = maker();
    nextCreateAttempt(null, LUNCH, make);
    expect(nextCreateAttempt(null, LUNCH, make).key).toBe('key-2');
  });
});
