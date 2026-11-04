import type { MyTrip, MyTripStatus } from './types';

export type MyTripGroup = { status: MyTripStatus; title: string; trips: MyTrip[] };

/**
 * N4 묶음. 값 문서는 "다녀온 여행"·"계획 중인 여행" 두 묶음만 그렸다.
 * 여행 중인 여행은 문서에 없어 맨 위 "여행 중"으로 따로 둔다. 비어 있는 묶음은 보여 주지 않는다
 */
const GROUP_ORDER: { status: MyTripStatus; title: string }[] = [
  { status: 'ONGOING', title: '여행 중' },
  { status: 'COMPLETED', title: '다녀온 여행' },
  { status: 'PLANNING', title: '계획 중인 여행' },
];

/** 서버 순서(최근 만든 순)를 묶음 안에서 그대로 둔다 */
export function groupMyTrips(trips: MyTrip[]): MyTripGroup[] {
  return GROUP_ORDER.map((g) => ({
    ...g,
    trips: trips.filter((t) => t.status === g.status),
  })).filter((g) => g.trips.length > 0);
}

/** "2026-11-14" → "11.14" */
function monthDay(date: string): string {
  const [, month, day] = date.split('-');
  return `${month}.${day}`;
}

/** "11.14 – 11.15". 하루짜리는 "11.14", 기간을 안 정했으면 null */
export function formatPeriod(startDate: string | null, endDate: string | null): string | null {
  if (!startDate || !endDate) return null;
  if (startDate === endDate) return monthDay(startDate);
  return `${monthDay(startDate)} – ${monthDay(endDate)}`;
}

/** 나를 뺀 동행 이름, 참여 순. "서연, 민준". 혼자면 빈 문자열 */
export function companionNames(trip: MyTrip, myUserId: string | undefined): string {
  return [...trip.members]
    .sort((a, b) => a.joinOrder - b.joinOrder)
    .filter((m) => m.user.id !== myUserId)
    .map((m) => m.user.nickname)
    .join(', ');
}
