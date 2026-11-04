import { randomUUID } from 'expo-crypto';

import { apiClient } from '@/api/client';
import type { DataResponse, MyProfile, PageResponse } from '@/api/types';

import type {
  Expense,
  ExpenseInput,
  ExpenseTrip,
  Settlement,
  SettlementState,
  TripMember,
} from './types';

/** 서버 최대 페이지 크기. 한 여행의 지출은 많지 않아 합계를 내려고 끝까지 읽는다 */
const PAGE_LIMIT = 100;

/** 같은 요청을 다시 보낼 때 같은 키를 쓰면 서버가 두 번 만들지 않는다 */
export const newIdempotencyKey = () => randomUUID();

export async function getMe(): Promise<MyProfile> {
  const { data } = await apiClient.get<DataResponse<MyProfile>>('/me');
  return data.data;
}

export async function getExpenseTrip(tripId: string): Promise<ExpenseTrip> {
  const { data } = await apiClient.get<DataResponse<ExpenseTrip>>(`/trips/${tripId}`);
  return data.data;
}

/** 나간 동행까지. 나간 사람이 낸 지출의 이름을 보여 줘야 한다 */
export async function getTripMembers(tripId: string): Promise<TripMember[]> {
  const { data } = await apiClient.get<DataResponse<{ members: TripMember[] }>>(
    `/trips/${tripId}/members`,
    { params: { includeInactive: true } },
  );
  return data.data.members;
}

/** 지출 전부. 최근 등록 순 */
export async function getAllExpenses(tripId: string): Promise<Expense[]> {
  const all: Expense[] = [];
  let cursor: string | null = null;
  do {
    const { data }: { data: PageResponse<Expense> } = await apiClient.get(
      `/trips/${tripId}/expenses`,
      { params: { limit: PAGE_LIMIT, ...(cursor ? { cursor } : {}) } },
    );
    all.push(...data.data);
    cursor = data.page.hasNext ? data.page.nextCursor : null;
  } while (cursor);
  return all;
}

export async function getSettlementState(tripId: string): Promise<SettlementState> {
  const { data } = await apiClient.get<DataResponse<SettlementState>>(
    `/trips/${tripId}/settlement`,
  );
  return data.data;
}

/**
 * 정산 계산. Idempotency-Key 필수, 지금 비용 버전을 함께 보낸다.
 * 그 사이 지출이 바뀌었으면 409 VERSION_CONFLICT
 */
export async function calculateSettlement(
  tripId: string,
  expectedExpenseVersion: number,
  idempotencyKey: string,
): Promise<Settlement> {
  const { data } = await apiClient.post<DataResponse<Settlement>>(
    `/trips/${tripId}/settlements`,
    { expectedExpenseVersion },
    { headers: { 'Idempotency-Key': idempotencyKey } },
  );
  return data.data;
}

/** 지출 등록. Idempotency-Key 필수, 지출 시각은 등록하는 지금으로 보낸다(화면에 날짜 칸이 없다) */
export async function createExpense(
  tripId: string,
  input: ExpenseInput,
  idempotencyKey: string,
): Promise<Expense> {
  const { data } = await apiClient.post<DataResponse<Expense>>(
    `/trips/${tripId}/expenses`,
    { ...input, currency: 'KRW', spentAt: new Date().toISOString() },
    { headers: { 'Idempotency-Key': idempotencyKey } },
  );
  return data.data;
}

/** 지출 수정. 등록한 사람만, 조회한 version을 함께 보낸다 */
export async function updateExpense(
  tripId: string,
  expenseId: string,
  input: ExpenseInput,
  expectedVersion: number,
): Promise<Expense> {
  const { data } = await apiClient.patch<DataResponse<Expense>>(
    `/trips/${tripId}/expenses/${expenseId}`,
    { ...input, expectedVersion },
  );
  return data.data;
}

/** 지출 삭제. 등록한 사람만. 지우면 이전 정산은 다시 계산해야 한다 */
export async function deleteExpense(
  tripId: string,
  expenseId: string,
  expectedVersion: number,
): Promise<void> {
  await apiClient.delete(`/trips/${tripId}/expenses/${expenseId}`, {
    params: { expectedVersion },
  });
}
