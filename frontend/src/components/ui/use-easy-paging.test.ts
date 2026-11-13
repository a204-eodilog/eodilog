import { describe, expect, it } from '@jest/globals';

import { nextPage } from './use-easy-paging';

describe('nextPage', () => {
  it('조금만 밀어도 민 방향으로 한 장 넘어간다', () => {
    expect(nextPage(1, 30, 4)).toBe(2);
    expect(nextPage(1, -30, 4)).toBe(0);
  });

  it('아주 조금 밀면 제자리다', () => {
    expect(nextPage(1, 10, 4)).toBe(1);
  });

  it('세게 밀어도 한 장만 넘어가고, 처음과 끝을 넘지 않는다', () => {
    expect(nextPage(1, 900, 4)).toBe(2);
    expect(nextPage(3, 200, 4)).toBe(3);
    expect(nextPage(0, -200, 4)).toBe(0);
  });
});
