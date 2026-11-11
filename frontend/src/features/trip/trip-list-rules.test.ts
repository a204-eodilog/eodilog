import { describe, expect, it } from '@jest/globals';

import { tripListLead, visibleNextTrips } from './trip-list-rules';
import type { Trip } from './types';

const trip = (startDate: string | null, endDate: string | null) =>
  ({ id: 't', title: '여행', startDate, endDate }) as unknown as Trip;

describe('tripListLead', () => {
  const today = '2026-11-11';

  it('다음 계획은 시작 전이면 D-N, 여행 중이면 N일차다', () => {
    expect(tripListLead(trip('2026-11-28', '2026-11-29'), 'next', today)).toBe('D-17');
    expect(tripListLead(trip('2026-11-10', '2026-11-12'), 'next', today)).toBe('2일차');
  });

  it('다녀온 여행은 몇 박 며칠이고, 올해가 아니면 연도를 앞에 붙인다', () => {
    expect(tripListLead(trip('2026-10-02', '2026-10-04'), 'past', today)).toBe('2박 3일');
    expect(tripListLead(trip('2025-10-02', '2025-10-04'), 'past', today)).toBe('2025 · 2박 3일');
  });

  it('날짜가 없으면 붙일 글이 없다', () => {
    expect(tripListLead(trip(null, null), 'next', today)).toBeNull();
    expect(tripListLead(trip(null, null), 'past', today)).toBeNull();
  });
});

describe('visibleNextTrips', () => {
  const list = ['a', 'b', 'c', 'd', 'e'];

  it('3개까지만 보이고 나머지는 접힌다', () => {
    expect(visibleNextTrips(list, false)).toEqual({
      shown: ['a', 'b', 'c'],
      hiddenCount: 2,
      canToggle: true,
    });
  });

  it('펼치면 모두 보인다', () => {
    expect(visibleNextTrips(list, true)).toEqual({ shown: list, hiddenCount: 0, canToggle: true });
  });

  it('3개 이하면 접을 것이 없다', () => {
    expect(visibleNextTrips(['a', 'b', 'c'], false)).toEqual({
      shown: ['a', 'b', 'c'],
      hiddenCount: 0,
      canToggle: false,
    });
  });
});
