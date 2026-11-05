import {
  AxiosError,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';

import { env } from '@/config/env';
import { sampleFeed } from '@/features/feed/preview-data';
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
  ...user('user-me', '다온'),
  ageBand: null,
  ageUseConsent: false,
  // 신규 가입자 모드: 카카오 닉네임만 있고 프로필(S02)은 아직
  profileCompleted: !env.devMockNewUser,
  profileUrl: '',
};

/** S07 공동 피드 좋아요(테스트 모드 메모리) */
const feedLikes = new Map<string, { liked: boolean; count: number }>();

/** 신규 가입자 모드에서 S03에 저장한 취향. 저장 전에는 404 */
let myPreferences: unknown = null;

const FRIENDS = ['가람', '나래', '바다', '소라', '하늘'].map((name, i) =>
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
const SAMPLE_TRIPS: Trip[] = [
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
  makeTrip({ title: '가람이 만든 여행', start: 20, days: 1, friends: 2, meAsMember: true }),
  makeTrip({ title: '스무 명 워크숍', start: 40, days: 1, crowd: true }),
];
// 신규 가입자 모드는 여행 없이 시작해 첫 방문 홈을 본다
let trips: Trip[] = env.devMockNewUser ? [] : SAMPLE_TRIPS;

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
  if (method === 'patch' && url === '/me') {
    const body = JSON.parse(String(config.data ?? '{}')) as { nickname?: string };
    if (body.nickname) ME.nickname = body.nickname;
    ME.profileCompleted = true;
    return ok(config, { data: ME });
  }
  if (method === 'get' && url === '/me/preferences') {
    if (!myPreferences) throw fail(config, 404, 'NOT_FOUND', '아직 저장한 취향이 없어요');
    return ok(config, { data: myPreferences });
  }
  if (method === 'put' && url === '/me/preferences') {
    const body = JSON.parse(String(config.data ?? '{}')) as Record<string, unknown>;
    myPreferences = { inferredItems: [], ...body, updatedAt: new Date().toISOString() };
    return ok(config, { data: myPreferences });
  }
  if (method === 'get' && url === '/me/trips') return ok(config, page(trips));
  // S37 내가 게시한 공동 피드: 예시 여행 중 "남도 맛집 여행"을 경주로 게시한 것으로 본다
  if (method === 'get' && url === '/me/feeds') {
    const posted = trips.find((t) => t.title === '남도 맛집 여행');
    return ok(
      config,
      page(
        posted
          ? [
              {
                id: `feed-${posted.id}`,
                tripId: posted.id,
                title: '봄 경주',
                regions: [{ id: 'region-gyeongju', code: '4713000000', name: '경상북도 경주시' }],
              },
            ]
          : [],
      ),
    );
  }

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

  // S05 홈. 팔로우한 친구가 다녀간 지역 네 곳(법정동 코드는 지도 경계와 같다)
  if (method === 'get' && url === '/home/map') {
    const marker = (code: string, name: string, members: string[]) => ({
      region: { id: `home-${code}`, code, name, parentId: null, latitude: null, longitude: null },
      feedIds: [`feed-${code}`],
      visibleMemberUserIds: members,
      visitCount: members.length,
    });
    return ok(config, {
      data: {
        markers: [
          marker('5115000000', '강원특별자치도 강릉시', ['user-1', 'user-2', 'user-3']),
          // 강원 주변(확대 확인용)
          marker('5121000000', '강원특별자치도 속초시', ['user-1', 'user-4']),
          marker('5183000000', '강원특별자치도 양양군', ['user-2']),
          marker('5182000000', '강원특별자치도 고성군', ['user-5']),
          marker('5117000000', '강원특별자치도 동해시', ['user-3', 'user-4']),
          marker('5123000000', '강원특별자치도 삼척시', ['user-1']),
          marker('5176000000', '강원특별자치도 평창군', ['user-2', 'user-3', 'user-4', 'user-5']),
          marker('5111000000', '강원특별자치도 춘천시', ['user-5']),
          marker('4713000000', '경상북도 경주시', ['user-2', 'user-4']),
          marker('1213000000', '전남광주통합특별시 여수시', ['user-1']),
          marker('5011000000', '제주특별자치도 제주시', ['user-3', 'user-5']),
        ],
        criteria: { from: null, to: null, regionGrouping: 'SIGUNGU' },
        updatedAt: new Date().toISOString(),
      },
    });
  }
  // 좋아요 기반 추천(백엔드 아직 없음). 휴대폰 테스트에서 시트 카드가 보이게 예시를 준다
  // S07 공동 피드: 어떤 ID든 예시 피드를 돌려준다. 좋아요는 메모리에 남는다
  const feedMatch = /^\/feeds\/([^/]+)(\/like)?$/.exec(url);
  if (feedMatch) {
    const [, feedId, like] = feedMatch;
    const cur = feedLikes.get(feedId) ?? { liked: false, count: 12 };
    if (!like && method === 'get') {
      return ok(config, {
        data: { ...sampleFeed(feedId), likedByMe: cur.liked, likeCount: cur.count },
      });
    }
    if (like && method === 'put') {
      const next = { liked: true, count: cur.liked ? cur.count : cur.count + 1 };
      feedLikes.set(feedId, next);
      return ok(config, { data: next });
    }
    if (like && method === 'delete') {
      feedLikes.set(feedId, { liked: false, count: cur.liked ? cur.count - 1 : cur.count });
      return ok(config, undefined, 204);
    }
  }

  if (method === 'get' && url === '/me/discovery-recommendations') {
    const region = (code: string, name: string) => ({
      id: `home-${code}`,
      code,
      name,
      parentId: null,
      latitude: null,
      longitude: null,
    });
    const feed = (
      id: string,
      title: string,
      code: string,
      name: string,
      start: string,
      end: string,
    ) => ({
      type: 'FEED' as const,
      feed: {
        id,
        tripId: `trip-${id}`,
        title,
        coverPhotoId: null,
        regions: [region(code, name)],
        startDate: start,
        endDate: end,
        publishedAt: '2026-10-20T09:00:00Z',
        likedByMe: false,
        likeCount: 3,
      },
      place: null,
      reason: '좋아요한 여행과 비슷해요',
    });
    const place = (id: string, name: string, address: string) => ({
      type: 'PLACE' as const,
      feed: null,
      place: { id, name, address, regionId: null },
      reason: '좋아요한 여행과 비슷해요',
    });
    return ok(
      config,
      page([
        feed(
          'rec-1',
          '제주 동쪽 한 바퀴',
          '5011000000',
          '제주특별자치도 제주시',
          '2026-09-12',
          '2026-09-14',
        ),
        place('rec-2', '명주동 골목 카페', '강원 강릉시 명주동'),
        feed(
          'rec-3',
          '여수 밤바다',
          '1213000000',
          '전남광주통합특별시 여수시',
          '2026-08-02',
          '2026-08-03',
        ),
        place('rec-4', '안목 바다뷰 카페', '강원 강릉시 견소동'),
      ]),
    );
  }
  if (method === 'get' && url === '/me/notification-summary') {
    return ok(config, { data: { unreadCount: 2, asOf: new Date().toISOString() } });
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
  isNewUser: env.devMockNewUser,
};
