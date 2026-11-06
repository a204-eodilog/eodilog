import { describe, expect, it } from '@jest/globals';

import {
  addressParts,
  bookmarkSource,
  findBookmark,
  cityGroups,
  masonryColumns,
  regionFor,
  syncedAtLabel,
  toSavedItem,
} from './saved-rules';
import type { Bookmark } from './types';

function bookmark(
  name: string,
  address: string | null,
  lat = 35.15,
  lng = 129.11,
  sourceFeedId: string | null = null,
): Bookmark {
  return {
    place: {
      id: `p-${name}`,
      name,
      address,
      latitude: lat,
      longitude: lng,
      regionId: null,
      provider: null,
      providerPlaceId: null,
      source: 'PROVIDER',
    },
    retainedPlace: { name, latitude: lat, longitude: lng },
    memo: null,
    sourceFeedId,
    sourceUnavailable: false,
    createdAt: '2026-11-05T01:00:00Z',
  };
}

describe('addressParts', () => {
  it('특별시·광역시는 이름을 줄이고 구까지', () => {
    expect(addressParts('부산광역시 수영구 광안해변로 219')).toEqual(['부산', '수영구']);
    expect(addressParts('서울특별시 종로구')).toEqual(['서울', '종로구']);
    expect(addressParts('세종특별자치시 한누리대로')).toEqual(['세종', '한누리대로']);
  });

  it('도는 건너뛰고 시·군 이름과 다음 단계', () => {
    expect(addressParts('강원특별자치도 강릉시 강문동 산1')).toEqual(['강릉', '강문동']);
    expect(addressParts('제주특별자치도 제주시 애월읍')).toEqual(['제주', '애월읍']);
    expect(addressParts('경기도 양평군')).toEqual(['양평']);
  });

  it('주소가 없으면 빈 배열', () => {
    expect(addressParts(null)).toEqual([]);
    expect(addressParts('  ')).toEqual([]);
  });
});

describe('toSavedItem', () => {
  it('지역·출처를 붙인다', () => {
    const item = toSavedItem(bookmark('광안리 카페', '부산광역시 수영구 광안해변로', 1, 2, 'f1'));
    expect(item).toMatchObject({
      placeId: 'p-광안리 카페',
      city: '부산',
      area: '부산 수영구',
      source: '공동 피드',
    });
  });

  it('원본이 사라지면 남은 이름·위치를 쓴다', () => {
    const lost: Bookmark = {
      ...bookmark('x', null),
      place: null,
      retainedPlace: { name: '사라진 곳', latitude: 37, longitude: 127 },
      sourceUnavailable: true,
    };
    expect(toSavedItem(lost)).toMatchObject({
      placeId: null,
      name: '사라진 곳',
      latitude: 37,
      city: null,
      area: null,
    });
  });
});

it('masonryColumns는 짧은 열에 다음 카드를 넣는다', () => {
  const items = ['a', 'b', 'c', 'd'].map((n) => toSavedItem(bookmark(n, null)));
  const [left, right] = masonryColumns(items);
  // 높이 200(a)·160(b)·220(c)·180(d): a 왼쪽, b 오른쪽, c 오른쪽(160<200), d 왼쪽(200<380)
  expect(left.map((c) => c.item.name)).toEqual(['a', 'd']);
  expect(right.map((c) => c.item.name)).toEqual(['b', 'c']);
  expect(left[0].photoHeight).toBe(200);
});

it('cityGroups는 지역별로 묶어 가운데 위치와 개수를 낸다', () => {
  const items = [
    toSavedItem(bookmark('a', '강원특별자치도 강릉시 강문동', 37.8, 128.9)),
    toSavedItem(bookmark('b', '부산광역시 수영구', 35.1, 129.1)),
    toSavedItem(bookmark('c', '부산광역시 영도구', 35.3, 129.3)),
    toSavedItem(bookmark('d', null, 36, 127)),
  ];
  const groups = cityGroups(items);
  expect(groups.map((g) => [g.city, g.items.length])).toEqual([
    ['부산', 2],
    ['강릉', 1],
    ['기타', 1],
  ]);
  expect(groups[0].latitude).toBeCloseTo(35.2);
});

it('syncedAtLabel은 기기 시각 "HH:mm 기준이에요"', () => {
  const at = new Date(2026, 10, 5, 9, 5).getTime();
  expect(syncedAtLabel(at)).toBe('09:05 기준이에요');
});

describe('S14 즐겨찾기 찾기', () => {
  const kept = bookmark('강문 해변', '강원특별자치도 강릉시 강문동', 37, 128, 'f1');
  const lost: Bookmark = {
    ...bookmark('x', null),
    place: null,
    sourceFeedId: null,
    sourceUnavailable: true,
    retainedPlace: { name: '사라진 곳', latitude: 37, longitude: 127 },
  };

  it('목록 카드의 key로 즐겨찾기를 찾는다(원본이 사라져도)', () => {
    const list = [kept, lost];
    expect(findBookmark(list, toSavedItem(kept).key)).toBe(kept);
    expect(findBookmark(list, toSavedItem(lost).key)).toBe(lost);
    expect(findBookmark(list, 'nope')).toBeNull();
  });

  it('가져온 곳: 공동 피드 / 원본 없음 / 그 밖', () => {
    expect(bookmarkSource(kept)).toBe('feed');
    expect(bookmarkSource(lost)).toBe('lost');
    expect(bookmarkSource(bookmark('a', null))).toBe('none');
  });
});

describe('regionFor', () => {
  it('지역 장소가 모두 들어가고 아래쪽(카드 자리)을 더 넓게 둔다', () => {
    const items = [
      toSavedItem(bookmark('a', null, 35.08, 129.04)),
      toSavedItem(bookmark('b', null, 35.16, 129.12)),
    ];
    const r = regionFor(items);
    expect(r).not.toBeNull();
    if (!r) return;
    // 모든 장소가 범위 안
    for (const i of items) {
      expect(i.latitude).toBeGreaterThan(r.latitude);
      expect(i.latitude).toBeLessThan(r.latitude + r.latitudeDelta);
      expect(i.longitude).toBeGreaterThan(r.longitude);
      expect(i.longitude).toBeLessThan(r.longitude + r.longitudeDelta);
    }
    // 아래 여유가 위 여유보다 크다
    const below = 35.08 - r.latitude;
    const above = r.latitude + r.latitudeDelta - 35.16;
    expect(below).toBeGreaterThan(above);
  });

  it('한 곳뿐이면 최소 범위로, 없으면 null', () => {
    const r = regionFor([toSavedItem(bookmark('a', null, 37, 128))]);
    expect(r?.latitudeDelta).toBeCloseTo(0.042);
    expect(regionFor([])).toBeNull();
  });
});
