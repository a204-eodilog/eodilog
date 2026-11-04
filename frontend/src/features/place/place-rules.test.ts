import { describe, expect, it } from '@jest/globals';
import { AxiosError, type AxiosResponse } from 'axios';

import {
  PLACE_NAME_MAX_LENGTH,
  QUERY_MAX_LENGTH,
  formatCoord,
  normalizePlaceName,
  normalizeQuery,
  searchFailure,
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
