/** 숫자 입력·표시에 쓰는 공통 함수. 원화는 소수점이 없어 정수만 다룬다. */

/** 입력 글자에서 숫자만 남긴다. "21,000원" → "21000" */
export function digitsOnly(text: string): string {
  return text.replace(/\D/g, '');
}

/** 숫자 문자열에 천 단위 쉼표를 넣는다. "21000" → "21,000". 비어 있으면 빈 문자열 */
export function formatThousands(text: string | number): string {
  const digits = digitsOnly(String(text)).replace(/^0+(?=\d)/, '');
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 쉼표가 든 입력을 정수로. 비어 있으면 null. 서버 amountMinor에 그대로 보낸다 */
export function parseAmount(text: string): number | null {
  const digits = digitsOnly(text);
  return digits ? Number(digits) : null;
}

/** 원화 표시. 1234567 → "1,234,567원" */
export function formatWon(amount: number): string {
  return `${formatThousands(amount)}원`;
}
