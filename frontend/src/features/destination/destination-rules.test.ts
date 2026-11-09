import { describe, expect, it, jest } from '@jest/globals';

import { toFacilityRows } from '@/features/facility/facility';
import { toPlaceInfo } from '@/features/place/info';
import { withIga } from '@/lib/korean';

import {
  areaOf,
  rankMove,
  toDestinationInfo,
  toTrendBoard,
  trendRange,
  updatedLine,
} from './destination-rules';
import type { TrendRegion } from './types';

// 장소·시설 규칙 파일이 API 부르는 함수도 같이 들고 있어 설정값을 대신한다
jest.mock('@/config/env', () => ({
  env: { appEnv: 'local', apiBaseUrl: 'http://test', kakaoRedirectUri: null },
}));

const trend = (
  rank: number,
  code: string,
  name: string,
  extra: Partial<TrendRegion> = {},
): TrendRegion => ({
  region: { id: `r-${rank}`, code, name, parentId: null, latitude: null, longitude: null },
  rank,
  previousRank: null,
  rankChange: null,
  isNew: false,
  publishedTripCount: 10,
  followingCount: 0,
  from: '2026-09-24',
  to: '2026-10-23',
  sampleSize: 100,
  updatedAt: '2026-10-23T06:00:00',
  insufficientData: false,
  ...extra,
});

describe('S09 트렌드', () => {
  it('기간은 오늘 포함 최근 30일', () => {
    expect(trendRange('2026-10-23')).toEqual({ from: '2026-09-24', to: '2026-10-23' });
  });
  it('순위 변동: 새로 · 오름 · 내림 · 그대로', () => {
    expect(rankMove({ isNew: true, rankChange: 3 })).toEqual({ kind: 'new' });
    expect(rankMove({ isNew: false, rankChange: 2 })).toEqual({ kind: 'up', by: 2 });
    expect(rankMove({ isNew: false, rankChange: -1 })).toEqual({ kind: 'down', by: 1 });
    expect(rankMove({ isNew: false, rankChange: null })).toEqual({ kind: 'same' });
  });
  it('지역 이름은 짧게, 위에 시도', () => {
    const board = toTrendBoard(
      [trend(2, '4713000000', '경상북도 경주시'), trend(1, '5115000000', '강원특별자치도 강릉시')],
      { from: '2026-09-24', to: '2026-10-23' },
      '2026-10-23',
    );
    expect(board.rows.map((r) => [r.rank, r.name, r.sido])).toEqual([
      [1, '강릉', '강원'],
      [2, '경주', '경북'],
    ]);
    expect(board.periodLine).toBe('최근 30일 · 09.24 – 10.23');
    expect(board.updatedLine).toBe('오늘 06:00 기준');
    expect(board.insufficient).toBe(false);
  });
  it('비었거나 모두 자료 부족이면 순위를 보이지 않는다', () => {
    const range = { from: '2026-09-24', to: '2026-10-23' };
    expect(toTrendBoard([], range).insufficient).toBe(true);
    expect(
      toTrendBoard([trend(1, '5115000000', '강릉시', { insufficientData: true })], range)
        .insufficient,
    ).toBe(true);
  });
  it('갱신 시각이 오늘이 아니면 날짜를 붙인다', () => {
    expect(updatedLine('2026-11-05T06:00:00', '2026-11-06')).toBe('11.05 06:00 기준');
    expect(updatedLine(null)).toBeNull();
  });
  it('시도 자신은 상위 지역이 없다', () => {
    expect(areaOf('5100000000')).toBeNull();
  });
});

describe('N3 여행지 정보', () => {
  it('지역 이름·시도·대표 장소', () => {
    const info = toDestinationInfo({
      region: {
        id: 'r',
        code: '5115000000',
        name: '강원특별자치도 강릉시',
        parentId: null,
        latitude: null,
        longitude: null,
      },
      introduction: '겨울 바다',
      representativePlaces: [
        { id: 'p', name: '강문 해변', address: null, latitude: 0, longitude: 0 },
      ],
      partialErrors: [],
    });
    expect(info).toMatchObject({ name: '강릉', area: '강원', introduction: '겨울 바다' });
    expect(info.places).toEqual([{ id: 'p', name: '강문 해변', address: null }]);
  });
});

describe('N7 장소 정보', () => {
  const place = {
    id: 'p',
    name: '명주동 골목 카페',
    address: '강릉 명주동',
    latitude: 0,
    longitude: 0,
    regionId: null,
    provider: null,
    providerPlaceId: null,
    source: 'PROVIDER' as const,
  };
  const user = (nickname: string) => ({
    id: nickname,
    nickname,
    profileImageUrl: null,
    accountVisibility: 'PUBLIC' as const,
    followingStatus: 'ACCEPTED' as const,
    followedByStatus: 'NONE' as const,
  });
  it('다녀간 친구 한 줄과 평점·첫 평가', () => {
    const info = toPlaceInfo({
      place,
      social: {
        place,
        visitorCount: 1,
        visitors: [user('나래')],
        averageScore: 4.46,
        reviewCount: 1,
        partialErrors: [],
      },
      reviews: [
        { id: 'b', author: user('가람'), score: 4, body: '두 번째', writtenAt: '2026-10-21' },
        {
          id: 'a',
          author: user('나래'),
          score: 5,
          body: '조용히 쉬기 좋아요',
          writtenAt: '2026-10-20',
        },
      ],
    });
    expect(info).toMatchObject({
      visitorsLine: '나래가 다녀왔어요',
      score: 4.5,
      review: '조용히 쉬기 좋아요',
    });
  });
  it('여럿이면 "외 N명", 요약이 없으면 그 줄을 뺀다', () => {
    const many = toPlaceInfo({
      place,
      social: {
        place,
        visitorCount: 3,
        visitors: [user('가람')],
        averageScore: null,
        reviewCount: 0,
        partialErrors: [],
      },
    });
    expect(many.visitorsLine).toBe('가람 외 2명이 다녀왔어요');
    expect(many.score).toBeNull();
    expect(toPlaceInfo({ place }).visitorsLine).toBeNull();
  });
  it('이/가', () => {
    expect(withIga('가람')).toBe('가람이');
    expect(withIga('나래')).toBe('나래가');
    expect(withIga('ABC')).toBe('ABC이(가)');
  });
});

describe('S28 주변 편의시설', () => {
  it('가까운 순, 걷는 시간·확인 시각', () => {
    const rows = toFacilityRows([
      {
        providerId: 'b',
        name: '멀리',
        type: 'EV_CHARGER',
        latitude: 0,
        longitude: 0,
        walkingSeconds: 720,
        availability: null,
        queriedAt: '2026-11-06T10:15:00',
      },
      {
        providerId: 'a',
        name: '가까이',
        type: 'EV_CHARGER',
        latitude: 0,
        longitude: 0,
        walkingSeconds: 290,
        availability: '급속 2대 사용 가능',
        queriedAt: '2026-11-06T10:15:00',
      },
    ]);
    expect(rows.map((r) => [r.number, r.name, r.walk, r.status])).toEqual([
      [1, '가까이', '도보 5분', '급속 2대 사용 가능 · 10:15 확인'],
      [2, '멀리', '도보 12분', null],
    ]);
  });
});
