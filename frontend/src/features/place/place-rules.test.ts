import { describe, expect, it } from '@jest/globals';
import { AxiosError, type AxiosResponse } from 'axios';

import {
  PLACE_NAME_MAX_LENGTH,
  QUERY_MAX_LENGTH,
  distanceLabel,
  distanceMeters,
  formatCoord,
  normalizePlaceName,
  normalizeQuery,
  nearParam,
  rankNear,
  searchFailure,
  shortAddress,
} from './place-rules';

describe('normalizeQuery', () => {
  it('공백을 정리하고 비면 null', () => {
    expect(normalizeQuery('  민락   수변 ')).toBe('민락 수변');
    expect(normalizeQuery('   ')).toBeNull();
  });

  it('너무 길면 잘라서 보낸다', () => {
    expect(normalizeQuery('가'.repeat(QUERY_MAX_LENGTH + 5))).toHaveLength(QUERY_MAX_LENGTH);
  });
});

it('normalizePlaceName: 비었거나 255자를 넘으면 null', () => {
  expect(normalizePlaceName(' 민락 수변공원 ')).toBe('민락 수변공원');
  expect(normalizePlaceName('')).toBeNull();
  expect(normalizePlaceName('가'.repeat(PLACE_NAME_MAX_LENGTH + 1))).toBeNull();
});

describe('searchFailure', () => {
  const withStatus = (status: number) =>
    new AxiosError('x', undefined, undefined, undefined, { status } as AxiosResponse);

  it('시간 초과와 공급자 장애는 slow', () => {
    expect(searchFailure(new AxiosError('t', 'ECONNABORTED'))).toBe('slow');
    expect(searchFailure(withStatus(503))).toBe('slow');
  });

  it('취소는 canceled, 나머지는 error', () => {
    expect(searchFailure(new AxiosError('c', 'ERR_CANCELED'))).toBe('canceled');
    expect(searchFailure(withStatus(500))).toBe('error');
    expect(searchFailure(new Error('x'))).toBe('error');
  });
});

it('formatCoord는 소수 넷째 자리까지', () => {
  expect(formatCoord(35.153212, 129.118634)).toBe('35.1532, 129.1186');
});

describe('지도에서 고르기 검색', () => {
  const center = { latitude: 37.5547, longitude: 126.9707 };
  it('거리 글자', () => {
    expect(distanceLabel(4)).toBe('10m');
    expect(distanceLabel(320)).toBe('320m');
    expect(distanceLabel(1234)).toBe('1.2km');
    expect(distanceLabel(15_400)).toBe('15km');
  });
  it('짧은 주소는 시도를 줄이고 세 칸까지', () => {
    expect(shortAddress('부산광역시 수영구 광안해변로 219')).toBe('부산 수영구 광안해변로');
    expect(shortAddress('강원 강릉시 강문동')).toBe('강원 강릉시 강문동');
    expect(shortAddress(null)).toBeNull();
  });
  it('이름이 똑같은 곳 먼저, 그다음 가까운 순', () => {
    const near = { name: '서울역 국밥', latitude: 37.5549, longitude: 126.971 };
    const far = { name: '서울역 카페', latitude: 37.57, longitude: 126.99 };
    const exact = { name: '서울역', latitude: 37.58, longitude: 127.0 };
    expect(rankNear([far, near, exact], '서울역', center).map((r) => r.place.name)).toEqual([
      '서울역',
      '서울역 국밥',
      '서울역 카페',
    ]);
    expect(distanceMeters(center, center)).toBe(0);
  });
});

describe('nearParam', () => {
  it('서버 near 값은 "위도,경도" 소수 6자리', () => {
    expect(nearParam({ latitude: 37.5547, longitude: 126.97071234 })).toBe('37.554700,126.970712');
  });
});
