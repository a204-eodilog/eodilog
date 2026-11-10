import { describe, expect, it } from '@jest/globals';

import { isMine, myMemo, overlapLabel, saverNames, shortAddress } from './group-rules';
import { place, saved } from './testing';

const members = [
  { id: 'm-seeun', name: '세은' },
  { id: 'm-seung', name: '승기' },
];

describe('그룹 즐겨찾기 규칙', () => {
  it('담은 동행 이름을 참여 순으로, 나간 동행은 동행으로', () => {
    expect(saverNames(saved(place('a', 'A'), ['m-seeun', 'm-left']), members)).toEqual([
      '세은',
      '동행',
    ]);
  });

  it('두 명 이상이 담으면 겹침', () => {
    expect(overlapLabel(saved(place('a', 'A'), ['m-seeun', 'm-seung']))).toBe('겹침 2명');
    expect(overlapLabel(saved(place('a', 'A'), ['m-seeun']))).toBeNull();
  });

  it('내가 담았는지와 내 메모', () => {
    const item = saved(place('a', 'A'), ['m-seeun', 'm-me'], { 'm-me': '아침에' });
    expect(isMine(item, 'm-me')).toBe(true);
    expect(isMine(item, null)).toBe(false);
    expect(myMemo(item, 'm-me')).toBe('아침에');
    expect(myMemo(item, 'm-seeun')).toBe('');
  });

  it('주소는 앞 두 낱말만', () => {
    expect(shortAddress('부산 해운대구 우동 1408')).toBe('부산 해운대구');
    expect(shortAddress(null)).toBeNull();
  });
});
