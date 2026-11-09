import { expect, it } from '@jest/globals';

import { withEulReul, withRo, withWa } from './korean';

it('받침이 있으면 으로, 없거나 ㄹ 받침이면 로', () => {
  expect(withRo('겨울 여행')).toBe('겨울 여행으로');
  expect(withRo('부산')).toBe('부산으로');
  expect(withRo('제주')).toBe('제주로');
  expect(withRo('서울')).toBe('서울로');
});

it('한글로 끝나지 않으면 (으)로', () => {
  expect(withRo('Trip 2')).toBe('Trip 2(으)로');
});

it('받침이 있으면 과, 없으면 와', () => {
  expect(withWa('민준')).toBe('민준과');
  expect(withWa('지우')).toBe('지우와');
  expect(withWa('하늘')).toBe('하늘과');
  expect(withWa('Ann')).toBe('Ann와(과)');
});

it('받침이 있으면 을, 없으면 를, 한글이 아니면 을(를)', () => {
  expect(withEulReul('해운대 해변')).toBe('해운대 해변을');
  expect(withEulReul('광안리 바다뷰 카페')).toBe('광안리 바다뷰 카페를');
  expect(withEulReul('서울')).toBe('서울을');
  expect(withEulReul('Cafe 22')).toBe('Cafe 22을(를)');
});
