import type { MapPoint } from '@/lib/korea-map';

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
  /**
   * 표지 사진 주소(`/assets/{assetId}/download`). 서버 FeedCard에는 아직 없고 사진 번호만 온다(백엔드 요청).
   * 지금은 테스트 모드의 시험 데이터만 채운다. 서버가 주기 시작하면 그대로 그려진다
   */
  coverImageUrl?: string | null;
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
  /** 장소 사진 주소. 서버 응답에는 아직 없다(백엔드 요청). 시험 데이터만 채운다 */
  imageUrl?: string | null;
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
  /** 서버 지역 ID. S06 같은 지역 여행 목록(GET /home/regions/{regionId}/feeds)을 부를 때 쓴다 */
  regionId?: string;
  /** 짧은 이름. "강릉" */
  name: string;
  /** 다녀간 친구 수 */
  memberCount: number;
  /** 다녀간 친구 ID. 시도로 묶을 때 같은 친구를 한 번만 센다 */
  memberIds: string[];
  /** 친구 이름(얼굴 글자). 서버 응답에 없으면 빈 배열 */
  memberNames: string[];
  /** 확대했을 때 사진 핀 표지. 서버 응답에 아직 없다 */
  coverUrl: string | null;
  visitCount: number;
  feedIds: string[];
};

/** 여러 지역을 하나로 묶은 핀. 전국 보기는 시도로, 확대하면 화면에서 겹치는 지역끼리 묶는다 */
export type RegionGroup = {
  key: string;
  /** 핀 글자. "강원 8곳", "강릉·평창 외 1곳" */
  label: string;
  /** 묶인 지역 수 */
  placeCount: number;
  /** 다녀간 친구 수(겹치지 않게) */
  memberCount: number;
  /** 핀을 꽂을 곳. 묶인 지역들의 가운데 */
  point: MapPoint;
  marks: RegionMark[];
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
  /** 누르면 갈 곳의 서버 ID. 여행이면 피드 ID(S07), 장소면 장소 ID(N7) */
  targetId: string;
};

/** S06 같은 지역 여행 카드 한 장 */
export type RegionTripCard = {
  feedId: string;
  title: string;
  /** "01.17 – 01.18" */
  period: string | null;
  /** "1박 2일" */
  nights: string | null;
  /** 표지 사진 주소. 서버 FeedCard에는 사진 번호만 있어 진짜 서버에서는 비어 있다(백엔드 요청) */
  coverUrl: string | null;
};

/** S06 시트에 넘기는 지역 하나의 목록 */
export type RegionTrips = {
  mark: RegionMark;
  state: 'loading' | 'error' | 'ready';
  cards: RegionTripCard[];
};

/** 홈 상태 (screen-list S05). 지도 확대·시트 펼침은 같은 ready 안의 보기 상태 */
export type HomeState = 'loading' | 'first-visit' | 'error' | 'no-friends' | 'no-public' | 'ready';
