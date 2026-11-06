import { describe, expect, it } from '@jest/globals';

import { routeLegend, routeLines, routeRegion } from './route-rules';
import type { FeedDay } from './types';

const stop = (n: number, latitude: number, longitude: number) =>
  ({ itemId: `i${n}`, number: n, point: { latitude, longitude } }) as FeedDay['stops'][number];

describe('routeRegion', () => {
  it('장소가 없으면 null', () => {
    expect(routeRegion([])).toBeNull();
  });
  it('모든 장소가 범위 안에 들어온다', () => {
    const pts = [
      { latitude: 37.79, longitude: 128.91 },
      { latitude: 37.75, longitude: 128.89 },
    ];
    const r = routeRegion(pts)!;
    for (const p of pts) {
      expect(p.latitude).toBeGreaterThan(r.latitude);
      expect(p.latitude).toBeLessThan(r.latitude + r.latitudeDelta);
      expect(p.longitude).toBeGreaterThan(r.longitude);
      expect(p.longitude).toBeLessThan(r.longitude + r.longitudeDelta);
    }
  });
  it('한 곳이어도 최소 범위를 둔다', () => {
    expect(routeRegion([{ latitude: 37.79, longitude: 128.91 }])!.latitudeDelta).toBeGreaterThan(
      0.02,
    );
  });
});

describe('routeLines', () => {
  it('1일차는 실선, 2일차부터 점선. 한 곳뿐인 날은 선이 없다', () => {
    const days = [
      { day: 1, dateLabel: null, stops: [stop(1, 37.7, 128.9), stop(2, 37.8, 128.9)] },
      { day: 2, dateLabel: null, stops: [stop(3, 37.7, 128.8), stop(4, 37.6, 128.8)] },
      { day: 3, dateLabel: null, stops: [stop(5, 37.5, 128.8)] },
    ] as unknown as FeedDay[];
    const lines = routeLines(days);
    expect(lines.map((l) => [l.day, l.dashed])).toEqual([
      [1, false],
      [2, true],
    ]);
  });
});

describe('routeLegend', () => {
  it('하루면 비우고, 이틀 이상이면 일차마다 선 색을 준다', () => {
    const day = (n: number) => ({ day: n, date: null, stops: [] }) as never;
    expect(routeLegend([day(1)])).toEqual([]);
    const legend = routeLegend([day(1), day(2)]);
    expect(legend.map((l) => l.day)).toEqual([1, 2]);
    expect(legend[0].color).not.toBe(legend[1].color);
  });
});
