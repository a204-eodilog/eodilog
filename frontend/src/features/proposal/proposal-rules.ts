import { changedDays } from '@/features/course/coedit-rules';
import {
  DEFAULT_MODE,
  MODE_LABEL,
  proposalToDraft,
  type CourseDraft,
  type DayLeg,
  type DraftItem,
} from '@/features/course/course-rules';
import type { CourseContent, TransportMode } from '@/features/course/types';
import { dateClock } from '@/features/on-trip/on-trip-rules';
import { withEulReul, withRo } from '@/lib/korean';

/** 변경안 내용을 지금 코스와 같은 모양의 초안으로 */
export function proposalDraft(
  content: CourseContent,
  baseVersion: number,
  days: number | null,
): CourseDraft {
  let n = 0;
  return proposalToDraft(content, baseVersion, days, () => `proposed-${++n}`);
}

/** 비교할 날(0부터). 바뀐 첫 날, 없으면 첫째 날 */
export function compareDay(current: CourseDraft, proposed: CourseDraft): number {
  return changedDays(current, proposed)[0] ?? 0;
}

export type RowMark = 'same' | 'earlier' | 'later' | 'new';
export type CompareRow = {
  item: DraftItem;
  mark: RowMark;
  /** 시각이 바뀌었으면 기존 시각 */
  before: string | null;
  /** 이 칸 앞 구간이 지금 코스에 없던 쌍이다 */
  legChanged: boolean;
};

/**
 * 제안 날의 줄마다 지금 날과 비교한 표시. 같은 장소가 있으면 시각으로 그대로·당겨짐·늦춰짐,
 * 없으면 새로. 지금 날에만 있는 장소는 removed로 따로 돌려준다
 */
export function compareRows(
  current: readonly DraftItem[],
  proposed: readonly DraftItem[],
): { rows: CompareRow[]; removed: DraftItem[] } {
  const adjacent = new Set(
    current.slice(1).map((to, i) => `${current[i].place.id}>${to.place.id}`),
  );
  const rows = proposed.map((item, i): CompareRow => {
    const old = current.find((c) => c.place.id === item.place.id);
    let mark: RowMark = 'new';
    if (old) {
      if ((old.startTime ?? '') === (item.startTime ?? '')) mark = 'same';
      else mark = (item.startTime ?? '') < (old.startTime ?? '') ? 'earlier' : 'later';
    }
    const legChanged = i > 0 && !adjacent.has(`${proposed[i - 1].place.id}>${item.place.id}`);
    return { item, mark, before: old && mark !== 'same' ? old.startTime : null, legChanged };
  });
  const ids = new Set(proposed.map((p) => p.place.id));
  return { rows, removed: current.filter((c) => !ids.has(c.place.id)) };
}

export const MARK_LABEL: Record<RowMark, string> = {
  same: '그대로',
  earlier: '당겨짐',
  later: '늦춰짐',
  new: '새로',
};

/** 지금 코스에서 그 장소가 있는 날과 순서. "1일차 2번째 장소" */
function positionOf(draft: CourseDraft, placeId: string): string | null {
  for (let d = 0; d < draft.days.length; d += 1) {
    const i = draft.days[d].findIndex((x) => x.place.id === placeId);
    if (i >= 0) return `${d + 1}일차 ${i + 1}번째 장소`;
  }
  return null;
}

/**
 * 무엇이 바뀌는지 한 줄과 아래 줄. 장소 하나를 빼면 "{이름}를 빼요", 하나를 바꾸면
 * "{A}을 {B}로 바꿔요", 시각만 바뀌면 "{이름} 시간을 바꿔요". 그 밖에는 서버 설명
 */
export function summary(
  current: CourseDraft,
  proposed: CourseDraft,
  description: string | null,
): { title: string; sub: string | null } {
  const before = current.days.flat();
  const after = proposed.days.flat();
  const removed = before.filter((b) => !after.some((a) => a.place.id === b.place.id));
  const added = after.filter((a) => !before.some((b) => b.place.id === a.place.id));
  if (removed.length === 1 && added.length === 0) {
    return {
      title: `${withEulReul(removed[0].place.name)} 빼요`,
      sub: positionOf(current, removed[0].place.id),
    };
  }
  if (removed.length === 1 && added.length === 1) {
    return {
      title: `${withEulReul(removed[0].place.name)} ${withRo(added[0].place.name)} 바꿔요`,
      sub: positionOf(current, removed[0].place.id),
    };
  }
  if (removed.length === 0 && added.length === 0) {
    const moved = after.find((a) => {
      const old = before.find((b) => b.place.id === a.place.id);
      return old && old.startTime !== a.startTime;
    });
    if (moved) {
      const old = before.find((b) => b.place.id === moved.place.id);
      return {
        title: `${moved.place.name} 시간을 바꿔요`,
        sub: `${old?.startTime ?? ''} → ${moved.startTime ?? ''}`,
      };
    }
  }
  return { title: description || '코스를 바꿔요', sub: null };
}

export type Stat = { label: string; value: string; before: string };

/** 지금 날 구간 시간의 합(분). 하나도 모르면 null */
function minutesOf(legs: readonly DayLeg[]): number | null {
  const secs = legs
    .map((l) => (l.info?.status === 'AVAILABLE' ? l.info.durationSeconds : null))
    .filter((s): s is number => s !== null);
  return secs.length > 0 ? Math.round(secs.reduce((a, b) => a + b, 0) / 60) : null;
}

const lastTime = (items: readonly DraftItem[]) =>
  [...items].reverse().find((i) => i.startTime)?.startTime ?? null;

/** 숫자 칸 셋. 변경안에는 구간 시간이 없어 바뀐 쪽 이동은 "계산 전"(Q-11-3) */
export function stats(
  current: readonly DraftItem[],
  currentLegs: readonly DayLeg[],
  proposed: readonly DraftItem[],
): [Stat, Stat, Stat] {
  const minutes = minutesOf(currentLegs);
  return [
    { label: '장소', value: `${proposed.length}곳`, before: `기존 ${current.length}곳` },
    {
      label: '이동',
      value: '계산 전',
      before: minutes !== null ? `기존 ${minutes}분` : '기존 시간 모름',
    },
    {
      label: '마지막 일정',
      value: lastTime(proposed) ?? '—',
      before: `기존 ${lastTime(current) ?? '—'}`,
    },
  ];
}

/** "대중교통 기준 · 11.14(토) 12:05 계산". 가장 많은 수단을 기준으로 */
export function basisLine(draft: CourseDraft, finishedAt: string | null): string | null {
  if (!finishedAt) return null;
  const counts = new Map<TransportMode, number>();
  for (const m of Object.values(draft.modes)) counts.set(m, (counts.get(m) ?? 0) + 1);
  const mode = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? DEFAULT_MODE;
  return `${MODE_LABEL[mode]} 기준 · ${dateClock(finishedAt)} 계산`;
}
