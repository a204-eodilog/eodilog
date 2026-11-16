import { describe, expect, it, jest } from '@jest/globals';

import { type Facility, toFacilityRows, withoutDuplicates } from './facility';

// 서버 주소 설정 없이 순수 함수만 시험한다
jest.mock('@/api/client', () => ({ apiClient: {} }));

const f = (id: string, name: string, lat: number, lng: number, walk: number): Facility => ({
  providerId: id,
  name,
  type: 'PHARMACY',
  latitude: lat,
  longitude: lng,
  walkingSeconds: walk,
  availability: null,
  queriedAt: '2026-11-16T01:00:00Z',
});

describe('withoutDuplicates', () => {
  it('이름이 같고 30m 안이면 하나만 남긴다', () => {
    const items = [
      f('a', '해운메디약국', 35.1622068, 129.1572417, 60),
      f('b', '해운메디약국', 35.1622254, 129.1572092, 61),
      f('c', '해운메디 약국', 35.16221, 129.15724, 62),
    ];
    expect(withoutDuplicates(items).map((x) => x.providerId)).toEqual(['a']);
  });

  it('이름이 같아도 멀면, 가까워도 이름이 다르면 둘 다 남긴다', () => {
    const items = [
      f('a', '우리약국', 35.16, 129.16, 60),
      f('b', '우리약국', 35.17, 129.16, 600),
      f('c', '온천약국', 35.16, 129.16, 61),
    ];
    expect(withoutDuplicates(items)).toHaveLength(3);
  });
});

describe('toFacilityRows', () => {
  it('가까운 쪽을 남기고 번호를 다시 매긴다', () => {
    const rows = toFacilityRows([
      f('far', '더좋은약사와약국', 35.1619024, 129.1611731, 300),
      f('near', '더좋은약사와약국', 35.1618991, 129.1611667, 120),
      f('x', '행복한약국', 35.162258, 129.1619506, 200),
    ]);
    expect(rows.map((r) => [r.id, r.number])).toEqual([
      ['near', 1],
      ['x', 2],
    ]);
  });
});
