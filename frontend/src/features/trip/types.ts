import type { UserCard } from '@/api/types';

/** 서버가 서울 날짜로 계산한다. 기간이 없거나 시작 전이면 PLANNING */
export type TripStatus = 'PLANNING' | 'ONGOING' | 'COMPLETED';

export type TripMember = {
  /** 멤버 id. 사용자 id가 아니다 */
  id: string;
  user: UserCard;
  role: 'OWNER' | 'MEMBER';
  status: 'ACTIVE' | 'LEFT' | 'REMOVED';
  joinOrder: number;
  joinedAt: string;
  leftAt: string | null;
};

export type Trip = {
  id: string;
  /** 여행 이름. 공백 제거 후 1~200자 */
  title: string;
  /** 'YYYY-MM-DD'. endDate와 함께 있거나 함께 없다 */
  startDate: string | null;
  endDate: string | null;
  /** 고른 순서. 이름은 지역 API로 따로 받는다 */
  destinationRegionIds: string[];
  status: TripStatus;
  currency: 'KRW';
  ownerMemberId: string;
  /** 참여 중인 동행만, 참여 순 */
  members: TripMember[];
  version: number;
  expenseVersion: number;
};

export type Region = {
  id: string;
  /** 법정동 코드 */
  code: string;
  /** 공식 이름 전체. "부산광역시 해운대구" */
  name: string;
  parentId: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type RegionDetail = {
  region: Region;
};

/** POST /trips 본문. 모르는 필드를 넣으면 서버가 400을 준다 */
export type CreateTripBody = {
  title: string;
  startDate?: string;
  endDate?: string;
  destinationRegionIds?: string[];
};

export type DateRange = { start: string; end: string };

/** 여행 탭 목록 묶음 */
export type TripSections = {
  /** 맨 위 큰 카드. 여행 중 → 다가오는 여행 순으로 고른다 */
  featured: Trip | null;
  next: Trip[];
  past: Trip[];
};

/** POST /trips/{tripId}/leave 결과 (docs/api-spec.md LeaveResult) */
export type LeaveResult = {
  tripId: string;
  /** 혼자 남은 사람이 나가 여행이 지워졌으면 true(202) */
  tripDeleted: boolean;
  /** 방장이 나가 방장을 넘겨받은 동행. 아니면 null */
  newOwnerMemberId: string | null;
  /** 여행 삭제 작업 ID. 일반 나가기는 null */
  cleanupJobId: string | null;
  status: 'LEFT' | 'TRIP_DELETED';
};
