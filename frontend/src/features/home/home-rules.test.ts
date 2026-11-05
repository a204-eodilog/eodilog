import { describe, expect, it } from '@jest/globals';

import { colors } from '@/theme';

import {
  fillStepsFor,
  clusterMarks,
  groupBySido,
  isGroup,
  placePhotoPins,
  fillsFor,
  homeState,
  nightsLabel,
  toRecommendations,
  toRegionMarks,
} from './home-rules';
import type { MapResult } from './types';

const region = (code: string, name: string) => ({
  id: `r-${code}`,
  code,
  name,
  parentId: null,
  latitude: null,
  longitude: null,
});

const result = (markers: MapResult['markers']): MapResult => ({
  markers,
  criteria: { from: null, to: null, regionGrouping: 'SIGUNGU' },
  updatedAt: '2026-11-05T00:00:00Z',
});

describe('toRegionMarks', () => {
  it('지역 코드로 경계와 맞추고 짧은 이름을 쓴다', () => {
    const marks = toRegionMarks(
      result([
        {
          region: region('5115000000', '강원특별자치도 강릉시'),
          feedIds: ['f1'],
          visibleMemberUserIds: ['a', 'b'],
          visitCount: 3,
        },
      ]),
    );
    expect(marks).toEqual([
      expect.objectContaining({
        regionCode: '5115000000',
        name: '강릉',
        memberCount: 2,
        visitCount: 3,
      }),
    ]);
  });

  it('같은 지역은 합치고 친구는 한 번만 센다', () => {
    const marks = toRegionMarks(
      result([
        {
          region: region('5115000000', '강원특별자치도 강릉시'),
          feedIds: ['f1'],
          visibleMemberUserIds: ['a'],
          visitCount: 1,
        },
        {
          region: region('5115000000', '강원특별자치도 강릉시'),
          feedIds: ['f2'],
          visibleMemberUserIds: ['a', 'b'],
          visitCount: 2,
        },
      ]),
    );
    expect(marks[0]).toMatchObject({ memberCount: 2, visitCount: 3, feedIds: ['f1', 'f2'] });
  });

  it('지도에 없는 코드는 뺀다', () => {
    expect(
      toRegionMarks(
        result([
          {
            region: region('9999999999', '없는 곳'),
            feedIds: [],
            visibleMemberUserIds: ['a'],
            visitCount: 1,
          },
        ]),
      ),
    ).toEqual([]);
  });
});

describe('fillsFor', () => {
  it('친구 수가 많을수록 진한 파랑', () => {
    const fills = fillsFor([
      {
        regionCode: 'a',
        name: 'a',
        memberCount: 1,
        memberIds: [],
        memberNames: [],
        coverUrl: null,
        visitCount: 1,
        feedIds: [],
      },
      {
        regionCode: 'b',
        name: 'b',
        memberCount: 5,
        memberIds: [],
        memberNames: [],
        coverUrl: null,
        visitCount: 1,
        feedIds: [],
      },
    ]);
    expect(fills).toEqual({ a: colors.map.step1, b: colors.map.step4 });
  });
});

describe('fillStepsFor', () => {
  it('적게 다녀간 곳부터, 많이 다녀간 곳은 진한 겹까지', () => {
    const m = (regionCode: string, memberCount: number) => ({
      regionCode,
      name: regionCode,
      memberCount,
      memberIds: [],
      memberNames: [],
      coverUrl: null,
      visitCount: 1,
      feedIds: [],
    });
    expect(fillStepsFor([m('a', 3), m('b', 1), m('c', 6)])).toEqual([
      { code: 'b', colors: [colors.map.step1] },
      { code: 'a', colors: [colors.map.step1, colors.map.step2, colors.map.step3] },
      {
        code: 'c',
        colors: [colors.map.step1, colors.map.step2, colors.map.step3, colors.map.step4],
      },
    ]);
  });
});

describe('groupBySido', () => {
  const m = (regionCode: string, memberIds: string[]) => ({
    regionCode,
    name: regionCode,
    memberCount: memberIds.length,
    memberIds,
    memberNames: [],
    coverUrl: null,
    visitCount: 1,
    feedIds: [],
  });
  it('같은 시도 여러 곳은 묶고 친구는 한 번만, 혼자면 그대로', () => {
    const items = groupBySido([
      m('5115000000', ['a', 'b']),
      m('5121000000', ['b', 'c']),
      m('4713000000', ['d']),
    ]);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      key: 'sido-5100000000',
      label: '강원 2곳',
      placeCount: 2,
      memberCount: 3,
    });
    expect(items[1]).toMatchObject({ regionCode: '4713000000' });
  });
});

describe('clusterMarks', () => {
  const m = (regionCode: string, name: string, n: number) => ({
    regionCode,
    name,
    memberCount: n,
    memberIds: Array.from({ length: n }, (_, i) => `${regionCode}-${i}`),
    memberNames: [],
    coverUrl: null,
    visitCount: 1,
    feedIds: [],
  });
  const marks = [
    m('5115000000', '강릉', 3),
    m('5117000000', '동해', 2),
    m('4713000000', '경주', 1),
  ];
  it('작게 보면 가까운 강릉·동해가 묶이고 친구 많은 강릉이 대표', () => {
    const items = clusterMarks(marks, 1, { width: 100, height: 44 });
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ label: '강릉 외 1곳', placeCount: 2, memberCount: 5 });
  });
  it('크게 보면 모두 따로', () => {
    expect(clusterMarks(marks, 50, { width: 100, height: 44 })).toHaveLength(3);
  });
});

describe('placePhotoPins', () => {
  const m = (regionCode: string, name: string, n: number) => ({
    regionCode,
    name,
    memberCount: n,
    memberIds: Array.from({ length: n }, (_, i) => `${regionCode}-${i}`),
    memberNames: [],
    coverUrl: null,
    visitCount: 1,
    feedIds: [],
  });
  // 강릉(584,153)·평창(530,178)·동해(612,190)·춘천(428,123)
  const marks = [
    m('5115000000', '강릉', 3),
    m('5176000000', '평창', 4),
    m('5117000000', '동해', 2),
    m('5111000000', '춘천', 1),
  ];
  const card = { width: 176, height: 64, gap: 6 };
  it('카드 네모가 겹치지 않는 쪽을 고르고, 양쪽 다 막히면 가까운 카드와 묶는다', () => {
    const items = placePhotoPins(marks, 1, card);
    // 가까운 세 곳 중 하나는 묶이고 춘천은 따로
    const groups = items.filter(isGroup);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toMatch(/외 /);
    expect(items.some((i) => !isGroup(i) && i.mark.name === '춘천')).toBe(true);
  });
  it('충분히 크게 보면 모두 따로 놓이고 겹치지 않는다', () => {
    const items = placePhotoPins(marks, 6, card);
    expect(items.filter(isGroup)).toHaveLength(0);
    expect(items).toHaveLength(4);
  });
});

describe('nightsLabel', () => {
  it('박·일과 당일', () => {
    expect(nightsLabel('2026-11-14', '2026-11-16')).toBe('2박 3일');
    expect(nightsLabel('2026-11-14', '2026-11-14')).toBe('당일');
    expect(nightsLabel(null, '2026-11-14')).toBeNull();
  });
});

describe('toRecommendations', () => {
  it('피드는 여행, 장소는 장소 줄로', () => {
    const rows = toRecommendations([
      {
        type: 'FEED',
        reason: '좋아요한 여행과 비슷해요',
        place: null,
        feed: {
          id: 'f',
          tripId: 't',
          title: '제주 동쪽 한 바퀴',
          coverPhotoId: null,
          regions: [region('5011000000', '제주특별자치도 제주시')],
          startDate: '2026-10-01',
          endDate: '2026-10-03',
          publishedAt: '',
          likedByMe: false,
          likeCount: 0,
        },
      },
      {
        type: 'PLACE',
        reason: '',
        feed: null,
        place: { id: 'p', name: '명주동 골목 카페', address: '강릉 명주동', regionId: null },
      },
    ]);
    expect(rows.map((r) => [r.kind, r.title, r.meta, r.nights])).toEqual([
      ['trip', '제주 동쪽 한 바퀴', '제주', '2박 3일'],
      ['place', '명주동 골목 카페', '강릉 명주동', null],
    ]);
  });
});

describe('homeState', () => {
  const mark = [
    {
      regionCode: 'a',
      name: 'a',
      memberCount: 1,
      memberIds: [],
      memberNames: [],
      coverUrl: null,
      visitCount: 1,
      feedIds: [],
    },
  ];
  it('여행이 없으면 첫 방문이 먼저', () => {
    expect(homeState({ hasTrip: false, mapFailed: true, following: false, marks: [] })).toBe(
      'first-visit',
    );
  });
  it('지도 실패', () => {
    expect(homeState({ hasTrip: true, mapFailed: true, following: true, marks: undefined })).toBe(
      'error',
    );
  });
  it('친구가 없다고 확실할 때만 친구 없음, 모르면 공개 기록 없음', () => {
    expect(homeState({ hasTrip: true, mapFailed: false, following: false, marks: [] })).toBe(
      'no-friends',
    );
    expect(homeState({ hasTrip: true, mapFailed: false, following: null, marks: [] })).toBe(
      'no-public',
    );
  });
  it('표시할 지역이 있으면 기본', () => {
    expect(homeState({ hasTrip: true, mapFailed: false, following: null, marks: mark })).toBe(
      'ready',
    );
  });
});
