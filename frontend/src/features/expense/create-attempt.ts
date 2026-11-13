import type { ExpenseInput } from './types';

/**
 * 지출 등록 한 번의 시도. 서버는 Idempotency-Key와 함께 본문 전체(지출 시각 포함)를 기억해서,
 * 같은 키에 본문이 조금이라도 다르면 409 IDEMPOTENCY_KEY_REUSED로 거절한다.
 * 그래서 키와 지출 시각을 한 묶음으로 두고, 입력이 같을 때만 함께 다시 쓴다
 */
export type CreateAttempt = {
  /** 보낸 입력. 다음 시도와 같은지 견준다 */
  signature: string;
  key: string;
  spentAt: string;
};

/** 보내는 값 그대로 견준다. 나눌 사람 순서가 달라도 서버에는 다른 본문이다 */
function signatureOf(input: ExpenseInput): string {
  return JSON.stringify([
    input.title,
    input.amountMinor,
    input.payerMemberId,
    input.participantMemberIds,
  ]);
}

/**
 * 이번에 보낼 시도.
 * 앞 시도와 입력이 같으면 그대로 돌려준다. 응답만 놓친 경우 서버가 이미 등록한 지출을 다시 준다.
 * 입력이 바뀌었거나 앞 시도가 없으면(처음이거나 앞 시도가 성공함) 키와 지출 시각을 새로 만든다
 */
export function nextCreateAttempt(
  previous: CreateAttempt | null,
  input: ExpenseInput,
  make: () => { key: string; spentAt: string },
): CreateAttempt {
  const signature = signatureOf(input);
  if (previous && previous.signature === signature) return previous;
  return { signature, ...make() };
}
