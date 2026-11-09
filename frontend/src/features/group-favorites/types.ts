// 계약: specs/20261109-131605-group-favorites/contracts/group-api.md (백엔드 TripSavedPlaceController 기준)
import type { Place } from '@/features/place/types';

export type { Place };

/** 그룹 즐겨찾기 장소 하나(백엔드 SavedPlaceView). 담은 동행은 참여 순 */
export type SavedPlace = {
  place: Place;
  savedBy: { memberId: string; memo: string | null }[];
  /** 담은 동행 수. 2 이상이면 겹친 곳 */
  savedCount: number;
};

/** GET /trips/{tripId}/saved-places 응답. DataResponse로 감싸지 않는다 */
export type SavedPlacePage = {
  items: SavedPlace[];
  totals: { allPlaceCount: number; overlapPlaceCount: number; filteredCount: number };
  page: { nextCursor: string | null; hasNext: boolean };
};

export type SavedFilter = 'ALL' | 'OVERLAP';

export type ListQuery = { filter: SavedFilter; memberId: string | null };

/** 코스에 들어 있는 장소와 코스를 마지막으로 고친 동행(GET itinerary에서 이 화면에 필요한 값만) */
export type CoursePlaces = { placeIds: Set<string>; updatedByMemberId: string | null };
