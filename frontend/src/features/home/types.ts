/** docs/api-spec.md Region (홈 응답에 들어오는 지역) */
export type HomeRegion = {
  id: string;
  /** 법정동 10자리. 지도 경계와 같은 코드 */
  code: string;
  name: string;
  parentId: string | null;
  latitude: number | null;
  longitude: number | null;
};

/** GET /home/map (MapResult). 팔로우한 사람의 공개된 공동 피드를 지역별로 묶은 것 */
export type MapResult = {
  markers: {
    region: HomeRegion;
    feedIds: string[];
    visibleMemberUserIds: string[];
    visitCount: number;
  }[];
  criteria: { from: string | null; to: string | null; regionGrouping: string };
  updatedAt: string;
};

/** FeedCard (공동 피드 요약). 여행당 하나, 대표 글쓴이 없음 */
export type FeedCard = {
  id: string;
  tripId: string;
  title: string;
  coverPhotoId: string | null;
  regions: HomeRegion[];
  startDate: string | null;
  endDate: string | null;
  publishedAt: string;
  likedByMe: boolean;
  likeCount: number;
};

export type HomePlace = {
  id: string;
  name: string;
  address: string | null;
  regionId: string | null;
};

/** GET /me/discovery-recommendations (DiscoveryItem). 좋아요 기반 추천 */
export type DiscoveryItem = {
  type: 'FEED' | 'PLACE';
  feed: FeedCard | null;
  place: HomePlace | null;
  reason: string;
};

/** 화면용 지역 표시. 서버 응답은 home-rules.toRegionMarks 한 곳에서만 이 모양으로 바꾼다 */
export type RegionMark = {
  regionCode: string;
  /** 짧은 이름. "강릉" */
  name: string;
  /** 다녀간 친구 수 */
  memberCount: number;
  /** 친구 이름(얼굴 글자). 서버 응답에 없으면 빈 배열 */
  memberNames: string[];
  /** 확대했을 때 사진 핀 표지. 서버 응답에 아직 없다 */
  coverUrl: string | null;
  visitCount: number;
  feedIds: string[];
};

/** 아래 추천 시트 한 줄 */
export type HomeRecommendation = {
  id: string;
  kind: 'trip' | 'place';
  title: string;
  /** 여행이면 함께 간 사람·지역("하늘"), 장소면 위치("강릉 명주동") */
  meta: string;
  /** "2박 3일". 장소는 없음 */
  nights: string | null;
  imageUrl: string | null;
};

/** 홈 상태 (screen-list S05). 지도 확대·시트 펼침은 같은 ready 안의 보기 상태 */
export type HomeState = 'loading' | 'first-visit' | 'error' | 'no-friends' | 'no-public' | 'ready';
