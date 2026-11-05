import {
  AxiosError,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';

import { env } from '@/config/env';
import { addDays, seoulToday } from '@/lib/seoul-date';

import type { MyProfile, Session, UserCard } from './types';

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

/** 정원(20명)이 찬 여행을 만들 때 쓰는 동행. 나 + 19명 */
const CROWD = Array.from({ length: 19 }, (_, i) =>
  i < FRIENDS.length ? FRIENDS[i] : user(`user-crowd-${i + 1}`, `동행${i + 1}`),
);

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
  /** 정원이 찬 여행(나 + 19명) */
  crowd?: boolean;
  /** 내가 방장이 아니라 두 번째로 참여한 동행인 여행 */
  meAsMember?: boolean;
}): Trip {
  seq += 1;
  const today = seoulToday();
  const startDate = input.start === undefined ? null : addDays(today, input.start);
  const endDate = startDate ? addDays(startDate, input.days ?? 0) : null;
  const friends = input.crowd ? CROWD : FRIENDS.slice(0, input.friends ?? 0);
  const people =
    input.meAsMember && friends.length > 0
      ? [friends[0], ME, ...friends.slice(1)]
      : [ME, ...friends];
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
  // 동행 초대·관리 확인용: 내가 동행인 여행, 정원이 찬 여행
  makeTrip({ title: '세은이 만든 여행', start: 20, days: 1, friends: 2, meAsMember: true }),
  makeTrip({ title: '스무 명 워크숍', start: 40, days: 1, crowd: true }),
];

/** 이 여행에서 지금 쓸 수 있는 초대 링크의 토큰. 새로 만들거나 취소하면 바뀐다 */
const inviteTokens = new Map<string, string>();

const INVITE_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function bump(trip: Trip) {
  trip.version += 1;
}

/**
 * 웹 테스트 모드 콘솔에서 다른 동행의 변경을 흉내 낸다(동행 명세 research R15).
 * globalThis.__devMock.bumpVersion('trip-1') → 다음 저장·나가기가 409를 받는다
 * globalThis.__devMock.giveOwner('trip-1', 'member-1-2') → 내가 방장이 아니게 된다(403 확인)
 */
export const devMockControls = {
  /** 지금 가짜 서버의 여행. 확인용 */
  peek(tripId: string) {
    return trips.find((t) => t.id === tripId);
  },
  bumpVersion(tripId: string) {
    const trip = trips.find((t) => t.id === tripId);
    if (trip) bump(trip);
  },
  giveOwner(tripId: string, memberId: string) {
    const trip = trips.find((t) => t.id === tripId);
    if (!trip || !trip.members.some((m) => m.id === memberId)) return;
    trip.ownerMemberId = memberId;
    trip.members = trip.members.map((m) => ({
      ...m,
      role: m.id === memberId ? 'OWNER' : 'MEMBER',
    }));
    bump(trip);
  },
};
// 이 파일은 로그인·세션 코드가 늘 불러오므로, 개발 빌드의 테스트 모드일 때만 콘솔 도구를 등록한다
if (__DEV__ && env.devMock) {
  (globalThis as { __devMock?: typeof devMockControls }).__devMock = devMockControls;
}

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

  const companion = handleCompanions(config, method, url);
  if (companion) return companion;

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

/**
 * 동행 초대·관리·나가기 API(specs/20261105-091142-trip-companions/contracts/companions-api.md).
 * 서버처럼 방장(403) → 버전(409) → 대상 순으로 보고, 성공하면 version을 하나 올린다
 */
function handleCompanions(
  config: InternalAxiosRequestConfig,
  method: string,
  url: string,
): AxiosResponse | null {
  const match = /^\/trips\/([^/]+)(\/.*)?$/.exec(url);
  if (!match) return null;
  const [, tripId, rest = ''] = match;
  const isWrite = method !== 'get';
  if (!isWrite) return null;

  const trip = trips.find((t) => t.id === tripId);
  const me = trip?.members.find((m) => m.user.id === ME.id);
  if (!trip || !me) throw fail(config, 404, 'TRIP_NOT_FOUND', '여행을 찾을 수 없습니다.');

  const body = JSON.parse(String(config.data ?? '{}')) as Record<string, unknown>;
  const params = (config.params ?? {}) as Record<string, unknown>;
  const isOwner = trip.ownerMemberId === me.id;
  const checkVersion = (expected: unknown) => {
    if (Number(expected) !== trip.version) {
      throw fail(
        config,
        409,
        'VERSION_CONFLICT',
        '여행 정보가 변경되었습니다. 다시 조회해 주세요.',
      );
    }
  };
  const requireOwner = () => {
    if (!isOwner) throw fail(config, 403, 'FORBIDDEN', '방장만 할 수 있습니다.');
  };

  if (method === 'post' && rest === '/invitations') {
    const token = `dev${Date.now().toString(36)}`;
    inviteTokens.set(trip.id, token);
    return ok(
      config,
      {
        data: {
          id: `invite-${token}`,
          token,
          url: `ieohaeng://invitations/${token}`,
          expiresAt: new Date(Date.now() + INVITE_DAYS_MS).toISOString(),
        },
      },
      201,
    );
  }

  if (method === 'delete' && rest === '/invitations') {
    inviteTokens.delete(trip.id);
    return ok(config, '', 204);
  }

  if (method === 'patch' && rest === '') {
    checkVersion(body.expectedVersion);
    const before = JSON.stringify([
      trip.title,
      trip.startDate,
      trip.endDate,
      trip.destinationRegionIds,
    ]);
    if (typeof body.title === 'string') trip.title = body.title.trim();
    if ('startDate' in body) trip.startDate = (body.startDate as string | null) ?? null;
    if ('endDate' in body) trip.endDate = (body.endDate as string | null) ?? null;
    if (Array.isArray(body.destinationRegionIds)) {
      trip.destinationRegionIds = body.destinationRegionIds as string[];
    }
    const after = JSON.stringify([
      trip.title,
      trip.startDate,
      trip.endDate,
      trip.destinationRegionIds,
    ]);
    if (before !== after) bump(trip);
    return ok(config, { data: trip });
  }

  if (method === 'post' && rest === '/owner-transfer') {
    requireOwner();
    checkVersion(body.expectedVersion);
    const target = trip.members.find((m) => m.id === body.targetMemberId);
    if (!target || target.id === me.id) {
      throw fail(config, 400, 'VALIDATION_ERROR', '같은 여행의 동행에게만 넘길 수 있습니다.');
    }
    devMockControls.giveOwner(trip.id, target.id);
    return ok(config, { data: trip });
  }

  const memberMatch = /^\/members\/([^/]+)$/.exec(rest);
  if (method === 'delete' && memberMatch) {
    requireOwner();
    checkVersion(params.expectedVersion);
    const target = trip.members.find((m) => m.id === memberMatch[1]);
    if (!target) throw fail(config, 404, 'MEMBER_NOT_FOUND', '동행을 찾을 수 없습니다.');
    if (target.id === me.id) {
      throw fail(config, 400, 'VALIDATION_ERROR', '방장은 내보낼 수 없습니다.');
    }
    trip.members = trip.members.filter((m) => m.id !== target.id);
    bump(trip);
    return ok(config, '', 204);
  }

  if (method === 'post' && rest === '/leave') {
    if (body.deleteOwnPhotos === true) {
      throw fail(config, 400, 'VALIDATION_ERROR', '사진 지우기는 아직 지원하지 않습니다.');
    }
    checkVersion(body.expectedVersion);
    if (trip.members.length === 1) {
      trips = trips.filter((t) => t.id !== trip.id);
      return ok(
        config,
        {
          data: {
            tripId: trip.id,
            tripDeleted: true,
            newOwnerMemberId: null,
            cleanupJobId: `job-${trip.id}`,
            status: 'TRIP_DELETED',
          },
        },
        202,
      );
    }
    trip.members = trip.members.filter((m) => m.id !== me.id);
    let newOwnerMemberId: string | null = null;
    if (isOwner) {
      const next = [...trip.members].sort((a, b) => a.joinOrder - b.joinOrder)[0];
      trip.ownerMemberId = next.id;
      trip.members = trip.members.map((m) => ({
        ...m,
        role: m.id === next.id ? 'OWNER' : 'MEMBER',
      }));
      newOwnerMemberId = next.id;
    }
    bump(trip);
    // 내 화면에서는 나간 여행이 보이지 않아야 하므로 목록에서도 뺀다(테스트 모드는 사용자가 나 하나)
    trips = trips.filter((t) => t.id !== trip.id);
    const cleanup = body.deleteOwnMessages === true;
    return ok(
      config,
      {
        data: {
          tripId: trip.id,
          tripDeleted: false,
          newOwnerMemberId,
          cleanupJobId: cleanup ? `job-leave-${trip.id}` : null,
          status: 'LEFT',
        },
      },
      cleanup ? 202 : 200,
    );
  }

  if (method === 'delete' && rest === '') {
    requireOwner();
    checkVersion(params.expectedVersion);
    trips = trips.filter((t) => t.id !== trip.id);
    return ok(
      config,
      {
        data: {
          jobId: `job-delete-${trip.id}`,
          status: 'QUEUED',
          statusUrl: `/api/v1/jobs/job-delete-${trip.id}`,
        },
      },
      202,
    );
  }

  return null;
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
