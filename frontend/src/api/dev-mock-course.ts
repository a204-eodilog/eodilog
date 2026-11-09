import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';

import type { Trip } from './types';

/**
 * 개발용 테스트 모드의 가짜 코스 서버(specs/20261109-121845-course/contracts/course-api.md).
 * 코스 조회·전체 교체는 백엔드 규칙(version 409, 구간 422, 200개)을 그대로 따르고,
 * 백엔드에 아직 없는 자동 추천(proposals)과 이동 시간 다시 계산(routes/recalculate)도 명세대로 답한다.
 * 그룹 즐겨찾기 조회 GET /trips/{id}/saved-places도 여기서 답한다(감싸지 않은 응답).
 * 콘솔: globalThis.__devMock.course.editByOther('trip-1') 등(코스 quickstart)
 */

type Mode = 'WALK' | 'CAR' | 'TRANSIT';
type MockPlace = {
  id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  regionId: string | null;
  provider: string | null;
  providerPlaceId: string | null;
  source: 'PROVIDER' | 'MANUAL';
};
type MockItem = {
  id: string;
  place: MockPlace;
  day: number;
  order: number;
  startTime: string | null;
  stayMinutes: number | null;
};
type MockLeg = {
  fromItemId: string;
  toItemId: string;
  transportMode: Mode;
  durationSeconds: number | null;
  distanceMeters: number | null;
  geometry: { type: 'LineString'; coordinates: [number, number][] } | null;
  status: 'AVAILABLE' | 'UNAVAILABLE';
  queriedAt: string;
};
type MockCourse = {
  version: number;
  items: MockItem[];
  legs: MockLeg[];
  updatedByMemberId: string;
  updatedAt: string;
};
type MockJob = {
  id: string;
  kind: 'ITINERARY_PROPOSAL' | 'ROUTE_RECALCULATION';
  tripId: string;
  createdAt: number;
  fail: boolean;
  baseVersion: number;
};

type Helpers = {
  getTrips(): Trip[];
  meId: string;
  ok<T>(config: InternalAxiosRequestConfig, data: T, status?: number): AxiosResponse<T>;
  fail(config: InternalAxiosRequestConfig, status: number, code: string, message: string): Error;
};

const JOB_RUN_MS = 2500;
const MAX_ITEMS = 200;

const p = (
  id: string,
  name: string,
  latitude: number,
  longitude: number,
  regionId: string,
  address: string,
): MockPlace => ({
  id,
  name,
  address,
  latitude,
  longitude,
  regionId,
  provider: 'KAKAO',
  providerPlaceId: id,
  source: 'PROVIDER',
});

/** 그룹 즐겨찾기 예시. 부산 장소 ID는 사진 가짜 서버의 코스 장소와 같다 */
const PLACES: MockPlace[] = [
  p('place-haeundae', '해운대 해변', 35.1587, 129.1604, 'region-busan', '부산 해운대구 우동'),
  p('place-gwangalli', '광안리 바다뷰 카페', 35.1532, 129.1186, 'region-busan', '부산 수영구'),
  p('place-seomyeon', '서면 돼지국밥집', 35.1578, 129.0596, 'region-busan', '부산 부산진구'),
  p('place-gamcheon', '감천문화마을', 35.0975, 129.0106, 'region-busan', '부산 사하구'),
  p('place-huinnyeoul', '흰여울문화마을', 35.0784, 129.0453, 'region-busan', '부산 영도구'),
  p('place-anmok', '안목 커피거리', 37.7722, 128.9478, 'region-gangneung', '강원 강릉시'),
  p('place-gyeongpo', '경포대', 37.7954, 128.8966, 'region-gangneung', '강원 강릉시'),
];

const minutesBetween = (a: MockPlace, b: MockPlace, mode: Mode) => {
  const km = Math.hypot(a.latitude - b.latitude, a.longitude - b.longitude) * 100;
  const speed = mode === 'WALK' ? 4 : mode === 'CAR' ? 30 : 20;
  return Math.max(5, Math.round((km / speed) * 60));
};

export function createCourseMock(h: Helpers) {
  let courses = new Map<string, MockCourse>();
  let jobs = new Map<string, MockJob>();
  let seq = 0;
  let failProposal = false;
  let failRecalc = false;
  const nextId = (prefix: string) => `${prefix}-${++seq}`;

  const tripOf = (id: string) => h.getTrips().find((t) => t.id === id);
  const myMember = (trip: Trip) =>
    trip.members.find((m) => m.user.id === h.meId)?.id ?? trip.ownerMemberId;
  const placesOf = (trip: Trip) =>
    PLACES.filter((pl) => trip.destinationRegionIds.includes(pl.regionId ?? ''));

  function courseOf(trip: Trip): MockCourse {
    const found = courses.get(trip.id);
    if (found) return found;
    const now = new Date().toISOString();
    let course: MockCourse = {
      version: 1,
      items: [],
      legs: [],
      updatedByMemberId: trip.ownerMemberId,
      updatedAt: now,
    };
    // 첫 예시 여행은 Figma 코스 초안과 같은 부산 2일 코스로 시작한다. 구간은 연동 전처럼 계산 불가
    if (trip.id === 'trip-1') {
      const [haeundae, gwangalli, seomyeon, gamcheon] = PLACES;
      const items: MockItem[] = [
        { id: 'it-1', place: haeundae, day: 1, order: 1, startTime: '10:00', stayMinutes: 120 },
        { id: 'it-4', place: gwangalli, day: 1, order: 2, startTime: '13:00', stayMinutes: 90 },
        { id: 'it-2', place: seomyeon, day: 1, order: 3, startTime: '19:00', stayMinutes: 60 },
        { id: 'it-3', place: gamcheon, day: 2, order: 1, startTime: '10:30', stayMinutes: 120 },
      ];
      course = {
        version: 3,
        items,
        legs: [unavailable('it-1', 'it-4', 'TRANSIT'), unavailable('it-4', 'it-2', 'TRANSIT')],
        updatedByMemberId: trip.members[1]?.id ?? trip.ownerMemberId,
        updatedAt: now,
      };
    }
    courses.set(trip.id, course);
    return course;
  }

  function unavailable(from: string, to: string, mode: Mode): MockLeg {
    return {
      fromItemId: from,
      toItemId: to,
      transportMode: mode,
      durationSeconds: null,
      distanceMeters: null,
      geometry: null,
      status: 'UNAVAILABLE',
      queriedAt: new Date().toISOString(),
    };
  }

  function computed(course: MockCourse, l: MockLeg): MockLeg {
    const a = course.items.find((i) => i.id === l.fromItemId)?.place;
    const b = course.items.find((i) => i.id === l.toItemId)?.place;
    if (!a || !b) return l;
    return {
      ...l,
      durationSeconds: minutesBetween(a, b, l.transportMode) * 60,
      distanceMeters: Math.round(
        Math.hypot(a.latitude - b.latitude, a.longitude - b.longitude) * 100_000,
      ),
      geometry: {
        type: 'LineString',
        coordinates: [
          [a.longitude, a.latitude],
          [b.longitude, b.latitude],
        ],
      },
      status: 'AVAILABLE',
      queriedAt: new Date().toISOString(),
    };
  }

  const view = (tripId: string, c: MockCourse) => ({ tripId, ...c });

  function replace(config: InternalAxiosRequestConfig, trip: Trip, body: Record<string, unknown>) {
    const course = courseOf(trip);
    if (Number(body.expectedVersion) !== course.version)
      throw h.fail(config, 409, 'VERSION_CONFLICT', '코스가 변경되었습니다. 다시 조회해 주세요.');
    const items = (body.items ?? []) as {
      id?: string;
      placeId: string;
      day: number;
      order: number;
      startTime?: string | null;
      stayMinutes?: number | null;
    }[];
    const legs = (body.legs ?? []) as {
      day: number;
      fromOrder: number;
      toOrder: number;
      transportMode: Mode;
    }[];
    if (items.length > MAX_ITEMS)
      throw h.fail(config, 400, 'VALIDATION_ERROR', '코스 항목은 200개까지예요.');
    // 날마다 order 1부터 빈틈없이, 같은 날 인접 쌍마다 구간 정확히 하나
    const byDay = new Map<number, number[]>();
    for (const i of items) byDay.set(i.day, [...(byDay.get(i.day) ?? []), i.order]);
    for (const [day, orders] of byDay) {
      const sorted = [...orders].sort((a, b) => a - b);
      if (sorted.some((o, k) => o !== k + 1))
        throw h.fail(config, 400, 'VALIDATION_ERROR', '순서가 1부터 이어지지 않아요.');
      const dayLegs = legs.filter((l) => l.day === day);
      const ok =
        dayLegs.length === sorted.length - 1 &&
        sorted.slice(1).every((o) => dayLegs.some((l) => l.fromOrder === o - 1 && l.toOrder === o));
      if (!ok) throw h.fail(config, 422, 'INVALID_ROUTE_LEGS', '구간이 코스 항목과 맞지 않습니다.');
    }
    if (legs.some((l) => !byDay.has(l.day)))
      throw h.fail(config, 422, 'INVALID_ROUTE_LEGS', '구간이 코스 항목과 맞지 않습니다.');

    const known = [...PLACES, ...course.items.map((i) => i.place)];
    const nextItems: MockItem[] = items.map((i) => {
      const keep = i.id ? course.items.find((x) => x.id === i.id) : undefined;
      if (i.id && !keep)
        throw h.fail(config, 400, 'VALIDATION_ERROR', '이 코스의 항목이 아니에요.');
      const pl =
        known.find((x) => x.id === i.placeId) ??
        p(i.placeId, '고른 장소', 35.15, 129.1, trip.destinationRegionIds[0] ?? '', '');
      return {
        id: keep?.id ?? nextId('it'),
        place: pl,
        day: i.day,
        order: i.order,
        startTime: i.startTime ?? null,
        stayMinutes: i.stayMinutes ?? null,
      };
    });
    const at = (day: number, order: number) =>
      nextItems.find((i) => i.day === day && i.order === order) as MockItem;
    const nextLegs: MockLeg[] = legs.map((l) => {
      const from = at(l.day, l.fromOrder).id;
      const to = at(l.day, l.toOrder).id;
      const old = course.legs.find(
        (x) => x.fromItemId === from && x.toItemId === to && x.transportMode === l.transportMode,
      );
      return old ?? unavailable(from, to, l.transportMode);
    });
    const same =
      JSON.stringify(nextItems.map((i) => [i.id, i.place.id, i.day, i.order, i.startTime])) ===
        JSON.stringify(course.items.map((i) => [i.id, i.place.id, i.day, i.order, i.startTime])) &&
      JSON.stringify(nextLegs) === JSON.stringify(course.legs);
    if (!same) {
      course.items = nextItems;
      course.legs = nextLegs;
      course.version += 1;
      course.updatedByMemberId = myMember(trip);
      course.updatedAt = new Date().toISOString();
    }
    return view(trip.id, course);
  }

  /** 그룹 즐겨찾기 장소를 날짜에 고르게 나눈 추천 코스 */
  function proposed(trip: Trip) {
    const days =
      trip.startDate && trip.endDate
        ? Math.round((Date.parse(trip.endDate) - Date.parse(trip.startDate)) / 86_400_000) + 1
        : 1;
    const pool = placesOf(trip);
    const per = Math.max(1, Math.ceil(pool.length / days));
    const items = pool.map((pl, i) => ({
      id: null,
      place: pl,
      day: Math.min(days, Math.floor(i / per) + 1),
      order: (i % per) + 1,
      startTime: `${String(10 + (i % per) * 3).padStart(2, '0')}:00`,
      stayMinutes: 90,
    }));
    const legs = items
      .filter((i) => i.order > 1)
      .map((i) => ({
        day: i.day,
        fromOrder: i.order - 1,
        toOrder: i.order,
        transportMode: 'TRANSIT',
      }));
    return { items, legs };
  }

  function jobStatus(job: MockJob) {
    const done = Date.now() - job.createdAt >= JOB_RUN_MS;
    if (!done) return 'RUNNING';
    return job.fail ? 'FAILED' : 'SUCCEEDED';
  }

  function jobView(job: MockJob) {
    const status = jobStatus(job);
    return {
      id: job.id,
      kind: job.kind,
      status,
      progress: status === 'RUNNING' ? 50 : 100,
      result: null,
      error: status === 'FAILED' ? { code: 'AI_FAILED', message: '작업에 실패했습니다.' } : null,
      createdAt: new Date(job.createdAt).toISOString(),
      finishedAt: status === 'RUNNING' ? null : new Date().toISOString(),
    };
  }

  function handle(
    config: InternalAxiosRequestConfig,
    method: string,
    url: string,
  ): AxiosResponse | null {
    const jobMatch = /^\/jobs\/([^/]+)$/.exec(url);
    if (jobMatch && method === 'get') {
      const job = jobs.get(decodeURIComponent(jobMatch[1]));
      if (!job) return null;
      // 다시 계산이 끝나면 그때 코스의 구간을 채운다
      if (job.kind === 'ROUTE_RECALCULATION' && jobStatus(job) === 'SUCCEEDED') {
        const trip = tripOf(job.tripId);
        const course = trip ? courseOf(trip) : null;
        if (course && course.version === job.baseVersion) {
          course.legs = course.legs.map((l) =>
            l.status === 'AVAILABLE' ? l : computed(course, l),
          );
        }
      }
      return h.ok(config, { data: jobView(job) });
    }

    const savedMatch = /^\/trips\/([^/]+)\/saved-places$/.exec(url);
    if (savedMatch && method === 'get') {
      const trip = tripOf(decodeURIComponent(savedMatch[1]));
      if (!trip) throw h.fail(config, 404, 'TRIP_NOT_FOUND', '여행을 찾을 수 없습니다.');
      const items = placesOf(trip).map((pl, i) => ({
        place: pl,
        savedBy: trip.members.slice(0, 1 + (i % 2)).map((m) => ({ memberId: m.id, memo: null })),
        savedCount: 1 + (i % 2),
      }));
      return h.ok(config, {
        items,
        totals: {
          allPlaceCount: items.length,
          overlapPlaceCount: items.filter((i) => i.savedCount > 1).length,
          filteredCount: items.length,
        },
        page: { nextCursor: null, hasNext: false },
      });
    }

    const m = /^\/trips\/([^/]+)\/itinerary(\/.*)?$/.exec(url);
    if (!m) return null;
    const trip = tripOf(decodeURIComponent(m[1]));
    if (!trip) throw h.fail(config, 404, 'TRIP_NOT_FOUND', '여행을 찾을 수 없습니다.');
    const rest = m[2] ?? '';
    const body = (typeof config.data === 'string' ? JSON.parse(config.data || '{}') : {}) as Record<
      string,
      unknown
    >;
    const course = courseOf(trip);

    if (rest === '' && method === 'get') return h.ok(config, { data: view(trip.id, course) });
    if (rest === '' && method === 'put') return h.ok(config, { data: replace(config, trip, body) });

    if (rest === '/proposals' && method === 'post') {
      if (Number(body.expectedVersion) !== course.version)
        throw h.fail(config, 409, 'VERSION_CONFLICT', '코스가 변경되었습니다. 다시 조회해 주세요.');
      const job: MockJob = {
        id: nextId('job-course'),
        kind: 'ITINERARY_PROPOSAL',
        tripId: trip.id,
        createdAt: Date.now(),
        fail: failProposal,
        baseVersion: course.version,
      };
      failProposal = false;
      jobs.set(job.id, job);
      return h.ok(
        config,
        { data: { jobId: job.id, status: 'QUEUED', statusUrl: `/api/v1/jobs/${job.id}` } },
        202,
      );
    }
    const proposalMatch = /^\/proposals\/([^/]+)$/.exec(rest);
    if (proposalMatch && method === 'get') {
      const job = jobs.get(decodeURIComponent(proposalMatch[1]));
      if (!job || job.tripId !== trip.id)
        throw h.fail(config, 404, 'JOB_NOT_FOUND', '작업을 찾을 수 없습니다.');
      const status = jobStatus(job);
      return h.ok(config, {
        data: {
          job: jobView(job),
          baseVersion: job.baseVersion,
          reason: 'INITIAL',
          proposed: status === 'SUCCEEDED' ? proposed(trip) : null,
          diff: null,
          appliedAt: null,
          canUndo: false,
        },
      });
    }
    if (rest === '/routes/recalculate' && method === 'post') {
      if (Number(body.expectedVersion) !== course.version)
        throw h.fail(config, 409, 'VERSION_CONFLICT', '코스가 변경되었습니다. 다시 조회해 주세요.');
      const job: MockJob = {
        id: nextId('job-route'),
        kind: 'ROUTE_RECALCULATION',
        tripId: trip.id,
        createdAt: Date.now(),
        fail: failRecalc,
        baseVersion: course.version,
      };
      failRecalc = false;
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
    /**
     * 다른 동행이 코스를 저장한 것처럼 그 날 순서를 뒤집고 version을 올린다. 다음 [완료]가 409를 받는다.
     * 그 날 장소가 하나뿐이면 시작 시각을 한 시간 늦춘다. 다른 날 구간은 그대로 둔다(함께 편집 quickstart)
     */
    editByOther(tripId = 'trip-1', day = 1) {
      const trip = tripOf(tripId);
      if (!trip) return;
      const course = courseOf(trip);
      const list = course.items
        .filter((i) => i.day === day)
        .sort((a, b) => a.order - b.order)
        .reverse();
      if (list.length === 0) return;
      if (list.length === 1) {
        const [only] = list;
        const [hh, mm] = (only.startTime ?? '09:00').split(':').map(Number);
        only.startTime = `${String((hh + 1) % 24).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      }
      list.forEach((i, k) => (i.order = k + 1));
      const inDay = new Set(list.map((i) => i.id));
      course.legs = [
        ...course.legs.filter((l) => !inDay.has(l.fromItemId)),
        ...list.slice(1).map((to, k) => unavailable(list[k].id, to.id, 'CAR')),
      ];
      course.version += 1;
      course.updatedByMemberId =
        trip.members.find((x) => x.id !== myMember(trip))?.id ?? course.updatedByMemberId;
      course.updatedAt = new Date().toISOString();
    },
    /** 다음 자동 추천을 실패로 끝낸다 */
    failNextProposal() {
      failProposal = true;
    },
    /** 다음 이동 시간 다시 계산을 실패로 끝낸다 */
    failNextRecalculate() {
      failRecalc = true;
    },
    reset() {
      courses = new Map();
      jobs = new Map();
      failProposal = false;
      failRecalc = false;
    },
  };

  return { handle, controls };
}
