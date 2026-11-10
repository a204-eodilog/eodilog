import type { UserCard } from '@/api/types';

/** 여행 상태. 서버가 조회 시점 날짜(Asia/Seoul)와 기간으로 정한다(기간 없음은 계획 중) */
export type MyTripStatus = 'PLANNING' | 'ONGOING' | 'COMPLETED';

/** GET /me/trips 한 줄 (백엔드 TripResponse 중 N4가 쓰는 것) */
export type MyTrip = {
  id: string;
  title: string;
  /** "2026-11-14". 기간을 정하지 않았으면 null */
  startDate: string | null;
  endDate: string | null;
  status: MyTripStatus;
  /** ACTIVE 멤버만, 참여 순 */
  members: { id: string; user: UserCard; joinOrder: number }[];
};

/** S38에 필요한 여행 정보 (GET /trips/{tripId}의 일부) */
export type RecordTrip = {
  id: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  /** 참여 중인 동행만, 참여 순 */
  members: MyTrip['members'];
};

/**
 * S38 이 여행의 공동 피드(GET /trips/{tripId}/feed, 명세 OwnFeed 중 쓰는 것). 게시 전이면 null.
 * version은 삭제할 때(expectedVersion), visibility는 내 경로에서 숨긴 친구
 */
export type TripFeed = {
  id: string;
  version: number;
  visibility: { hiddenViewerUserIds: string[]; version: number };
};
