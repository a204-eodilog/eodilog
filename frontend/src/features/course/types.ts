// 계약: specs/20261109-121845-course/contracts/course-api.md (백엔드 ItineraryController 기준)
import type { Place } from '@/features/place/types';

export type { Place };

/** 구간별 이동 수단(결정 Q-6). 코스 전체 수단은 없다 */
export type TransportMode = 'WALK' | 'CAR' | 'TRANSIT';

export type ItineraryItem = {
  id: string;
  place: Place;
  /** 여행 일차, 1부터 */
  day: number;
  /** 그 날 안의 순서, 1부터 빈틈없이 */
  order: number;
  /** 도착·시작 시각 HH:mm, 없으면 null */
  startTime: string | null;
  /** 머무는 분, 없으면 null */
  stayMinutes: number | null;
};

export type RouteLeg = {
  fromItemId: string;
  toItemId: string;
  transportMode: TransportMode;
  /** 조회 전이거나 실패면 null. 0이나 직선거리로 채우지 않는다 */
  durationSeconds: number | null;
  distanceMeters: number | null;
  /** GeoJSON LineString, 좌표는 경도·위도 순 */
  geometry: { type: 'LineString'; coordinates: [number, number][] } | null;
  status: 'AVAILABLE' | 'UNAVAILABLE';
  queriedAt: string;
};

/** 여행당 하나뿐인 지금 코스. 확정 단계는 없다 */
export type Itinerary = {
  tripId: string;
  version: number;
  items: ItineraryItem[];
  legs: RouteLeg[];
  updatedByMemberId: string;
  updatedAt: string;
};

/** PUT 본문. 요청에 없는 기존 항목은 지워진다 */
export type ItineraryWrite = {
  expectedVersion: number;
  items: {
    id?: string;
    placeId: string;
    day: number;
    order: number;
    startTime?: string | null;
    stayMinutes?: number | null;
  }[];
  legs: { day: number; fromOrder: number; toOrder: number; transportMode: TransportMode }[];
};

export type JobStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
export type JobRef = { jobId: string; status: JobStatus; statusUrl: string };
export type Job = {
  id: string;
  kind: string;
  status: JobStatus;
  progress: number;
  result: unknown;
  error: { code: string; message: string } | null;
  createdAt: string;
  finishedAt: string | null;
};

/** 자동 추천 결과 코스. 저장된 코스와 같은 모양이지만 항목 id는 없을 수 있다 */
export type CourseContent = {
  items: (Omit<ItineraryItem, 'id'> & { id?: string | null })[];
  legs: { day: number; fromOrder: number; toOrder: number; transportMode: TransportMode }[];
};

/** GET proposals/{jobId} (API 명세 §10 ItineraryProposal) */
export type ItineraryProposal = {
  job: Job;
  baseVersion: number;
  reason: string;
  proposed: CourseContent | null;
  diff: { removedPlaceIds: string[]; addedPlaceIds: string[]; description: string } | null;
  appliedAt: string | null;
  canUndo: boolean;
};

/** 그룹 즐겨찾기 장소 하나(백엔드 SavedPlaceView). 투표 브랜치의 같은 타입과 합칠 때 하나로 한다 */
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
