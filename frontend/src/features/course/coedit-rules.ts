import { DEFAULT_MODE, legKey, type CourseDraft, type DraftItem } from './course-rules';

/**
 * 코스 함께 편집 규칙(spec Q-8-2, Q-8-4). 일차 단위로 누가 어느 날을 고쳤는지 가리고 합친다.
 * 실시간 이벤트 없이 저장 409와 다시 연결 뒤에 최신 코스를 받아 이 규칙으로 비교한다.
 */

export type RebaseResult =
  /** 내가 고친 날이 없다. 최신 코스를 그대로 쓴다 */
  | { kind: 'none'; draft: CourseDraft }
  /** 서로 다른 날을 고쳤다(또는 덮기). 최신 코스에 내 날을 얹었다 */
  | { kind: 'merged'; draft: CourseDraft; mineDays: number[]; theirDays: number[] }
  /** 같은 날을 고쳤다. 사람이 골라야 한다 */
  | { kind: 'overlap'; days: number[] };

/** 그 날을 비교할 값. 장소, 시각, 머무는 시간, 인접 쌍 수단 */
function daySignature(draft: CourseDraft, day: number): string {
  const list = draft.days[day] ?? [];
  return JSON.stringify(
    list.map((d, i) => [
      d.place.id,
      d.startTime,
      d.stayMinutes,
      i > 0 ? (draft.modes[legKey(list[i - 1], d)] ?? DEFAULT_MODE) : null,
    ]),
  );
}

/** base와 비교해 값이 다른 일차(0부터). 일수가 다르면 없는 날은 빈 날로 본다 */
export function changedDays(base: CourseDraft, other: CourseDraft): number[] {
  const count = Math.max(base.days.length, other.days.length);
  const result: number[] = [];
  for (let d = 0; d < count; d += 1) {
    if (daySignature(base, d) !== daySignature(other, d)) result.push(d);
  }
  return result;
}

/**
 * 최신 코스(latest)에 내가 처음 코스(base)에서 고친 날을 다시 얹는다.
 * - 같은 날을 둘 다 고쳤으면 overlap. force면 그래도 내 날이 이긴다(내 것으로 덮기)
 * - 내 날에 있는 항목은 다른 날에서 빼 같은 항목이 두 번 들어가지 않게 한다
 * - 최신 코스에 없는 항목 ID(동행이 지운 항목)는 지워 새 항목으로 보낸다
 */
export function rebaseDraft(
  base: CourseDraft,
  mine: CourseDraft,
  latest: CourseDraft,
  options: { force?: boolean } = {},
): RebaseResult {
  const mineDays = changedDays(base, mine);
  const theirDays = changedDays(base, latest);
  if (mineDays.length === 0) return { kind: 'none', draft: latest };
  const overlap = mineDays.filter((d) => theirDays.includes(d));
  if (overlap.length > 0 && !options.force) return { kind: 'overlap', days: overlap };

  const latestIds = new Set(latest.days.flat().flatMap((i) => (i.id ? [i.id] : [])));
  const mineSet = new Set(mineDays);
  const keep = (i: DraftItem): DraftItem => (i.id && !latestIds.has(i.id) ? { ...i, id: null } : i);
  const mineIds = new Set(
    mineDays.flatMap((d) => (mine.days[d] ?? []).flatMap((i) => (i.id ? [i.id] : []))),
  );
  const count = Math.max(mine.days.length, latest.days.length);
  const days: DraftItem[][] = [];
  const modes: CourseDraft['modes'] = {};
  const legs: CourseDraft['legs'] = {};
  for (let d = 0; d < count; d += 1) {
    // 그 날을 가져온 쪽의 수단과 구간 결과만 쓴다. 다른 쪽의 옛 값이 덮지 않게
    const source = mineSet.has(d) ? mine : latest;
    const list = mineSet.has(d)
      ? (mine.days[d] ?? []).map(keep)
      : (latest.days[d] ?? []).filter((i) => !i.id || !mineIds.has(i.id));
    list.forEach((to, i) => {
      if (i === 0) return;
      const k = legKey(list[i - 1], to);
      if (source.modes[k]) modes[k] = source.modes[k];
      if (source.legs[k]) legs[k] = source.legs[k];
    });
    days.push(list);
  }
  return {
    kind: 'merged',
    draft: { baseVersion: latest.baseVersion, days, modes, legs },
    mineDays,
    theirDays,
  };
}
