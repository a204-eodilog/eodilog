import { describe, expect, it } from '@jest/globals';

import { dashSegments, fitRegion, spreadMarkers } from './map-spread';

const box = { width: 330, height: 180 };

/** 화면 거리(px). spreadMarkers와 같은 계산 */
function px(
  region: NonNullable<ReturnType<typeof fitRegion>>,
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const cos = Math.cos(((region.latitude + region.latitudeDelta / 2) * Math.PI) / 180);
  const degPerPx = Math.max(
    region.latitudeDelta / box.height,
    (region.longitudeDelta * cos) / box.width,
  );
  return Math.hypot(
    ((a.longitude - b.longitude) * cos) / degPerPx,
    (a.latitude - b.latitude) / degPerPx,
  );
}

describe('fitRegion', () => {
  it('점이 없으면 null, 있으면 모든 점이 범위 안', () => {
    expect(fitRegion([], 0.01)).toBeNull();
    const pts = [
      { latitude: 37.77, longitude: 128.9 },
      { latitude: 37.9, longitude: 128.82 },
    ];
    const r = fitRegion(pts, 0.01)!;
    for (const p of pts) {
      expect(p.latitude).toBeGreaterThan(r.latitude);
      expect(p.latitude).toBeLessThan(r.latitude + r.latitudeDelta);
      expect(p.longitude).toBeGreaterThan(r.longitude);
      expect(p.longitude).toBeLessThan(r.longitude + r.longitudeDelta);
    }
  });
});

describe('spreadMarkers', () => {
  const far = [
    { latitude: 37.77, longitude: 128.9 },
    { latitude: 37.9, longitude: 128.82 },
  ];
  const close = [
    { latitude: 37.7718, longitude: 128.9478 },
    { latitude: 37.7719, longitude: 128.9479 },
    { latitude: 37.772, longitude: 128.9477 },
  ];

  it('멀리 떨어진 핀은 그대로 둔다', () => {
    const r = fitRegion(far, 0.01)!;
    expect(spreadMarkers(far, r, box)).toEqual(far);
  });

  it('겹치는 핀은 화면에서 30px 가까이 벌어진다', () => {
    const r = fitRegion([...far, ...close], 0.01)!;
    const out = spreadMarkers([...far, ...close], r, box);
    const moved = out.slice(2);
    for (let i = 0; i < moved.length; i += 1) {
      for (let j = i + 1; j < moved.length; j += 1) {
        expect(px(r, moved[i], moved[j])).toBeGreaterThanOrEqual(29);
      }
    }
    expect(out.slice(0, 2)).toEqual(far);
  });

  it('지도 크기를 모르면(0) 그대로', () => {
    const r = fitRegion(close, 0.01)!;
    expect(spreadMarkers(close, r, { width: 0, height: 0 })).toEqual(close);
  });
});

describe('dashSegments', () => {
  it('선을 짧은 조각 여러 개로 나누고, 조각은 모두 선 위에 있다', () => {
    const line = [
      { latitude: 37.77, longitude: 128.9 },
      { latitude: 37.9, longitude: 128.82 },
    ];
    const parts = dashSegments(line);
    expect(parts.length).toBeGreaterThan(10);
    for (const part of parts) {
      expect(part.length).toBeGreaterThanOrEqual(2);
      for (const p of part) {
        expect(p.latitude).toBeGreaterThanOrEqual(37.77);
        expect(p.latitude).toBeLessThanOrEqual(37.9);
      }
    }
    expect(parts[0][0]).toEqual(line[0]);
  });

  it('점이 하나거나 같은 자리면 비운다', () => {
    expect(dashSegments([{ latitude: 1, longitude: 1 }])).toEqual([]);
    expect(
      dashSegments([
        { latitude: 1, longitude: 1 },
        { latitude: 1, longitude: 1 },
      ]),
    ).toEqual([]);
  });
});
