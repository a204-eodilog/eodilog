import type { Place } from '@/features/place/types';
import { formatShortDate, parseDate } from '@/lib/format-date';

import type { CourseContent, Itinerary, ItineraryWrite, RouteLeg, TransportMode } from './types';

/** 서버가 받는 최대 항목 수 */
export const MAX_ITEMS = 200;
/** 새로 생기는 구간의 기본 수단(가정 Q-6-2) */
export const DEFAULT_MODE: TransportMode = 'TRANSIT';

export const MODE_LABEL: Record<TransportMode, string> = {
  TRANSIT: '대중교통',
  CAR: '자동차',
  WALK: '걷기',
};

/** 초안 한 칸. key는 화면 안에서만 쓰는 이름이고, 서버 항목이면 id와 같다 */
export type DraftItem = {
  key: string;
  id: string | null;
  place: Place;
  startTime: string | null;
  stayMinutes: number | null;
};

/**
 * 저장 전 화면에서 고치는 코스 사본. days[0]이 1일차다.
 * 구간 수단은 "앞 칸 key>뒤 칸 key"로 기억해 순서를 바꿔도 같은 쌍이면 수단이 남는다.
 * legs는 서버가 구한 구간 결과로, 같은 쌍이고 수단이 같을 때만 시간을 보인다.
 */
export type CourseDraft = {
  baseVersion: number;
  days: DraftItem[][];
  modes: Record<string, TransportMode>;
  legs: Record<string, RouteLeg>;
};

export const legKey = (from: DraftItem, to: DraftItem) => `${from.key}>${to.key}`;

/** 여행 기간 일수. 기간이 없으면 null */
export function dayCount(startDate: string | null, endDate: string | null): number | null {
  const s = parseDate(startDate);
  const e = parseDate(endDate);
  if (!s || !e) return null;
  return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1);
}

/** "11.14(토)". 기간이 없으면 null */
export function dayDate(startDate: string | null, day: number): string | null {
  const s = parseDate(startDate);
  if (!s) return null;
  const d = new Date(s.getFullYear(), s.getMonth(), s.getDate() + day - 1);
  return formatShortDate(d);
}

function emptyDays(n: number): DraftItem[][] {
  return Array.from({ length: Math.max(1, n) }, () => []);
}

/**
 * 서버 코스 → 초안. 일수가 정해져 있으면 그 수만큼 날을 만들고,
 * 일수보다 뒤 날짜의 항목은 마지막 날 끝으로 옮긴다(기간을 줄였을 때).
 */
export function toDraft(itinerary: Itinerary, days: number | null): CourseDraft {
  const maxDay = itinerary.items.reduce((m, i) => Math.max(m, i.day), 1);
  const count = days ?? maxDay;
  const result = emptyDays(count);
  const sorted = [...itinerary.items].sort((a, b) => a.day - b.day || a.order - b.order);
  for (const i of sorted) {
    const index = Math.min(i.day, result.length) - 1;
    result[index].push({
      key: i.id,
      id: i.id,
      place: i.place,
      startTime: i.startTime,
      stayMinutes: i.stayMinutes,
    });
  }
  const modes: Record<string, TransportMode> = {};
  const legs: Record<string, RouteLeg> = {};
  for (const l of itinerary.legs) {
    const k = `${l.fromItemId}>${l.toItemId}`;
    modes[k] = l.transportMode;
    legs[k] = l;
  }
  return { baseVersion: itinerary.version, days: result, modes, legs };
}

/**
 * 자동 추천 결과 → 초안. 기존 코스에 있던 항목은 그 id를 이어 쓰고 새 항목은 새 key를 붙인다.
 * AI가 준 구간 이동 시간도 함께 담아 "계산 전"이 아니라 시간을 보인다. 수단을 바꾸면 dayLegs가 버린다
 */
export function proposalToDraft(
  content: CourseContent,
  baseVersion: number,
  days: number | null,
  makeKey: () => string,
): CourseDraft {
  const maxDay = content.items.reduce((m, i) => Math.max(m, i.day), 1);
  const result = emptyDays(days ?? maxDay);
  const byPos = new Map<string, DraftItem>();
  const sorted = [...content.items].sort((a, b) => a.day - b.day || a.order - b.order);
  for (const i of sorted) {
    const d: DraftItem = {
      key: i.id ?? makeKey(),
      id: i.id ?? null,
      place: i.place,
      startTime: i.startTime,
      stayMinutes: i.stayMinutes,
    };
    result[Math.min(i.day, result.length) - 1].push(d);
    byPos.set(`${i.day}:${i.order}`, d);
  }
  const modes: Record<string, TransportMode> = {};
  const legs: Record<string, RouteLeg> = {};
  for (const l of content.legs) {
    const from = byPos.get(`${l.day}:${l.fromOrder}`);
    const to = byPos.get(`${l.day}:${l.toOrder}`);
    if (!from || !to) continue;
    const key = legKey(from, to);
    modes[key] = l.transportMode;
    if (l.status) {
      legs[key] = {
        fromItemId: from.key,
        toItemId: to.key,
        transportMode: l.transportMode,
        durationSeconds: l.durationSeconds ?? null,
        distanceMeters: l.distanceMeters ?? null,
        geometry: l.geometry ?? null,
        status: l.status,
        queriedAt: l.queriedAt ?? '',
      };
    }
  }
  return { baseVersion, days: result, modes, legs };
}

/** 빈 초안. 직접 만들기의 시작 */
export function emptyDraft(baseVersion: number, days: number): CourseDraft {
  return { baseVersion, days: emptyDays(days), modes: {}, legs: {} };
}

/** 초안 → PUT 본문. 날마다 order를 1부터 다시 매기고 인접 쌍마다 구간을 하나 만든다 */
export function toWrite(draft: CourseDraft): ItineraryWrite {
  const items: ItineraryWrite['items'] = [];
  const legs: ItineraryWrite['legs'] = [];
  draft.days.forEach((list, dayIndex) => {
    const day = dayIndex + 1;
    list.forEach((d, i) => {
      items.push({
        ...(d.id ? { id: d.id } : {}),
        placeId: d.place.id,
        day,
        order: i + 1,
        startTime: d.startTime,
        stayMinutes: d.stayMinutes,
      });
      if (i > 0) {
        legs.push({
          day,
          fromOrder: i,
          toOrder: i + 1,
          transportMode: draft.modes[legKey(list[i - 1], d)] ?? DEFAULT_MODE,
        });
      }
    });
  });
  return { expectedVersion: draft.baseVersion, items, legs };
}

/** 항목 수 */
export function itemCount(draft: CourseDraft): number {
  return draft.days.reduce((n, d) => n + d.length, 0);
}

/** 초안이 저장된 코스와 내용이 같은지. 같으면 저장 요청을 보내지 않는다 */
export function sameContent(draft: CourseDraft, saved: Itinerary): boolean {
  const a = toWrite(draft);
  const b = toWrite(toDraft(saved, null));
  const strip = (w: ItineraryWrite) => JSON.stringify({ items: w.items, legs: w.legs });
  return strip(a) === strip(b);
}

function withDays(draft: CourseDraft, days: DraftItem[][]): CourseDraft {
  return { ...draft, days };
}

/** 같은 날 안에서 한 칸 위(-1)·아래(+1)로 옮긴다. 끝을 넘으면 그대로 */
export function moveItem(draft: CourseDraft, day: number, index: number, delta: -1 | 1) {
  const list = draft.days[day];
  const target = index + delta;
  if (!list || target < 0 || target >= list.length) return draft;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return withDays(
    draft,
    draft.days.map((d, i) => (i === day ? next : d)),
  );
}

/** 칸을 뺀다. 앞뒤 칸 사이에는 새 구간(기본 수단)이 생긴다 */
export function removeItem(draft: CourseDraft, day: number, index: number): CourseDraft {
  return withDays(
    draft,
    draft.days.map((d, i) => (i === day ? d.filter((_, j) => j !== index) : d)),
  );
}

/** 칸의 장소를 바꾼다. 새 항목이 되며, 그 칸을 잇던 구간 수단은 그대로 이어 받는다 */
export function replacePlace(
  draft: CourseDraft,
  day: number,
  index: number,
  newPlace: Place,
  newKey: string,
): CourseDraft {
  const old = draft.days[day]?.[index];
  if (!old) return draft;
  const fresh: DraftItem = { ...old, key: newKey, id: null, place: newPlace };
  const modes: Record<string, TransportMode> = {};
  for (const [k, m] of Object.entries(draft.modes)) {
    const [from, to] = k.split('>');
    modes[`${from === old.key ? newKey : from}>${to === old.key ? newKey : to}`] = m;
  }
  return {
    ...draft,
    modes,
    days: draft.days.map((d, i) => (i === day ? d.map((x, j) => (j === index ? fresh : x)) : d)),
  };
}

/** 그 날 끝에 장소를 놓는다(직접 만들기) */
export function addPlace(draft: CourseDraft, day: number, p: Place, key: string): CourseDraft {
  const fresh: DraftItem = { key, id: null, place: p, startTime: null, stayMinutes: null };
  return withDays(
    draft,
    draft.days.map((d, i) => (i === day ? [...d, fresh] : d)),
  );
}

/** 구간 수단을 바꾼다 */
export function setLegMode(draft: CourseDraft, key: string, mode: TransportMode): CourseDraft {
  return { ...draft, modes: { ...draft.modes, [key]: mode } };
}

export type DayLeg = {
  key: string;
  mode: TransportMode;
  /** 서버가 구한 결과. 쌍과 수단이 저장된 것과 같을 때만 */
  info: RouteLeg | null;
};

/** 그 날의 구간들. i번째는 i번째 칸과 i+1번째 칸 사이 */
export function dayLegs(draft: CourseDraft, day: number): DayLeg[] {
  const list = draft.days[day] ?? [];
  return list.slice(1).map((to, i) => {
    const key = legKey(list[i], to);
    const mode = draft.modes[key] ?? DEFAULT_MODE;
    const saved = draft.legs[key];
    return { key, mode, info: saved && saved.transportMode === mode ? saved : null };
  });
}

/** "대중교통 22분". 시간을 모르면 null(0분이나 직선거리로 채우지 않는다) */
export function legLabel(leg: DayLeg): string | null {
  const seconds = leg.info?.status === 'AVAILABLE' ? leg.info.durationSeconds : null;
  if (seconds === null || seconds === undefined) return null;
  return `${MODE_LABEL[leg.mode]} ${Math.max(1, Math.round(seconds / 60))}분`;
}

/**
 * 시간이 없는 구간을 어떻게 보일지. pending은 "계산 전", failed는 "못 구했어요"와 다시 계산.
 * 백엔드에는 아직 경로 계산이 없어 저장한 구간이 모두 UNAVAILABLE이다. 이 값은 '조회 실패'와 '아직 조회 안 함'을
 * 함께 뜻해서 구분할 수 없다. 그래서 경로 계산이 생기기 전까지는 계산 전으로 보이고, 실패 화면은 미리보기에서만 쓴다
 * (가정 — 사용자 확인 필요, Q-6-6)
 */
export type NoTime = 'pending' | 'failed';

export function noTimeDefault(): NoTime {
  return 'pending';
}

/** 저장된 구간 중 시간을 구하지 못한 것이 있는지(S24 이동 시간 갱신 실패, S23 계산 불가) */
export function hasUnavailable(itinerary: Itinerary): boolean {
  return itinerary.legs.some((l) => l.status !== 'AVAILABLE' || l.durationSeconds === null);
}

/** 서울 시각으로 "10.26(월)"과 "20:40" */
function seoul(iso: string): { date: string; time: string } {
  const d = new Date(new Date(iso).getTime() + 9 * 3_600_000);
  const local = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: formatShortDate(local),
    time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
  };
}

/** "10.26(월) 세은님이 마지막으로 고쳤어요" */
export function editedLine(updatedAt: string, name: string): string {
  return `${seoul(updatedAt).date} ${name}님이 마지막으로 고쳤어요`;
}

/** "10.26(월) 20:40 기준" */
export function basisLine(iso: string): string {
  const s = seoul(iso);
  return `${s.date} ${s.time} 기준`;
}

/** 구간 결과 중 가장 늦게 구한 시각. 없으면 null */
export function latestQueriedAt(itinerary: Itinerary): string | null {
  return itinerary.legs.reduce<string | null>(
    (m, l) => (m === null || l.queriedAt > m ? l.queriedAt : m),
    null,
  );
}

/**
 * 날짜마다 갈 지역의 처음 값(가정 Q-6-3). 그 날 장소 지역 중 가장 많은 곳,
 * 장소가 없으면 여행지 순서를 날짜에 고르게 나눈다.
 */
export function dayRegions(draft: CourseDraft, regionIds: readonly string[]): string[] {
  if (regionIds.length === 0) return draft.days.map(() => '');
  return draft.days.map((list, i) => {
    const counts = new Map<string, number>();
    for (const d of list) {
      const r = d.place.regionId;
      if (r && regionIds.includes(r)) counts.set(r, (counts.get(r) ?? 0) + 1);
    }
    let best: string | null = null;
    for (const [r, n] of counts) if (best === null || n > (counts.get(best) ?? 0)) best = r;
    if (best) return best;
    const per = draft.days.length / regionIds.length;
    return regionIds[Math.min(regionIds.length - 1, Math.floor(i / per))];
  });
}

/** 초안에 이미 있는 장소 ID */
export function placedIds(draft: CourseDraft): Set<string> {
  return new Set(draft.days.flat().map((d) => d.place.id));
}
