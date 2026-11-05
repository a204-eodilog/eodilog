import { describe, expect, it } from '@jest/globals';

import type { OwnFeedLite } from '@/features/feed';

import { viewFor } from './preview-rules';

const feed = (id: string, code: string, hidden: string[], extra: object = {}): OwnFeedLite =>
  ({
    id,
    tripId: `t-${id}`,
    title: id,
    startDate: '2026-04-11',
    endDate: '2026-04-12',
    regions: [{ id: `r-${code}`, code, name: id }],
    visibility: { feedId: id, hiddenViewerUserIds: hidden, version: 1, updatedAt: '' },
    ...extra,
  }) as OwnFeedLite;

describe('viewFor', () => {
  const feeds = [
    feed('봄 경주', '4713000000', [], { photos: [{ id: 'p', imageUrl: '' }], publicReviews: [1] }),
    feed('추석 전주', '5211000000', ['u1']),
    feed('겨울 여행', '2635000000', ['u1', 'u2']),
  ];

  it('그 친구를 숨긴 피드는 빼고 수만 센다', () => {
    const v = viewFor('u1', feeds);
    expect(v.cards.map((c) => c.title)).toEqual(['봄 경주']);
    expect(v.hiddenCount).toBe(2);
    expect(v.pins).toEqual([
      { regionCode: '4713000000', label: '봄 경주', posted: true, tripIds: ['t-봄 경주'] },
    ]);
  });
  it('실린 것만 태그로, 기간은 짧게', () => {
    const [card] = viewFor('u1', feeds).cards;
    expect(card.tags).toEqual(['사진', '평점']);
    expect(card.period).toBe('04.11 – 04.12');
  });
  it('숨기지 않은 친구에게는 모두 보인다', () => {
    expect(viewFor('u9', feeds).hiddenCount).toBe(0);
    expect(viewFor('u9', feeds).cards).toHaveLength(3);
  });
});
