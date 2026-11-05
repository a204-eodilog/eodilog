/** GET /me/trips 한 줄에서 마이페이지가 쓰는 값(docs/api-spec.md Trip) */
export type MyTrip = {
  id: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  destinationRegionIds: string[];
  status: 'PLANNING' | 'ONGOING' | 'COMPLETED' | string;
};

/** GET /me/feeds 한 줄에서 쓰는 값(OwnFeed). 지역은 코드까지 온다 */
export type MyFeed = {
  id: string;
  tripId: string;
  title: string;
  regions: { id: string; code: string; name: string }[];
};

/** 화면용 지도 핀. 같은 지역의 여러 여행은 하나로 묶는다 */
export type MyTripPin = {
  regionCode: string;
  /** "봄 경주", 여럿이면 "봄 경주 외 1개" */
  label: string;
  /** 하나라도 게시했으면 게시됨(파랑), 아니면 나만 봐요(자물쇠) */
  posted: boolean;
  tripIds: string[];
};

export type MyPageSummary = {
  nickname: string;
  profileImageUrl: string | null;
  /** 다녀온(끝난) 여행 수 */
  visitedCount: number;
  /** 게시한 공동 피드 수 */
  postedCount: number;
  /** 내 여행 목록 전체 수 */
  tripCount: number;
  /** 다녀온 여행 중 여행지가 없어 지도에 핀이 없는 수 */
  pinlessCount: number;
  /** 팔로잉 수. 다 세지 못했으면(다음 쪽이 있으면) null */
  friendCount: number | null;
  pins: MyTripPin[];
};
