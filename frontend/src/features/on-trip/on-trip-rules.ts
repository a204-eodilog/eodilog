import type { DraftItem } from '@/features/course/course-rules';
import { formatShortDate, parseDate } from '@/lib/format-date';

import type { HourlyWeather, Weather, WeatherAlternative } from './types';

/** 이 확률부터 비가 온다고 본다 */
export const RAIN_P = 0.3;
/** 이 확률부터 그 시간 일정이 비의 영향을 받는다고 본다(Q-10-3) */
export const AFFECT_P = 0.5;

const DAY_MS = 86_400_000;

export type TripPhase =
  | { kind: 'noDates' }
  | { kind: 'before'; daysLeft: number; startDate: string }
  /** day는 1부터, date는 YYYY-MM-DD */
  | { kind: 'during'; day: number; date: string }
  | { kind: 'after'; day: number; date: string };

const pad2 = (n: number) => String(n).padStart(2, '0');

/** 기기 날짜를 YYYY-MM-DD로 */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 오늘 날짜로 여행 단계를 정한다. 끝났으면 마지막 날을 보인다 */
export function tripPhase(start: string | null, end: string | null, now: Date): TripPhase {
  const s = parseDate(start);
  const e = parseDate(end) ?? s;
  if (!s || !e) return { kind: 'noDates' };
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const fromStart = Math.round((today.getTime() - s.getTime()) / DAY_MS);
  if (fromStart < 0) return { kind: 'before', daysLeft: -fromStart, startDate: start as string };
  const last = Math.round((e.getTime() - s.getTime()) / DAY_MS);
  if (fromStart > last) return { kind: 'after', day: last + 1, date: isoDate(e) };
  return { kind: 'during', day: fromStart + 1, date: isoDate(today) };
}

const LABEL: Record<string, string> = {
  CLEAR: '맑음',
  PARTLY_CLOUDY: '구름 조금',
  CLOUDY: '흐림',
  RAIN: '비',
  SHOWER: '소나기',
  SNOW: '눈',
  SLEET: '진눈깨비',
  FOG: '안개',
  THUNDER: '뇌우',
};

/** 날씨 상태 이름. 모르는 값은 그대로 */
export function conditionLabel(condition: string): string {
  return LABEL[condition] ?? condition;
}

/** 날씨 아이콘 이름 */
export function conditionIcon(condition: string): 'sun' | 'cloud' | 'cloud-rain' {
  if (condition === 'CLEAR') return 'sun';
  if (['RAIN', 'SHOWER', 'SNOW', 'SLEET', 'THUNDER'].includes(condition)) return 'cloud-rain';
  return 'cloud';
}

const pct = (p: number) => Math.round(p * 100);
const hourOf = (iso: string) => new Date(iso).getHours();
const sortedHours = (w: Weather) =>
  [...w.hourly].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
const wet = (h: HourlyWeather) => (h.precipitationProbability ?? 0) >= RAIN_P;

/** 하루 중 가장 높은 비 확률(%). 모르면 null */
export function rainChance(w: Weather): number | null {
  const values = [
    w.precipitationProbability,
    ...w.hourly.map((h) => h.precipitationProbability),
  ].filter((p): p is number => p !== null);
  return values.length > 0 ? pct(Math.max(...values)) : null;
}

/** 요약. 비 시간이 오전에 몰리면 "오전 비 70%", 비가 없으면 상태 이름 */
export function weatherHeadline(w: Weather): string {
  const rainy = w.hourly.filter(wet);
  if (rainy.length === 0) return conditionLabel(w.condition);
  const word = rainy.some((h) => h.condition === 'SNOW') ? '눈' : '비';
  const max = Math.max(...rainy.map((h) => h.precipitationProbability ?? 0));
  const morning = rainy.filter((h) => hourOf(h.at) < 12).length * 2 >= rainy.length;
  return `${morning ? '오전' : '오후'} ${word} ${pct(max)}%`;
}

/** 날짜별 예보 한 줄. 비 확률 30% 이상이면 "비 60%", 아니면 상태 이름 */
export function forecastLabel(w: Weather): string {
  const chance = rainChance(w);
  if (chance !== null && chance >= RAIN_P * 100) {
    return `${w.condition === 'SNOW' ? '눈' : '비'} ${chance}%`;
  }
  return conditionLabel(w.condition);
}

/** 비가 온 뒤 처음 그치는 시각. "12시부터 그쳐요". 그치지 않거나 비가 없으면 null */
export function clearsAt(w: Weather): string | null {
  const hours = sortedHours(w);
  const first = hours.findIndex(wet);
  if (first < 0) return null;
  const after = hours.slice(first).find((h) => !wet(h));
  return after ? `${hourOf(after.at)}시부터 그쳐요` : null;
}

/** "최고 14° 최저 9°". 모르면 null */
export function tempLine(w: Weather): string | null {
  if (w.maxCelsius === null || w.minCelsius === null) return null;
  return `최고 ${Math.round(w.maxCelsius)}° 최저 ${Math.round(w.minCelsius)}°`;
}

/** 시각 "HH:MM" */
export function clock(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** "11.14(토) 09:40" */
export function dateClock(iso: string): string {
  return `${formatShortDate(new Date(iso))} ${clock(iso)}`;
}

/** 그 시각이 지났으면 관측, 다가올 시각이면 예보(Q-10-2) */
export function hourKind(at: string, now: Date): '관측' | '예보' {
  return new Date(at).getTime() <= now.getTime() ? '관측' : '예보';
}

/** 시작 시각("HH:MM")의 시간별 비 확률 */
function chanceAt(w: Weather, startTime: string | null): number {
  if (!startTime) return 0;
  const hour = Number(startTime.slice(0, 2));
  return w.hourly.find((h) => hourOf(h.at) === hour)?.precipitationProbability ?? 0;
}

/**
 * 비 확률 50% 이상인 시간에 시작하는 첫 일정의 칸 번호. 없으면 null(Q-10-3).
 * now를 주면(오늘) 이미 시작 시각이 지난 일정은 건너뛴다
 */
export function affectedIndex(items: readonly DraftItem[], w: Weather, now?: Date): number | null {
  const current = now ? clock(now) : null;
  const i = items.findIndex(
    (item) =>
      (current === null || (item.startTime !== null && item.startTime >= current)) &&
      chanceAt(w, item.startTime) >= AFFECT_P,
  );
  return i >= 0 ? i : null;
}

/** 지금 이후 첫 일정의 칸 번호. 시각이 없는 일정은 건너뛴다 */
export function nextIndex(items: readonly DraftItem[], now: Date): number | null {
  const current = clock(now);
  const i = items.findIndex((item) => item.startTime !== null && item.startTime >= current);
  return i >= 0 ? i : null;
}

/**
 * 주변 편의시설의 기준 장소 ID. 다음 일정이 있으면 그 장소, 없으면 오늘 마지막 장소.
 * 오늘 일정을 다 마쳤으면 마지막 장소 근처에 있다고 본다. 장소가 없으면 null
 */
export function amenityBase(items: readonly DraftItem[], next: number | null): string | null {
  const item = next !== null ? items[next] : items[items.length - 1];
  return item?.place.id ?? null;
}

export type AltLine = { icon: 'clock' | 'alert' | 'walk' | 'info'; text: string };

/**
 * 대안 카드 제목과 아래 줄. 응답에 이동 시간·영업 정보가 따로 없어 이유를 그대로 보인다.
 * 시간 옮기기는 목표 시각과 비 그침 예보를 덧붙인다
 */
export function alternativeView(
  alt: WeatherAlternative,
  w: Weather | null,
): { title: string; lines: AltLine[]; selectable: boolean } {
  if (alt.type === 'TIME_SHIFT') {
    const lines: AltLine[] = [];
    if (alt.targetStartTime)
      lines.push({ icon: 'clock', text: `비 그친 뒤 ${alt.targetStartTime}` });
    const clears = w ? clearsAt(w) : null;
    lines.push({ icon: 'alert', text: clears ? `${clears} · 예보` : alt.reason });
    return { title: alt.activity, lines, selectable: true };
  }
  if (alt.type === 'PLACE_SWAP') {
    return {
      title: alt.place?.name ?? alt.activity,
      lines: [{ icon: 'walk', text: alt.reason }],
      selectable: alt.place !== null,
    };
  }
  return { title: alt.activity, lines: [{ icon: 'info', text: alt.reason }], selectable: false };
}

/** 여행 날짜 목록(YYYY-MM-DD). 시작 전 예보에 쓴다 */
export function tripDates(start: string | null, end: string | null): string[] {
  const s = parseDate(start);
  const e = parseDate(end) ?? s;
  if (!s || !e) return [];
  const dates: string[] = [];
  for (let t = s.getTime(); t <= e.getTime(); t += DAY_MS) dates.push(isoDate(new Date(t)));
  return dates;
}
