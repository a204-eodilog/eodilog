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

/** 코스 응답에서 이 기능이 쓰는 부분. 캐시에는 서버가 준 코스 전체가 있다(코스 화면과 같은 쿼리 키) */
export type ItineraryDoc = { items: ItineraryItem[] };

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

/**
 * 방문 평가 (docs/api-spec.md Review). 방문 하나에 평가 하나, 작성자는 방문한 멤버.
 * visit·place는 평가 목록용 요약이고 장소를 읽지 못하면 place가 null이다
 */
export type Review = {
  id: string;
  visitId: string;
  authorMemberId: string;
  /** 1~5 정수 */
  score: number;
  body: string;
  /** 점수·글이 바뀔 때만 오른다. 고칠 때 expectedVersion으로 보낸다 */
  version: number;
  createdAt: string;
  updatedAt: string;
  visit: { placeId: string; visitedAt: string };
  place: { name: string; address: string | null } | null;
};

/** 평가 쓰기·고치기. 처음 쓸 때는 expectedVersion을 보내지 않는다(보내면 400) */
export type ReviewInput = { score: number; body: string; expectedVersion?: number };
