import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';

import type { Trip } from './types';

/**
 * 개발용 테스트 모드의 가짜 투표 서버(specs/20261109-094657-poll-vote/contracts/poll-api.md).
 * 서버처럼 투표 404 → 마감 409 POLL_CLOSED → version 409 VERSION_CONFLICT 순서로 본다.
 * 마감 시각이 지난 진행 중 투표는 조회·쓰기 전에 먼저 마감하고, 지역 투표를 확정하면 여행지 끝에 더한다.
 * 장소 조회 GET /places/{id}와 그룹 즐겨찾기 GET /trips/{id}/saved-places도 여기서 답한다
 */

type Candidate = {
  id: string;
  regionId: string | null;
  placeId: string | null;
  voteCount: number;
  addedAt: string;
};

type MockPoll = {
  id: string;
  tripId: string;
  type: 'REGION' | 'PLACE';
  title: string;
  status: 'OPEN' | 'CLOSED' | 'FINALIZED';
  version: number;
  closesAt: string;
  closedReason: 'DEADLINE' | 'NO_VOTES' | null;
  eligibleMemberCount: number;
  votedMemberCount: number;
  candidates: Candidate[];
  myCandidateIds: string[];
  selectedCandidateIds: string[];
  createdAt: string;
  /** 다른 동행의 표(후보 ID → 표 수)와 투표한 다른 동행 수 */
  otherVotes: Record<string, number>;
  otherVoters: number;
};

type Helpers = {
  getTrips(): Trip[];
  ok<T>(config: InternalAxiosRequestConfig, data: T, status?: number): AxiosResponse<T>;
  fail(config: InternalAxiosRequestConfig, status: number, code: string, message: string): Error;
};

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const MAX_CANDIDATES = 30;

/** 그룹 즐겨찾기 예시 장소. 지역 ID는 dev-mock.ts의 REGIONS와 같다 */
const PLACES = [
  ['place-haeundae', '해운대 해변', '부산 해운대구 우동', 35.1587, 129.1604, 'region-busan'],
  [
    'place-gwangalli',
    '광안리 바다뷰 카페',
    '부산 수영구 광안해변로 219',
    35.1532,
    129.1186,
    'region-busan',
  ],
  ['place-gamcheon', '감천문화마을', '부산 사하구 감내2로 203', 35.0975, 129.0106, 'region-busan'],
  ['place-gangmun', '강문 해변', '강원 강릉시 강문동', 37.7953, 128.9184, 'region-gangneung'],
  [
    'place-myeongju',
    '명주동 골목 카페',
    '강원 강릉시 명주동 15',
    37.7537,
    128.8957,
    'region-gangneung',
  ],
  ['place-odongdo', '오동도', '전남 여수시 수정동', 34.7442, 127.7667, 'region-yeosu'],
  ['place-bulguksa', '불국사', '경북 경주시 진현동 15-1', 35.7898, 129.332, 'region-gyeongju'],
] as const;

const placeView = (p: (typeof PLACES)[number]) => ({
  id: p[0],
  name: p[1],
  address: p[2],
  latitude: p[3],
  longitude: p[4],
  regionId: p[5],
  provider: 'KAKAO',
  providerPlaceId: p[0],
  source: 'PROVIDER',
});

export function createPollMock({ getTrips, ok, fail }: Helpers) {
  let polls: MockPoll[] = [];
  let seq = 0;
  let seeded = false;

  const now = () => Date.now();
  const tripOf = (tripId: string) => getTrips().find((t) => t.id === tripId);
  const activeCount = (trip: Trip) => trip.members.filter((m) => m.status === 'ACTIVE').length;

  /** 제주 여행은 그룹 즐겨찾기가 비어 있다(N8 빈 상태 확인용) */
  const savedOf = (trip: Trip) => (trip.title.includes('제주') ? [] : PLACES);

  function failFields(config: InternalAxiosRequestConfig, field: string, reason: string) {
    const response = ok(
      config,
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: '입력값을 확인해 주세요.',
          fields: [{ field, message: reason }],
          traceId: 'dev-mock',
        },
      },
      400,
    );
    return new AxiosError(reason, 'ERR_BAD_REQUEST', config, null, response);
  }

  function recount(poll: MockPoll) {
    poll.candidates = poll.candidates.map((c) => ({
      ...c,
      voteCount: (poll.otherVotes[c.id] ?? 0) + (poll.myCandidateIds.includes(c.id) ? 1 : 0),
    }));
    poll.votedMemberCount = poll.otherVoters + (poll.myCandidateIds.length > 0 ? 1 : 0);
  }

  function close(poll: MockPoll) {
    recount(poll);
    const max = Math.max(0, ...poll.candidates.map((c) => c.voteCount));
    poll.version += 1;
    if (max === 0) {
      poll.status = 'CLOSED';
      poll.closedReason = 'NO_VOTES';
      poll.selectedCandidateIds = [];
      return;
    }
    poll.status = 'FINALIZED';
    poll.closedReason = 'DEADLINE';
    poll.selectedCandidateIds = poll.candidates.filter((c) => c.voteCount === max).map((c) => c.id);
    const trip = tripOf(poll.tripId);
    if (poll.type === 'REGION' && trip) {
      const added = poll.candidates
        .filter((c) => poll.selectedCandidateIds.includes(c.id) && c.regionId)
        .map((c) => c.regionId as string)
        .filter((id) => !trip.destinationRegionIds.includes(id));
      if (added.length > 0) {
        trip.destinationRegionIds = [...trip.destinationRegionIds, ...added];
        trip.version += 1;
      }
    }
  }

  function closeDue(tripId: string) {
    for (const p of polls) {
      if (p.tripId === tripId && p.status === 'OPEN' && Date.parse(p.closesAt) <= now()) close(p);
    }
  }

  function make(
    trip: Trip,
    type: MockPoll['type'],
    inputs: { regionId?: string; placeId?: string }[],
    closesAt: string,
    title = type === 'REGION' ? '어디로 갈까요?' : '어디에 가 볼까요?',
  ): MockPoll {
    seq += 1;
    const addedAt = new Date(now()).toISOString();
    const poll: MockPoll = {
      id: `poll-${seq}`,
      tripId: trip.id,
      type,
      title,
      status: 'OPEN',
      version: 1,
      closesAt,
      closedReason: null,
      eligibleMemberCount: activeCount(trip),
      votedMemberCount: 0,
      candidates: inputs.map((input, i) => ({
        id: `cand-${seq}-${i + 1}`,
        regionId: input.regionId ?? null,
        placeId: input.placeId ?? null,
        voteCount: 0,
        addedAt,
      })),
      myCandidateIds: [],
      selectedCandidateIds: [],
      createdAt: addedAt,
      otherVotes: {},
      otherVoters: 0,
    };
    polls = [poll, ...polls];
    return poll;
  }

  /** 첫 여행(부산 바다 여행)에 진행 중인 지역 투표 하나: 부산 1표(내 선택)·강릉 1표·여수 0표 */
  function seed() {
    if (seeded) return;
    seeded = true;
    const trip = getTrips()[0];
    if (!trip) return;
    const poll = make(
      trip,
      'REGION',
      [
        { regionId: 'region-busan' },
        { regionId: 'region-gangneung' },
        { regionId: 'region-yeosu' },
      ],
      new Date(now() + 2 * DAY + HOUR).toISOString(),
    );
    poll.myCandidateIds = [poll.candidates[0].id];
    poll.otherVotes = { [poll.candidates[1].id]: 1 };
    poll.otherVoters = 1;
    recount(poll);
  }

  const view = (p: MockPoll) => {
    const { createdAt: _c, otherVotes: _o, otherVoters: _v, ...rest } = p;
    return rest;
  };

  function handle(
    config: InternalAxiosRequestConfig,
    method: string,
    url: string,
  ): AxiosResponse | null {
    const placeMatch = /^\/places\/([^/]+)$/.exec(url);
    if (method === 'get' && placeMatch) {
      const place = PLACES.find((p) => p[0] === placeMatch[1]);
      // 그룹 즐겨찾기 예시 장소만 답한다. 그 밖의 장소(홈 추천, 피드 예시)는 dev-mock.ts의 장소 정보가 답하게 넘긴다.
      // 여기서 404를 내면 홈 추천 카드를 눌렀을 때 장소 정보를 불러오지 못했다고 나온다
      if (place) return ok(config, { data: placeView(place) });
    }

    const savedMatch = /^\/trips\/([^/]+)\/saved-places$/.exec(url);
    if (method === 'get' && savedMatch) {
      const trip = tripOf(savedMatch[1]);
      if (!trip) throw fail(config, 404, 'TRIP_NOT_FOUND', '여행을 찾을 수 없습니다.');
      const items = savedOf(trip).map((p, i) => ({
        place: placeView(p),
        savedBy: [{ memberId: trip.members[i % trip.members.length].id, memo: null }],
        savedCount: 1 + (i % 2),
      }));
      return ok(config, {
        items,
        totals: {
          allPlaceCount: items.length,
          overlapPlaceCount: items.filter((s) => s.savedCount >= 2).length,
          filteredCount: items.length,
        },
        page: { nextCursor: null, hasNext: false },
      });
    }

    const m = /^\/trips\/([^/]+)\/polls(?:\/([^/]+))?(?:\/(ballot|candidates))?$/.exec(url);
    if (!m) return null;
    seed();
    const [, tripId, pollId, action] = m;
    const trip = tripOf(tripId);
    if (!trip) throw fail(config, 404, 'TRIP_NOT_FOUND', '여행을 찾을 수 없습니다.');
    closeDue(tripId);

    if (!pollId) {
      if (method === 'get') {
        const data = polls.filter((p) => p.tripId === tripId).map(view);
        return ok(config, { data, page: { nextCursor: null, hasNext: false } });
      }
      if (method === 'post') {
        const body = JSON.parse(String(config.data ?? '{}')) as {
          type: MockPoll['type'];
          title: string;
          candidates: { regionId?: string; placeId?: string }[];
          closesAt: string;
        };
        if (!body.title || body.title.length > 200) throw failFields(config, 'title', '제목');
        if (!body.candidates?.length || body.candidates.length > MAX_CANDIDATES) {
          throw failFields(config, 'candidates', '후보는 1개 이상 30개 이하로 넣어 주세요.');
        }
        const left = Date.parse(body.closesAt) - now();
        if (!(left > 0) || left > 30 * DAY) {
          throw failFields(config, 'closesAt', '마감 시각은 지금 이후 30일 이내로 정해 주세요.');
        }
        return ok(
          config,
          { data: view(make(trip, body.type, body.candidates, body.closesAt, body.title)) },
          201,
        );
      }
      return null;
    }

    const poll = polls.find((p) => p.id === pollId && p.tripId === tripId);
    if (!poll) throw fail(config, 404, 'POLL_NOT_FOUND', '투표를 찾을 수 없습니다.');
    if (method === 'get' && !action) return ok(config, { data: view(poll) });

    const body = JSON.parse(String(config.data ?? '{}')) as {
      candidateIds?: string[];
      candidate?: { regionId?: string; placeId?: string };
      expectedVersion?: number;
    };
    if (poll.status !== 'OPEN') throw fail(config, 409, 'POLL_CLOSED', '이미 마감된 투표입니다.');
    if (body.expectedVersion !== poll.version) {
      throw fail(config, 409, 'VERSION_CONFLICT', '투표가 변경되었습니다. 다시 조회해 주세요.');
    }

    if (method === 'put' && action === 'ballot') {
      const ids = body.candidateIds ?? [];
      if (ids.some((id) => !poll.candidates.some((c) => c.id === id))) {
        throw failFields(config, 'candidateIds', '이 투표의 후보가 아닌 ID가 있습니다.');
      }
      poll.myCandidateIds = [...new Set(ids)];
      recount(poll);
      return ok(config, { data: view(poll) });
    }

    if (method === 'post' && action === 'candidates') {
      const input = body.candidate ?? {};
      const target = poll.type === 'REGION' ? input.regionId : input.placeId;
      if (!target) throw failFields(config, 'candidate', '투표 유형에 맞는 후보를 넣어 주세요.');
      if (poll.candidates.some((c) => (c.regionId ?? c.placeId) === target)) {
        throw failFields(config, 'candidate', '이미 있는 후보입니다.');
      }
      if (poll.candidates.length >= MAX_CANDIDATES) {
        throw failFields(config, 'candidate', '후보는 30개까지 넣을 수 있습니다.');
      }
      seq += 1;
      poll.candidates.push({
        id: `cand-${seq}`,
        regionId: input.regionId ?? null,
        placeId: input.placeId ?? null,
        voteCount: 0,
        addedAt: new Date(now()).toISOString(),
      });
      poll.version += 1;
      return ok(config, { data: view(poll) }, 201);
    }
    return null;
  }

  const firstOpen = (tripId?: string) =>
    polls.find((p) => p.status === 'OPEN' && (!tripId || p.tripId === tripId));

  /** 웹 콘솔 globalThis.__devMock.poll.* 로 부른다(quickstart "서버 없이 보기") */
  const controls = {
    /** 다른 동행이 진행 중 투표에 후보를 하나 넣는다. 내 다음 선택 저장이 409 VERSION_CONFLICT를 받는다 */
    addCandidateByOther(tripId?: string) {
      seed();
      const poll = firstOpen(tripId);
      if (!poll) return;
      const used = new Set(poll.candidates.map((c) => c.regionId ?? c.placeId));
      const next =
        poll.type === 'REGION'
          ? ['region-gyeongju', 'region-jeju', 'region-jongno'].find((id) => !used.has(id))
          : PLACES.map((p) => p[0] as string).find((id) => !used.has(id));
      if (!next) return;
      seq += 1;
      poll.candidates.push({
        id: `cand-${seq}`,
        regionId: poll.type === 'REGION' ? next : null,
        placeId: poll.type === 'PLACE' ? next : null,
        voteCount: 0,
        addedAt: new Date(now()).toISOString(),
      });
      poll.version += 1;
    },
    /** 진행 중 투표를 바로 마감한다. decided 최다 하나, tie 동률, noVotes 0표 */
    closeNow(kind: 'decided' | 'tie' | 'noVotes', tripId?: string) {
      seed();
      const poll = firstOpen(tripId);
      if (!poll) return;
      const [a, b] = poll.candidates;
      poll.myCandidateIds = kind === 'noVotes' ? [] : [a.id];
      poll.otherVotes = kind === 'decided' ? { [a.id]: 1 } : kind === 'tie' ? { [b.id]: 1 } : {};
      poll.otherVoters = kind === 'noVotes' ? 0 : 1;
      poll.closesAt = new Date(now() - 1000).toISOString();
      close(poll);
    },
    reset() {
      polls = [];
      seeded = false;
    },
  };

  return { handle, controls };
}
