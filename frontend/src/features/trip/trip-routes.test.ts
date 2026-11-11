import { expect, it } from '@jest/globals';

import { todoHref } from './trip-routes';

it('지금 할 일 버튼은 단계에 맞는 화면 주소로 간다', () => {
  expect(todoHref('favorites', 'trip-1')).toBe('/trips/trip-1/favorites');
  expect(todoHref('course', 'trip-1')).toBe('/trips/trip-1/course');
  expect(todoHref('today', 'trip-1')).toBe('/trips/trip-1/today');
  expect(todoHref('photos', 'trip-1')).toBe('/trips/trip-1/photos');
});

it('게시 화면이 정해지지 않은 피드는 갈 곳이 없다', () => {
  expect(todoHref('feed', 'trip-1')).toBeNull();
});
