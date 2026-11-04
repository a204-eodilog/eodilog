const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 서버 date(YYYY-MM-DD)를 기기 시간대의 날짜로 읽는다. 형식이 틀리면 null */
export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "11.14(토)" */
export function formatShortDate(date: Date): string {
  return `${date.getMonth() + 1}.${date.getDate()}(${WEEKDAYS[date.getDay()]})`;
}

/** "11.14(토) – 11.15(일)". 하루면 날짜 하나, 날짜 미정이면 "날짜 미정" */
export function formatTripPeriod(start: string | null, end: string | null): string {
  const s = parseDate(start);
  const e = parseDate(end);
  if (!s && !e) return '날짜 미정';
  if (s && e && s.getTime() !== e.getTime()) {
    return `${formatShortDate(s)} – ${formatShortDate(e)}`;
  }
  return formatShortDate((s ?? e) as Date);
}

/** "1박 2일". 하루면 "당일치기", 날짜 미정이면 null */
export function formatTripNights(start: string | null, end: string | null): string | null {
  const s = parseDate(start);
  const e = parseDate(end);
  if (!s || !e) return null;
  const nights = Math.max(0, Math.round((e.getTime() - s.getTime()) / DAY_MS));
  return nights === 0 ? '당일치기' : `${nights}박 ${nights + 1}일`;
}
