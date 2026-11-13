import type { TripStatus } from '@/api/types';
import { formatTotalShort } from '@/lib/format-number';
import { daysBetween } from '@/lib/seoul-date';

import type { PlaceTimelineItem, TimelineItem, TimelinePlace, TripSummary } from './types';

/**
 * 여행 시작일 최신순, 날짜 없는 여행은 맨 아래(결정 Q-7·8). 같은 날은 tripId 큰 것부터(명세 제안).
 * 서버가 이미 이 순서로 주지만 페이지를 이어 붙인 뒤에도 같게 한 번 더 맞춘다
 */
export function sortTimeline(items: TimelineItem[]): TimelineItem[] {
  return [...items].sort((a, b) => {
    if (a.date !== b.date) {
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date < b.date ? 1 : -1;
    }
    return a.tripId < b.tripId ? 1 : a.tripId > b.tripId ? -1 : 0;
  });
}

export type TripTag = { label: string; tone: 'neutral' | 'brand' | 'brandSoft' };

/** 여행 머리 태그(N4 태그와 같은 말). 계획 중 > 게시됨 > 비공개 */
export function tripTag(status: TripStatus, feedId: string | null): TripTag {
  if (status === 'PLANNING') return { label: '계획 중', tone: 'brandSoft' };
  if (feedId) return { label: '게시됨', tone: 'brand' };
  return { label: '비공개', tone: 'neutral' };
}

/** 서울 기준 날짜·시각. '2026-11-14T01:00:00Z' → { day: '11.14', time: '10:00' } */
export function seoulClock(iso: string): { day: string; time: string } {
  const seoul = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000).toISOString();
  return { day: `${seoul.slice(5, 7)}.${seoul.slice(8, 10)}`, time: seoul.slice(11, 16) };
}

export type PlaceRow = {
  key: string;
  /** 같은 날 둘째 줄부터, 날짜가 없는 줄은 null */
  day: string | null;
  name: string;
  /** "10:00 · 가지 않았어요 · 사진 3장" */
  sub: string;
  /** 실제 다녀온 곳(초록 점). 아니면 회색 점 */
  visited: boolean;
  /** 다녀온 여행인데 가지 않은 곳: "계획만" 표시 */
  planOnly: boolean;
};

/**
 * S41 장소 줄. 서버 순서(일정 순)를 그대로 둔다.
 * 값 문서의 "개인 즐겨찾기에서 담음"은 PlaceTimelineItem에 담은 경로 값이 없어 "시간 미정"으로 쓴다
 */
export function placeRows(items: PlaceTimelineItem[], tripStatus: TripStatus): PlaceRow[] {
  let lastDay: string | null = null;
  return items.map((item, i) => {
    const when = item.visitedAt ?? item.plannedAt;
    const clock = when ? seoulClock(when) : null;
    const day = clock && clock.day !== lastDay ? clock.day : null;
    if (clock) lastDay = clock.day;
    const visited = item.status === 'VISITED';
    const planOnly = !visited && tripStatus === 'COMPLETED';
    const parts = [
      clock?.time,
      planOnly ? '가지 않았어요' : null,
      item.photoCount > 0 ? `사진 ${item.photoCount}장` : null,
    ].filter((p): p is string => !!p);
    return {
      key: `${item.place.id}-${i}`,
      day,
      name: item.place.name,
      sub: parts.length > 0 ? parts.join(' · ') : '시간 미정',
      visited,
      planOnly,
    };
  });
}

/** "1박 2일", 하루짜리는 "당일". 기간을 안 정했으면 null */
export function tripLength(startDate: string | null, endDate: string | null): string | null {
  if (!startDate || !endDate) return null;
  const nights = daysBetween(startDate, endDate);
  if (nights <= 0) return '당일';
  return `${nights}박 ${nights + 1}일`;
}

/** "약 38km", 10km 아래는 소수 첫째 자리("약 3.2km"), 1km 아래는 "약 800m". 없으면 null */
export function formatDistance(meters: number | null): string | null {
  if (meters === null || meters < 0) return null;
  if (meters < 1000) return `약 ${Math.round(meters / 100) * 100}m`;
  const km = meters / 1000;
  return `약 ${km < 10 ? Math.round(km * 10) / 10 : Math.round(km)}km`;
}

export type SummaryCell = { label: string; value: string | null };

/**
 * S42 값 세 칸과 빠진 항목 안내. null 값은 화면에서 "미입력".
 * 셋째 칸은 경비, 경비가 없고 다녀온 곳이 있으면 "다녀온 곳 N곳"(값 문서의 "또는")
 */
export function summaryCells(
  summary: TripSummary,
  trip: { startDate: string | null; endDate: string | null },
): { cells: SummaryCell[]; note: string | null } {
  const distance = summary.actualDistanceMeters ?? summary.plannedDistanceMeters;
  const amount = summary.totalAmountMinor;
  const third: SummaryCell =
    amount !== null
      ? { label: '경비', value: formatTotalShort(amount) }
      : summary.visitedPlaceCount > 0
        ? { label: '다녀온 곳', value: `${summary.visitedPlaceCount}곳` }
        : { label: '경비', value: null };
  const noCourse = distance === null && summary.visitedPlaceCount === 0;
  const note =
    amount === null && noCourse
      ? '코스·경비 아직 없음'
      : amount === null
        ? '경비를 입력하지 않아 넣지 않았어요'
        : null;
  return {
    cells: [
      { label: '기간', value: tripLength(trip.startDate, trip.endDate) },
      { label: '이동거리', value: formatDistance(distance) },
      third,
    ],
    note,
  };
}

export type SketchPoint = { key: string; x: number; y: number };

/**
 * S42 지도 그림의 경로 점. 위경도를 상자(width x height, 둘레 pad)에 비율을 지켜 맞춘다.
 * 경도는 위도에 따라 줄어들어 cos(위도)를 곱한다. 장소가 하나면 가운데
 */
export function sketchPoints(
  places: Pick<TimelinePlace, 'id' | 'latitude' | 'longitude'>[],
  width: number,
  height: number,
  pad: number,
): SketchPoint[] {
  if (places.length === 0) return [];
  const midLat = places.reduce((s, p) => s + p.latitude, 0) / places.length;
  const k = Math.cos((midLat * Math.PI) / 180);
  const xs = places.map((p) => p.longitude * k);
  const ys = places.map((p) => -p.latitude);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX;
  const spanY = Math.max(...ys) - minY;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const scale = Math.min(
    spanX > 0 ? innerW / spanX : Infinity,
    spanY > 0 ? innerH / spanY : Infinity,
  );
  const s = Number.isFinite(scale) ? scale : 0;
  const offX = pad + (innerW - spanX * s) / 2;
  const offY = pad + (innerH - spanY * s) / 2;
  return places.map((p, i) => ({
    key: `${p.id}-${i}`,
    x: offX + (xs[i] - minX) * s,
    y: offY + (ys[i] - minY) * s,
  }));
}

export type MonthGroup<T> = {
  /** "2026-11". 날짜를 안 정한 여행은 "none" */
  key: string;
  /** 달 숫자 "11월". 날짜를 안 정했으면 "미정" */
  month: string;
  /** "2026년". 날짜를 안 정했으면 null */
  year: string | null;
  entries: T[];
};

/**
 * 타임라인을 여행 시작 달마다 묶는다. 받은 순서(최신순, 날짜 없는 여행은 맨 아래)를 그대로 지킨다.
 * 여행이 한 줄로 죽 이어지면 언제 것인지 가려 보기 어려워 달 머리로 나눈다
 */
export function groupByMonth<T>(
  entries: readonly T[],
  startDateOf: (entry: T) => string | null,
): MonthGroup<T>[] {
  const groups: MonthGroup<T>[] = [];
  for (const entry of entries) {
    const date = startDateOf(entry);
    const key = date ? date.slice(0, 7) : 'none';
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.entries.push(entry);
      continue;
    }
    groups.push({
      key,
      month: date ? `${Number(date.slice(5, 7))}월` : '미정',
      year: date ? `${date.slice(0, 4)}년` : null,
      entries: [entry],
    });
  }
  return groups;
}

/** 여행 카드에 처음 보이는 장소 줄 수. 넘치면 접어 두고 화살표로 편다 */
export const ROWS_SHOWN = 3;
