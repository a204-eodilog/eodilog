import { describe, expect, it } from '@jest/globals';

import type { Expense, SettlementState } from '@/features/expense';
import type { ItineraryItem, Visit } from '@/features/visit';

import {
  companionLine,
  courseSummary,
  expenseSummary,
  hiddenLabel,
  publishedVisibility,
  recordFeed,
  reviewSummary,
} from './record-rules';

function item(placeId: string, name: string, day: number, order: number): ItineraryItem {
  return { id: `i-${placeId}-${day}`, place: { id: placeId, name }, day, order, startTime: null };
}

function visit(placeId: string, reviewScore: number | null = null): Visit {
  return {
    id: `v-${placeId}`,
    tripId: 't',
    memberId: 'me',
    placeId,
    visitedAt: '2026-11-14T01:00:00Z',
    evidenceType: 'MANUAL',
    reviewId: reviewScore === null ? null : `r-${placeId}`,
    reviewScore,
  };
}

function expense(amountMinor: number): Expense {
  return {
    id: `e-${amountMinor}`,
    title: '저녁',
    memo: null,
    amountMinor,
    currency: 'KRW',
    payerMemberId: 'm1',
    participantMemberIds: ['m1'],
    spentAt: '2026-11-14T10:00:00Z',
    registeredByMemberId: 'm1',
    shares: [{ memberId: 'm1', amountMinor }],
    version: 1,
  };
}

const ITEMS = [
  item('p1', '해운대', 1, 1),
  item('p2', '광안리', 1, 2),
  item('p3', '감천문화마을', 2, 1),
  item('p1', '해운대', 2, 2),
];

describe('companionLine', () => {
  it('동행 이름 뒤에 과/와를 붙인다', () => {
    expect(companionLine('서연, 민준')).toBe('서연, 민준과 함께');
    expect(companionLine('지우')).toBe('지우와 함께');
  });

  it('혼자면 줄이 없다', () => {
    expect(companionLine('')).toBeNull();
  });
});

describe('courseSummary', () => {
  it('코스 장소 중 다녀온 곳 수와 계획한 곳 수. 같은 장소는 한 곳', () => {
    expect(courseSummary(ITEMS, [visit('p1'), visit('p3'), visit('p9')])).toEqual({
      value: '2곳 다녀옴',
      sub: '계획 3곳',
    });
  });

  it('코스가 비어 있으면 코스 없음', () => {
    expect(courseSummary([], [visit('p1')]).value).toBe('코스 없음');
  });
});

describe('reviewSummary', () => {
  it('평가한 수와 가장 높은 점수를 준 곳', () => {
    expect(reviewSummary(ITEMS, [visit('p1', 3), visit('p2', 5), visit('p3')])).toEqual({
      value: '내 평가 2개',
      sub: '광안리 5점',
    });
  });

  it('점수가 같으면 코스에서 먼저 나오는 곳', () => {
    expect(reviewSummary(ITEMS, [visit('p3', 4), visit('p1', 4)]).sub).toBe('해운대 4점');
  });

  it('평가 전이면 다녀온 곳이 있는지에 따라 안내', () => {
    expect(reviewSummary(ITEMS, [visit('p1')])).toEqual({
      value: '내 평가 0개',
      sub: '평가 전이에요',
    });
    expect(reviewSummary(ITEMS, []).sub).toBe('다녀온 곳이 없어요');
  });
});

describe('expenseSummary', () => {
  const state = (current: boolean, recalculationRequired = false): SettlementState => ({
    current: current
      ? {
          id: 's',
          expenseVersion: 1,
          stale: recalculationRequired,
          totalAmountMinor: 0,
          includedExpenses: [],
          members: [],
          transfers: [],
          calculatedAt: '2026-11-15T12:00:00Z',
        }
      : null,
    currentExpenseVersion: 1,
    recalculationRequired,
  });

  it('지출 합계를 만 원 단위로 줄이고 정산 상태를 붙인다', () => {
    const expenses = [expense(200_000), expense(34_000)];
    expect(expenseSummary(expenses, state(true))).toEqual({
      value: '23.4만 원',
      sub: '정산 계산됨',
    });
    expect(expenseSummary(expenses, state(false)).sub).toBe('정산 전');
    expect(expenseSummary(expenses, state(true, true)).sub).toBe('다시 계산 필요');
  });

  it('지출이 없으면 0원', () => {
    expect(expenseSummary([], undefined)).toEqual({ value: '0원', sub: '지출 없음' });
  });
});

describe('publishedVisibility', () => {
  it('숨긴 친구가 있으면 이름을 붙인다', () => {
    expect(publishedVisibility([])).toBe('전체 공개');
    expect(publishedVisibility(['하늘'])).toBe('전체 공개 · 하늘에게 숨김');
  });
});

const NAMES = new Map([
  ['u1', '하늘'],
  ['u2', '바다'],
]);
const feed = (hidden: string[]) => ({
  id: 'f1',
  version: 1,
  visibility: { hiddenViewerUserIds: hidden, version: 1 },
});

describe('hiddenLabel', () => {
  it('첫 이름과 나머지 수, 이름을 모르면 수만', () => {
    expect(hiddenLabel([], NAMES)).toBeNull();
    expect(hiddenLabel(['u1'], NAMES)).toBe('하늘');
    expect(hiddenLabel(['u9', 'u2', 'u1'], NAMES, '님')).toBe('바다님 외 2명');
    expect(hiddenLabel(['u8', 'u9'], NAMES)).toBe('2명');
  });
});

describe('recordFeed', () => {
  it('게시 전이면 draft', () => {
    expect(recordFeed(null, NAMES, ['서연'])).toEqual({ status: 'draft' });
    expect(recordFeed(undefined, NAMES, [])).toEqual({ status: 'draft' });
  });

  it('숨긴 친구와 다른 동행이 있으면 동행 피드에서는 보인다고 알린다', () => {
    expect(recordFeed(feed(['u1']), NAMES, ['서연'])).toEqual({
      status: 'published',
      visibility: '전체 공개 · 하늘에게 숨김',
      hiddenNote: '하늘님은 서연님 피드에서는 볼 수 있어요',
    });
    expect(recordFeed(feed(['u1', 'u2']), NAMES, ['서연', '민준'])).toMatchObject({
      hiddenNote: '하늘님 외 1명은 다른 동행 피드에서는 볼 수 있어요',
    });
  });

  it('혼자 간 여행이거나 숨긴 친구가 없으면 안내 줄이 없다', () => {
    expect(recordFeed(feed(['u1']), NAMES, [])).toMatchObject({ hiddenNote: null });
    expect(recordFeed(feed([]), NAMES, ['서연'])).toEqual({
      status: 'published',
      visibility: '전체 공개',
      hiddenNote: null,
    });
  });
});
