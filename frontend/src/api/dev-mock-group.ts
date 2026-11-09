import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';

import type { Trip } from './types';

/**
 * 개발용 테스트 모드의 가짜 그룹 즐겨찾기 서버
 * (specs/20261109-131605-group-favorites/contracts/group-api.md, 백엔드 TripSavedPlaceService와 같은 규칙).
 * 최근 담은 순, 겹친 곳은 담은 수 2 이상, limit 1~100, 커서로 이어 받기, 응답은 감싸지 않는다.
 * 내 저장만 담기·메모·빼기를 한다. 콘솔: globalThis.__devMock.group.saveByOther('trip-1') 등
 */

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
type Save = { memberId: string; memo: string | null; at: number };
type Entry = { place: MockPlace; saves: Save[] };

type Helpers = {
  getTrips(): Trip[];
  meId: string;
  /** 다른 가짜 서버가 아는 장소(개인 즐겨찾기 등). 없으면 null */
  findPlace(id: string): MockPlace | null;
  ok<T>(config: InternalAxiosRequestConfig, data: T, status?: number): AxiosResponse<T>;
  fail(config: InternalAxiosRequestConfig, status: number, code: string, message: string): Error;
};

const p = (
  id: string,
  name: string,
  address: string,
  latitude: number,
  longitude: number,
): MockPlace => ({
  id,
  name,
  address,
  latitude,
  longitude,
  regionId: 'region-busan',
  provider: 'KAKAO',
  providerPlaceId: id,
  source: 'PROVIDER',
});

/** Figma 201-9344와 같은 부산 다섯 곳. ID는 사진·코스 가짜 서버의 장소와 같다 */
const SEED = [
  p('place-haeundae', '해운대 해변', '부산 해운대구 우동', 35.1587, 129.1604),
  p('place-gwangalli', '광안리 바다뷰 카페', '부산 수영구 광안해변로', 35.1532, 129.1186),
  p('place-gamcheon', '감천문화마을', '부산 사하구 감내2로', 35.0975, 129.0106),
  p('place-seomyeon', '서면 돼지국밥집', '부산 부산진구 서면로', 35.1578, 129.0596),
  p('place-huinnyeoul', '흰여울문화마을', '부산 영도구 영선동', 35.0784, 129.0453),
];

export function createGroupMock(h: Helpers) {
  let stores = new Map<string, Map<string, Entry>>();
  let clock = Date.now();
  const tick = () => ++clock;

  const tripOf = (id: string) => h.getTrips().find((t) => t.id === id);
  const myMember = (trip: Trip) =>
    trip.members.find((m) => m.user.id === h.meId)?.id ?? trip.ownerMemberId;

  /** 첫 예시 여행은 다섯 곳(겹친 곳 셋), 나머지는 빈 그룹 즐겨찾기 */
  function storeOf(trip: Trip): Map<string, Entry> {
    const found = stores.get(trip.id);
    if (found) return found;
    const store = new Map<string, Entry>();
    if (trip.id === 'trip-1') {
      const [me, a, b] = [myMember(trip), trip.members[1]?.id, trip.members[2]?.id];
      const who = [[a, b], [a], [b, me], [me], [a, me]];
      SEED.forEach((pl, i) => {
        const saves = who[i]
          .filter((m): m is string => Boolean(m))
          .map((memberId) => ({ memberId, memo: null, at: tick() }));
        store.set(pl.id, { place: pl, saves });
      });
    }
    stores.set(trip.id, store);
    return store;
  }

  const latest = (e: Entry) => Math.max(...e.saves.map((s) => s.at));
  const view = (trip: Trip, e: Entry) => {
    const order = (memberId: string) => trip.members.findIndex((m) => m.id === memberId);
    const saves = [...e.saves].sort((x, y) => order(x.memberId) - order(y.memberId));
    return {
      place: e.place,
      savedBy: saves.map((s) => ({ memberId: s.memberId, memo: s.memo })),
      savedCount: saves.length,
    };
  };

  function handle(
    config: InternalAxiosRequestConfig,
    method: string,
    url: string,
    params: Record<string, string>,
  ): AxiosResponse | null {
    const m = /^\/trips\/([^/]+)\/saved-places(?:\/([^/]+)\/me)?$/.exec(url);
    if (!m) return null;
    const trip = tripOf(decodeURIComponent(m[1]));
    if (!trip) throw h.fail(config, 404, 'TRIP_NOT_FOUND', '여행을 찾을 수 없습니다.');
    const store = storeOf(trip);
    const placeId = m[2] ? decodeURIComponent(m[2]) : null;
    const me = myMember(trip);

    if (!placeId && method === 'get') {
      const filter = params.filter ?? 'ALL';
      const limit = Number(params.limit ?? 20);
      if ((filter !== 'ALL' && filter !== 'OVERLAP') || !(limit >= 1 && limit <= 100))
        throw h.fail(config, 400, 'VALIDATION_ERROR', '요청 값을 확인해 주세요.');
      const all = [...store.values()].filter((e) => e.saves.length > 0);
      let rows = all
        .filter((e) => filter === 'ALL' || e.saves.length >= 2)
        .filter((e) => !params.memberId || e.saves.some((s) => s.memberId === params.memberId))
        .sort((x, y) => latest(y) - latest(x));
      const filteredCount = rows.length;
      const start = params.cursor ? Number(params.cursor) : 0;
      rows = rows.slice(start, start + limit);
      const next = start + limit < filteredCount ? String(start + limit) : null;
      return h.ok(config, {
        items: rows.map((e) => view(trip, e)),
        totals: {
          allPlaceCount: all.length,
          overlapPlaceCount: all.filter((e) => e.saves.length >= 2).length,
          filteredCount,
        },
        page: { nextCursor: next, hasNext: next !== null },
      });
    }
    if (!placeId) return null;
    const body = (typeof config.data === 'string' ? JSON.parse(config.data || '{}') : {}) as {
      memo?: string | null;
    };
    if (body.memo && body.memo.length > 2000)
      throw h.fail(config, 400, 'VALIDATION_ERROR', '메모는 2000자까지예요.');
    const entry = store.get(placeId);

    if (method === 'put') {
      const pl =
        entry?.place ??
        SEED.find((x) => x.id === placeId) ??
        h.findPlace(placeId) ??
        p(placeId, '고른 장소', '부산', 35.15, 129.1);
      const next: Entry = entry ?? { place: pl, saves: [] };
      next.saves = [
        ...next.saves.filter((s) => s.memberId !== me),
        { memberId: me, memo: body.memo ?? null, at: tick() },
      ];
      store.set(placeId, next);
      return h.ok(config, { data: view(trip, next) });
    }
    if (method === 'patch') {
      const mine = entry?.saves.find((s) => s.memberId === me);
      if (!entry || !mine) throw h.fail(config, 404, 'NOT_FOUND', '담은 장소를 찾을 수 없어요.');
      mine.memo = body.memo ?? null;
      return h.ok(config, { data: view(trip, entry) });
    }
    if (method === 'delete') {
      if (entry) entry.saves = entry.saves.filter((s) => s.memberId !== me);
      return h.ok(config, null, 204);
    }
    return null;
  }

  const controls = {
    /** 다른 동행이 장소 하나를 새로 담은 것처럼 한다. 목록을 다시 받으면 맨 위에 보인다 */
    saveByOther(tripId = 'trip-1') {
      const trip = tripOf(tripId);
      if (!trip) return;
      const other = trip.members.find((x) => x.id !== myMember(trip))?.id;
      if (!other) return;
      const pl = p(
        `place-other-${tick()}`,
        '다대포 해수욕장',
        '부산 사하구 다대동',
        35.0466,
        128.9663,
      );
      storeOf(trip).set(pl.id, { place: pl, saves: [{ memberId: other, memo: null, at: tick() }] });
    },
    reset() {
      stores = new Map();
    },
  };

  return { handle, controls };
}
