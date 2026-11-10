import { describe, expect, it } from '@jest/globals';

import { ageBandLabel, NICKNAME_MAX_LENGTH, normalizeNickname, toAgeBand } from './profile-rules';

describe('normalizeNickname', () => {
  it('앞뒤 공백을 빼고 돌려준다', () => {
    expect(normalizeNickname('  지우 ')).toBe('지우');
  });

  it('비어 있거나 공백만 있으면 null', () => {
    expect(normalizeNickname('')).toBeNull();
    expect(normalizeNickname('   ')).toBeNull();
  });

  it('50자까지만 받는다', () => {
    expect(normalizeNickname('가'.repeat(NICKNAME_MAX_LENGTH))).toHaveLength(50);
    expect(normalizeNickname('가'.repeat(NICKNAME_MAX_LENGTH + 1))).toBeNull();
  });
});

describe('연령대', () => {
  it('서버 값을 화면 글자로 바꾼다', () => {
    expect(ageBandLabel('TWENTIES')).toBe('20대');
    expect(ageBandLabel('SIXTIES_PLUS')).toBe('60대 이상');
  });

  it('없거나 모르는 값은 null', () => {
    expect(ageBandLabel(null)).toBeNull();
    expect(toAgeBand('20대')).toBeNull();
    expect(toAgeBand('TEENS')).toBe('TEENS');
  });
});
