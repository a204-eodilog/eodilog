import {
  AxiosError,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';

import { env } from '@/config/env';
import { sampleFeed } from '@/features/feed/preview-data';
import { addDays, seoulToday } from '@/lib/seoul-date';

import { createChatMock } from './dev-mock-chat';
import { createChecklistMock } from './dev-mock-checklist';
import { createCourseMock } from './dev-mock-course';
import { createGroupMock } from './dev-mock-group';
import { createNotificationMock } from './dev-mock-notification';
import { createPollMock } from './dev-mock-poll';
import { createRecommendMock } from './dev-mock-recommend';
import { mockMyTimeline, mockTripSummary, mockTripTimeline } from './dev-mock-timeline';
import { createWeatherMock } from './dev-mock-weather';

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

/**
 * 시험 프로필 사진 주소. 다른 사람의 절반쯤만 사진을 줘서 사진 얼굴과 글자 얼굴이 섞인 모습을 본다.
 * 나는 비워 둔다. 내 얼굴의 연파랑 구분과 프로필 사진 올리기(S02) 확인을 그대로 두기 위해서다.
 * lib/mock-photo가 이 주소를 인터넷 샘플 사진으로 바꿔 그린다
 */
function sampleProfileImage(id: string): string | null {
  if (id === 'user-me') return null;
  const sum = [...id].reduce((n, ch) => n + ch.charCodeAt(0), 0);
  return sum % 2 === 0 ? `/assets/sample-profile-${id}/download` : null;
}

function user(id: string, nickname: string): UserCard {
  return {
    id,
    nickname,
    profileImageUrl: sampleProfileImage(id),
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

/** S44 추천 친구·N9 프로필에 쓰는 예시 사람(테스트 모드). 한 명은 비공개 계정 */
const PEOPLE = [
  { ...user('people-1', '도윤'), feedCount: 3, followerCount: 12, followingCount: 9 },
  { ...user('people-2', '하린'), feedCount: 1, followerCount: 4, followingCount: 6 },
  {
    ...user('people-3', '서준'),
    accountVisibility: 'PRIVATE' as const,
    followerCount: 5,
    followingCount: 7,
  },
];
let hiddenSuggestions: string[] = [];

/**
 * 내가 게시한 공동 피드(테스트 모드 메모리, 여행 ID → 피드). S37·S38·S39·S40이 같이 본다.
 * 처음에는 예시 여행 "남도 맛집 여행"을 경주로 게시해 둔다. visibility는 S39 내 노출 설정(처음엔 아무도 숨기지 않음)
 */
type MockOwnFeed = {
  id: string;
  tripId: string;
  title: string;
  body: string;
  regions: { id: string; code: string; name: string }[];
  startDate: string | null;
  endDate: string | null;
  publishedAt: string;
  version: number;
  visibility: {
    feedId: string;
    hiddenViewerUserIds: string[];
    version: number;
    updatedAt: string;
  };
};
const ownFeeds = new Map<string, MockOwnFeed>();
// 응답은 복사해서 준다. 메모리의 객체를 그대로 주면 화면 캐시가 같은 객체를 들고 있다가 바뀐 줄 모른다
const copyFeed = (f: MockOwnFeed): MockOwnFeed => JSON.parse(JSON.stringify(f)) as MockOwnFeed;
function publishMockFeed(
  trip: { id: string; title: string; startDate: string | null; endDate: string | null },
  write: { title: string; body: string; regions?: MockOwnFeed['regions'] },
): MockOwnFeed {
  const id = `feed-${trip.id}`;
  const feed: MockOwnFeed = {
    id,
    tripId: trip.id,
    title: write.title,
    body: write.body,
    regions: write.regions ?? [],
    startDate: trip.startDate,
    endDate: trip.endDate,
    publishedAt: new Date().toISOString(),
    version: 1,
    visibility: {
      feedId: id,
      hiddenViewerUserIds: [],
      version: 1,
      updatedAt: '2026-11-01T00:00:00Z',
    },
  };
  ownFeeds.set(trip.id, feed);
  return feed;
}

/** S07 공동 피드 좋아요(테스트 모드 메모리) */
const feedLikes = new Map<string, { liked: boolean; count: number }>();
// 목록에서 내준 피드의 제목·기간·지역. 상세(S07)는 예시 하나를 쓰되 이 값으로 덮어 눌렀던 카드와 제목이 맞게 한다
type FeedSummary = {
  id: string;
  title: string;
  startDate?: string | null;
  endDate?: string | null;
  regions?: readonly unknown[];
};
const feedSummaries = new Map<string, Partial<FeedSummary>>();
function remember<T extends FeedSummary>(list: T[]): T[] {
  for (const f of list) {
    // 값이 없는 칸은 넣지 않아 예시 피드 값이 그대로 남게 한다
    const known: Partial<FeedSummary> = { title: f.title };
    if (f.startDate) known.startDate = f.startDate;
    if (f.endDate) known.endDate = f.endDate;
    if (f.regions && f.regions.length > 0) known.regions = f.regions;
    feedSummaries.set(f.id, known);
  }
  return list;
}

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

/** 홈 추천 장소·S07 예시 피드·N3 대표 장소에 나오는 예시 장소. N7 장소 정보와 S08 개인 저장이 쓴다 */
const EXAMPLE_PLACES: Record<string, [string, string]> = {
  'rec-2': ['명주동 골목 카페', '강원 강릉시 명주동'],
  'rec-4': ['안목 바다뷰 카페', '강원 강릉시 견소동'],
  p1: ['강문 해변', '강원 강릉시 강문동'],
  p2: ['안목 바다뷰 카페', '강원 강릉시 견소동'],
  p3: ['초당 순두부집', '강원 강릉시 초당동'],
  p4: ['경포호 산책길', '강원 강릉시 저동'],
  p5: ['주문진 어시장', '강원 강릉시 주문진읍'],
};

/** S10 개인 즐겨찾기 예시(값 문서 S10 "예시 데이터"). 강문 해변·명주동은 공동 피드에서 담은 것 */
const BOOKMARKS = [
  ['광안리 바다뷰 카페', '부산광역시 수영구 광안해변로 219', 35.1532, 129.1186, null],
  ['강문 해변', '강원특별자치도 강릉시 강문동 산1', 37.7953, 128.9184, 'feed-dev-1'],
  ['전포 카페거리', '부산광역시 부산진구 전포대로 209', 35.1557, 129.0636, null],
  ['흰여울문화마을', '부산광역시 영도구 영선동4가 1044', 35.0784, 129.0447, null],
  ['명주동 골목 카페', '강원특별자치도 강릉시 명주동 15', 37.7537, 128.8957, 'feed-dev-2'],
] as const;
/** 명세 Bookmark 모양. 기능 폴더(features/saved) 타입을 api 쪽에서 불러오지 않으려고 여기 둔다 */
type MockBookmark = {
  place: {
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
  retainedPlace: { name: string; latitude: number; longitude: number };
  memo: string | null;
  sourceFeedId: string | null;
  sourceUnavailable: boolean;
  createdAt: string;
};
let bookmarks: MockBookmark[] = BOOKMARKS.map(
  ([name, address, latitude, longitude, sourceFeedId], i) => ({
    place: {
      id: `place-bookmark-${i + 1}`,
      name,
      address,
      latitude,
      longitude,
      regionId: null,
      provider: 'NAVER',
      providerPlaceId: null,
      source: 'PROVIDER' as const,
    },
    retainedPlace: { name, latitude, longitude },
    memo: null,
    sourceFeedId,
    sourceUnavailable: false,
    createdAt: new Date(Date.UTC(2026, 10, 5 - i)).toISOString(),
  }),
);

let seq = 0;

/** 테스트 모드 추출 작업. 결과는 링크 글자로 정한다 */
type MockExtraction = {
  startedAt: number;
  /** STUCK은 끝나지 않고 진행 중에 머문다(S12 시간 초과 확인용) */
  outcome: 'SUCCESS' | 'MULTIPLE_CANDIDATES' | 'NOT_FOUND' | 'FAILED' | 'STUCK';
};
const extractions = new Map<string, MockExtraction>();
/** 추출 요청 Idempotency-Key → 처음 만든 작업 id와 본문 */
const extractionByKey = new Map<string, { id: string; body: string }>();
const EXTRACTION_MS = 4500;

/** 즐겨찾기 예시 장소를 추출 후보 장소로 쓴다(저장하면 개인 즐겨찾기 PUT이 그대로 받는다) */
function bookmarkPlace(index: number) {
  const [name, address, latitude, longitude] = BOOKMARKS[index];
  return {
    id: `place-bookmark-${index + 1}`,
    name,
    address,
    latitude,
    longitude,
    regionId: null,
    provider: 'NAVER',
    providerPlaceId: null,
    source: 'PROVIDER' as const,
  };
}

function extractionResult(id: string, job: MockExtraction) {
  const elapsed = Date.now() - job.startedAt;
  const done = job.outcome !== 'STUCK' && elapsed >= EXTRACTION_MS;
  const failed = done && job.outcome === 'FAILED';
  const candidates = !done
    ? []
    : job.outcome === 'SUCCESS'
      ? [
          { index: 0, evidence: '게시물 글에서 찾았어요' },
          { index: 2, evidence: '캡처 속 간판에서 찾았어요' },
        ].map(({ index, evidence }, i) => ({
          candidateId: `${id}-c${i + 1}`,
          name: BOOKMARKS[index][0],
          place: bookmarkPlace(index),
          evidence,
          confidence: 0.9,
        }))
      : job.outcome === 'MULTIPLE_CANDIDATES'
        ? // AI 서버처럼 언급(name)마다 후보를 이어 붙인다: 한 곳으로 정해진 가게 + 지점이 둘인 카페
          // (지점 이름은 place.name) + 지도에서 못 찾은 빵집(place: null)
          [
            {
              name: BOOKMARKS[3][0],
              place: bookmarkPlace(3),
              evidence: '캡처 속 간판에서 찾았어요',
              confidence: 1,
            },
            ...(['광안점', '전포점'] as const).map((branch, i) => ({
              name: '바다 앞 카페',
              place: { ...bookmarkPlace([0, 2][i]), name: `바다 앞 카페 ${branch}` },
              evidence: '게시물 글에서 찾았어요',
              confidence: 0.8,
            })),
            {
              name: '골목 빵집',
              place: null,
              evidence: '게시물 글에서 찾았어요',
              confidence: null,
            },
          ].map((c, i) => ({ candidateId: `${id}-c${i + 1}`, ...c }))
        : [];
  return {
    job: {
      id,
      kind: 'PLACE_EXTRACTION',
      status: !done ? (elapsed < 600 ? 'QUEUED' : 'RUNNING') : failed ? 'FAILED' : 'SUCCEEDED',
      progress: done ? 100 : Math.min(Math.floor((elapsed / EXTRACTION_MS) * 100), 99),
      result: null,
      error: failed ? { code: 'SOURCE_UNREACHABLE', message: '링크를 열지 못했어요.' } : null,
      createdAt: new Date(job.startedAt).toISOString(),
      finishedAt: done ? new Date(job.startedAt + EXTRACTION_MS).toISOString() : null,
    },
    resultStatus: !done ? null : job.outcome,
    candidates,
  };
}

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

{
  const posted = trips.find((t) => t.title === '남도 맛집 여행');
  if (posted) {
    publishMockFeed(posted, {
      title: '봄 경주',
      body: '',
      regions: [{ id: 'region-gyeongju', code: '4713000000', name: '경상북도 경주시' }],
    });
  }
}

/** 이 여행에서 지금 쓸 수 있는 초대 링크의 토큰. 새로 만들거나 취소하면 바뀐다 */
const inviteTokens = new Map<string, string>();

const INVITE_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function bump(trip: Trip) {
  trip.version += 1;
}

/** 채팅 가짜 서버. 여행 목록(trips)에 없는 여행의 방은 404다 */
const chatMock = createChatMock({ getTrips: () => trips, me: ME, ok, fail });
/** 코스 가짜 서버. 자동 추천·다시 계산·그룹 즐겨찾기 조회도 답한다 */
const courseMock = createCourseMock({
  getTrips: () => trips,
  meId: ME.id,
  ok,
  fail,
  // 날씨 변경안은 날씨 대안 가짜 서버가 아는 대안으로 만든다. 부를 때 찾아 정의 순서와 상관없다
  alternativeOf: (id) => weatherMock.alternativeOf(id),
});
/** 여행 중 날씨와 날씨 대안 가짜 서버. 앱용 날씨 API가 없다(Q-10-1) */
const weatherMock = createWeatherMock({
  getTrips: () => trips,
  itemOf: (tripId, placeId) => courseMock.itemOf(tripId, placeId),
  ok,
  fail,
});
/** 준비물 가짜 서버. 추천 설정이 OFF면 제안을 막는다 */
const checklistMock = createChecklistMock({
  getTrips: () => trips,
  me: ME,
  getAiChecklistMode: () => settings.ai.checklist,
  ok,
  fail,
});
/** 추천 결과 가짜 서버. 백엔드에 추천 API가 없다(Q-9-1) */
const recommendMock = createRecommendMock({ getTrips: () => trips, ok, fail });
/** 그룹 즐겨찾기 가짜 서버. 담는 장소는 개인 즐겨찾기나 추천 결과에서 찾는다 */
const groupMock = createGroupMock({
  getTrips: () => trips,
  meId: ME.id,
  findPlace: (id) => bookmarks.find((b) => b.place.id === id)?.place ?? recommendMock.findPlace(id),
  ok,
  fail,
});

/** 알림 가짜 서버. 홈 종 숫자(notification-summary)도 여기서 센다 */
const notificationMock = createNotificationMock({ ok, fail });
/** 투표 가짜 서버. 장소 조회와 그룹 즐겨찾기 목록도 함께 답한다 */
const pollMock = createPollMock({ getTrips: () => trips, ok, fail });

/**
 * 웹 테스트 모드 콘솔에서 다른 동행의 변경을 흉내 낸다(동행 명세 research R15).
 * globalThis.__devMock.bumpVersion('trip-1') → 다음 저장·나가기가 409를 받는다
 * globalThis.__devMock.giveOwner('trip-1', 'member-1-2') → 내가 방장이 아니게 된다(403 확인)
 */
export const devMockControls = {
  /** 채팅: globalThis.__devMock.chat.incoming('trip-1', '안녕') 등(contracts/realtime.md "테스트 모드") */
  chat: chatMock.controls,
  /** 코스: globalThis.__devMock.course.editByOther('trip-1'), failNextProposal() 등(코스 quickstart) */
  course: courseMock.controls,
  /** 날씨: globalThis.__devMock.weather.failNext(), noAlternativesNext() */
  weather: weatherMock.controls,
  /** 알림: globalThis.__devMock.notification.push('POLL_OPENED'), failNext() */
  notification: notificationMock.controls,
  /** 준비물: globalThis.__devMock.checklist.editByOther('trip-1'), failNextSuggestion() 등(준비물 quickstart) */
  checklist: checklistMock.controls,
  /** 투표: globalThis.__devMock.poll.addCandidateByOther(), closeNow('tie') 등(투표 quickstart) */
  poll: pollMock.controls,
  /** 그룹 즐겨찾기: globalThis.__devMock.group.saveByOther('trip-1'), reset() */
  group: groupMock.controls,
  /** 추천: globalThis.__devMock.recommend.failNext(), insufficientNext() */
  recommend: recommendMock.controls,
  /**
   * 다른 기기에서 내가 내보내졌거나 여행이 삭제된 것을 흉내 낸다. 그 여행과 대화방이 모두 404가 된다.
   * globalThis.__devMock.kickMe('trip-1') 뒤 S47에서 보내기·새로고침을 하면 차단 화면이 나온다(채팅 quickstart 4-1)
   */
  kickMe(tripId: string) {
    trips = trips.filter((t) => t.id !== tripId);
  },
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

/** 요청 본문(문자열이면 JSON으로 읽는다) */
function parseBody<T>(config: InternalAxiosRequestConfig): T {
  return (typeof config.data === 'string' ? JSON.parse(config.data) : (config.data ?? {})) as T;
}

function fail(config: InternalAxiosRequestConfig, status: number, code: string, message: string) {
  const response = ok(
    config,
    { error: { code, message, fields: [], traceId: 'dev-mock' } },
    status,
  );
  return new AxiosError(message, 'ERR_BAD_REQUEST', config, null, response);
}

// GET·PATCH /me/settings. 첫 값은 서버 기본값(AI 네 개 CONFIRM, 날씨 SUGGEST_ONLY, 알림 셋 켜짐)과 같다
let settings = {
  version: 1,
  ai: {
    photoClassification: 'CONFIRM',
    visitDetection: 'CONFIRM',
    placeExtraction: 'CONFIRM',
    checklist: 'CONFIRM',
    weather: 'SUGGEST_ONLY',
  },
  notifications: { followRequests: true, voteCourse: true, tripChanges: true },
};

function patchSettings(config: InternalAxiosRequestConfig) {
  const body = JSON.parse(String(config.data ?? '{}')) as {
    expectedVersion?: number;
    ai?: Partial<typeof settings.ai>;
    notifications?: Partial<typeof settings.notifications>;
  };
  if (body.expectedVersion !== settings.version) {
    throw fail(config, 409, 'VERSION_CONFLICT', '설정이 변경되었습니다. 다시 조회해 주세요.');
  }
  const next = {
    version: settings.version,
    ai: { ...settings.ai, ...body.ai },
    notifications: { ...settings.notifications, ...body.notifications },
  };
  const changed = JSON.stringify(next) !== JSON.stringify(settings);
  settings = { ...next, version: changed ? settings.version + 1 : settings.version };
  return settings;
}

function page<T>(data: T[]) {
  return { data, page: { nextCursor: null, hasNext: false } };
}

// S30 사진 업로드(백엔드 assets·photos). 바이트는 보내지 않는다(putPhoto가 테스트 모드면 건너뜀).
// 사진 응답은 복사본으로 돌려준다(저장한 객체를 그대로 주면 고친 뒤에도 같은 객체라 화면이 바뀐 줄 모른다)
// 완료 확인 5번에 1번은 실패해서 일부 실패 화면과 [다시 시도]를 볼 수 있다
const photoBatches = new Map<string, { id: string; tripId: string; fileCount: number }>();
const photoBatchByKey = new Map<string, string>();
const assets = new Map<
  string,
  { status: 'PENDING' | 'READY' | 'DELETED'; batchId: string | null; purpose: string }
>();
type MockPhoto = {
  id: string;
  assetId: string;
  tripId: string;
  batchId: string | null;
  uploaderMemberId: string;
  placeId: string | null;
  capturedAt: string | null;
  topics: string[];
  groupId: null;
  version: number;
};
let photoSeq = 0;
let completeCalls = 0;

// S31 확인용: 첫 여행(부산 바다 여행)의 코스 장소 3곳과 사진 10장(장소 미지정 3장, 그중 1장은 동행 것)
const PHOTO_COURSE = [
  {
    id: 'it-1',
    place: { id: 'place-haeundae', name: '해운대 해변' },
    day: 1,
    order: 1,
    startTime: null,
  },
  {
    id: 'it-2',
    place: { id: 'place-seomyeon', name: '서면 돼지국밥집' },
    day: 1,
    order: 2,
    startTime: null,
  },
  {
    id: 'it-3',
    place: { id: 'place-gamcheon', name: '감천문화마을' },
    day: 2,
    order: 1,
    startTime: null,
  },
];
const tripPhotos: MockPhoto[] = (
  [
    ['member-1-1', 'place-haeundae', ['LANDSCAPE']],
    ['member-1-1', 'place-haeundae', ['LANDSCAPE', 'PEOPLE']],
    ['member-1-2', 'place-haeundae', ['PEOPLE']],
    ['member-1-3', 'place-seomyeon', ['FOOD']],
    ['member-1-1', 'place-seomyeon', ['FOOD']],
    ['member-1-2', 'place-gamcheon', ['LANDSCAPE']],
    ['member-1-1', 'place-gamcheon', ['OTHER']],
    ['member-1-1', null, []],
    ['member-1-1', null, ['FOOD']],
    ['member-1-2', null, []],
  ] as const
).map(([uploaderMemberId, placeId, topics], i) => ({
  id: `photo-seed-${i + 1}`,
  assetId: `asset-seed-${i + 1}`,
  tripId: 'trip-1',
  batchId: null,
  uploaderMemberId,
  placeId,
  capturedAt: null,
  topics: [...topics],
  groupId: null,
  version: 1,
}));

function handlePhotos(
  config: InternalAxiosRequestConfig,
  method: string,
  url: string,
): AxiosResponse | null {
  const body = (
    typeof config.data === 'string' ? JSON.parse(config.data || '{}') : (config.data ?? {})
  ) as Record<string, unknown>;
  const batchMatch = /^\/trips\/([^/]+)\/photo-upload-batches$/.exec(url);
  if (method === 'post' && batchMatch) {
    const fileCount = Number(body.fileCount);
    if (!(fileCount >= 1)) throw fail(config, 400, 'VALIDATION_ERROR', '파일 수를 확인해 주세요.');
    if (fileCount > 50) throw fail(config, 422, 'INPUT_LIMIT_EXCEEDED', '50장까지 올릴 수 있어요.');
    const key = String(config.headers['Idempotency-Key'] ?? '');
    const existing = key ? photoBatchByKey.get(key) : undefined;
    const id = existing ?? `photo-batch-${(photoSeq += 1)}`;
    if (!existing) {
      photoBatches.set(id, { id, tripId: batchMatch[1], fileCount });
      if (key) photoBatchByKey.set(key, id);
    }
    const batch = photoBatches.get(id)!;
    const registeredCount = tripPhotos.filter((p) => p.batchId === id).length;
    return ok(
      config,
      { data: { ...batch, registeredCount, createdAt: new Date().toISOString() } },
      201,
    );
  }
  if (method === 'post' && url === '/assets/upload-intents') {
    const assetId = `asset-${(photoSeq += 1)}`;
    assets.set(assetId, {
      status: 'PENDING',
      batchId: (body.batchId as string) ?? null,
      purpose: String(body.purpose ?? 'TRIP_PHOTO'),
    });
    return ok(
      config,
      {
        data: {
          assetId,
          uploadUrl: `https://dev-mock.invalid/uploads/${assetId}`,
          method: 'PUT',
          headers: { 'content-type': String(body.contentType ?? 'image/jpeg') },
          expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
        },
      },
      201,
    );
  }
  const assetMatch = /^\/assets\/([^/]+)(\/complete)?$/.exec(url);
  if (assetMatch && ((method === 'post' && assetMatch[2]) || method === 'delete')) {
    const asset = assets.get(assetMatch[1]);
    if (!asset) throw fail(config, 404, 'ASSET_NOT_FOUND', '파일을 찾을 수 없습니다.');
    if (asset.status !== 'PENDING') {
      throw fail(config, 409, 'ASSET_NOT_PENDING', '이미 업로드를 마쳤거나 취소한 파일입니다.');
    }
    if (method === 'delete') {
      asset.status = 'DELETED';
      return ok(config, null, 204);
    }
    // 일부 실패는 S30 사진 올리기에서만 본다. S11 캡처는 늘 성공
    if (asset.purpose === 'TRIP_PHOTO') completeCalls += 1;
    if (asset.purpose === 'TRIP_PHOTO' && completeCalls % 5 === 3) {
      throw fail(config, 422, 'UPLOAD_MISMATCH', '올린 파일이 요청한 크기나 형식과 다릅니다.');
    }
    asset.status = 'READY';
    return ok(config, { data: { id: assetMatch[1], status: 'READY' } });
  }
  const photosMatch = /^\/trips\/([^/]+)\/photos$/.exec(url);
  if (method === 'post' && photosMatch) {
    const assetId = String(body.assetId);
    const batchId = String(body.batchId);
    if (assets.get(assetId)?.status !== 'READY') {
      throw fail(config, 409, 'ASSET_NOT_READY', '업로드를 마치지 않은 파일입니다.');
    }
    const tripId = photosMatch[1];
    const myMember = trips
      .find((t) => t.id === tripId)
      ?.members.find((m) => m.user.id === ME.id)?.id;
    const found =
      tripPhotos.find((p) => p.assetId === assetId) ??
      (() => {
        const photo: MockPhoto = {
          id: `photo-${(photoSeq += 1)}`,
          assetId,
          tripId,
          batchId,
          uploaderMemberId: myMember ?? 'member-me',
          placeId: null,
          capturedAt: (body.capturedAt as string) ?? null,
          topics: [],
          groupId: null,
          version: 1,
        };
        tripPhotos.unshift(photo);
        return photo;
      })();
    return ok(config, { data: { ...found, topics: [...found.topics] } }, 201);
  }
  if (method === 'get' && photosMatch) {
    return ok(
      config,
      page(
        tripPhotos
          .filter((p) => p.tripId === photosMatch[1])
          .map((p) => ({ ...p, topics: [...p.topics] })),
      ),
    );
  }
  const summaryMatch = /^\/trips\/([^/]+)\/photo-summary$/.exec(url);
  if (method === 'get' && summaryMatch) {
    const list = tripPhotos.filter((p) => p.tripId === summaryMatch[1]);
    const count = (pick: (p: MockPhoto) => string[]) => {
      const m = new Map<string, number>();
      list.forEach((p) => pick(p).forEach((k) => m.set(k, (m.get(k) ?? 0) + 1)));
      return [...m.entries()];
    };
    return ok(config, {
      data: {
        totalCount: list.length,
        unplacedCount: list.filter((p) => !p.placeId).length,
        topics: count((p) => p.topics).map(([topic, n]) => ({ topic, count: n })),
        places: count((p) => (p.placeId ? [p.placeId] : [])).map(([placeId, n]) => ({
          placeId,
          count: n,
        })),
        groups: [],
      },
    });
  }
  // S31 여러 장 장소 연결. 테스트 모드는 UPDATE만 받는다. 한 장이라도 안 맞으면 아무것도 바꾸지 않는다
  const editBatchMatch = /^\/trips\/([^/]+)\/photos\/batch$/.exec(url);
  if (method === 'post' && editBatchMatch) {
    const targets = (body.photos ?? []) as { photoId: string; expectedVersion: number }[];
    if (body.action !== 'UPDATE' || targets.length === 0 || targets.length > 50) {
      throw fail(config, 400, 'VALIDATION_ERROR', '요청 값을 확인해 주세요.');
    }
    const found = targets.map((t) => ({
      t,
      photo: tripPhotos.find((p) => p.id === t.photoId && p.tripId === editBatchMatch[1]),
    }));
    if (found.some((f) => !f.photo)) {
      throw fail(config, 404, 'PHOTO_NOT_FOUND', '사진을 찾을 수 없습니다.');
    }
    if (found.some((f) => f.photo?.version !== f.t.expectedVersion)) {
      throw fail(config, 409, 'VERSION_CONFLICT', '다른 곳에서 바뀌었어요');
    }
    const changed = found.map(({ photo }) => {
      const p = photo as (typeof tripPhotos)[number];
      if ('placeId' in body) p.placeId = (body.placeId as string | null) ?? null;
      if (Array.isArray(body.topics)) p.topics = body.topics as string[];
      p.version += 1;
      return { ...p, topics: [...p.topics] };
    });
    return ok(config, { data: { photos: changed, deletedPhotoIds: [] } });
  }
  const photoMatch = /^\/trips\/([^/]+)\/photos\/([^/]+)$/.exec(url);
  if (method === 'delete' && photoMatch) {
    const i = tripPhotos.findIndex((p) => p.id === photoMatch[2] && p.tripId === photoMatch[1]);
    if (i === -1) throw fail(config, 404, 'PHOTO_NOT_FOUND', '사진을 찾을 수 없습니다.');
    tripPhotos.splice(i, 1);
    const jobId = `photo-delete-${(photoSeq += 1)}`;
    return ok(
      config,
      { data: { jobId, status: 'QUEUED', statusUrl: `/api/v1/jobs/${jobId}` } },
      202,
    );
  }
  if (method === 'patch' && photoMatch) {
    const photo = tripPhotos.find((p) => p.id === photoMatch[2] && p.tripId === photoMatch[1]);
    if (!photo) throw fail(config, 404, 'PHOTO_NOT_FOUND', '사진을 찾을 수 없습니다.');
    if (body.expectedVersion !== photo.version) {
      throw fail(config, 409, 'VERSION_CONFLICT', '다른 곳에서 바뀌었어요');
    }
    if ('placeId' in body) photo.placeId = (body.placeId as string | null) ?? null;
    if (Array.isArray(body.topics)) photo.topics = body.topics as string[];
    photo.version += 1;
    return ok(config, { data: { ...photo, topics: [...photo.topics] } });
  }
  // S31 코스 장소. 첫 여행만 코스가 있고 나머지는 빈 코스
  const itineraryMatch = /^\/trips\/([^/]+)\/itinerary$/.exec(url);
  if (method === 'get' && itineraryMatch) {
    return ok(config, {
      data: { version: 1, items: itineraryMatch[1] === 'trip-1' ? PHOTO_COURSE : [] },
    });
  }
  return null;
}

function handle(config: InternalAxiosRequestConfig): AxiosResponse {
  const method = (config.method ?? 'get').toLowerCase();
  const url = config.url ?? '';
  const params = (config.params ?? {}) as Record<string, string>;

  const chat = chatMock.handle(config, method, url, params);
  if (chat) return chat;
  // 그룹 즐겨찾기 GET /trips/{id}/saved-places는 그룹 가짜 서버가 먼저 답한다. 다른 가짜 서버의 같은 주소 처리보다 앞선다
  const group = groupMock.handle(config, method, url, params);
  if (group) return group;
  const course = courseMock.handle(config, method, url);
  if (course) return course;
  // 코스 가짜 서버가 모르는 작업(/jobs)은 날씨 쪽으로 넘어온다
  const weatherRes = weatherMock.handle(config, method, url, params);
  if (weatherRes) return weatherRes;
  const notification = notificationMock.handle(config, method, url, params);
  if (notification) return notification;
  const checklist = checklistMock.handle(config, method, url);
  if (checklist) return checklist;
  const poll = pollMock.handle(config, method, url);
  if (poll) return poll;

  const recommend = recommendMock.handle(config, method, url);
  if (recommend) return recommend;
  const photo = handlePhotos(config, method, url);
  if (photo) return photo;

  // S41 타임라인·S42 여행 요약(서버에 아직 없는 API, 명세 모양). 게시한 여행은 /me/feeds와 같은 "남도 맛집 여행"
  if (method === 'get' && url === '/me/timeline') {
    const posted = trips.find((t) => t.title === '남도 맛집 여행')?.id ?? null;
    return ok(config, page(mockMyTimeline(trips, posted)));
  }
  const timelineMatch = /^\/trips\/([^/]+)\/(timeline|summary)$/.exec(url);
  if (method === 'get' && timelineMatch) {
    const trip = trips.find((t) => t.id === timelineMatch[1]);
    if (!trip) throw fail(config, 404, 'TRIP_NOT_FOUND', '여행을 찾을 수 없습니다.');
    if (timelineMatch[2] === 'timeline') {
      return ok(config, { data: { items: mockTripTimeline(trip) } });
    }
    const photoCount = tripPhotos.filter((p) => p.tripId === trip.id).length;
    return ok(config, { data: mockTripSummary(trip, photoCount) });
  }

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
  // S44 추천 친구·숨기기
  if (method === 'get' && url === '/me/follow-suggestions') {
    const reasons = [
      { kind: 'CO_TRAVELER', count: 2 },
      { kind: 'CO_TRAVELER', count: 1 },
      { kind: 'FOLLOWS_YOU' },
    ];
    return ok(
      config,
      page(
        PEOPLE.map((p, i) => ({ user: followCard(p), reason: reasons[i] })).filter(
          (x) => !hiddenSuggestions.includes(x.user.id),
        ),
      ),
    );
  }
  const hideMatch = /^\/me\/follow-suggestion-dismissals\/([^/]+)$/.exec(url);
  if (method === 'put' && hideMatch) {
    hiddenSuggestions = [...hiddenSuggestions, decodeURIComponent(hideMatch[1])];
    return ok(config, undefined, 204);
  }
  // S44 닉네임 검색
  if (method === 'get' && url === '/users') {
    const q = String((config.params as { query?: string } | undefined)?.query ?? '').trim();
    const all = [...PEOPLE, ...FOLLOW_PEOPLE, ...FRIENDS];
    return ok(config, page(q ? all.filter((p) => p.nickname.includes(q)).map(followCard) : []));
  }
  // N9 다른 사용자 프로필·공동 피드
  const userMatch = /^\/users\/([^/]+)(\/feeds)?$/.exec(url);
  if (method === 'get' && userMatch) {
    const id = decodeURIComponent(userMatch[1]);
    const found = [...PEOPLE, ...FOLLOW_PEOPLE, ...FRIENDS].find((p) => p.id === id);
    if (!found) throw fail(config, 404, 'USER_NOT_FOUND', '사용자를 찾을 수 없어요');
    const card = followCard(found);
    if (!userMatch[2]) return ok(config, { data: { ...found, ...card } });
    if (card.accountVisibility === 'PRIVATE' && card.followingStatus !== 'ACCEPTED') {
      throw fail(config, 403, 'FORBIDDEN', '비공개 계정이에요');
    }
    const feed = (fid: string, title: string, code: string) => ({
      id: `${id}-${fid}`,
      tripId: `trip-${id}-${fid}`,
      title,
      regions: [{ id: `r-${code}`, code, name: title }],
    });
    return ok(
      config,
      page(
        remember([
          feed('1', '봄 경주', '4713000000'),
          feed('2', '추석 전주', '5211000000'),
          feed('3', '겨울 여행', '2635000000'),
        ]),
      ),
    );
  }
  // 팔로우: 공개 계정이면 ACCEPTED, 비공개면 REQUESTED
  const followMatch = /^\/users\/([^/]+)\/follow$/.exec(url);
  if (method === 'post' && followMatch) {
    const id = decodeURIComponent(followMatch[1]);
    const target = [...PEOPLE, ...FOLLOW_PEOPLE, ...FRIENDS].find((p) => p.id === id);
    if (!target) throw fail(config, 404, 'USER_NOT_FOUND', '사용자를 찾을 수 없어요');
    const existing = follows.find((x) => x.follower.id === ME.id && x.followee.id === id);
    if (existing) return ok(config, { data: followResponse(existing) });
    const created = follow(
      `follow-${id}`,
      FOLLOW_ME,
      target,
      target.accountVisibility === 'PRIVATE' ? 'REQUESTED' : 'ACCEPTED',
    );
    follows = [...follows, created];
    return ok(config, { data: followResponse(created) });
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
    const body = JSON.parse(String(config.data ?? '{}')) as {
      nickname?: string;
      ageBand?: string | null;
      accountVisibility?: MyProfile['accountVisibility'];
      profileImageAssetId?: string | null;
    };
    if (body.nickname) {
      ME.nickname = body.nickname;
      ME.profileCompleted = true;
    }
    if ('ageBand' in body) ME.ageBand = body.ageBand ?? null;
    if (body.accountVisibility) ME.accountVisibility = body.accountVisibility;
    if ('profileImageAssetId' in body) {
      ME.profileImageUrl = body.profileImageAssetId
        ? `/assets/${body.profileImageAssetId}/download`
        : null;
    }
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
  if (method === 'get' && url === '/me/settings') return ok(config, { data: settings });
  if (method === 'patch' && url === '/me/settings') {
    return ok(config, { data: patchSettings(config) });
  }
  if (method === 'get' && url === '/me/bookmarks') return ok(config, page(bookmarks));
  const bookmarkMatch = /^\/me\/bookmarks\/([^/]+)$/.exec(url);
  if (bookmarkMatch) {
    const placeId = decodeURIComponent(bookmarkMatch[1]);
    const found = bookmarks.find((b) => b.place.id === placeId);
    const body = (
      typeof config.data === 'string' ? JSON.parse(config.data) : (config.data ?? {})
    ) as {
      memo?: string;
      sourceFeedId?: string;
    };
    if (method === 'patch' && found) {
      found.memo = body.memo ?? null;
      return ok(config, { data: found });
    }
    if (method === 'delete' && found) {
      bookmarks = bookmarks.filter((b) => b !== found);
      return ok(config, undefined, 204);
    }
    // 되돌리기: 지운 예시 장소를 같은 자리 값으로 다시 넣는다
    const index = BOOKMARKS.findIndex((_, i) => `place-bookmark-${i + 1}` === placeId);
    if (method === 'put' && index >= 0) {
      const [name, address, latitude, longitude] = BOOKMARKS[index];
      const restored = {
        place: {
          id: placeId,
          name,
          address,
          latitude,
          longitude,
          regionId: null,
          provider: 'NAVER',
          providerPlaceId: null,
          source: 'PROVIDER' as const,
        },
        retainedPlace: { name, latitude, longitude },
        memo: body.memo ?? null,
        sourceFeedId: body.sourceFeedId ?? null,
        sourceUnavailable: false,
        createdAt: new Date().toISOString(),
      };
      bookmarks = [restored, ...bookmarks.filter((b) => b.place.id !== placeId)];
      return ok(config, { data: restored });
    }
    // S08 나만 보기: S07·N3·N7의 예시 장소는 새로 담는다(이미 있으면 메모만 바꾼다). 그 밖의 장소는 404
    const example = EXAMPLE_PLACES[placeId];
    if (method === 'put' && (found || example)) {
      const saved = found ?? {
        place: {
          id: placeId,
          name: example[0],
          address: example[1],
          latitude: 37.7718,
          longitude: 128.9478,
          regionId: 'region-gangneung',
          provider: 'KTO',
          providerPlaceId: placeId,
          source: 'PROVIDER' as const,
        },
        retainedPlace: { name: example[0], latitude: 37.7718, longitude: 128.9478 },
        memo: null as string | null,
        sourceFeedId: null as string | null,
        sourceUnavailable: false,
        createdAt: new Date().toISOString(),
      };
      saved.memo = body.memo ?? null;
      if (!found) bookmarks = [saved, ...bookmarks];
      return ok(config, { data: saved });
    }
    throw fail(config, 404, 'NOT_FOUND', '저장한 장소를 찾을 수 없어요.');
  }
  // S12 장소 추출(백엔드 미구현, API 명세 §5). 4.5초 동안 진행률이 오르고 끝난다.
  // 링크나 메모에 many·none·fail·stuck이 들어 있으면 복수 후보·식별 불가·처리 실패·끝나지 않음
  // (캡처만 보낼 때는 메모로 고른다)
  // Idempotency-Key 필수. 같은 키 + 같은 본문이면 처음 작업 id, 다른 본문이면 409
  if (method === 'post' && url === '/extractions') {
    const body = parseBody<{ url?: string; captureAssetIds?: string[]; memo?: string }>(config);
    const key = String(config.headers['Idempotency-Key'] ?? '');
    if (!key) throw fail(config, 400, 'VALIDATION_ERROR', 'Idempotency-Key 헤더가 필요해요.');
    const serialized = JSON.stringify(body);
    const previous = extractionByKey.get(key);
    if (previous && previous.body !== serialized) {
      throw fail(config, 409, 'IDEMPOTENCY_KEY_REUSED', '다른 요청에 쓴 키예요.');
    }
    if (previous) {
      return ok(
        config,
        {
          data: { jobId: previous.id, status: 'QUEUED', statusUrl: `/api/v1/jobs/${previous.id}` },
        },
        202,
      );
    }
    if (!body.url && !(body.captureAssetIds?.length ?? 0)) {
      throw fail(config, 400, 'VALIDATION_ERROR', '링크나 캡처를 하나 이상 넣어 주세요.');
    }
    if ((body.captureAssetIds?.length ?? 0) > 10) {
      throw fail(config, 422, 'INPUT_LIMIT_EXCEEDED', '캡처는 10장까지 넣을 수 있어요.');
    }
    if (settings.ai.placeExtraction === 'OFF') {
      throw fail(config, 409, 'AI_FEATURE_DISABLED', '장소 찾기 설정이 꺼져 있어요.');
    }
    seq += 1;
    const id = `extraction-${seq}`;
    const hint = `${body.url ?? ''} ${body.memo ?? ''}`;
    extractions.set(id, {
      startedAt: Date.now(),
      outcome: /stuck/i.test(hint)
        ? 'STUCK'
        : /fail/i.test(hint)
          ? 'FAILED'
          : /none/i.test(hint)
            ? 'NOT_FOUND'
            : /many/i.test(hint)
              ? 'MULTIPLE_CANDIDATES'
              : 'SUCCESS',
    });
    extractionByKey.set(key, { id, body: serialized });
    return ok(
      config,
      { data: { jobId: id, status: 'QUEUED', statusUrl: `/api/v1/jobs/${id}` } },
      202,
    );
  }
  const extractionMatch = /^\/extractions\/([^/]+)$/.exec(url);
  if (extractionMatch) {
    const id = decodeURIComponent(extractionMatch[1]);
    const found = extractions.get(id);
    if (!found) throw fail(config, 404, 'NOT_FOUND', '작업을 찾을 수 없어요.');
    if (method === 'delete') {
      extractions.delete(id);
      return ok(config, undefined, 204);
    }
    if (method === 'get') return ok(config, { data: extractionResult(id, found) });
  }
  // 그룹 즐겨찾기에 추가(S14): 담기만 하고 S20 목록은 아직 흉내 내지 않는다
  if (method === 'put' && /^\/trips\/[^/]+\/saved-places\/[^/]+\/me$/.test(url)) {
    return ok(config, { data: null });
  }
  if (method === 'get' && url === '/me/trips') return ok(config, page(trips));
  // S37·S39·S40 내가 게시한 공동 피드(나간 여행은 빠진다). 최근 게시한 것부터
  if (method === 'get' && url === '/me/feeds') {
    const mine = [...ownFeeds.values()]
      .filter((f) => trips.some((t) => t.id === f.tripId))
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    return ok(config, page(remember(mine.map(copyFeed))));
  }
  // S38 이 여행의 공동 피드. 게시 전이면 null, 게시하면 여행당 하나(이미 있으면 그대로 200)
  // S38이 함께 읽는 코스·방문·지출·정산. 테스트 모드에서는 모두 비어 있다(요약 카드가 "없음"으로 보임)
  const recordPartMatch = /^\/trips\/([^/]+)\/(itinerary|visits|expenses|settlement)$/.exec(url);
  if (method === 'get' && recordPartMatch && trips.some((t) => t.id === recordPartMatch[1])) {
    const part = recordPartMatch[2];
    if (part === 'itinerary') return ok(config, { data: { items: [] } });
    if (part === 'settlement') {
      return ok(config, {
        data: { current: null, currentExpenseVersion: 0, recalculationRequired: false },
      });
    }
    return ok(config, page([]));
  }
  // 동행 목록. 경비 화면이 낸 사람 이름을 보이려고 나간 동행까지(includeInactive) 부른다.
  // 이 응답이 없어 테스트 모드의 경비 화면이 "경비를 불러오지 못했어요"로 열렸다(2026-11-11 여행 메뉴 조사)
  const membersMatch = /^\/trips\/([^/]+)\/members$/.exec(url);
  if (method === 'get' && membersMatch) {
    const trip = trips.find((t) => t.id === membersMatch[1]);
    if (!trip) throw fail(config, 404, 'TRIP_NOT_FOUND', '여행을 찾을 수 없어요');
    const all = String(config.params?.includeInactive) === 'true';
    const members = all ? trip.members : trip.members.filter((m) => m.status === 'ACTIVE');
    return ok(config, { data: { members } });
  }
  const tripFeedMatch = /^\/trips\/([^/]+)\/feed$/.exec(url);
  if (tripFeedMatch) {
    const trip = trips.find((t) => t.id === tripFeedMatch[1]);
    if (!trip) throw fail(config, 404, 'TRIP_NOT_FOUND', '여행을 찾을 수 없어요');
    const found = ownFeeds.get(trip.id);
    const existing = found ? copyFeed(found) : null;
    if (method === 'get') return ok(config, { data: existing });
    if (method === 'post') {
      if (existing) return ok(config, { data: existing });
      // 실패 화면을 보려면 제목에 "fail"을 넣은 여행에서 게시한다
      if (trip.title.includes('fail'))
        throw fail(config, 500, 'INTERNAL_ERROR', '게시하지 못했어요');
      const body = JSON.parse(String(config.data ?? '{}')) as { title?: string; body?: string };
      return ok(
        config,
        {
          data: copyFeed(
            publishMockFeed(trip, { title: body.title ?? trip.title, body: body.body ?? '' }),
          ),
        },
        201,
      );
    }
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
  const visibilityMatch = /^\/feeds\/([^/]+)\/visibility\/me$/.exec(url);
  if (method === 'put' && visibilityMatch) {
    const body = JSON.parse(String(config.data ?? '{}')) as {
      hiddenViewerUserIds: string[];
      expectedVersion: number;
    };
    const feed = [...ownFeeds.values()].find((f) => f.id === visibilityMatch[1]);
    if (!feed) throw fail(config, 404, 'FEED_NOT_FOUND', '공동 피드를 찾을 수 없어요');
    if (body.expectedVersion !== feed.visibility.version) {
      throw fail(config, 409, 'VERSION_CONFLICT', '다른 곳에서 바뀌었어요');
    }
    feed.visibility = {
      feedId: feed.id,
      hiddenViewerUserIds: body.hiddenViewerUserIds,
      version: feed.visibility.version + 1,
      updatedAt: new Date().toISOString(),
    };
    return ok(config, { data: { ...feed.visibility } });
  }
  // S38 공동 피드 삭제(S39 삭제 확인). 버전이 다르면 409, 이미 지웠으면 404
  const deleteFeedMatch = /^\/feeds\/([^/]+)$/.exec(url);
  if (method === 'delete' && deleteFeedMatch) {
    const feed = [...ownFeeds.values()].find((f) => f.id === deleteFeedMatch[1]);
    if (!feed) throw fail(config, 404, 'FEED_NOT_FOUND', '공동 피드를 찾을 수 없어요');
    if (Number(config.params?.expectedVersion) !== feed.version) {
      throw fail(config, 409, 'VERSION_CONFLICT', '다른 곳에서 바뀌었어요');
    }
    ownFeeds.delete(feed.tripId);
    return ok(config, undefined, 204);
  }
  // S39 기록까지 삭제. 피드를 내리고 정리 작업을 접수한다(테스트 모드는 피드만 내림). 피드가 없으면 404
  const ownRecordsMatch = /^\/feeds\/([^/]+)\/delete-own-records$/.exec(url);
  if (method === 'post' && ownRecordsMatch) {
    const feed = [...ownFeeds.values()].find((f) => f.id === ownRecordsMatch[1]);
    if (!feed) throw fail(config, 404, 'FEED_NOT_FOUND', '공동 피드를 찾을 수 없어요');
    const { expectedVersion } = parseBody<{ expectedVersion?: number }>(config);
    if (expectedVersion !== feed.version) {
      throw fail(config, 409, 'VERSION_CONFLICT', '다른 곳에서 바뀌었어요');
    }
    ownFeeds.delete(feed.tripId);
    const jobId = `job-own-records-${feed.id}`;
    return ok(
      config,
      { data: { jobId, status: 'QUEUED', statusUrl: `/api/v1/jobs/${jobId}` } },
      202,
    );
  }
  // S09 최근 트렌드 여행지: 예시 지역 다섯 곳
  if (method === 'get' && url === '/trends/regions') {
    const p = (config.params ?? {}) as { from?: string; to?: string };
    const row = (
      rank: number,
      id: string,
      trips: number,
      friends: number,
      move: { isNew?: boolean; change?: number },
    ) => {
      const region = REGIONS.find((r) => r.id === id) ?? REGIONS[0];
      return {
        region,
        rank,
        previousRank: null,
        rankChange: move.change ?? null,
        isNew: move.isNew ?? false,
        publishedTripCount: trips,
        followingCount: friends,
        from: p.from ?? '',
        to: p.to ?? '',
        sampleSize: 400,
        updatedAt: new Date(new Date().setHours(6, 0, 0, 0)).toISOString(),
        insufficientData: false,
      };
    };
    return ok(
      config,
      page([
        row(1, 'region-gangneung', 128, 3, { change: 2 }),
        row(2, 'region-gyeongju', 104, 2, { change: -1 }),
        row(3, 'region-yeosu', 97, 1, { isNew: true }),
        row(4, 'region-jeju', 88, 2, { change: -2 }),
        row(5, 'region-busan', 71, 0, { change: 0 }),
      ]),
    );
  }
  // S28 주변 편의시설: 전기차 충전소만 세 곳, 다른 유형은 빈 결과
  const facilitiesMatch = /^\/places\/([^/]+)\/facilities$/.exec(url);
  if (method === 'get' && facilitiesMatch) {
    const type = String((config.params as { type?: string } | undefined)?.type ?? '');
    const at = new Date(new Date().setHours(10, 15, 0, 0)).toISOString();
    // 기준 장소(37.7718, 128.9478) 둘레에 흩어 놓는다. 걷는 1분 ≈ 70m, 방향은 시설마다 다르게
    const fac = (
      id: string,
      name: string,
      minutes: number,
      availability: string | null,
      angle = Number(id.replace(/\D/g, '')) * 2.1,
    ) => ({
      providerId: id,
      name,
      type,
      latitude: 37.7718 + ((minutes * 70) / 111_000) * Math.sin(angle),
      longitude: 128.9478 + ((minutes * 70) / 88_000) * Math.cos(angle),
      walkingSeconds: minutes * 60,
      availability,
      queriedAt: at,
    });
    return ok(
      config,
      page(
        type === 'EV_CHARGER'
          ? [
              fac('f1', '안목 공영주차장 충전소', 5, '급속 2대 사용 가능'),
              fac('f2', '견소동 주차빌딩 충전소', 9, null),
              fac('f3', '송정 공영주차장 충전소', 12, null),
            ]
          : [],
      ),
    );
  }
  // S13 장소 검색: 예시 장소·즐겨찾기 예시·부산 몇 곳에서 이름이나 주소에 검색어가 든 곳(공공 장소 검색 흉내)
  if (method === 'get' && url === '/places') {
    const q = String((config.params as { query?: string } | undefined)?.query ?? '').trim();
    const pool = [
      ...Object.entries(EXAMPLE_PLACES).map(([id, [name, address]], i) => ({
        id,
        name,
        address,
        latitude: 37.7718 + i * 0.004,
        longitude: 128.9478 - i * 0.003,
      })),
      ...BOOKMARKS.map(([name, address, latitude, longitude], i) => ({
        id: `place-bookmark-${i + 1}`,
        name,
        address,
        latitude,
        longitude,
      })),
      {
        id: 'sp-1',
        name: '광안리 해수욕장',
        address: '부산광역시 수영구 광안동',
        latitude: 35.1532,
        longitude: 129.1186,
      },
      {
        id: 'sp-2',
        name: '민락수변공원',
        address: '부산광역시 수영구 민락동',
        latitude: 35.1557,
        longitude: 129.1342,
      },
      {
        id: 'sp-3',
        name: '수영 돼지국밥',
        address: '부산광역시 수영구 수영동',
        latitude: 35.1699,
        longitude: 129.1149,
      },
      // 지도에서 고르기 검색 확인용 서울 몇 곳(서울역 이름이 든 곳이 여럿이라 가까운 순·같은 이름 구분을 볼 수 있다)
      {
        id: 'se-1',
        name: '서울역',
        address: '서울특별시 용산구 한강대로 405',
        latitude: 37.5547,
        longitude: 126.9707,
      },
      {
        id: 'se-2',
        name: '서울로7017',
        address: '서울특별시 중구 퇴계로 22',
        latitude: 37.5568,
        longitude: 126.9693,
      },
      {
        id: 'se-3',
        name: '스타벅스 서울역점',
        address: '서울특별시 중구 봉래동2가 122',
        latitude: 37.5559,
        longitude: 126.9723,
      },
      {
        id: 'se-4',
        name: '서울역 돼지국밥',
        address: '서울특별시 용산구 동자동 43',
        latitude: 37.5531,
        longitude: 126.9725,
      },
      {
        id: 'se-5',
        name: '서울시청',
        address: '서울특별시 중구 세종대로 110',
        latitude: 37.5663,
        longitude: 126.9779,
      },
      {
        id: 'se-6',
        name: '남대문시장',
        address: '서울특별시 중구 남대문시장4길 21',
        latitude: 37.5592,
        longitude: 126.9775,
      },
    ];
    const seen = new Set<string>();
    const found = q
      ? pool.filter(
          (p) =>
            (p.name.includes(q) || p.address.includes(q)) &&
            !seen.has(p.name) &&
            Boolean(seen.add(p.name)),
        )
      : [];
    return ok(
      config,
      page(
        found.map((p) => ({
          ...p,
          regionId: null,
          provider: 'KTO',
          providerPlaceId: p.id,
          source: 'PROVIDER',
        })),
      ),
    );
  }
  // S13 지도에서 직접 고른 위치를 장소로(수동 장소)
  if (method === 'post' && url === '/places') {
    const body = JSON.parse(String(config.data ?? '{}')) as {
      name: string;
      latitude: number;
      longitude: number;
      regionId?: string;
    };
    return ok(
      config,
      {
        data: {
          id: `manual-${Date.now()}`,
          name: body.name,
          address: null,
          latitude: body.latitude,
          longitude: body.longitude,
          regionId: body.regionId ?? null,
          provider: null,
          providerPlaceId: null,
          source: 'MANUAL',
        },
      },
      201,
    );
  }
  // N7 장소 정보: 예시 장소(홈 추천 장소, S07 예시 피드 장소). 모르는 ID도 이름만 바꿔 돌려준다
  const placeInfoMatch = /^\/places\/([^/]+)(\/social-summary|\/public-reviews)?$/.exec(url);
  if (method === 'get' && placeInfoMatch && placeInfoMatch[1] !== 'search') {
    const id = decodeURIComponent(placeInfoMatch[1]);
    const [name, address] = EXAMPLE_PLACES[id] ?? ['예시 장소', null];
    const place = {
      id,
      name,
      address,
      latitude: 37.7718,
      longitude: 128.9478,
      regionId: 'region-gangneung',
      provider: 'KTO',
      providerPlaceId: id,
      source: 'PROVIDER',
    };
    if (!placeInfoMatch[2]) return ok(config, { data: place });
    if (placeInfoMatch[2] === '/social-summary') {
      return ok(config, {
        data: {
          place,
          visitorCount: 2,
          visitors: [FRIENDS[0], FRIENDS[1]],
          averageScore: 4.5,
          reviewCount: 2,
          partialErrors: [],
        },
      });
    }
    return ok(
      config,
      page([
        {
          id: `${id}-r1`,
          author: FRIENDS[0],
          score: 5,
          body: '조용히 쉬기 좋아요',
          writtenAt: '2026-10-20T09:00:00Z',
        },
        {
          id: `${id}-r2`,
          author: FRIENDS[1],
          score: 4,
          body: '주말엔 자리가 없어요',
          writtenAt: '2026-10-21T09:00:00Z',
        },
      ]),
    );
  }
  // S06 같은 지역 여행 목록: 홈 지도 지역마다 공동 피드 두 개(카드를 누르면 S07 예시 피드)
  const regionFeedsMatch = /^\/home\/regions\/([^/]+)\/feeds$/.exec(url);
  if (method === 'get' && regionFeedsMatch) {
    const regionId = decodeURIComponent(regionFeedsMatch[1]);
    const card = (n: number, title: string, start: string, end: string) => ({
      id: `${regionId}-feed-${n}`,
      tripId: `${regionId}-trip-${n}`,
      title,
      coverPhotoId: null,
      regions: [],
      startDate: start,
      endDate: end,
      publishedAt: `2026-1${n}-01T09:00:00Z`,
      likedByMe: false,
      likeCount: 3 * n,
    });
    return ok(
      config,
      page(
        remember([
          card(1, '겨울 바다 산책', '2026-01-17', '2026-01-18'),
          card(0, '가을 맛집 투어', '2025-10-03', '2025-10-05'),
        ]),
      ),
    );
  }
  const feedMatch = /^\/feeds\/([^/]+)(\/like)?$/.exec(url);
  if (feedMatch) {
    const [, feedId, like] = feedMatch;
    const cur = feedLikes.get(feedId) ?? { liked: false, count: 12 };
    if (!like && method === 'get') {
      return ok(config, {
        data: {
          ...sampleFeed(feedId),
          ...feedSummaries.get(feedId),
          likedByMe: cur.liked,
          likeCount: cur.count,
        },
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
    const remembered = (item: ReturnType<typeof feed>) => {
      remember([item.feed]);
      return item;
    };
    const place = (id: string, name: string, address: string) => ({
      type: 'PLACE' as const,
      feed: null,
      place: { id, name, address, regionId: null },
      reason: '좋아요한 여행과 비슷해요',
    });
    return ok(
      config,
      page([
        remembered(
          feed(
            'rec-1',
            '제주 동쪽 한 바퀴',
            '5011000000',
            '제주특별자치도 제주시',
            '2026-09-12',
            '2026-09-14',
          ),
        ),
        place('rec-2', '명주동 골목 카페', '강원 강릉시 명주동'),
        remembered(
          feed(
            'rec-3',
            '여수 밤바다',
            '1213000000',
            '전남광주통합특별시 여수시',
            '2026-08-02',
            '2026-08-03',
          ),
        ),
        place('rec-4', '안목 바다뷰 카페', '강원 강릉시 견소동'),
      ]),
    );
  }

  const regionMatch = /^\/regions\/([^/]+)$/.exec(url);
  if (method === 'get' && regionMatch) {
    const region = REGIONS.find((r) => r.id === regionMatch[1]);
    if (!region) throw fail(config, 404, 'REGION_NOT_FOUND', '지역을 찾을 수 없습니다.');
    // N3 여행지 정보: 강릉만 소개·대표 장소 예시가 있다
    const gangneung = region.id === 'region-gangneung';
    const spot = (id: string, name: string, address: string) => ({
      id,
      name,
      address,
      latitude: 37.77,
      longitude: 128.9,
      regionId: region.id,
      provider: 'KTO',
      providerPlaceId: id,
      source: 'PROVIDER',
    });
    return ok(config, {
      data: {
        region,
        introduction: gangneung ? '겨울 바다와 커피 거리' : null,
        representativePlaces: gangneung
          ? [
              spot('p1', '강문 해변', '강원 강릉시 강문동'),
              spot('p2', '안목 바다뷰 카페', '강원 강릉시 견소동'),
              spot('p5', '주문진 어시장', '강원 강릉시 주문진읍'),
            ]
          : [],
        partialErrors: [],
      },
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
