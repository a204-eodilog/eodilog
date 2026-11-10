import { describe, expect, it } from '@jest/globals';

import { buildCandidateOptions, regionCounts, UNKNOWN_NAME } from './candidate-options';
import { candidate, savedPlace } from './testing';

const saved = [
  savedPlace('p1', 'busan', { name: '해운대 해변', address: '부산 해운대구' }),
  savedPlace('p2', 'gangneung', { name: '강문 해변', address: '강릉 강문동' }),
  savedPlace('p3', 'busan', { name: '광안리 카페', address: '부산 수영구' }),
  savedPlace('p4', null, { name: '지역 없는 곳' }),
];
const names = { busan: '부산', gangneung: '강릉' };

describe('regionCounts', () => {
  it('지역별로 묶어 장소 수를 세고 많은 순으로 놓는다, 지역 없는 장소는 뺀다', () => {
    expect(regionCounts(saved)).toEqual([
      { regionId: 'busan', count: 2 },
      { regionId: 'gangneung', count: 1 },
    ]);
  });
});

describe('buildCandidateOptions', () => {
  it('지역 투표는 지역 이름과 그룹 즐겨찾기 N곳', () => {
    expect(buildCandidateOptions('REGION', saved, [], names)).toEqual([
      { key: 'busan', title: '부산', subtitle: '그룹 즐겨찾기 2곳', input: { regionId: 'busan' } },
      {
        key: 'gangneung',
        title: '강릉',
        subtitle: '그룹 즐겨찾기 1곳',
        input: { regionId: 'gangneung' },
      },
    ]);
  });

  it('이름을 아직 받지 못한 지역은 알 수 없는 곳', () => {
    expect(buildCandidateOptions('REGION', saved, [], {})[0].title).toBe(UNKNOWN_NAME);
  });

  it('장소 투표는 담은 순서 그대로 이름과 주소', () => {
    const options = buildCandidateOptions('PLACE', saved, [], names);
    expect(options.map((o) => o.title)).toEqual([
      '해운대 해변',
      '강문 해변',
      '광안리 카페',
      '지역 없는 곳',
    ]);
    expect(options[0]).toMatchObject({
      subtitle: '부산 해운대구',
      input: { placeId: 'p1' },
      savedCount: 1,
      savers: [],
    });
    const named = buildCandidateOptions('PLACE', saved, [], names, { me: '영광' });
    expect(named[0].savers).toEqual(['영광']);
  });

  it('이미 후보인 곳은 뺀다', () => {
    const regionTaken = [candidate('c1', { regionId: 'busan' })];
    expect(buildCandidateOptions('REGION', saved, regionTaken, names).map((o) => o.key)).toEqual([
      'gangneung',
    ]);
    const placeTaken = [candidate('c1', { regionId: null, placeId: 'p2' })];
    expect(buildCandidateOptions('PLACE', saved, placeTaken, names).map((o) => o.key)).toEqual([
      'p1',
      'p3',
      'p4',
    ]);
  });

  it('그룹 즐겨찾기가 비면 후보도 없다', () => {
    expect(buildCandidateOptions('REGION', [], [], names)).toEqual([]);
    expect(buildCandidateOptions('PLACE', [], [], names)).toEqual([]);
  });
});
