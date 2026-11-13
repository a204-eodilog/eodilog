import { beforeEach, describe, expect, it } from '@jest/globals';

import { clearRouteAttempts, markRouteAttempt, routeAttempted } from './route-attempts';

beforeEach(() => clearRouteAttempts());

describe('이동 시간 계산을 요청해 본 코스', () => {
  it('요청한 여행과 버전만 기억한다', () => {
    expect(routeAttempted('trip-1', 3)).toBe(false);
    markRouteAttempt('trip-1', 3);
    expect(routeAttempted('trip-1', 3)).toBe(true);
    // 코스를 다시 저장하면 버전이 올라 새 코스로 본다
    expect(routeAttempted('trip-1', 4)).toBe(false);
    expect(routeAttempted('trip-2', 3)).toBe(false);
  });

  it('지우면 다시 요청할 수 있다', () => {
    markRouteAttempt('trip-1', 3);
    clearRouteAttempts();
    expect(routeAttempted('trip-1', 3)).toBe(false);
  });
});
