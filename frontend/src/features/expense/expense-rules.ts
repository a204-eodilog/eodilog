import { exceedsAmountMax, parseAmount } from '@/lib/format-number';

import type { ExpenseInput, SettlementState, TripMember } from './types';

/** 서버 규칙: 경비 이름은 앞뒤 공백을 뺀 1~200자 */
export const TITLE_MAX_LENGTH = 200;
/**
 * 입력칸에서 막는 길이. 목록 한 줄에 들어가게 서버보다 짧게 막고 남은 글자 수를 보여 준다
 * (2026-11-13 사용자 결정). 저장 검사는 서버 규칙(TITLE_MAX_LENGTH)을 그대로 쓴다
 */
export const TITLE_INPUT_MAX_LENGTH = 30;

/** 이름 뒤에 붙는 '이/가'. 받침이 있으면 '이' */
export function subjectParticle(name: string): string {
  const last = name.trim().charCodeAt(name.trim().length - 1);
  const isHangul = last >= 0xac00 && last <= 0xd7a3;
  return isHangul && (last - 0xac00) % 28 !== 0 ? '이' : '가';
}

/** "지우가 냄", "민준이 냄" */
export function payerLabel(name: string): string {
  return `${name}${subjectParticle(name)} 냄`;
}

/**
 * 나눌 사람 표시. 지금 여행에 있는 동행 모두면 "3명 똑같이", 일부면 "서연, 지우 2명"(참여 순).
 * S36 포함한 지출은 "3명이 똑같이"라 모두일 때 붙는 말을 바꿔 쓴다.
 */
export function splitLabel(
  participantIds: string[],
  members: TripMember[],
  everyoneSuffix = '명 똑같이',
): string {
  const active = members.filter((m) => m.status === 'ACTIVE');
  const chosen = new Set(participantIds);
  const everyone = active.length > 0 && active.every((m) => chosen.has(m.id));
  if (everyone && chosen.size === active.length) return `${chosen.size}${everyoneSuffix}`;
  const names = [...members]
    .sort((a, b) => a.joinOrder - b.joinOrder)
    .filter((m) => chosen.has(m.id))
    .map((m) => m.user.nickname);
  return `${names.join(', ')} ${chosen.size}명`;
}

/** 지금 정산을 계산한 뒤에 새로 들어온 지출인지. "정산 후 추가" 태그를 단다 */
export function addedAfterSettlement(expenseId: string, state: SettlementState | undefined) {
  if (!state?.current || !state.recalculationRequired) return false;
  return !state.current.includedExpenses.some((e) => e.expenseId === expenseId);
}

/** 정산을 한 번 계산했고, 그 뒤 지출이 바뀌었는지. "정산 후 지출 변경" 상태 */
export function changedAfterSettlement(state: SettlementState | undefined) {
  return Boolean(state?.current && state.recalculationRequired);
}

export type ExpenseForm = {
  amount: string;
  title: string;
  payerMemberId: string | null;
  participantMemberIds: string[];
};

export type ExpenseFormProblem = 'amount' | 'amountTooLarge' | 'title' | 'payer' | 'participants';

/** 저장할 값. 규칙에 어긋나면 첫 번째 문제를 돌려준다 */
export function toExpenseInput(
  form: ExpenseForm,
): { input: ExpenseInput } | { problem: ExpenseFormProblem } {
  // 상한은 lib/format-number(AMOUNT_MAX)와 서버 ExpenseService MAX_AMOUNT_MINOR가 같다
  if (exceedsAmountMax(form.amount)) return { problem: 'amountTooLarge' };
  const amount = parseAmount(form.amount);
  if (!amount) return { problem: 'amount' };
  const title = form.title.trim();
  if (!title || title.length > TITLE_MAX_LENGTH) return { problem: 'title' };
  if (!form.payerMemberId) return { problem: 'payer' };
  if (form.participantMemberIds.length === 0) return { problem: 'participants' };
  return {
    input: {
      title,
      amountMinor: amount,
      payerMemberId: form.payerMemberId,
      participantMemberIds: form.participantMemberIds,
    },
  };
}
