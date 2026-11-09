import { addDays } from '@/lib/seoul-date';

import type { Trip } from './types';

/**
 * S41 타임라인·S42 여행 요약 테스트 모드 값(GET /me/timeline, /trips/{id}/timeline, /trips/{id}/summary).
 * 서버에 아직 없는 API라 docs/api-spec.md 명세 모양 그대로 만든다.
 * 예시 여행 이름으로 장소를 붙인다: 부산 바다 여행(다녀오는 중), 남도 맛집 여행(다녀옴, 가지 않은 곳 1곳·경비 있음),
 * 제주 한 달 살기(날짜 미정, 시간 없는 계획). 나머지는 장소가 없다
 */

type MockStop = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** 여행 시작일에서 며칠째(0부터). 없으면 시간 없는 계획 */
  day?: number;
  time?: string;
  visited: boolean;
  photos?: number;
};

const STOPS: Record<string, MockStop[]> = {
  '부산 바다 여행': [
    {
      id: 'place-haeundae',
      name: '해운대 해변',
      lat: 35.1587,
      lng: 129.1604,
      day: 0,
      time: '10:00',
      visited: true,
      photos: 3,
    },
    {
      id: 'place-gwangalli',
      name: '광안리 바다뷰 카페',
      lat: 35.1532,
      lng: 129.1186,
      day: 0,
      time: '13:00',
      visited: true,
    },
    {
      id: 'place-seomyeon',
      name: '서면 돼지국밥집',
      lat: 35.1578,
      lng: 129.06,
      day: 0,
      time: '19:00',
      visited: true,
      photos: 2,
    },
    {
      id: 'place-gamcheon',
      name: '감천문화마을',
      lat: 35.0975,
      lng: 129.0106,
      day: 1,
      time: '10:30',
      visited: true,
      photos: 2,
    },
    {
      id: 'place-huinnyeoul',
      name: '흰여울문화마을',
      lat: 35.0783,
      lng: 129.0446,
      day: 1,
      time: '14:00',
      visited: false,
    },
  ],
  '남도 맛집 여행': [
    {
      id: 'place-yeosu-market',
      name: '여수 수산시장',
      lat: 34.7387,
      lng: 127.7353,
      day: 0,
      time: '11:00',
      visited: true,
      photos: 4,
    },
    {
      id: 'place-odongdo',
      name: '오동도',
      lat: 34.7446,
      lng: 127.7668,
      day: 0,
      time: '15:00',
      visited: false,
    },
    {
      id: 'place-hwangnidan',
      name: '황리단길',
      lat: 35.8379,
      lng: 129.2097,
      day: 1,
      time: '12:00',
      visited: true,
      photos: 6,
    },
    {
      id: 'place-bulguksa',
      name: '불국사',
      lat: 35.7901,
      lng: 129.3321,
      day: 2,
      time: '09:30',
      visited: true,
      photos: 8,
    },
  ],
  '제주 한 달 살기': [
    { id: 'place-hyeopjae', name: '협재 해변', lat: 33.394, lng: 126.2397, visited: false },
    { id: 'place-seongsan', name: '성산일출봉', lat: 33.4581, lng: 126.9425, visited: false },
  ],
};

/** 경비를 입력해 둔 여행(원) */
const AMOUNTS: Record<string, number> = { '남도 맛집 여행': 234_000 };

function stopsOf(trip: Trip): MockStop[] {
  return STOPS[trip.title] ?? [];
}

export function mockMyTimeline(trips: Trip[], postedTripId: string | null) {
  return [...trips]
    .sort((a, b) => {
      if (a.startDate !== b.startDate) {
        if (!a.startDate) return 1;
        if (!b.startDate) return -1;
        return a.startDate < b.startDate ? 1 : -1;
      }
      return a.id < b.id ? 1 : -1;
    })
    .map((t) => ({
      tripId: t.id,
      feedId: t.id === postedTripId ? `feed-${t.id}` : null,
      date: t.startDate,
      dateBasis: t.startDate ? ('TRIP' as const) : ('UNKNOWN' as const),
      status: 'ACTIVE',
    }));
}

export function mockTripTimeline(trip: Trip) {
  return stopsOf(trip).map((s) => {
    const at =
      trip.startDate && s.day !== undefined && s.time
        ? new Date(`${addDays(trip.startDate, s.day)}T${s.time}:00+09:00`).toISOString()
        : null;
    return {
      place: { id: s.id, name: s.name, latitude: s.lat, longitude: s.lng },
      plannedAt: at,
      visitedAt: s.visited ? at : null,
      status: s.visited ? ('VISITED' as const) : ('PLANNED' as const),
      photoCount: s.photos ?? 0,
      plannedDistanceMeters: null,
    };
  });
}

/** 두 점 사이 거리(m, 구면) */
function meters(a: MockStop, b: MockStop): number {
  const r = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

function pathMeters(stops: MockStop[]): number | null {
  if (stops.length < 2) return null;
  let sum = 0;
  for (let i = 1; i < stops.length; i += 1) sum += meters(stops[i - 1], stops[i]);
  return Math.round(sum);
}

export function mockTripSummary(trip: Trip, photoCount: number) {
  const stops = stopsOf(trip);
  const visited = stops.filter((s) => s.visited);
  return {
    tripId: trip.id,
    photoCount,
    visitedPlaceCount: visited.length,
    visitedRegionCount: trip.destinationRegionIds.length,
    plannedDistanceMeters: pathMeters(stops),
    actualDistanceMeters: pathMeters(visited),
    totalAmountMinor: AMOUNTS[trip.title] ?? null,
    currency: 'KRW' as const,
  };
}
