import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';

import type { Trip } from '@/features/trip/types';

/**
 * 추천 결과(S21) 테스트 모드 가짜 서버. 백엔드에 추천 API가 아직 없어(Q-9-1) API 명세 형식대로 답한다.
 * 작업은 만든 뒤 6초 동안 RUNNING이고 그 뒤 SUCCEEDED. 결과는 Figma 201-10081과 같은 부산 다섯 곳.
 * 콘솔: globalThis.__devMock.recommend.failNext(), insufficientNext()
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
  outcome: 'ok' | 'fail' | 'insufficient';
};

const RUN_MS = 6000;

const region = (id: string, name: string) => ({
  id,
  code: id,
  name,
  parentId: 'region-busan',
  latitude: null,
  longitude: null,
});

const place = (id: string, name: string, address: string, lat: number, lng: number) => ({
  id,
  name,
  address,
  latitude: lat,
  longitude: lng,
  regionId: 'region-busan',
  provider: 'KAKAO',
  providerPlaceId: id,
  source: 'PROVIDER' as const,
});

const ITEMS = [
  {
    type: 'REGION',
    region: region('region-yeongdo', '영도 흰여울 일대'),
    place: null,
    reason: '겹친 장소 흰여울문화마을이 있는 동네예요',
  },
  {
    type: 'REGION',
    region: region('region-songjeong', '해운대 송정 일대'),
    place: null,
    reason: '겹친 장소 해운대 해변과 가까워요',
  },
  {
    type: 'PLACE',
    region: null,
    place: place('place-jagalchi', '자갈치 회 골목', '부산 중구 자갈치해안로', 35.0966, 129.0306),
    reason: '맛집을 고른 두 사람에게 맞아요',
  },
  {
    type: 'PLACE',
    region: null,
    place: place(
      'place-cheongsapo',
      '청사포 바다뷰 카페',
      '부산 해운대구 청사포로',
      35.1605,
      129.1916,
    ),
    reason: '바다와 카페 취향이 겹쳐요',
  },
  {
    type: 'PLACE',
    region: null,
    place: place('place-igidae', '이기대 산책로', '부산 남구 이기대공원로', 35.1215, 129.1195),
    reason: '산책과 사진 취향을 함께 반영했어요',
  },
];

export function createRecommendMock(h: Helpers) {
  const jobs = new Map<string, MockJob>();
  let seq = 0;
  let nextOutcome: MockJob['outcome'] = 'ok';

  function view(trip: Trip, job: MockJob) {
    const elapsed = Date.now() - job.createdAt;
    const done = elapsed >= RUN_MS;
    const status = !done ? 'RUNNING' : job.outcome === 'fail' ? 'FAILED' : 'SUCCEEDED';
    const insufficient = done && job.outcome === 'insufficient';
    return {
      job: {
        id: job.id,
        kind: 'TRIP_RECOMMENDATION',
        status,
        progress: done ? 100 : Math.round((elapsed / RUN_MS) * 100),
        error:
          status === 'FAILED'
            ? { code: 'AI_PROVIDER_ERROR', message: '추천을 만들지 못했습니다.' }
            : null,
        createdAt: new Date(job.createdAt).toISOString(),
        finishedAt: done ? new Date(job.createdAt + RUN_MS).toISOString() : null,
      },
      items: status === 'SUCCEEDED' && !insufficient ? ITEMS : [],
      basis: insufficient
        ? { sharedPlaceCount: 1, usedMemberCount: 1 }
        : {
            sharedPlaceCount: 5,
            usedMemberCount: trip.members.filter((m) => m.status === 'ACTIVE').length,
          },
      insufficientData: insufficient,
    };
  }

  function handle(
    config: InternalAxiosRequestConfig,
    method: string,
    url: string,
  ): AxiosResponse | null {
    const m = /^\/trips\/([^/]+)\/recommendations(?:\/([^/]+))?$/.exec(url);
    if (!m) return null;
    const trip = h.getTrips().find((t) => t.id === decodeURIComponent(m[1]));
    if (!trip) throw h.fail(config, 404, 'TRIP_NOT_FOUND', '여행을 찾을 수 없습니다.');

    if (!m[2] && method === 'post') {
      seq += 1;
      const job: MockJob = {
        id: `job-rec-${seq}`,
        tripId: trip.id,
        createdAt: Date.now(),
        outcome: nextOutcome,
      };
      nextOutcome = 'ok';
      jobs.set(job.id, job);
      return h.ok(
        config,
        { data: { jobId: job.id, status: 'QUEUED', statusUrl: `/api/v1/jobs/${job.id}` } },
        202,
      );
    }
    if (m[2] && method === 'get') {
      const job = jobs.get(decodeURIComponent(m[2]));
      if (!job || job.tripId !== trip.id)
        throw h.fail(config, 404, 'JOB_NOT_FOUND', '작업을 찾을 수 없습니다.');
      return h.ok(config, { data: view(trip, job) });
    }
    return null;
  }

  const controls = {
    /** 다음 추천을 실패로 끝낸다 */
    failNext() {
      nextOutcome = 'fail';
    },
    /** 다음 추천을 자료 부족으로 끝낸다 */
    insufficientNext() {
      nextOutcome = 'insufficient';
    },
  };

  /** 추천한 장소. 그룹 즐겨찾기 가짜 서버가 [담기]한 장소를 찾을 때 쓴다 */
  function findPlace(id: string) {
    return ITEMS.find((i) => i.place?.id === id)?.place ?? null;
  }

  return { handle, controls, findPlace };
}
