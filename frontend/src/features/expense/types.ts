import type { UserCard } from '@/api/types';

/** 여행 멤버 (docs/api-spec.md Member). 나간 동행도 경비에는 남는다 */
export type TripMember = {
  id: string;
  user: UserCard;
  role: 'OWNER' | 'MEMBER';
  status: 'ACTIVE' | 'LEFT' | 'REMOVED';
  joinOrder: number;
};

/** 경비 화면에 필요한 여행 정보 (GET /trips/{tripId}의 일부) */
export type ExpenseTrip = {
  id: string;
  title: string;
  /** 지출이 바뀔 때마다 오르는 비용 버전. 정산 계산에 보낸다 */
  expenseVersion: number;
};

/** 지출 (docs/api-spec.md Expense). 금액은 원 단위 정수 */
export type Expense = {
  id: string;
  title: string;
  memo: string | null;
  amountMinor: number;
  currency: 'KRW';
  payerMemberId: string;
  participantMemberIds: string[];
  spentAt: string;
  registeredByMemberId: string;
  shares: { memberId: string; amountMinor: number }[];
  version: number;
};

/** 지출 등록·수정에 쓰는 값. 화면에서 고르는 것만 */
export type ExpenseInput = {
  title: string;
  amountMinor: number;
  payerMemberId: string;
  participantMemberIds: string[];
};

/**
 * 정산 결과 (docs/api-spec.md Settlement, 백엔드 SettlementResponse). 금액은 원 단위 정수.
 * owedMinor는 10원 단위로 올린 1명 부담액, balanceMinor = 낸 돈 - 부담(+면 받고 -면 보낸다)
 */
export type Settlement = {
  id: string;
  expenseVersion: number;
  stale: boolean;
  totalAmountMinor: number;
  includedExpenses: {
    expenseId: string;
    expenseVersion: number;
    title: string;
    amountMinor: number;
    payerMemberId: string;
    shares: { memberId: string; amountMinor: number }[];
  }[];
  /** 경비에 결제자·분담자로 나온 멤버(나간 동행 포함), 참여 순 */
  members: {
    memberId: string;
    paidMinor: number;
    owedMinor: number;
    balanceMinor: number;
  }[];
  transfers: { id: string; fromMemberId: string; toMemberId: string; amountMinor: number }[];
  calculatedAt: string;
};

/** 정산 상태 (GET /trips/{tripId}/settlement). 계산한 적이 없으면 current가 null */
export type SettlementState = {
  current: Settlement | null;
  currentExpenseVersion: number;
  recalculationRequired: boolean;
};
