import {
  AxiosError,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';

import { addDays, seoulToday } from '@/lib/seoul-date';

import type { Follow, MyProfile, Session, UserCard } from './types';

/**
 * 개발용 테스트 모드(env.devMock)의 가짜 서버. 로그인 없이 여행 화면을 기기에서 확인하려고 쓴다.
 * 응답 모양은 백엔드 계약(specs/20261030-092912-trip-create-detail/contracts/trips-api.md)과 같다.
 * 데이터는 메모리에만 있어 앱을 새로 켜면 처음 상태로 돌아간다. 실제 API 연결 확인을 대신하지 않는다.
 */

type Region = {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  latitude: number | null;
  longitude: number | null;
};

type Member = {
  id: string;
  user: UserCard;
  role: 'OWNER' | 'MEMBER';
  status: 'ACTIVE';
  joinOrder: number;
  joinedAt: string;
  leftAt: null;
};

type Trip = {
  id: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  destinationRegionIds: string[];
  status: 'PLANNING' | 'ONGOING' | 'COMPLETED';
  currency: 'KRW';
  ownerMemberId: string;
  members: Member[];
  version: number;
  expenseVersion: number;
};

const LATENCY_MS = 300;

function user(id: string, nickname: string): UserCard {
  return {
    id,
    nickname,
    profileImageUrl: null,
    accountVisibility: 'PUBLIC',
    followingStatus: 'NONE',
    followedByStatus: 'NONE',
  };
}

const ME: MyProfile = {
  ...user('user-me', '영광'),
  ageBand: null,
  ageUseConsent: false,
  profileCompleted: true,
  profileUrl: '',
};

const FRIENDS = ['세은', '승기', '인경', '수철', '성환'].map((name, i) =>
  user(`user-${i + 1}`, name),
);

/** S43 모의 데이터는 개발 테스트 모드에서만 반환한다. */
const FOLLOW_ME: UserCard = { ...ME, nickname: '여행자' };
const FOLLOW_PEOPLE = ['하늘', '바다', '가람', '나래'].map((name, index) =>
  user('follow-user-' + index, name),
);
function follow(
  id: string,
  follower: UserCard,
  followee: UserCard,
  status: Follow['status'],
): Follow {
  return {
    id,
    follower,
    followee,
    status,
    requestedAt: '2026-11-01T00:00:00Z',
    acceptedAt: status === 'ACCEPTED' ? '2026-11-01T00:00:00Z' : null,
  };
}
let follows: Follow[] = [
  follow('following-1', FOLLOW_ME, FOLLOW_PEOPLE[0], 'ACCEPTED'),
  follow('following-2', FOLLOW_ME, FOLLOW_PEOPLE[1], 'ACCEPTED'),
  follow('follower-1', FOLLOW_PEOPLE[0], FOLLOW_ME, 'ACCEPTED'),
  follow('request-1', FOLLOW_PEOPLE[2], FOLLOW_ME, 'REQUESTED'),
  follow('request-2', FOLLOW_PEOPLE[3], FOLLOW_ME, 'REQUESTED'),
];

function followCard(person: UserCard): UserCard {
  return {
    ...person,
    followingStatus:
      follows.find((f) => f.follower.id === ME.id && f.followee.id === person.id)?.status ?? 'NONE',
    followedByStatus:
      follows.find((f) => f.followee.id === ME.id && f.follower.id === person.id)?.status ?? 'NONE',
  };
}
function followResponse(row: Follow): Follow {
  return { ...row, follower: followCard(row.follower), followee: followCard(row.followee) };
}
function followPage(config: InternalAxiosRequestConfig, rows: Follow[]) {
  const params = config.params ?? {};
  const limit = Number(params.limit ?? 20);
  const start = params.cursor ? rows.findIndex((row) => row.id === params.cursor) + 1 : 0;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || (params.cursor && start === 0)) {
    throw fail(config, 400, 'VALIDATION_ERROR', '페이지 조건을 확인해 주세요.');
  }
  const data = rows.slice(start, start + limit).map(followResponse);
  const hasNext = start + data.length < rows.length;
  return ok(config, {
    data,
    page: { hasNext, nextCursor: hasNext ? data[data.length - 1].id : null },
  });
}

const REGIONS: Region[] = [
  ['region-busan', '2600000000', '부산광역시'],
  ['region-gangneung', '5115000000', '강원특별자치도 강릉시'],
  ['region-yeosu', '4613000000', '전라남도 여수시'],
  ['region-jeju', '5000000000', '제주특별자치도'],
  ['region-jongno', '1111000000', '서울특별시 종로구'],
  ['region-gyeongju', '4713000000', '경상북도 경주시'],
].map(([id, code, name]) => ({ id, code, name, parentId: null, latitude: null, longitude: null }));

let seq = 0;

function makeTrip(input: {
  title: string;
  start?: number;
  days?: number;
  regions?: string[];
  friends?: number;
}): Trip {
  seq += 1;
  const today = seoulToday();
  const startDate = input.start === undefined ? null : addDays(today, input.start);
  const endDate = startDate ? addDays(startDate, input.days ?? 0) : null;
  const people = [ME, ...FRIENDS.slice(0, input.friends ?? 0)];
  const members = people.map<Member>((u, i) => ({
    id: `member-${seq}-${i + 1}`,
    user: u,
    role: i === 0 ? 'OWNER' : 'MEMBER',
    status: 'ACTIVE',
    joinOrder: i + 1,
    joinedAt: new Date().toISOString(),
    leftAt: null,
  }));
  // 화면은 날짜로 상태를 다시 계산하므로 서버 값은 참고만 한다
  const status =
    !startDate || !endDate || today < startDate
      ? 'PLANNING'
      : today > endDate
        ? 'COMPLETED'
        : 'ONGOING';
  return {
    id: `trip-${seq}`,
    title: input.title,
    startDate,
    endDate,
    destinationRegionIds: input.regions ?? [],
    status,
    currency: 'KRW',
    ownerMemberId: members[0].id,
    members,
    version: 1,
    expenseVersion: 0,
  };
}

/** 상태 표 5행과 목록 묶음을 한 번에 볼 수 있게 고른 여행들. 만든 순서 최신부터 */
let trips: Trip[] = [
  makeTrip({ title: '부산 바다 여행', start: -1, days: 2, regions: ['region-busan'], friends: 2 }),
  makeTrip({
    title: '강릉 커피 투어',
    start: 17,
    days: 1,
    regions: ['region-gangneung'],
    friends: 5,
  }),
  makeTrip({
    title: '동해 한 바퀴',
    start: 30,
    days: 2,
    regions: ['region-busan', 'region-gangneung'],
    friends: 1,
  }),
  makeTrip({ title: '제주 한 달 살기', regions: ['region-jeju'] }),
  makeTrip({ title: '겨울 여행' }),
  makeTrip({
    title: '남도 맛집 여행',
    start: -40,
    days: 2,
    regions: ['region-yeosu', 'region-busan', 'region-gyeongju'],
    friends: 3,
  }),
  makeTrip({ title: '봄 소풍', start: -10, days: 0, friends: 1 }),
];

/** 같은 키로 다시 보내면 처음 만든 여행을 돌려준다(서버 멱등 처리와 같게) */
const createdByKey = new Map<string, Trip>();

function ok<T>(config: InternalAxiosRequestConfig, data: T, status = 200): AxiosResponse<T> {
  return { data, status, statusText: 'OK', headers: {}, config };
}

function fail(config: InternalAxiosRequestConfig, status: number, code: string, message: string) {
  const response = ok(
    config,
    { error: { code, message, fields: [], traceId: 'dev-mock' } },
    status,
  );
  return new AxiosError(message, 'ERR_BAD_REQUEST', config, null, response);
}

function page<T>(data: T[]) {
  return { data, page: { nextCursor: null, hasNext: false } };
}

function handle(config: InternalAxiosRequestConfig): AxiosResponse {
  const method = (config.method ?? 'get').toLowerCase();
  const url = config.url ?? '';
  const params = (config.params ?? {}) as Record<string, string>;

  if (method === 'get' && url === '/me/following') {
    return followPage(
      config,
      follows.filter((f) => f.follower.id === ME.id && f.status === 'ACCEPTED'),
    );
  }
  if (method === 'get' && url === '/me/followers') {
    return followPage(
      config,
      follows.filter((f) => f.followee.id === ME.id && f.status === 'ACCEPTED'),
    );
  }
  if (method === 'get' && url === '/me/follow-requests') {
    if (params.direction !== 'RECEIVED' && params.direction !== 'SENT')
      throw fail(config, 400, 'VALIDATION_ERROR', '요청 방향을 확인해 주세요.');
    return followPage(
      config,
      follows.filter(
        (f) =>
          f.status === 'REQUESTED' &&
          (params.direction === 'RECEIVED' ? f.followee.id : f.follower.id) === ME.id,
      ),
    );
  }
  const requestMatch = /^\/me\/follow-requests\/([^/]+)(\/accept)?$/.exec(url);
  if (
    requestMatch &&
    ((method === 'post' && requestMatch[2]) || (method === 'delete' && !requestMatch[2]))
  ) {
    const found = follows.find((f) => f.id === decodeURIComponent(requestMatch[1]));
    if (!found || found.status !== 'REQUESTED')
      throw fail(config, 404, 'NOT_FOUND', '팔로우 요청을 찾을 수 없어요.');
    if (method === 'post') {
      if (found.followee.id !== ME.id)
        throw fail(config, 403, 'FORBIDDEN', '받은 요청만 수락할 수 있어요.');
      const accepted: Follow = {
        ...found,
        status: 'ACCEPTED',
        acceptedAt: new Date().toISOString(),
        follower: { ...found.follower, followedByStatus: 'ACCEPTED' },
      };
      follows = follows.map((f) => (f.id === found.id ? accepted : f));
      return ok(config, { data: followResponse(accepted) });
    }
    follows = follows.filter((f) => f.id !== found.id);
    return ok(config, undefined, 204);
  }
  const unfollowMatch = /^\/users\/([^/]+)\/follow$/.exec(url);
  const followerMatch = /^\/me\/followers\/([^/]+)$/.exec(url);
  if (method === 'delete' && (unfollowMatch || followerMatch)) {
    const targetId = decodeURIComponent((unfollowMatch ?? followerMatch)![1]);
    follows = follows.filter(
      (f) =>
        !(unfollowMatch
          ? f.follower.id === ME.id && f.followee.id === targetId
          : f.followee.id === ME.id && f.follower.id === targetId),
    );
    return ok(config, undefined, 204);
  }

  if (method === 'get' && url === '/me') return ok(config, { data: ME });
  if (method === 'get' && url === '/me/trips') return ok(config, page(trips));

  if (method === 'post' && url === '/trips') {
    const key = String(config.headers['Idempotency-Key'] ?? '');
    const existing = createdByKey.get(key);
    if (existing) return ok(config, { data: existing }, 201);
    const body = JSON.parse(String(config.data ?? '{}')) as {
      title: string;
      startDate?: string;
      endDate?: string;
      destinationRegionIds?: string[];
    };
    const trip = makeTrip({ title: body.title.trim(), regions: body.destinationRegionIds });
    trip.startDate = body.startDate ?? null;
    trip.endDate = body.endDate ?? null;
    trips = [trip, ...trips];
    createdByKey.set(key, trip);
    return ok(config, { data: trip }, 201);
  }

  const tripMatch = /^\/trips\/([^/]+)$/.exec(url);
  if (method === 'get' && tripMatch) {
    const trip = trips.find((t) => t.id === tripMatch[1]);
    if (!trip) throw fail(config, 404, 'TRIP_NOT_FOUND', '여행을 찾을 수 없습니다.');
    return ok(config, { data: trip });
  }

  if (method === 'get' && url === '/regions') {
    const query = (params.query ?? '').trim();
    return ok(config, page(REGIONS.filter((r) => query && r.name.includes(query))));
  }

  const regionMatch = /^\/regions\/([^/]+)$/.exec(url);
  if (method === 'get' && regionMatch) {
    const region = REGIONS.find((r) => r.id === regionMatch[1]);
    if (!region) throw fail(config, 404, 'REGION_NOT_FOUND', '지역을 찾을 수 없습니다.');
    return ok(config, {
      data: { region, introduction: null, representativePlaces: [], partialErrors: [] },
    });
  }

  throw fail(config, 404, 'NOT_FOUND', `테스트 모드에 없는 요청입니다: ${method} ${url}`);
}

export const devMockAdapter: AxiosAdapter = (config) =>
  new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        resolve(handle(config));
      } catch (e) {
        reject(e);
      }
    }, LATENCY_MS);
  });

/** 테스트 모드에서 로그인한 것으로 보는 가짜 토큰. 실제 서버에는 보내지 않는다 */
export const DEV_MOCK_TOKENS = { accessToken: 'dev-mock-access', refreshToken: 'dev-mock-refresh' };

/** 테스트 모드의 [카카오로 계속하기]가 카카오를 거치지 않고 바로 쓰는 로그인 결과 */
export const DEV_MOCK_SESSION: Session = {
  ...DEV_MOCK_TOKENS,
  expiresIn: 3600,
  user: ME,
  isNewUser: false,
};
