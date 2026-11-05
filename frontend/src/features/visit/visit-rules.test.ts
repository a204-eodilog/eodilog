import { describe, expect, it } from '@jest/globals';

import type { ItineraryItem, Visit } from './types';
import { buildVisitDays, dayTitle, manualVisitedAt, visitSummary } from './visit-rules';

function item(
  id: string,
  placeId: string,
  day: number,
  order: number,
  startTime: string | null = null,
): ItineraryItem {
  return { id, place: { id: placeId, name: `장소 ${placeId}` }, day, order, startTime };
}

function visit(
  placeId: string,
  evidenceType: Visit['evidenceType'],
  reviewScore: number | null = null,
): Visit {
  return {
    id: `v-${placeId}`,
    tripId: 't',
    memberId: 'me',
    placeId,
    visitedAt: '2026-11-14T01:00:00Z',
    evidenceType,
    reviewId: reviewScore === null ? null : `r-${placeId}`,
    reviewScore,
  };
}

describe('dayTitle', () => {
  it('시작일이 있으면 그날부터 센 날짜를 붙인다', () => {
    expect(dayTitle(1, '2026-11-14')).toBe('1일차 · 11.14(토)');
    expect(dayTitle(2, '2026-11-14')).toBe('2일차 · 11.15(일)');
  });

  it('기간이 없으면 일차만', () => {
    expect(dayTitle(1, null)).toBe('1일차');
  });
});

describe('buildVisitDays', () => {
  it('일차·순서로 묶고 방문 근거로 줄 상태를 정한다', () => {
    const days = buildVisitDays(
      [item('b', 'p2', 1, 2), item('c', 'p3', 2, 1), item('a', 'p1', 1, 1, '10:00')],
      [visit('p1', 'PHOTO'), visit('p3', 'MANUAL')],
      '2026-11-14',
    );
    expect(days.map((d) => d.day)).toEqual([1, 2]);
    expect(days[0].rows.map((r) => [r.itemId, r.state, r.number, r.time])).toEqual([
      ['a', 'photo', 1, '10:00'],
      ['b', 'planned', 2, null],
    ]);
    expect(days[1].rows[0].state).toBe('manual');
  });

  it('코스에 없는 장소의 방문은 줄을 만들지 않는다', () => {
    const days = buildVisitDays([item('a', 'p1', 1, 1)], [visit('p9', 'MANUAL')], null);
    expect(days[0].rows).toHaveLength(1);
    expect(days[0].rows[0].visit).toBeNull();
  });
});

describe('visitSummary', () => {
  const items = [item('a', 'p1', 1, 1), item('b', 'p2', 1, 2), item('c', 'p3', 1, 3)];

  it('다녀온 곳이 없으면 요약 없음', () => {
    expect(visitSummary(buildVisitDays(items, [], null))).toBeNull();
  });

  it('사진으로만 찾고 평가 전이면 찾은 곳 수', () => {
    const days = buildVisitDays(items, [visit('p1', 'PHOTO'), visit('p2', 'PHOTO')], null);
    expect(visitSummary(days)).toBe('사진으로 다녀온 곳 2곳을 찾았어요');
  });

  it('직접 체크나 평가가 있으면 평가한 수', () => {
    const days = buildVisitDays(items, [visit('p1', 'PHOTO', 4), visit('p2', 'MANUAL')], null);
    expect(visitSummary(days)).toBe('다녀온 곳 2곳 중 1곳 평가했어요');
  });

  it('같은 장소가 코스에 두 번 있어도 한 곳으로 센다', () => {
    const days = buildVisitDays(
      [item('a', 'p1', 1, 1), item('b', 'p1', 2, 1)],
      [visit('p1', 'MANUAL')],
      null,
    );
    expect(visitSummary(days)).toBe('다녀온 곳 1곳 중 0곳 평가했어요');
  });
});

describe('manualVisitedAt', () => {
  const now = new Date('2026-11-20T03:00:00Z');

  it('코스 시각이 지났으면 그 시각(서울)을 보낸다', () => {
    expect(manualVisitedAt('2026-11-14', 1, '10:00', now)).toBe('2026-11-14T01:00:00.000Z');
  });

  it('시각이 없으면 그날 낮 12시', () => {
    expect(manualVisitedAt('2026-11-14', 2, null, now)).toBe('2026-11-15T03:00:00.000Z');
  });

  it('아직 오지 않았거나 기간이 없으면 지금', () => {
    expect(manualVisitedAt('2026-12-01', 1, '10:00', now)).toBe(now.toISOString());
    expect(manualVisitedAt(null, 1, '10:00', now)).toBe(now.toISOString());
  });
});
