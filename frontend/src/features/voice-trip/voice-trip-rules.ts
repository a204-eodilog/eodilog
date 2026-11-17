// 실험: 말로 새 여행 만들기. AI 서버 계약은 ai/app/features/voice_trip (POST /ai/v1/voice-trip/jobs 등)
import { DEFAULT_MODE } from '@/features/course/course-rules';
import type { ItineraryWrite } from '@/features/course/types';
import type { Place } from '@/features/place/types';
import { shortRegionName } from '@/features/trip/trip-rules';
import type { Region } from '@/features/trip/types';

/** AI가 네이버 검색으로 찾은 장소. 우리 서버 장소 ID는 없다 */
export type AiPlace = {
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  provider: string;
  providerPlaceId: string;
  category: string | null;
};

export type SaidName = { name: string; said: string | null };

export type VoiceItem = {
  key: string;
  day: number;
  said: string | null;
  /** "점심", "저녁"처럼 말한 때 */
  label: string | null;
  startTime: string | null;
  /** 검색에 쓴 말. 장소를 못 찾았으면 이 말로 빈칸을 보인다 */
  query: string;
  place: AiPlace | null;
  /** 종류만 말해 AI가 고른 곳 */
  aiPicked: boolean;
};

export type TripVoiceDraft = {
  title: string;
  titleByAi: boolean;
  destinations: SaidName[];
  startDate: string | null;
  endDate: string | null;
  datesSaid: string | null;
  dayCount: number;
  /** 말한 순서. 같은 날 안의 순서가 코스 순서다 */
  items: VoiceItem[];
  transcript: string;
};

export type JobStep = 'TRANSCRIBING' | 'UNDERSTANDING' | 'SEARCHING' | 'DONE';
export type TripJobView = {
  jobId: string;
  status: 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  step: JobStep;
  searched: number;
  toSearch: number;
  audioSeconds: number | null;
  draft: TripVoiceDraft | null;
  error: { code: string; message: string } | null;
};

export type FixOp = {
  op:
    'setTitle' | 'setDestinations' | 'setDates' | 'add' | 'remove' | 'move' | 'setTime' | 'replace';
  key?: string | null;
  day?: number | null;
  title?: string | null;
  names?: string[] | null;
  startDate?: string | null;
  endDate?: string | null;
  query?: string | null;
  label?: string | null;
  said?: string | null;
  startTime?: string | null;
  place?: AiPlace | null;
  aiPicked?: boolean | null;
};

export type FixResult = { transcript: string; ops: FixOp[]; changes: string[] };
export type Candidate = { place: AiPlace; distanceMeters: number | null };

/** 고친 뒤 파랗게 보일 것 */
export type Changed = {
  keys: Set<string>;
  title: boolean;
  destinations: boolean;
  dates: boolean;
};

export const NO_CHANGE: Changed = {
  keys: new Set(),
  title: false,
  destinations: false,
  dates: false,
};

const MAX_DAYS = 10;

/** 'YYYY-MM-DD' 두 날 사이 일수(양 끝 포함) */
export function spanDays(start: string, end: string): number {
  const ms = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}

/** 그날 항목(말한 순서) */
export function dayItems(draft: TripVoiceDraft, day: number): VoiceItem[] {
  return draft.items.filter((i) => i.day === day);
}

export function itemName(item: VoiceItem): string {
  return item.place?.name ?? item.query;
}

/** 날 수가 줄면 넘치는 날의 항목은 마지막 날로 모은다 */
function clampDays(items: VoiceItem[], dayCount: number): VoiceItem[] {
  return items.map((i) => (i.day > dayCount ? { ...i, day: dayCount } : i));
}

/** 끼니·때를 하루 중 분으로. 말한 시각이 있으면 시각이 먼저다 */
const LABEL_MINUTES: Record<string, number> = {
  아침: 8 * 60,
  오전: 10 * 60,
  점심: 12 * 60,
  오후: 15 * 60,
  저녁: 18 * 60,
  밤: 21 * 60,
};

function whenMinutes(item: Pick<VoiceItem, 'startTime' | 'label'>): number | null {
  if (item.startTime) {
    const [h, m] = item.startTime.split(':').map(Number);
    return h * 60 + m;
  }
  return item.label ? (LABEL_MINUTES[item.label] ?? null) : null;
}

/**
 * 그날에 넣는다. 끼니나 시각이 있으면 그보다 늦은 첫 항목 앞에, 없으면 그날 맨 끝에
 * ("둘째 날 점심"이 저녁 뒤로 가지 않게)
 */
function insertAtDayEnd(items: VoiceItem[], item: VoiceItem): VoiceItem[] {
  const when = whenMinutes(item);
  if (when !== null) {
    const later = items.findIndex((i) => {
      if (i.day !== item.day) return false;
      const other = whenMinutes(i);
      return other !== null && other > when;
    });
    if (later >= 0) return [...items.slice(0, later), item, ...items.slice(later)];
  }
  let at = -1;
  items.forEach((i, index) => {
    if (i.day <= item.day) at = index;
  });
  return [...items.slice(0, at + 1), item, ...items.slice(at + 1)];
}

/** 날짜를 손으로 정했다. 날 수를 맞추고 넘치는 항목은 마지막 날로 */
export function withDates(draft: TripVoiceDraft, start: string, end: string): TripVoiceDraft {
  const dayCount = Math.min(MAX_DAYS, spanDays(start, end));
  return {
    ...draft,
    startDate: start,
    endDate: end,
    datesSaid: null,
    dayCount,
    items: clampDays(draft.items, dayCount),
  };
}

/** 말로 고친 명령을 초안에 적용한다. 바뀐 것을 함께 돌려줘 화면이 파랗게 보인다 */
export function applyFix(
  draft: TripVoiceDraft,
  ops: FixOp[],
): { draft: TripVoiceDraft; changed: Changed } {
  let next = { ...draft, items: [...draft.items] };
  const changed: Changed = { keys: new Set(), title: false, destinations: false, dates: false };
  for (const op of ops) {
    if (op.op === 'setTitle' && op.title) {
      next = { ...next, title: op.title, titleByAi: false };
      changed.title = true;
    } else if (op.op === 'setDestinations' && op.names) {
      next = { ...next, destinations: op.names.map((name) => ({ name, said: null })) };
      changed.destinations = true;
    } else if (op.op === 'setDates' && op.startDate && op.endDate) {
      next = withDates(next, op.startDate, op.endDate);
      changed.dates = true;
    } else if (op.op === 'add' && op.key && op.day && op.place) {
      const item: VoiceItem = {
        key: op.key,
        day: op.day,
        said: op.said ?? null,
        label: op.label ?? null,
        startTime: op.startTime ?? null,
        query: op.query ?? op.place.name,
        place: op.place,
        aiPicked: !!op.aiPicked,
      };
      next = {
        ...next,
        dayCount: Math.max(next.dayCount, op.day),
        items: insertAtDayEnd(next.items, item),
      };
      changed.keys.add(op.key);
    } else if (op.key && next.items.some((i) => i.key === op.key)) {
      const key = op.key;
      const current = next.items.find((i) => i.key === key)!;
      if (op.op === 'remove') {
        next = { ...next, items: next.items.filter((i) => i.key !== key) };
        changed.keys.delete(key);
      } else if (op.op === 'move' && op.day) {
        const rest = next.items.filter((i) => i.key !== key);
        next = {
          ...next,
          dayCount: Math.max(next.dayCount, op.day),
          items: insertAtDayEnd(rest, { ...current, day: op.day }),
        };
        changed.keys.add(key);
      } else if (op.op === 'setTime' && op.startTime) {
        next = replaceItem(next, { ...current, startTime: op.startTime });
        changed.keys.add(key);
      } else if (op.op === 'replace' && op.place) {
        next = replaceItem(next, {
          ...current,
          place: op.place,
          query: op.query ?? current.query,
          aiPicked: !!op.aiPicked,
        });
        changed.keys.add(key);
      }
    }
  }
  return { draft: next, changed };
}

export function replaceItem(draft: TripVoiceDraft, item: VoiceItem): TripVoiceDraft {
  return { ...draft, items: draft.items.map((i) => (i.key === item.key ? item : i)) };
}

export function removeItem(draft: TripVoiceDraft, key: string): TripVoiceDraft {
  return { ...draft, items: draft.items.filter((i) => i.key !== key) };
}

/** 같은 날 안에서 한 칸 위·아래로 */
export function shiftItem(draft: TripVoiceDraft, key: string, delta: -1 | 1): TripVoiceDraft {
  const item = draft.items.find((i) => i.key === key);
  if (!item) return draft;
  const same = dayItems(draft, item.day);
  const at = same.findIndex((i) => i.key === key);
  const other = same[at + delta];
  if (!other) return draft;
  const items = [...draft.items];
  const a = items.findIndex((i) => i.key === key);
  const b = items.findIndex((i) => i.key === other.key);
  [items[a], items[b]] = [items[b], items[a]];
  return { ...draft, items };
}

/** 손으로 장소를 그날 끝에 넣는다 */
export function addPicked(
  draft: TripVoiceDraft,
  day: number,
  place: AiPlace,
  key: string,
): TripVoiceDraft {
  const item: VoiceItem = {
    key,
    day,
    said: null,
    label: null,
    startTime: null,
    query: place.name,
    place,
    aiPicked: false,
  };
  return { ...draft, items: insertAtDayEnd(draft.items, item) };
}

const ADMIN_SUFFIX = /(특별자치시|특별자치도|광역시|특별시|시|군|구)$/;
const bare = (name: string) => name.replace(/\s+/g, '').replace(ADMIN_SUFFIX, '');

/**
 * 말한 여행지("부산", "경주")에 맞는 지역을 고른다. 짧은 이름이 같은 곳 중 가장 큰 단위(이름 조각이 적은 곳).
 * 없으면 null(여행지는 비워 두고 나중에 정한다)
 */
export function pickRegion(said: string, regions: Region[]): Region | null {
  const want = bare(said);
  if (!want) return null;
  const same = regions
    .filter((r) => bare(shortRegionName(r.name)) === want)
    .sort((a, b) => a.name.split(/\s+/).length - b.name.split(/\s+/).length);
  return same[0] ?? null;
}

/**
 * 만든 여행에 넣을 코스 본문. 우리 장소로 바꾸지 못한 항목·기간 밖 날은 뺀다.
 * 날마다 order를 1부터 매기고 인접 쌍마다 기본 수단 구간을 하나 만든다(코스 화면의 toWrite와 같다)
 */
export function toItineraryWrite(
  draft: TripVoiceDraft,
  placeIdByKey: ReadonlyMap<string, string>,
  expectedVersion: number,
): ItineraryWrite {
  const items: ItineraryWrite['items'] = [];
  const legs: ItineraryWrite['legs'] = [];
  for (let day = 1; day <= draft.dayCount; day += 1) {
    const list = dayItems(draft, day).filter((i) => placeIdByKey.has(i.key));
    list.forEach((item, index) => {
      items.push({
        placeId: placeIdByKey.get(item.key)!,
        day,
        order: index + 1,
        startTime: item.startTime,
        stayMinutes: null,
      });
      if (index > 0) {
        legs.push({ day, fromOrder: index, toOrder: index + 1, transportMode: DEFAULT_MODE });
      }
    });
  }
  return { expectedVersion, items, legs };
}

export type StepRow = { label: string; state: 'done' | 'now' | 'wait' };

/** 정리 중 화면의 단계 줄 */
export function stepRows(job: Pick<TripJobView, 'step' | 'searched' | 'toSearch'>): StepRow[] {
  const order: JobStep[] = ['TRANSCRIBING', 'UNDERSTANDING', 'SEARCHING', 'DONE'];
  const at = order.indexOf(job.step);
  const state = (i: number): StepRow['state'] => (i < at ? 'done' : i === at ? 'now' : 'wait');
  const searching =
    job.step === 'SEARCHING' && job.toSearch > 0
      ? `장소 찾기 ${job.toSearch}곳 중 ${job.searched}곳`
      : '장소 찾기';
  return [
    { label: '말 받아쓰기', state: state(0) },
    { label: '여행지·날짜·날마다 할 일 나누기', state: state(1) },
    { label: searching, state: state(2) },
    { label: '초안 만들기', state: state(3) },
  ];
}

/** '"…돼지국밥"이라고 말했어요'처럼 따옴표 말 뒤 조사를 받침에 맞춘다 */
export function saidLine(said: string): string {
  const last = said.trim().slice(-1);
  const code = last.charCodeAt(0) - 0xac00;
  const final = code >= 0 && code <= 11171 ? code % 28 : 0;
  return `"${said.trim()}"${final ? '이라고' : '라고'} 말했어요`;
}

/** "350m", "1.2km" */
export function formatDistance(meters: number | null): string | null {
  if (meters === null) return null;
  if (meters < 1000) return `${Math.round(meters / 10) * 10}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

/** "11.20(금) ~ 11.22(일)" */
export function rangeLabel(start: string, end: string): string {
  const day = (iso: string) => {
    const d = new Date(`${iso}T00:00:00Z`);
    return `${d.getUTCMonth() + 1}.${d.getUTCDate()}(${'일월화수목금토'[d.getUTCDay()]})`;
  };
  return `${day(start)} ~ ${day(end)}`;
}

/** n일차의 날짜 "11.20". 날짜가 없으면 null */
export function dayDateLabel(draft: TripVoiceDraft, day: number): string | null {
  if (!draft.startDate) return null;
  const d = new Date(`${draft.startDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + day - 1);
  return `${d.getUTCMonth() + 1}.${d.getUTCDate()}`;
}

/** 같은 가게로 보는 거리 */
const SAME_PLACE_METERS = 300;
const squash = (s: string) => s.replace(/\s+/g, '').toLowerCase();

/**
 * AI가 찾은 장소와 같은 우리 서버 장소를 고른다. 이름이 같거나 한쪽이 다른 쪽을 품고, 300m 안이어야 한다.
 * 없으면 null(부르는 쪽이 지도 위치로 새 장소를 만든다)
 */
export function matchOurPlace(ai: AiPlace, candidates: Place[]): Place | null {
  const name = squash(ai.name);
  const near = candidates
    .filter((p) => {
      const other = squash(p.name);
      return other === name || other.includes(name) || name.includes(other);
    })
    .map((p) => ({ p, m: meters(ai, p) }))
    .filter((x) => x.m <= SAME_PLACE_METERS)
    .sort((a, b) => a.m - b.m);
  return near[0]?.p ?? null;
}

function meters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const rad = Math.PI / 180;
  const x = (b.longitude - a.longitude) * rad * Math.cos(((a.latitude + b.latitude) / 2) * rad);
  const y = (b.latitude - a.latitude) * rad;
  return Math.sqrt(x * x + y * y) * 6_371_000;
}
