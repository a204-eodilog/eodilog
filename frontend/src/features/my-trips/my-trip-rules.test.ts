import { describe, expect, it } from '@jest/globals';

import { companionNames, formatPeriod, groupMyTrips } from './my-trip-rules';
import type { MyTrip, MyTripStatus } from './types';

function person(id: string, nickname: string, joinOrder: number) {
  return {
    id: `m-${id}`,
    joinOrder,
    user: {
      id,
      nickname,
      profileImageUrl: null,
      accountVisibility: 'PUBLIC' as const,
      followingStatus: 'NONE' as const,
      followedByStatus: 'NONE' as const,
    },
  };
}

function trip(id: string, status: MyTripStatus): MyTrip {
  return { id, title: id, startDate: null, endDate: null, status, members: [] };
}

describe('groupMyTrips', () => {
  it('여행 중 → 다녀온 → 계획 중 순서, 빈 묶음은 뺀다', () => {
    const groups = groupMyTrips([
      trip('a', 'PLANNING'),
      trip('b', 'COMPLETED'),
      trip('c', 'COMPLETED'),
    ]);
    expect(groups.map((g) => [g.title, g.trips.map((t) => t.id)])).toEqual([
      ['다녀온 여행', ['b', 'c']],
      ['계획 중인 여행', ['a']],
    ]);
  });

  it('여행 중인 여행은 맨 위 묶음', () => {
    expect(groupMyTrips([trip('a', 'COMPLETED'), trip('b', 'ONGOING')])[0].title).toBe('여행 중');
  });
});

describe('formatPeriod', () => {
  it('"MM.DD – MM.DD", 하루면 하나, 미정이면 null', () => {
    expect(formatPeriod('2026-11-14', '2026-11-15')).toBe('11.14 – 11.15');
    expect(formatPeriod('2026-08-08', '2026-08-08')).toBe('08.08');
    expect(formatPeriod(null, null)).toBeNull();
  });
});

it('동행 이름은 나를 빼고 참여 순', () => {
  const t: MyTrip = {
    ...trip('t', 'COMPLETED'),
    members: [person('me', '지우', 1), person('u3', '민준', 3), person('u2', '서연', 2)],
  };
  expect(companionNames(t, 'me')).toBe('서연, 민준');
  expect(companionNames({ ...t, members: [person('me', '지우', 1)] }, 'me')).toBe('');
});
