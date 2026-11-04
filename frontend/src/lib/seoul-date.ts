import dayjs from 'dayjs';

/** 서버의 여행 상태 계산과 같은 기준(Asia/Seoul). 한국은 서머타임이 없어 UTC+9 고정이다 */
const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** 서울 기준 오늘 날짜 'YYYY-MM-DD' */
export function seoulToday(now: Date = new Date()): string {
  return new Date(now.getTime() + SEOUL_OFFSET_MS).toISOString().slice(0, 10);
}

/** 두 날짜('YYYY-MM-DD') 사이 일 수. to가 뒤면 양수 */
export function daysBetween(from: string, to: string): number {
  return dayjs(to).diff(dayjs(from), 'day');
}

/** '2026-11-14' → '11.14(토)' */
export function formatDay(date: string): string {
  const d = dayjs(date);
  return `${d.format('MM.DD')}(${WEEKDAYS[d.day()]})`;
}

/** 기간 표시. 당일이면 하루만 쓴다: '11.14(토) – 11.15(일)' */
export function formatRange(start: string, end: string): string {
  if (start === end) return formatDay(start);
  return `${formatDay(start)} – ${formatDay(end)}`;
}

/** 'YYYY-MM-DD'에 n일을 더한다 */
export function addDays(date: string, n: number): string {
  return dayjs(date).add(n, 'day').format('YYYY-MM-DD');
}
