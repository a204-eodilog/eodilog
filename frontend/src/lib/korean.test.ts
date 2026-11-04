import { expect, it } from '@jest/globals';

import { withRo } from './korean';

it('받침이 있으면 으로, 없거나 ㄹ 받침이면 로', () => {
  expect(withRo('겨울 여행')).toBe('겨울 여행으로');
  expect(withRo('부산')).toBe('부산으로');
  expect(withRo('제주')).toBe('제주로');
  expect(withRo('서울')).toBe('서울로');
});

it('한글로 끝나지 않으면 (으)로', () => {
  expect(withRo('Trip 2')).toBe('Trip 2(으)로');
});
