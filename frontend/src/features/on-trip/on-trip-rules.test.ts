import { describe, expect, it } from '@jest/globals';

import {
  affectedIndex,
  alternativeView,
  clearsAt,
  conditionLabel,
  forecastLabel,
  hourKind,
  nextIndex,
  rainChance,
  tempLine,
  tripDates,
  tripPhase,
  weatherHeadline,
} from './on-trip-rules';
import { alternatives, hourly, todayItems, weather } from './testing';

const at = (iso: string) => new Date(iso);

describe('tripPhase', () => {
  it('오늘 날짜로 시작 전, 여행 중, 끝남, 날짜 없음을 나눈다', () => {
    expect(tripPhase('2026-11-14', '2026-11-15', at('2026-11-12T10:00:00'))).toEqual({
      kind: 'before',
      daysLeft: 2,
      startDate: '2026-11-14',
    });
    expect(tripPhase('2026-11-14', '2026-11-15', at('2026-11-14T09:40:00'))).toEqual({
      kind: 'during',
      day: 1,
      date: '2026-11-14',
    });
    expect(tripPhase('2026-11-14', '2026-11-15', at('2026-11-15T23:00:00'))).toMatchObject({
      kind: 'during',
      day: 2,
    });
    expect(tripPhase('2026-11-14', '2026-11-15', at('2026-11-20T09:00:00'))).toEqual({
      kind: 'after',
      day: 2,
      date: '2026-11-15',
    });
    expect(tripPhase(null, null, at('2026-11-14T09:00:00'))).toEqual({ kind: 'noDates' });
    // 끝 날짜가 없으면 하루짜리
    expect(tripPhase('2026-11-14', null, at('2026-11-14T09:00:00'))).toMatchObject({ day: 1 });
  });

  it('여행 날짜 목록', () => {
    expect(tripDates('2026-11-14', '2026-11-16')).toEqual([
      '2026-11-14',
      '2026-11-15',
      '2026-11-16',
    ]);
    expect(tripDates(null, null)).toEqual([]);
  });
});

describe('날씨 문구', () => {
  it('오전에 비가 몰리면 오전 비와 가장 높은 확률', () => {
    expect(weatherHeadline(weather())).toBe('오전 비 70%');
    expect(rainChance(weather())).toBe(70);
  });

  it('오후 비, 눈, 비 없음', () => {
    const afternoon = weather({ hourly: [hourly(14, 0.4), hourly(15, 0.8), hourly(9, 0.1)] });
    expect(weatherHeadline(afternoon)).toBe('오후 비 80%');
    const snow = weather({ hourly: [hourly(9, 0.6, 'SNOW')] });
    expect(weatherHeadline(snow)).toBe('오전 눈 60%');
    const clear = weather({ condition: 'CLEAR', hourly: [hourly(9, 0.1, 'CLEAR')] });
    expect(weatherHeadline(clear)).toBe('맑음');
    expect(conditionLabel('UNKNOWN')).toBe('UNKNOWN');
  });

  it('날짜별 예보는 비 확률이나 상태 이름', () => {
    expect(forecastLabel(weather())).toBe('비 70%');
    const clear = weather({
      condition: 'CLEAR',
      precipitationProbability: 0.1,
      hourly: [hourly(9, 0.1, 'CLEAR')],
    });
    expect(forecastLabel(clear)).toBe('맑음');
  });

  it('비가 그치는 시각과 기온 줄', () => {
    expect(clearsAt(weather())).toBe('12시부터 그쳐요');
    expect(clearsAt(weather({ hourly: [hourly(9, 0.9), hourly(10, 0.9)] }))).toBeNull();
    expect(clearsAt(weather({ hourly: [hourly(9, 0.1)] }))).toBeNull();
    expect(tempLine(weather())).toBe('최고 14° 최저 9°');
    expect(tempLine(weather({ maxCelsius: null }))).toBeNull();
  });

  it('지난 시각은 관측, 다가올 시각은 예보', () => {
    const now = at('2026-11-14T09:40:00+09:00');
    expect(hourKind('2026-11-14T09:00:00+09:00', now)).toBe('관측');
    expect(hourKind('2026-11-14T12:00:00+09:00', now)).toBe('예보');
  });
});

describe('오늘 코스', () => {
  it('비 확률 50% 이상인 시간에 시작하는 첫 일정', () => {
    expect(affectedIndex(todayItems(), weather())).toBe(0);
    expect(affectedIndex(todayItems(), weather({ hourly: [hourly(10, 0.2)] }))).toBeNull();
    // 오늘 이미 지난 일정은 건너뛴다
    expect(affectedIndex(todayItems(), weather(), at('2026-11-14T09:40:00'))).toBe(0);
    expect(affectedIndex(todayItems(), weather(), at('2026-11-14T15:00:00'))).toBeNull();
  });

  it('지금 이후 첫 일정이 다음', () => {
    expect(nextIndex(todayItems(), at('2026-11-14T09:40:00'))).toBe(0);
    expect(nextIndex(todayItems(), at('2026-11-14T11:00:00'))).toBe(1);
    expect(nextIndex(todayItems(), at('2026-11-14T20:00:00'))).toBeNull();
  });
});

describe('alternativeView', () => {
  it('시간 옮기기는 목표 시각과 비 그침 예보, 장소 바꾸기는 장소 이름과 이유, 안내는 고를 수 없다', () => {
    const [shift, swap, , info] = alternatives();
    expect(alternativeView(shift, weather())).toEqual({
      title: '해운대 해변을 오후로 옮기기',
      lines: [
        { icon: 'clock', text: '비 그친 뒤 14:00' },
        { icon: 'alert', text: '12시부터 그쳐요 · 예보' },
      ],
      selectable: true,
    });
    expect(alternativeView(swap, weather())).toEqual({
      title: '해운대 실내 수족관',
      lines: [{ icon: 'walk', text: '도보 8분 · 실내라 비를 피해요' }],
      selectable: true,
    });
    expect(alternativeView(info, weather()).selectable).toBe(false);
  });
});
