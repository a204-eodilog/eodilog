import { describe, expect, it } from '@jest/globals';

import { formatTripNights, formatTripPeriod, parseDate } from './format-date';

describe('parseDate', () => {
  it('YYYY-MM-DD를 기기 날짜로 읽는다', () => {
    const d = parseDate('2026-11-14');
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(10);
    expect(d?.getDate()).toBe(14);
  });

  it('비었거나 형식이 틀리면 null', () => {
    expect(parseDate(null)).toBeNull();
    expect(parseDate('2026/11/14')).toBeNull();
  });
});

describe('formatTripPeriod', () => {
  it('시작과 끝을 요일과 함께 보여 준다', () => {
    expect(formatTripPeriod('2026-11-14', '2026-11-15')).toBe('11.14(토) – 11.15(일)');
  });

  it('하루면 날짜 하나', () => {
    expect(formatTripPeriod('2026-11-14', '2026-11-14')).toBe('11.14(토)');
  });

  it('날짜가 없으면 미정', () => {
    expect(formatTripPeriod(null, null)).toBe('날짜 미정');
  });
});

describe('formatTripNights', () => {
  it('박과 일을 센다', () => {
    expect(formatTripNights('2026-11-14', '2026-11-15')).toBe('1박 2일');
    expect(formatTripNights('2026-11-14', '2026-11-17')).toBe('3박 4일');
  });

  it('하루면 당일치기, 날짜 없으면 null', () => {
    expect(formatTripNights('2026-11-14', '2026-11-14')).toBe('당일치기');
    expect(formatTripNights('2026-11-14', null)).toBeNull();
  });
});
