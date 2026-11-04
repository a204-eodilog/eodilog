import { describe, expect, it } from '@jest/globals';

import {
  KEYWORD_MAX_LENGTH,
  MAX_PREFERENCES,
  addKeyword,
  fromExplicitItems,
  normalizeKeyword,
  toExplicitItems,
} from './preference-rules';

describe('normalizeKeyword', () => {
  it('앞뒤·겹친 공백을 정리한다', () => {
    expect(normalizeKeyword('  사진   명소 ')).toBe('사진 명소');
  });

  it('비었거나 너무 길면 null', () => {
    expect(normalizeKeyword('   ')).toBeNull();
    expect(normalizeKeyword('가'.repeat(KEYWORD_MAX_LENGTH + 1))).toBeNull();
    expect(normalizeKeyword('가'.repeat(KEYWORD_MAX_LENGTH))).toHaveLength(KEYWORD_MAX_LENGTH);
  });
});

describe('addKeyword', () => {
  it('새 취향은 뒤에 붙인다', () => {
    expect(addKeyword(['바다'], ' 온천 ')).toEqual({ ok: true, keywords: ['바다', '온천'] });
  });

  it('이미 있으면 duplicate, 비었으면 empty', () => {
    expect(addKeyword(['Cafe'], 'cafe')).toEqual({ ok: false, reason: 'duplicate' });
    expect(addKeyword([], ' ')).toEqual({ ok: false, reason: 'empty' });
  });

  it('개수가 차면 full', () => {
    const many = Array.from({ length: MAX_PREFERENCES }, (_, i) => `취향${i}`);
    expect(addKeyword(many, '하나 더')).toEqual({ ok: false, reason: 'full' });
  });
});

it('서버 항목과 화면 글자를 서로 바꾼다', () => {
  expect(toExplicitItems(['바다'])).toEqual([{ key: '바다', value: '바다' }]);
  expect(fromExplicitItems([{ key: 'a', value: '맛집' }])).toEqual(['맛집']);
  expect(fromExplicitItems(undefined)).toEqual([]);
});
