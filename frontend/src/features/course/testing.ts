import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';

import type { Place } from '@/features/place/types';

import type { Itinerary, ItineraryItem, RouteLeg, SavedPlace, TransportMode } from './types';

/** 테스트와 미리보기용 장소. 부산 근처 좌표 */
export function place(id: string, name: string, overrides: Partial<Place> = {}): Place {
  return {
    id,
    name,
    address: null,
    latitude: 35.15,
    longitude: 129.1,
    regionId: 'region-busan',
    provider: null,
    providerPlaceId: null,
    source: 'PROVIDER',
    ...overrides,
  };
}

/** 코스 항목 */
export function item(
  id: string,
  p: Place,
  day: number,
  order: number,
  overrides: Partial<ItineraryItem> = {},
): ItineraryItem {
  return { id, place: p, day, order, startTime: null, stayMinutes: null, ...overrides };
}

/** 구간. 기본은 경로 공급자 연동 전처럼 계산 불가 */
export function leg(
  fromItemId: string,
  toItemId: string,
  transportMode: TransportMode = 'TRANSIT',
  overrides: Partial<RouteLeg> = {},
): RouteLeg {
  return {
    fromItemId,
    toItemId,
    transportMode,
    durationSeconds: null,
    distanceMeters: null,
    geometry: null,
    status: 'UNAVAILABLE',
    queriedAt: '2026-10-26T11:40:00Z',
    ...overrides,
  };
}

/** 코스. 항목에 맞는 구간을 주지 않으면 빈 구간 */
export function itinerary(overrides: Partial<Itinerary> = {}): Itinerary {
  return {
    tripId: 'trip-1',
    version: 1,
    items: [],
    legs: [],
    updatedByMemberId: 'm-seeun',
    updatedAt: '2026-10-26T11:40:00Z',
    ...overrides,
  };
}

/** 그룹 즐겨찾기 한 줄 */
export function savedPlace(p: Place, savedCount = 1): SavedPlace {
  return { place: p, savedBy: [], savedCount };
}

/** Figma 201-12879와 같은 부산 2일 코스: 1일차 해운대·광안리·서면, 2일차 감천 */
export function sampleCourse(available = true): Itinerary {
  const haeundae = place('p-haeundae', '해운대 해변', { latitude: 35.1587, longitude: 129.1604 });
  const gwangalli = place('p-gwangalli', '광안리 바다뷰 카페', {
    latitude: 35.1532,
    longitude: 129.1186,
  });
  const seomyeon = place('p-seomyeon', '서면 돼지국밥집', {
    latitude: 35.1578,
    longitude: 129.0596,
  });
  const gamcheon = place('p-gamcheon', '감천문화마을', { latitude: 35.0975, longitude: 129.0106 });
  const done = (seconds: number): Partial<RouteLeg> =>
    available
      ? {
          durationSeconds: seconds,
          distanceMeters: 5000,
          status: 'AVAILABLE',
          geometry: { type: 'LineString', coordinates: [] },
        }
      : {};
  return itinerary({
    version: 3,
    items: [
      item('i1', haeundae, 1, 1, { startTime: '10:00' }),
      item('i2', gwangalli, 1, 2, { startTime: '13:00' }),
      item('i3', seomyeon, 1, 3, { startTime: '19:00' }),
      item('i4', gamcheon, 2, 1, { startTime: '10:30' }),
    ],
    legs: [leg('i1', 'i2', 'TRANSIT', done(22 * 60)), leg('i2', 'i3', 'TRANSIT', done(25 * 60))],
  });
}

/** 서버가 오류 코드로 답한 것과 같은 오류. toApiError가 status와 code를 읽는다 */
export function httpError(status: number, code: string): AxiosError {
  const config = { headers: new AxiosHeaders() } as InternalAxiosRequestConfig;
  return new AxiosError(code, 'ERR_BAD_REQUEST', config, null, {
    status,
    statusText: code,
    headers: {},
    config,
    data: { error: { code, message: code, fields: [], traceId: null } },
  });
}
