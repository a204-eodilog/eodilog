import { describe, expect, it, jest } from '@jest/globals';
import { AxiosError, AxiosHeaders } from 'axios';

import type { ItineraryItem, Review, Visit } from './types';
import {
  canSaveReview,
  companionReviewsOf,
  myReviewOf,
  placeNameOf,
  reviewFailure,
  seoulDayLabel,
  visitWhen,
} from './review-rules';

// visit-rules가 불러오는 것 중 apiClient까지 가지 않도록 막아 둔다
jest.mock('@/api/client', () => ({ apiClient: {} }));

const VISIT: Visit = {
  id: 'v1',
  tripId: 't',
  memberId: 'me',
  placeId: 'p1',
  visitedAt: '2026-11-14T01:00:00Z',
  evidenceType: 'MANUAL',
  reviewId: null,
  reviewScore: null,
};

function item(placeId: string, day: number, order: number, time: string | null): ItineraryItem {
  return {
    id: `i-${placeId}-${day}`,
    place: { id: placeId, name: '해운대 해변' },
    day,
    order,
    startTime: time,
  };
}

function review(
  id: string,
  author: string,
  placeId: string,
  createdAt: string,
  visitId = `v-${id}`,
): Review {
  return {
    id,
    visitId,
    authorMemberId: author,
    score: 4,
    body: '좋았어요',
    version: 1,
    createdAt,
    updatedAt: createdAt,
    visit: { placeId, visitedAt: createdAt },
    place: { name: '해운대 해변', address: null },
  };
}

function apiError(status: number, code: string) {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError('fail', undefined, config, undefined, {
    status,
    statusText: '',
    headers: {},
    config,
    data: { error: { code, message: '' } },
  });
}

describe('canSaveReview', () => {
  it('점수와 글이 있어야 저장할 수 있다', () => {
    expect(canSaveReview(4, '좋았어요')).toBe(true);
    expect(canSaveReview(null, '좋았어요')).toBe(false);
    expect(canSaveReview(4, '   ')).toBe(false);
  });

  it('글은 1,000자(이모지도 한 글자)까지', () => {
    expect(canSaveReview(5, '가'.repeat(1000))).toBe(true);
    expect(canSaveReview(5, '가'.repeat(1001))).toBe(false);
    expect(canSaveReview(5, '😀'.repeat(1000))).toBe(true);
  });
});

describe('visitWhen', () => {
  it('코스에 있으면 일차·날짜·시각, 같은 장소가 두 번이면 먼저 나오는 것', () => {
    const items = [item('p1', 2, 1, '09:00'), item('p1', 1, 1, '10:00')];
    expect(visitWhen(VISIT, items, '2026-11-14')).toBe('1일차 · 11.14(토) 10:00');
  });

  it('시각이 없으면 일차·날짜만', () => {
    expect(visitWhen(VISIT, [item('p1', 1, 1, null)], '2026-11-14')).toBe('1일차 · 11.14(토)');
  });

  it('코스에 없으면 다녀온 날(서울)', () => {
    expect(visitWhen({ ...VISIT, visitedAt: '2026-11-14T16:00:00Z' }, [], null)).toBe('11.15(일)');
  });
});

describe('평가 고르기', () => {
  const reviews = [
    review('r3', 'm3', 'p1', '2026-11-16T03:00:00Z'),
    review('r1', 'me', 'p1', '2026-11-14T03:00:00Z', 'v1'),
    review('r2', 'm2', 'p1', '2026-11-15T03:00:00Z'),
    review('r4', 'm2', 'p9', '2026-11-15T04:00:00Z'),
  ];

  it('내 평가는 이 방문의 평가', () => {
    expect(myReviewOf(VISIT, reviews)?.id).toBe('r1');
    expect(myReviewOf(VISIT, [])).toBeNull();
  });

  it('동행 평가는 같은 장소의 다른 사람 평가, 먼저 쓴 순', () => {
    expect(companionReviewsOf(VISIT, reviews).map((r) => r.id)).toEqual(['r2', 'r3']);
  });

  it('장소 이름은 코스 → 평가 요약 → "장소"', () => {
    expect(placeNameOf(VISIT, [item('p1', 1, 1, null)], [])).toBe('해운대 해변');
    expect(placeNameOf(VISIT, [], reviews)).toBe('해운대 해변');
    expect(placeNameOf(VISIT, [], [])).toBe('장소');
  });
});

it('seoulDayLabel은 서울 날짜로 바꾼다', () => {
  expect(seoulDayLabel('2026-11-15T03:00:00Z')).toBe('11.15(일)');
});

it('reviewFailure: 버전 충돌·이미 없음·그 밖', () => {
  expect(reviewFailure(apiError(409, 'VERSION_CONFLICT'))).toBe('conflict');
  expect(reviewFailure(apiError(404, 'REVIEW_NOT_FOUND'))).toBe('gone');
  expect(reviewFailure(apiError(404, 'VISIT_NOT_FOUND'))).toBe('gone');
  expect(reviewFailure(new Error('network'))).toBe('error');
});
