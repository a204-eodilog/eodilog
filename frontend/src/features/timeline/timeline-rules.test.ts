import { describe, expect, it } from '@jest/globals';

import {
  formatDistance,
  placeRows,
  seoulClock,
  sketchPoints,
  sortTimeline,
  summaryCells,
  tripLength,
  tripTag,
  groupByMonth,
} from './timeline-rules';
import type { PlaceTimelineItem, TimelineItem, TripSummary } from './types';

const item = (tripId: string, date: string | null): TimelineItem => ({
  tripId,
  feedId: null,
  date,
  dateBasis: date ? 'TRIP' : 'UNKNOWN',
  status: 'ACTIVE',
});

const stop = (over: Partial<PlaceTimelineItem> & { name: string }): PlaceTimelineItem => ({
  place: { id: over.name, name: over.name, latitude: 35, longitude: 129 },
  plannedAt: null,
  visitedAt: null,
  status: 'PLANNED',
  photoCount: 0,
  plannedDistanceMeters: null,
  ...over,
});

const summary = (over: Partial<TripSummary> = {}): TripSummary => ({
  tripId: 't',
  photoCount: 0,
  visitedPlaceCount: 0,
  visitedRegionCount: 0,
  plannedDistanceMeters: null,
  actualDistanceMeters: null,
  totalAmountMinor: null,
  currency: 'KRW',
  ...over,
});

describe('sortTimeline', () => {
  it('시작일 최신순, 날짜 없는 여행은 맨 아래, 같은 날은 tripId 큰 것부터', () => {
    const sorted = sortTimeline([
      item('a', null),
      item('b', '2026-09-26'),
      item('c', '2026-11-14'),
      item('d', '2026-11-14'),
      item('e', null),
    ]);
    expect(sorted.map((i) => i.tripId)).toEqual(['d', 'c', 'b', 'e', 'a']);
  });
});

describe('tripTag', () => {
  it('계획 중이 먼저, 그다음 게시됨, 나머지 비공개', () => {
    expect(tripTag('PLANNING', 'feed-1').label).toBe('계획 중');
    expect(tripTag('COMPLETED', 'feed-1').label).toBe('게시됨');
    expect(tripTag('ONGOING', null).label).toBe('비공개');
  });
});

describe('seoulClock', () => {
  it('UTC 시각을 서울 날짜·시각으로', () => {
    expect(seoulClock('2026-11-13T16:30:00Z')).toEqual({ day: '11.14', time: '01:30' });
  });
});

describe('placeRows', () => {
  const day1 = '2026-11-14T01:00:00Z'; // 서울 11.14 10:00
  const day1b = '2026-11-14T04:00:00Z'; // 11.14 13:00
  const day2 = '2026-11-15T05:00:00Z'; // 11.15 14:00

  it('같은 날 둘째 줄부터 날짜를 비우고, 다녀온 곳은 visited', () => {
    const rows = placeRows(
      [
        stop({
          name: '해운대',
          visitedAt: day1,
          plannedAt: day1,
          status: 'VISITED',
          photoCount: 3,
        }),
        stop({ name: '카페', visitedAt: day1b, plannedAt: day1b, status: 'VISITED' }),
        stop({ name: '흰여울', plannedAt: day2 }),
      ],
      'ONGOING',
    );
    expect(rows.map((r) => r.day)).toEqual(['11.14', null, '11.15']);
    expect(rows[0]).toMatchObject({ sub: '10:00 · 사진 3장', visited: true, planOnly: false });
    expect(rows[2]).toMatchObject({ sub: '14:00', visited: false, planOnly: false });
  });

  it('다녀온 여행에서 가지 않은 곳은 "가지 않았어요"와 계획만', () => {
    const [row] = placeRows([stop({ name: '흰여울', plannedAt: day2 })], 'COMPLETED');
    expect(row).toMatchObject({ sub: '14:00 · 가지 않았어요', planOnly: true });
  });

  it('시간 없는 계획은 "시간 미정"', () => {
    const [row] = placeRows([stop({ name: '협재' })], 'PLANNING');
    expect(row).toMatchObject({ day: null, sub: '시간 미정' });
  });
});

describe('tripLength', () => {
  it('N박 N+1일, 하루는 당일, 기간 없으면 null', () => {
    expect(tripLength('2026-11-14', '2026-11-15')).toBe('1박 2일');
    expect(tripLength('2026-11-14', '2026-11-14')).toBe('당일');
    expect(tripLength(null, null)).toBeNull();
  });
});

describe('formatDistance', () => {
  it('10km 이상은 정수, 아래는 소수 첫째, 1km 아래는 m', () => {
    expect(formatDistance(38_400)).toBe('약 38km');
    expect(formatDistance(3_240)).toBe('약 3.2km');
    expect(formatDistance(780)).toBe('약 800m');
    expect(formatDistance(null)).toBeNull();
  });
});

describe('summaryCells', () => {
  const trip = { startDate: '2026-11-14', endDate: '2026-11-15' };

  it('경비가 있으면 셋째 칸은 경비, 안내 없음', () => {
    const { cells, note } = summaryCells(
      summary({ actualDistanceMeters: 38_000, totalAmountMinor: 234_000, visitedPlaceCount: 4 }),
      trip,
    );
    expect(cells).toEqual([
      { label: '기간', value: '1박 2일' },
      { label: '이동거리', value: '약 38km' },
      { label: '경비', value: '23.4만 원' },
    ]);
    expect(note).toBeNull();
  });

  it('경비가 없고 다녀온 곳이 있으면 다녀온 곳 N곳 + 경비 안내', () => {
    const { cells, note } = summaryCells(
      summary({ plannedDistanceMeters: 12_000, visitedPlaceCount: 4 }),
      trip,
    );
    expect(cells[2]).toEqual({ label: '다녀온 곳', value: '4곳' });
    expect(note).toBe('경비를 입력하지 않아 넣지 않았어요');
  });

  it('코스·경비가 모두 없으면 미입력 값과 "코스·경비 아직 없음"', () => {
    const { cells, note } = summaryCells(summary(), { startDate: null, endDate: null });
    expect(cells.map((c) => c.value)).toEqual([null, null, null]);
    expect(note).toBe('코스·경비 아직 없음');
  });
});

describe('sketchPoints', () => {
  it('상자 안(둘레 pad)에 들어오고 동쪽이 오른쪽, 북쪽이 위', () => {
    const points = sketchPoints(
      [
        { id: 'west', latitude: 35.1, longitude: 129.0 },
        { id: 'east', latitude: 35.2, longitude: 129.2 },
      ],
      300,
      200,
      20,
    );
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(20);
      expect(p.x).toBeLessThanOrEqual(280);
      expect(p.y).toBeGreaterThanOrEqual(20);
      expect(p.y).toBeLessThanOrEqual(180);
    }
    expect(points[1].x).toBeGreaterThan(points[0].x);
    expect(points[1].y).toBeLessThan(points[0].y);
  });

  it('장소가 하나면 가운데', () => {
    expect(
      sketchPoints([{ id: 'a', latitude: 35, longitude: 129 }], 300, 200, 20)[0],
    ).toMatchObject({ x: 150, y: 100 });
  });
});

describe('groupByMonth', () => {
  const start = (d: string | null) => d;

  it('같은 달에 시작한 여행을 한 묶음으로 모은다', () => {
    const groups = groupByMonth(['2026-11-30', '2026-11-12', '2026-10-04', null], start);
    expect(groups.map((g) => [g.key, g.month, g.year, g.entries.length])).toEqual([
      ['2026-11', '11월', '2026년', 2],
      ['2026-10', '10월', '2026년', 1],
      ['none', '미정', null, 1],
    ]);
  });

  it('받은 순서를 바꾸지 않는다', () => {
    expect(groupByMonth(['2026-03-02', '2026-03-01'], start)[0].entries).toEqual([
      '2026-03-02',
      '2026-03-01',
    ]);
  });
});
