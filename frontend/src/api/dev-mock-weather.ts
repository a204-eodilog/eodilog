import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';

import type { Trip } from '@/features/trip/types';

/**
 * 여행 중·날씨 대안(S25·S26) 테스트 모드 가짜 서버. 앱용 날씨 API가 아직 없어(Q-10-1)
 * API 명세 형식대로 답한다. 날씨는 늘 오전 비 70%, 12시부터 그침(Figma 201-14252).
 * 날씨 대안은 만든 뒤 3초 동안 RUNNING이고 그 뒤 대안 네 개.
 * 콘솔: globalThis.__devMock.weather.failNext(), noAlternativesNext()
 */

type Helpers = {
  getTrips(): Trip[];
  ok<T>(config: InternalAxiosRequestConfig, data: T, status?: number): AxiosResponse<T>;
  fail(config: InternalAxiosRequestConfig, status: number, code: string, message: string): Error;
};

type MockJob = {
  id: string;
  tripId: string;
  createdAt: number;
  date: string;
  placeId: string;
  baseVersion: number;
  empty: boolean;
};

const RUN_MS = 3000;
const RAIN: Record<number, number> = { 8: 0.5, 9: 0.6, 10: 0.7, 11: 0.5 };
const pad2 = (n: number) => String(n).padStart(2, '0');

function weatherOf(date: string, placeId: string) {
  const hourly = Array.from({ length: 14 }, (_, i) => {
    const hour = 8 + i;
    const p = RAIN[hour] ?? 0.1;
    return {
      at: `${date}T${pad2(hour)}:00:00`,
      condition: p >= 0.3 ? 'RAIN' : 'CLOUDY',
      temperatureCelsius: 9 + Math.min(i, 5),
      precipitationProbability: p,
    };
  });
  return {
    placeId,
    date,
    queriedAt: new Date().toISOString(),
    forecastAt: new Date(Date.now() - 40 * 60_000).toISOString(),
    source: 'KMA',
    condition: 'RAIN',
    temperatureCelsius: 11,
    minCelsius: 9,
    maxCelsius: 14,
    precipitationProbability: 0.7,
    hourly,
    stale: false,
  };
}

const place = (id: string, name: string, address: string) => ({
  id,
  name,
  address,
  latitude: 35.16,
  longitude: 129.16,
  regionId: 'region-busan',
  provider: 'KAKAO',
  providerPlaceId: id,
  source: 'PROVIDER' as const,
});

export function createWeatherMock(h: Helpers) {
  const jobs = new Map<string, MockJob>();
  let seq = 0;
  let failWeather = false;
  let emptyNext = false;

  function jobView(job: MockJob) {
    const done = Date.now() - job.createdAt >= RUN_MS;
    return {
      id: job.id,
      kind: 'WEATHER_ALTERNATIVES',
      status: done ? 'SUCCEEDED' : 'RUNNING',
      progress: done ? 100 : 50,
      result: done
        ? {
            alternatives: job.empty
              ? []
              : [
                  {
                    alternativeId: `${job.id}-shift`,
                    type: 'TIME_SHIFT',
                    place: null,
                    itemId: 'it-1',
                    targetStartTime: '14:00',
                    activity: '해운대 해변을 오후로 옮기기',
                    reason: '비가 그친 뒤에 가요',
                  },
                  {
                    alternativeId: `${job.id}-aquarium`,
                    type: 'PLACE_SWAP',
                    place: place(
                      'place-aquarium',
                      '해운대 실내 수족관',
                      '부산 해운대구 해운대해변로',
                    ),
                    itemId: 'it-1',
                    targetStartTime: null,
                    activity: '실내 수족관 둘러보기',
                    reason: '도보 8분 · 실내라 비를 피해요',
                  },
                  {
                    alternativeId: `${job.id}-bookcafe`,
                    type: 'PLACE_SWAP',
                    place: place('place-bookcafe', '마린시티 북카페', '부산 해운대구 마린시티'),
                    itemId: 'it-1',
                    targetStartTime: null,
                    activity: '북카페에서 쉬기',
                    reason: '도보 15분 · 실내',
                  },
                  {
                    alternativeId: `${job.id}-info`,
                    type: 'INFO',
                    place: null,
                    itemId: null,
                    targetStartTime: null,
                    activity: '우산을 챙겨요',
                    reason: '오전 내내 비가 와요',
                  },
                ],
            weather: weatherOf(job.date, job.placeId),
            baseVersion: job.baseVersion,
          }
        : null,
      error: null,
      createdAt: new Date(job.createdAt).toISOString(),
      finishedAt: done ? new Date(job.createdAt + RUN_MS).toISOString() : null,
    };
  }

  function handle(
    config: InternalAxiosRequestConfig,
    method: string,
    url: string,
    params: Record<string, string>,
  ): AxiosResponse | null {
    const jobMatch = /^\/jobs\/([^/]+)$/.exec(url);
    if (jobMatch && method === 'get') {
      const job = jobs.get(decodeURIComponent(jobMatch[1]));
      return job ? h.ok(config, { data: jobView(job) }) : null;
    }
    const m = /^\/trips\/([^/]+)\/(weather|weather-alternatives)$/.exec(url);
    if (!m) return null;
    const trip = h.getTrips().find((t) => t.id === decodeURIComponent(m[1]));
    if (!trip) throw h.fail(config, 404, 'TRIP_NOT_FOUND', '여행을 찾을 수 없습니다.');

    if (m[2] === 'weather' && method === 'get') {
      if (failWeather) {
        failWeather = false;
        throw h.fail(config, 503, 'WEATHER_UNAVAILABLE', '날씨를 불러오지 못했습니다.');
      }
      return h.ok(config, { data: weatherOf(params.date, params.placeId) });
    }
    if (m[2] === 'weather-alternatives' && method === 'post') {
      const body = (typeof config.data === 'string' ? JSON.parse(config.data || '{}') : {}) as {
        date?: string;
        placeId?: string;
        expectedVersion?: number;
      };
      seq += 1;
      const job: MockJob = {
        id: `job-weather-${seq}`,
        tripId: trip.id,
        createdAt: Date.now(),
        date: body.date ?? '',
        placeId: body.placeId ?? '',
        baseVersion: Number(body.expectedVersion ?? 1),
        empty: emptyNext,
      };
      emptyNext = false;
      jobs.set(job.id, job);
      return h.ok(
        config,
        { data: { jobId: job.id, status: 'QUEUED', statusUrl: `/api/v1/jobs/${job.id}` } },
        202,
      );
    }
    return null;
  }

  const controls = {
    /** 다음 날씨 조회를 실패로 */
    failNext() {
      failWeather = true;
    },
    /** 다음 날씨 대안을 빈 목록으로 */
    noAlternativesNext() {
      emptyNext = true;
    },
  };

  return { handle, controls };
}
