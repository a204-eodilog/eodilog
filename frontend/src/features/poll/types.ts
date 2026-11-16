// 계약: specs/20261109-094657-poll-vote/data-model.md (백엔드 poll/dto, place/dto 기준)

export type PollType = 'REGION' | 'PLACE';

/** OPEN 진행 중 / FINALIZED 최다 후보 확정(동률이면 여럿) / CLOSED 0표라 확정 없이 마감 */
export type PollStatus = 'OPEN' | 'CLOSED' | 'FINALIZED';

/** DEADLINE 최다 후보를 확정한 마감, NO_VOTES 0표 마감 */
export type PollClosedReason = 'DEADLINE' | 'NO_VOTES';

export type PollCandidate = {
  id: string;
  /** 지역 투표면 값이 있다 */
  regionId: string | null;
  /** 장소 투표면 값이 있다 */
  placeId: string | null;
  /** 진행 중이면 지금 동행의 표, 마감했으면 마감 때 고정한 값 */
  voteCount: number;
  addedAt: string;
};

export type Poll = {
  id: string;
  tripId: string;
  type: PollType;
  title: string;
  status: PollStatus;
  /** 후보 추가와 마감 때만 오른다. 다른 동행이 투표해도 오르지 않는다 */
  version: number;
  closesAt: string;
  closedReason: PollClosedReason | null;
  eligibleMemberCount: number;
  votedMemberCount: number;
  /** 입력·추가 순 */
  candidates: PollCandidate[];
  myCandidateIds: string[];
  /** FINALIZED만 값이 있다 */
  selectedCandidateIds: string[];
  // 아래 넷은 직접 종료 기능(2026-11-16)과 함께 생겼다. 서버에 반영되기 전 응답에는 없어서 없어도 되게 둔다
  /** 투표를 연 멤버 ID(여행 멤버 ID, 사용자 ID 아님) */
  createdByMemberId?: string;
  /** 내가 지금 종료할 수 있는지. 진행 중이고 마감 시각 전이며 내가 연 투표일 때만 true. 종료 버튼은 이 값만 본다 */
  canClose?: boolean;
  /** 실제 마감 시각. 직접 종료하면 closesAt보다 이르다. 진행 중이면 null */
  closedAt?: string | null;
  /** 직접 종료한 멤버. 마감 시각에 서버가 마감했거나 진행 중이면 null */
  closedByMemberId?: string | null;
};

/** 지역 투표는 regionId만, 장소 투표는 placeId만 보낸다 */
export type CandidateInput = { regionId: string } | { placeId: string };

export type CreatePollBody = {
  type: PollType;
  title: string;
  candidates: CandidateInput[];
  /** UTC ISO 문자열. 지금 이후 30일 이내 */
  closesAt: string;
};

/** GET /places/{placeId}의 장소. 이름은 바뀌지 않는다 */
export type Place = {
  id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  regionId: string | null;
};

/** 그룹 즐겨찾기 장소 하나(SavedPlaceView) */
export type SavedPlace = {
  place: Place;
  savedBy: { memberId: string; memo: string | null }[];
  savedCount: number;
};

/** GET /trips/{tripId}/saved-places 응답. DataResponse로 감싸지 않는다 */
export type SavedPlacePage = {
  items: SavedPlace[];
  totals: { allPlaceCount: number; overlapPlaceCount: number; filteredCount: number };
  page: { nextCursor: string | null; hasNext: boolean };
};

/** N8과 후보 추가 시트의 한 줄 */
export type CandidateOption = {
  /** 지역 ID 또는 장소 ID */
  key: string;
  title: string;
  /** 지역: "그룹 즐겨찾기 N곳", 장소: 주소 */
  subtitle: string | null;
  input: CandidateInput;
  /** 장소 후보를 담은 동행 수. 2명 이상이면 '겹침 N명'을 보인다 */
  savedCount?: number;
  /** 장소 후보를 담은 동행 닉네임(Figma 385-827 "세은, 승기") */
  savers?: string[];
};
