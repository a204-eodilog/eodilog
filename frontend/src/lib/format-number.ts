/** 숫자 입력·표시에 쓰는 공통 함수. 원화는 소수점이 없어 0 이상 정수만 다룬다(음수 부호는 지워진다). */

/**
 * 금액 상한. 서버 amountMinor는 정수인데, JS 숫자는 이보다 크면 정확하지 않아 입력을 막는다.
 * 쉼표를 넣으면 21글자("9,007,199,254,740,991")라 입력칸 maxLength는 이 값을 쓴다
 */
export const AMOUNT_MAX = Number.MAX_SAFE_INTEGER;
export const AMOUNT_MAX_LENGTH = 21;

/** 입력 글자에서 숫자만 남긴다. "21,000원" → "21000" */
export function digitsOnly(text: string): string {
  return text.replace(/\D/g, '');
}

/** 숫자 문자열에 천 단위 쉼표를 넣는다. "21000" → "21,000". 비어 있으면 빈 문자열. 0 이상만 */
export function formatThousands(text: string | number): string {
  const digits = digitsOnly(String(text)).replace(/^0+(?=\d)/, '');
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 입력이 상한(AMOUNT_MAX)을 넘는지. 넘으면 "금액이 너무 커요"를 보여 준다 */
export function exceedsAmountMax(text: string): boolean {
  const digits = digitsOnly(text).replace(/^0+(?=\d)/, '');
  const max = String(AMOUNT_MAX);
  return digits.length > max.length || (digits.length === max.length && digits > max);
}

/**
 * 쉼표가 든 입력을 정수로. 비어 있거나 상한을 넘으면 null. 서버 amountMinor에 그대로 보낸다.
 * 비어 있는 것과 너무 큰 것을 구분하려면 exceedsAmountMax를 같이 본다
 */
export function parseAmount(text: string): number | null {
  const digits = digitsOnly(text);
  if (!digits || exceedsAmountMax(digits)) return null;
  return Number(digits);
}

/** 원화 표시. 1234567 → "1,234,567원". 0 이상만 */
export function formatWon(amount: number): string {
  return `${formatThousands(amount)}원`;
}
