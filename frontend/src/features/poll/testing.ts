import type { Poll, PollCandidate, SavedPlace } from './types';

/** 투표 단위 테스트·미리보기용 후보. id만 주면 나머지는 정해진 값으로 채운다 */
export function candidate(id: string, over: Partial<PollCandidate> = {}): PollCandidate {
  return {
    id,
    regionId: `region-${id}`,
    placeId: null,
    voteCount: 0,
    addedAt: '2026-10-26T12:00:00Z',
    ...over,
  };
}

/** 진행 중인 지역 투표 하나. 필요한 필드만 덮어쓴다 */
export function poll(over: Partial<Poll> = {}): Poll {
  return {
    id: 'poll-1',
    tripId: 'trip-1',
    type: 'REGION',
    title: '어디로 갈까요?',
    status: 'OPEN',
    version: 1,
    // 실제 시계로 지난 마감이면 화면이 마감 확인을 되풀이하므로 먼 미래로 둔다
    closesAt: '2099-01-01T00:00:00Z',
    closedReason: null,
    eligibleMemberCount: 3,
    votedMemberCount: 0,
    candidates: [candidate('c1'), candidate('c2'), candidate('c3')],
    myCandidateIds: [],
    selectedCandidateIds: [],
    ...over,
  };
}

/** 그룹 즐겨찾기 장소 하나 */
export function savedPlace(
  id: string,
  regionId: string | null,
  over: Partial<SavedPlace['place']> = {},
): SavedPlace {
  return {
    place: {
      id,
      name: `장소 ${id}`,
      address: `주소 ${id}`,
      latitude: 35,
      longitude: 129,
      regionId,
      ...over,
    },
    savedBy: [{ memberId: 'me', memo: null }],
    savedCount: 1,
  };
}
