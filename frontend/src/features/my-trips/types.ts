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
