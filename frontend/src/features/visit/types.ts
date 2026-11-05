import type { UserCard } from '@/api/types';

/** S33에 필요한 여행 정보 (GET /trips/{tripId}의 일부) */
export type VisitTrip = {
  id: string;
  title: string;
  /** 'YYYY-MM-DD'. 기간이 없으면 일차 제목에 날짜를 쓰지 않는다 */
  startDate: string | null;
  /** 참여 중인 동행만, 참여 순 */
  members: { id: string; user: UserCard; joinOrder: number }[];
};

/** 코스 항목 (docs/api-spec.md ItineraryItem). 장소는 쓰는 값만 */
export type ItineraryItem = {
  id: string;
  place: { id: string; name: string };
  day: number;
  /** 날짜 안 순서. 1부터 빈틈없이 */
  order: number;
  /** 'HH:mm'. 없으면 null */
  startTime: string | null;
};

/** MANUAL: '다녀옴' 직접 체크 / PHOTO: 사진 방문 후보를 본인이 확인 */
export type VisitEvidenceType = 'MANUAL' | 'PHOTO';

/** 방문 (docs/api-spec.md Visit). 평가 기능 전이라 reviewId·reviewScore는 늘 null이다 */
export type Visit = {
  id: string;
  tripId: string;
  memberId: string;
  placeId: string;
  visitedAt: string;
  evidenceType: VisitEvidenceType;
  reviewId: string | null;
  reviewScore: number | null;
};
