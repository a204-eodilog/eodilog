import { addDays, formatDay } from '@/lib/seoul-date';

import type { ItineraryItem, Visit } from './types';

/** photo 사진으로 확인됨 / manual 직접 체크함 / planned 계획에만 있음 */
export type VisitRowState = 'photo' | 'manual' | 'planned';

export type VisitRow = {
  itemId: string;
  placeId: string;
  placeName: string;
  day: number;
  /** 일차 안 순서. 번호 동그라미에 쓴다 */
  number: number;
  /** 'HH:mm' 또는 null */
  time: string | null;
  state: VisitRowState;
  /** 이 장소의 내 방문. 계획에만 있으면 null */
  visit: Visit | null;
};

export type VisitDay = {
  day: number;
  /** "1일차 · 11.14(토)". 여행 기간이 없으면 "1일차" */
  title: string;
  rows: VisitRow[];
};

/** 일차 제목. 시작일이 있으면 그날부터 센 날짜를 붙인다 */
export function dayTitle(day: number, startDate: string | null): string {
  if (!startDate) return `${day}일차`;
  return `${day}일차 · ${formatDay(addDays(startDate, day - 1))}`;
}

/**
 * 코스 항목에 내 방문을 붙여 일차별로 묶는다. 일차·순서 순.
 * 방문은 장소 하나에 하나라서 같은 장소가 코스에 두 번 있으면 두 줄 모두 다녀온 곳이 된다.
 * 코스에 없는 장소의 방문은 장소 이름을 알 수 없어 여기에 보이지 않는다
 */
export function buildVisitDays(
  items: ItineraryItem[],
  visits: Visit[],
  startDate: string | null,
): VisitDay[] {
  const visitByPlace = new Map(visits.map((v) => [v.placeId, v]));
  const sorted = [...items].sort((a, b) => a.day - b.day || a.order - b.order);
  const days: VisitDay[] = [];
  for (const item of sorted) {
    let group = days[days.length - 1];
    if (!group || group.day !== item.day) {
      group = { day: item.day, title: dayTitle(item.day, startDate), rows: [] };
      days.push(group);
    }
    const visit = visitByPlace.get(item.place.id) ?? null;
    group.rows.push({
      itemId: item.id,
      placeId: item.place.id,
      placeName: item.place.name,
      day: item.day,
      number: item.order,
      time: item.startTime,
      state: !visit ? 'planned' : visit.evidenceType === 'PHOTO' ? 'photo' : 'manual',
      visit,
    });
  }
  return days;
}

/**
 * 목록 위 요약 문장. 다녀온 곳이 없으면 null(대신 "사진으로 찾은 방문 장소가 없어요" 상자).
 * 사진으로만 찾았고 아직 평가가 없으면 "사진으로 다녀온 곳 3곳을 찾았어요",
 * 직접 체크했거나 평가를 남기기 시작하면 "다녀온 곳 4곳 중 1곳 평가했어요"
 */
export function visitSummary(days: VisitDay[]): string | null {
  const visited = new Map<string, Visit>();
  for (const row of days.flatMap((d) => d.rows)) {
    if (row.visit) visited.set(row.placeId, row.visit);
  }
  if (visited.size === 0) return null;
  const list = [...visited.values()];
  const reviewed = list.filter((v) => v.reviewScore !== null).length;
  const photoOnly = list.every((v) => v.evidenceType === 'PHOTO');
  if (photoOnly && reviewed === 0) return `사진으로 다녀온 곳 ${visited.size}곳을 찾았어요`;
  return `다녀온 곳 ${visited.size}곳 중 ${reviewed}곳 평가했어요`;
}

/** 서울 시각 → ISO(UTC). 한국은 서머타임이 없어 +09:00 고정 */
function seoulInstant(date: string, time: string): number {
  return Date.parse(`${date}T${time}:00+09:00`);
}

/** 시각이 없는 코스 항목을 과거 날짜에 체크할 때 쓰는 시각 */
const DEFAULT_TIME = '12:00';

/**
 * '다녀옴'으로 보낼 방문 시각. 코스에 잡힌 날짜·시각이 이미 지났으면 그 시각을,
 * 아직 안 왔거나 여행 기간이 없으면 지금을 보낸다(서버는 미래 시각을 받지 않는다)
 */
export function manualVisitedAt(
  startDate: string | null,
  day: number,
  startTime: string | null,
  now: Date = new Date(),
): string {
  if (!startDate) return now.toISOString();
  const planned = seoulInstant(addDays(startDate, day - 1), startTime ?? DEFAULT_TIME);
  if (Number.isNaN(planned) || planned > now.getTime()) return now.toISOString();
  return new Date(planned).toISOString();
}
