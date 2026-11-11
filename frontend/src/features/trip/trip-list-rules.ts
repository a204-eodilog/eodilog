import { daysBetween } from '@/lib/seoul-date';

import { dayIndex, dDay, stayLabel } from './trip-rules';
import type { Trip } from './types';

/** 여행 탭에서 다음 계획을 처음에 보이는 수. 더 있으면 "더 보기"로 펼친다 */
export const NEXT_VISIBLE_LIMIT = 3;

/** 여행 탭의 묶음. 다음 계획은 파랑 달력 칸과 파랑 굵은 글, 다녀온 여행은 회색 달력 칸과 회색 글 */
export type TripListKind = 'next' | 'past';

/**
 * 여행 탭 줄·카드의 둘째 줄 앞 글.
 * 다음 계획은 "D-17"(시작 전)이나 "2일차"(여행 중), 다녀온 여행은 "1박 2일"이고 올해가 아니면 앞에 연도를 붙인다.
 * 날짜가 없으면 null
 */
export function tripListLead(trip: Trip, kind: TripListKind, today: string): string | null {
  if (kind === 'next') {
    const d = dDay(trip, today);
    if (d !== null) return `D-${d}`;
    const n = dayIndex(trip, today);
    return n !== null ? `${n}일차` : null;
  }
  const stay =
    trip.startDate && trip.endDate ? stayLabel(daysBetween(trip.startDate, trip.endDate)) : null;
  const otherYear = trip.startDate && trip.startDate.slice(0, 4) !== today.slice(0, 4);
  const lead = [otherYear ? trip.startDate?.slice(0, 4) : null, stay].filter(Boolean).join(' · ');
  return lead || null;
}

/**
 * 다음 계획에서 지금 보일 여행과 접혀 있는 수.
 * 가까운 순으로 NEXT_VISIBLE_LIMIT개까지 보이고, 펼치면 모두 보인다
 */
export function visibleNextTrips<T>(
  trips: readonly T[],
  expanded: boolean,
): { shown: readonly T[]; hiddenCount: number; canToggle: boolean } {
  const canToggle = trips.length > NEXT_VISIBLE_LIMIT;
  const shown = expanded || !canToggle ? trips : trips.slice(0, NEXT_VISIBLE_LIMIT);
  return { shown, hiddenCount: trips.length - shown.length, canToggle };
}
