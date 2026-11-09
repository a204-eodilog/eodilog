/** docs/api-spec.md Region */
export type DestRegion = {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  latitude: number | null;
  longitude: number | null;
};

/** GET /trends/regions 한 줄(TrendRegion). 기간·집계 정의는 결정 Q-9 */
export type TrendRegion = {
  region: DestRegion;
  rank: number;
  previousRank: number | null;
  rankChange: number | null;
  isNew: boolean;
  publishedTripCount: number;
  followingCount: number;
  from: string;
  to: string;
  sampleSize: number;
  updatedAt: string;
  insufficientData: boolean;
};

/** GET /regions/{regionId}(RegionDetail) */
export type RegionDetail = {
  region: DestRegion;
  introduction: string | null;
  representativePlaces: {
    id: string;
    name: string;
    address: string | null;
    latitude: number;
    longitude: number;
  }[];
  partialErrors: string[];
};

/** 순위 변동 표시. up·down은 칸 수 */
export type RankMove = { kind: 'up' | 'down'; by: number } | { kind: 'new' } | { kind: 'same' };

/** S09 한 줄 */
export type TrendRow = {
  regionId: string;
  rank: number;
  /** "강릉" */
  name: string;
  /** "강원". 모르면 null */
  sido: string | null;
  tripCount: number;
  /** 다녀간 팔로잉 수. 0이면 숨김 */
  friendCount: number;
  move: RankMove;
  coverUrl: string | null;
};

export type TrendBoard = {
  /** "최근 30일 · 09.24 – 10.23" */
  periodLine: string | null;
  /** "오늘 06:00 기준" / "11.05 06:00 기준" */
  updatedLine: string | null;
  /** 자료가 적어 순위를 보이지 않음 */
  insufficient: boolean;
  rows: TrendRow[];
};

/** N3 화면 값 */
export type DestinationInfo = {
  regionId: string;
  name: string;
  /** "강원" 같은 상위 지역. 모르면 null */
  area: string | null;
  introduction: string | null;
  places: { id: string; name: string; address: string | null }[];
  photos: string[];
};
