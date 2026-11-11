import { describe, expect, it } from '@jest/globals';

import { joinPaths, KOREA_MAP, SIDO_PATH, SIGUNGU_PATH, sigunguPathsByColor } from './korea-map';

describe('지도 경로 합치기', () => {
  it('시도·시군구 경로를 모두 이어 붙인다', () => {
    expect(SIDO_PATH).toBe(KOREA_MAP.sido.map((r) => r.d).join(' '));
    expect(SIGUNGU_PATH).toBe(KOREA_MAP.sigungu.map((r) => r.d).join(' '));
    expect(joinPaths([{ d: 'M0 0Z' }, { d: 'M1 1Z' }])).toBe('M0 0Z M1 1Z');
  });

  it('칠할 지역이 없으면 기본색 경로 하나', () => {
    expect(sigunguPathsByColor({}, '#fff')).toEqual([['#fff', SIGUNGU_PATH]]);
  });

  it('지역 코드나 상위 시도 코드로 칠한 색끼리 묶고, 나머지는 기본색', () => {
    const [first, second] = KOREA_MAP.sigungu;
    const otherSido = KOREA_MAP.sido.find(
      (s) => s.code !== first.parent && s.code !== second.parent,
    );
    if (!otherSido) throw new Error('시도가 둘 이상이어야 한다');
    const groups = sigunguPathsByColor({ [first.code]: 'red', [otherSido.code]: 'blue' }, '#fff');
    const byColor = new Map(groups);

    expect(byColor.get('red')).toBe(first.d);
    const inOther = KOREA_MAP.sigungu.filter((r) => r.parent === otherSido.code);
    expect(byColor.get('blue')).toBe(joinPaths(inOther));
    // 모든 시군구가 한 번씩만 들어간다
    const total = groups.reduce((n, [, d]) => n + d.split('M').length - 1, 0);
    expect(total).toBe(SIGUNGU_PATH.split('M').length - 1);
  });
});
