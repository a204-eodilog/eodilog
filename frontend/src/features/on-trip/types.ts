import type { Job, JobRef } from '@/features/course/types';
import type { Place } from '@/features/place/types';

export type { Job, JobRef };

/** 시간별 날씨. 확률은 0~1, 모르면 null */
export type HourlyWeather = {
  at: string;
  condition: string;
  temperatureCelsius: number | null;
  precipitationProbability: number | null;
};

/** GET /trips/{tripId}/weather. 그 날 그 장소의 날씨 */
export type Weather = {
  placeId: string;
  date: string;
  /** 앱이 서버에서 받은 시각 */
  queriedAt: string;
  /** 공급자가 예보를 낸 시각 */
  forecastAt: string;
  source: string;
  /** CLEAR·CLOUDY·RAIN·SNOW 등 */
  condition: string;
  temperatureCelsius: number | null;
  minCelsius: number | null;
  maxCelsius: number | null;
  precipitationProbability: number | null;
  hourly: HourlyWeather[];
  /** 마지막 값이 오래됐다 */
  stale: boolean;
};

/** 날씨 대안 한 줄. TIME_SHIFT는 itemId와 목표 시각, PLACE_SWAP은 place, INFO는 안내만 */
export type WeatherAlternative = {
  alternativeId: string;
  type: 'PLACE_SWAP' | 'TIME_SHIFT' | 'INFO';
  place: Place | null;
  itemId: string | null;
  targetStartTime: string | null;
  activity: string;
  reason: string;
};

/** 날씨 대안 작업 결과(WEATHER_ALTERNATIVES) */
export type WeatherAlternativesResult = {
  alternatives: WeatherAlternative[];
  weather: Weather;
  baseVersion: number;
};

/** 준비물 수. 받지 못하면 null */
export type ChecklistSummary = { total: number; checked: number };
