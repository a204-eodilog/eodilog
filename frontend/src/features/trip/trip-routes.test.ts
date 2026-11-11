import { expect, it } from '@jest/globals';

import { publishHref, todoHref } from './trip-routes';

it('지금 할 일 버튼은 단계에 맞는 화면 주소로 간다', () => {
  expect(todoHref('favorites', 'trip-1')).toBe('/trips/trip-1/favorites');
  expect(todoHref('course', 'trip-1')).toBe('/trips/trip-1/course');
  expect(todoHref('today', 'trip-1')).toBe('/trips/trip-1/today');
  expect(todoHref('photos', 'trip-1')).toBe('/trips/trip-1/photos');
});

it('피드와 게시는 내 여행 기록으로 간다', () => {
  expect(todoHref('feed', 'trip-1')).toBe('/trips/trip-1/record');
  expect(publishHref('trip-1')).toBe('/trips/trip-1/record');
});
