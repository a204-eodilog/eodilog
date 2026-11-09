import type { DraftItem } from '@/features/course/course-rules';
import { place } from '@/features/course/testing';

import type {
  HourlyWeather,
  Weather,
  WeatherAlternative,
  WeatherAlternativesResult,
} from './types';

/** 테스트와 미리보기 예시. 2026-11-14 부산, 오전 비 70%, 12시부터 그침 */

export const DATE = '2026-11-14';

export function hourly(
  hour: number,
  p: number,
  condition = p >= 0.3 ? 'RAIN' : 'CLOUDY',
): HourlyWeather {
  return {
    at: `${DATE}T${String(hour).padStart(2, '0')}:00:00`,
    condition,
    temperatureCelsius: 11,
    precipitationProbability: p,
  };
}

export function weather(overrides: Partial<Weather> = {}): Weather {
  return {
    placeId: 'p-haeundae',
    date: DATE,
    queriedAt: `${DATE}T09:40:00`,
    forecastAt: `${DATE}T09:00:00`,
    source: 'KMA',
    condition: 'RAIN',
    temperatureCelsius: 11,
    minCelsius: 9,
    maxCelsius: 14,
    precipitationProbability: 0.7,
    hourly: [
      hourly(9, 0.6),
      hourly(10, 0.7),
      hourly(11, 0.5),
      hourly(12, 0.2),
      hourly(13, 0.1),
      hourly(19, 0.1),
    ],
    stale: false,
    ...overrides,
  };
}

/** 1일차 해운대 10:00, 광안리 13:00, 서면 19:00 */
export function todayItems(): DraftItem[] {
  const item = (id: string, name: string, startTime: string): DraftItem => ({
    key: id,
    id,
    place: place(`p-${id}`, name),
    startTime,
    stayMinutes: 60,
  });
  return [
    item('i1', '해운대 해변', '10:00'),
    item('i2', '광안리 바다뷰 카페', '13:00'),
    item('i3', '서면 돼지국밥집', '19:00'),
  ];
}

export function alternatives(): WeatherAlternative[] {
  return [
    {
      alternativeId: 'alt-1',
      type: 'TIME_SHIFT',
      place: null,
      itemId: 'i1',
      targetStartTime: '14:00',
      activity: '해운대 해변을 오후로 옮기기',
      reason: '비가 그친 뒤에 가요',
    },
    {
      alternativeId: 'alt-2',
      type: 'PLACE_SWAP',
      place: place('p-aquarium', '해운대 실내 수족관'),
      itemId: 'i1',
      targetStartTime: null,
      activity: '실내 수족관 둘러보기',
      reason: '도보 8분 · 실내라 비를 피해요',
    },
    {
      alternativeId: 'alt-3',
      type: 'PLACE_SWAP',
      place: place('p-bookcafe', '마린시티 북카페'),
      itemId: 'i1',
      targetStartTime: null,
      activity: '북카페에서 쉬기',
      reason: '도보 15분 · 실내',
    },
    {
      alternativeId: 'alt-4',
      type: 'INFO',
      place: null,
      itemId: null,
      targetStartTime: null,
      activity: '우산을 챙겨요',
      reason: '오전 내내 비가 와요',
    },
  ];
}

export function alternativesResult(
  overrides: Partial<WeatherAlternativesResult> = {},
): WeatherAlternativesResult {
  return { alternatives: alternatives(), weather: weather(), baseVersion: 3, ...overrides };
}
