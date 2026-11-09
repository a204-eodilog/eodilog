import type { TripStatus } from '@/api/types';

/**
 * GET /me/timeline 한 줄(docs/api-spec.md TimelineItem). 여행 이름·기간은 없어 /me/trips와 합친다.
 * 서버가 아직 이 API를 만들지 않아 명세 그대로 받는다고 보고 짰다(EODI-234)
 */
export type TimelineItem = {
  tripId: string;
  /** 공동 피드를 게시했으면 그 ID */
  feedId: string | null;
  /** 여행 시작일 'YYYY-MM-DD'. 날짜를 안 정한 여행은 null */
  date: string | null;
  dateBasis: 'TRIP' | 'UNKNOWN';
  status: string;
};

/** 장소 좌표·이름 (명세 Place 중 쓰는 것) */
export type TimelinePlace = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
};

/** GET /trips/{tripId}/timeline items 한 줄(PlaceTimelineItem) */
export type PlaceTimelineItem = {
  place: TimelinePlace;
  /** ISO 시각. 계획에 시간이 없으면 null */
  plannedAt: string | null;
  visitedAt: string | null;
  status: 'PLANNED' | 'VISITED';
  photoCount: number;
  plannedDistanceMeters: number | null;
};

/** GET /trips/{tripId}/summary (TripSummary). 입력하지 않은 값은 null */
export type TripSummary = {
  tripId: string;
  photoCount: number;
  visitedPlaceCount: number;
  visitedRegionCount: number;
  plannedDistanceMeters: number | null;
  actualDistanceMeters: number | null;
  /** KRW는 원 단위 그대로 */
  totalAmountMinor: number | null;
  currency: 'KRW';
};

/** S41 여행 묶음에 쓰는 여행 정보 (/me/trips 한 줄 중 쓰는 것) */
export type TimelineTrip = {
  id: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  status: TripStatus;
};
