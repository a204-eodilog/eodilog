import { describe, expect, it } from '@jest/globals';

import {
  placePinLabels,
  profileLine,
  regionIdsToLookUp,
  toMyPageSummary,
  tripListLine,
} from './mypage-rules';
import type { MyFeed, MyTrip } from './types';

const trip = (id: string, status: string, regions: string[] = []): MyTrip => ({
  id,
  title: `여행 ${id}`,
  startDate: null,
  endDate: null,
  destinationRegionIds: regions,
  status,
});

const trips = [
  trip('a', 'COMPLETED', ['r-gj']),
  trip('b', 'COMPLETED', ['r-jj']),
  trip('c', 'COMPLETED', ['r-jj']),
  trip('d', 'COMPLETED'),
  trip('e', 'PLANNING', ['r-gj']),
];
const feeds: MyFeed[] = [
  {
    id: 'f1',
    tripId: 'a',
    title: '봄 경주',
    regions: [{ id: 'r-gj', code: '4713000000', name: '경주' }],
  },
];
const regionCodes = new Map([['r-jj', '5211000000']]);

describe('toMyPageSummary', () => {
  const s = toMyPageSummary({
    nickname: '하늘',
    profileImageUrl: null,
    trips,
    feeds,
    regionCodes,
    followerCount: 4,
    followingCount: 5,
  });

  it('다녀온 여행만 세고 핀을 꽂는다. 여행지가 없으면 핀 없는 여행', () => {
    expect(s.visitedCount).toBe(4);
    expect(s.postedCount).toBe(1);
    expect(s.tripCount).toBe(5);
    expect(s.pinlessCount).toBe(1);
  });
  it('게시한 여행은 피드 제목·지역으로, 같은 지역은 묶는다', () => {
    expect(s.pins).toEqual([
      { regionCode: '4713000000', label: '봄 경주', posted: true, tripIds: ['a'] },
      { regionCode: '5211000000', label: '여행 b 외 1개', posted: false, tripIds: ['b', 'c'] },
    ]);
  });
  it('지역 코드를 아직 모르면 핀 없는 여행으로 센다', () => {
    const t = toMyPageSummary({
      nickname: '하늘',
      profileImageUrl: null,
      trips,
      feeds,
      regionCodes: new Map(),
      followerCount: null,
      followingCount: null,
    });
    expect(t.pinlessCount).toBe(3);
  });
});

describe('글자', () => {
  it('프로필 한 줄과 내 여행 목록 한 줄', () => {
    expect(profileLine({ visitedCount: 4, postedCount: 1 })).toBe('다녀온 여행 4개 · 게시 1개');
    expect(profileLine({ visitedCount: 0, postedCount: 0 })).toBe('아직 기록한 여행이 없어요');
    expect(tripListLine({ tripCount: 7, pinlessCount: 1 })).toBe('7개 · 핀 없는 여행 1개 포함');
    expect(tripListLine({ tripCount: 3, pinlessCount: 0 })).toBe('3개');
  });
  it('코드를 찾아야 하는 지역은 게시 전 다녀온 여행의 첫 지역만, 겹치지 않게', () => {
    expect(regionIdsToLookUp(trips, feeds)).toEqual(['r-jj']);
  });
});

describe('placePinLabels', () => {
  it('떨어진 핀은 점 바로 위에 둔다', () => {
    const spots = placePinLabels([
      { key: 'a', x: 0, y: 0, width: 80 },
      { key: 'b', x: 300, y: 0, width: 80 },
    ]);
    expect(spots.get('a')).toEqual({ dx: 0, below: false });
    expect(spots.get('b')).toEqual({ dx: 0, below: false });
  });

  it('알약이 겹치면 뒤 핀을 옮겨 겹치지 않게 한다', () => {
    const spots = placePinLabels([
      { key: 'a', x: 0, y: 0, width: 80 },
      { key: 'b', x: 40, y: 10, width: 80 },
    ]);
    expect(spots.get('a')).toEqual({ dx: 0, below: false });
    expect(spots.get('b')).not.toEqual({ dx: 0, below: false });
  });
});
