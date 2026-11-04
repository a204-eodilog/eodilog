import { describe, expect, it } from '@jest/globals';

import { NICKNAME_MAX_LENGTH, normalizeNickname } from './profile-rules';

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
