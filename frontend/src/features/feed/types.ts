import type { UserCard } from '@/api/types';

/** docs/api-spec.md Region */
export type FeedRegion = {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  latitude: number | null;
  longitude: number | null;
};

/** docs/api-spec.md Place */
export type FeedPlace = {
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

/** PublicPhoto. imageUrl은 로그인해야 받을 수 있는 /assets/... 경로 */
export type PublicPhoto = {
  id: string;
  placeId: string | null;
  imageUrl: string;
  caption: string | null;
};

/** ItineraryItem */
export type ItineraryItem = {
  id: string;
  place: FeedPlace;
  day: number;
  order: number;
  startTime: string | null;
  stayMinutes: number | null;
};

/** RouteLeg. 좌표는 경도·위도 순 */
export type RouteLeg = {
  fromItemId: string;
  toItemId: string;
  transportMode: string;
  durationSeconds: number | null;
  distanceMeters: number | null;
  geometry: { type: 'LineString'; coordinates: number[][] } | null;
  status: 'AVAILABLE' | 'UNAVAILABLE';
  queriedAt: string;
};

/** PublishedReview */
export type PublishedReview = {
  id: string;
  placeId: string;
  author: UserCard;
  score: number;
  body: string;
  writtenAt: string;
  feedId: string;
};

/** GET /feeds/{feedId} (Feed). 서버 공통 공개 표현 */
export type Feed = {
  id: string;
  tripId: string;
  title: string;
  body: string;
  publishedAt: string;
  coverPhotoId: string | null;
  regions: FeedRegion[];
  startDate: string | null;
  endDate: string | null;
  photos: PublicPhoto[];
  places: FeedPlace[];
  publicItinerary: { items: ItineraryItem[]; legs: RouteLeg[] } | null;
  publicReviews: PublishedReview[];
  expenseSummary: { totalAmountMinor: number; currency: 'KRW'; asOfExpenseVersion: number } | null;
  likedByMe: boolean;
  likeCount: number;
  version: number;
  /**
   * 함께 간 동행. 명세 Feed에는 아직 없다(백엔드 요청). 오면 머리글에 얼굴·이름을 보이고, 없으면 숨긴다
   */
  members?: UserCard[];
};

/** 화면용. 서버 응답은 feed-rules.toFeedDetail 한 곳에서만 이 모양으로 바꾼다 */
export type FeedStop = {
  itemId: string;
  /** 지도·목록에 붙는 번호(1부터, 일차를 넘어 이어짐) */
  number: number;
  placeId: string;
  name: string;
  /** 평가 평균(소수 한 자리). 평가가 없으면 null */
  score: number | null;
  /** 대표 한 줄 평가 */
  review: string | null;
  /** 그 평가를 쓴 동행 이름 */
  reviewAuthor: string | null;
  photoUrl: string | null;
  point: { latitude: number; longitude: number };
  /** 다음 장소까지 이동(같은 날 안에서만) */
  next: { mode: TransportKind; minutes: number | null } | null;
};

export type TransportKind = 'walk' | 'car' | 'transit' | 'other';

export type FeedDay = {
  day: number;
  /** "01.17(토)". 여행 날짜를 모르면 null */
  dateLabel: string | null;
  stops: FeedStop[];
};

export type FeedDetail = {
  id: string;
  title: string;
  coverUrl: string | null;
  likedByMe: boolean;
  likeCount: number;
  /** "01.17 – 01.18" */
  periodLabel: string | null;
  /** "1박 2일" */
  nightsLabel: string | null;
  /** 동행 이름. 서버가 주지 않으면 빈 배열 */
  members: { name: string; imageUrl: string | null }[];
  /** 앞에서 3장 */
  photos: { id: string; url: string }[];
  /** 3장 뒤에 더 있는 수 */
  morePhotos: number;
  days: FeedDay[];
  /** 경비 합계(원). 비공개면 null */
  expenseTotal: number | null;
};
