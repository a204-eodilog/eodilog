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
  /** 여행 삭제(TRIP_DELETE) 또는 내 채팅 정리(LEAVE_CLEANUP) 작업 ID. 없으면 null */
  cleanupJobId: string | null;
  status: 'LEFT' | 'TRIP_DELETED';
};

/** POST /trips/{tripId}/invitations 201. 서버는 토큰 해시만 보관하므로 이 응답에서만 url을 알 수 있다 */
export type InvitationSecret = {
  id: string;
  /** 초대 토큰(43자). 화면에는 쓰지 않고 url만 보인다 */
  token: string;
  /** 공유할 링크. 서버가 만든 앱 주소 그대로 쓴다 */
  url: string;
  /** 만료 시각(UTC). 만든 때부터 7일 */
  expiresAt: string;
};

/** 이 기기에 남겨 두는 초대 링크(research R1) */
export type SavedInviteLink = { url: string; expiresAt: string };

/** PATCH /trips/{tripId} 본문. 생략한 칸은 서버가 그대로 둔다. 모르는 칸을 넣으면 400 */
export type UpdateTripBody = {
  /** 수정을 시작한 때의 여행 version. 다르면 409 */
  expectedVersion: number;
  title?: string;
  /** null이면 비운다. endDate와 함께 있거나 함께 비어야 한다 */
  startDate?: string | null;
  endDate?: string | null;
  /** 보낸 목록으로 통째로 바꾼다. []이면 모두 비운다 */
  destinationRegionIds?: string[];
};

/** DELETE /trips/{tripId} 202. 앱은 받기만 하고 조회하지 않는다 */
export type JobRef = { jobId: string; status: 'QUEUED'; statusUrl: string };
