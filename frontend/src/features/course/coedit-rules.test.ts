import { describe, expect, it } from '@jest/globals';

import { changedDays, rebaseDraft } from './coedit-rules';
import { legKey, moveItem, removeItem, toDraft, toWrite, type CourseDraft } from './course-rules';
import { item, itinerary, leg, place, sampleCourse } from './testing';
import type { Itinerary } from './types';

const base = () => toDraft(sampleCourse(), 2);
const ids = (d: CourseDraft) => d.days.map((list) => list.map((i) => i.place.id));

/** 다른 동행이 저장한 최신 코스. sampleCourse에서 항목만 바꾸고 version을 올린다 */
function latestWith(items: Itinerary['items'], legs: Itinerary['legs'] = []) {
  return toDraft(itinerary({ version: 4, items, legs }), 2);
}

const course = sampleCourse();
const [i1, i2, i3, i4] = course.items;
const busan = place('p-busan', '부산 시립미술관');

describe('changedDays', () => {
  it('같으면 비어 있고 순서가 바뀐 날만 고른다', () => {
    expect(changedDays(base(), base())).toEqual([]);
    expect(changedDays(base(), moveItem(base(), 0, 0, 1))).toEqual([0]);
  });

  it('구간 수단만 바꿔도 고친 날이다', () => {
    const b = base();
    const k = legKey(b.days[0][0], b.days[0][1]);
    expect(changedDays(b, { ...b, modes: { ...b.modes, [k]: 'CAR' } })).toEqual([0]);
  });

  it('일수가 달라지면 늘어난 날만 고친 날로 본다', () => {
    const b = base();
    const longer = { ...b, days: [...b.days, [b.days[1][0]]] };
    expect(changedDays(b, longer)).toEqual([2]);
  });
});

describe('rebaseDraft', () => {
  it('내가 고친 날이 없으면 최신 코스를 그대로 쓴다', () => {
    const latest = latestWith([i1, i2, i3, { ...i4, startTime: '11:00' }]);
    const r = rebaseDraft(base(), base(), latest);
    expect(r.kind).toBe('none');
  });

  it('서로 다른 날을 고쳤으면 최신 코스에 내 날을 얹는다', () => {
    const mine = moveItem(base(), 0, 0, 1);
    // 동행은 2일차에 미술관을 더했다
    const latest = latestWith([i1, i2, i3, i4, item('i9', busan, 2, 2)], [leg('i4', 'i9', 'CAR')]);
    const r = rebaseDraft(base(), mine, latest);
    expect(r.kind).toBe('merged');
    if (r.kind !== 'merged') return;
    expect(ids(r.draft)).toEqual([
      ['p-gwangalli', 'p-haeundae', 'p-seomyeon'],
      ['p-gamcheon', 'p-busan'],
    ]);
    expect(r.draft.baseVersion).toBe(4);
    expect(r.mineDays).toEqual([0]);
    expect(r.theirDays).toEqual([1]);
    // 동행이 고른 2일차 수단이 남는다
    expect(toWrite(r.draft).legs).toContainEqual({
      day: 2,
      fromOrder: 1,
      toOrder: 2,
      transportMode: 'CAR',
    });
  });

  it('동행이 바꾼 다른 날 수단을 내 옛 값이 덮지 않는다', () => {
    // 나는 2일차 감천을 뺐고 동행은 1일차 첫 구간을 걷기로 바꿨다
    const mine = removeItem(base(), 1, 0);
    const latest = latestWith(course.items, [leg('i1', 'i2', 'WALK'), leg('i2', 'i3', 'TRANSIT')]);
    const r = rebaseDraft(base(), mine, latest);
    if (r.kind !== 'merged') throw new Error(r.kind);
    expect(r.draft.modes[legKey(r.draft.days[0][0], r.draft.days[0][1])]).toBe('WALK');
  });

  it('같은 날을 둘 다 고쳤으면 겹친 날을 돌려준다', () => {
    const mine = moveItem(base(), 0, 0, 1);
    const latest = latestWith([i1, i3, i4].map((i, k) => ({ ...i, order: k + 1 })));
    const r = rebaseDraft(base(), mine, latest);
    expect(r).toEqual({ kind: 'overlap', days: [0] });
  });

  it('덮기면 겹쳐도 내 날이 이기고 동행의 다른 날은 남는다', () => {
    const mine = moveItem(base(), 0, 0, 1);
    const latest = latestWith([
      { ...i1, order: 1 },
      { ...i3, order: 2 },
      { ...i4, day: 2, order: 1 },
      item('i9', busan, 2, 2),
    ]);
    const r = rebaseDraft(base(), mine, latest, { force: true });
    if (r.kind !== 'merged') throw new Error(r.kind);
    expect(ids(r.draft)).toEqual([
      ['p-gwangalli', 'p-haeundae', 'p-seomyeon'],
      ['p-gamcheon', 'p-busan'],
    ]);
  });

  it('동행이 지운 항목을 내가 남겼으면 새 항목으로 다시 넣는다', () => {
    const mine = moveItem(base(), 0, 0, 1);
    // 동행이 광안리를 지웠다
    const latest = latestWith([i1, { ...i3, order: 2 }, i4]);
    const r = rebaseDraft(base(), mine, latest, { force: true });
    if (r.kind !== 'merged') throw new Error(r.kind);
    const gwangalli = r.draft.days[0].find((i) => i.place.id === 'p-gwangalli');
    expect(gwangalli?.id).toBeNull();
    expect(toWrite(r.draft).items.filter((i) => i.id === 'i2')).toHaveLength(0);
  });

  it('동행이 다른 날로 옮긴 항목은 내 날에 있으면 한 번만 들어간다', () => {
    // 나는 1일차에서 서면을 지웠고 해운대를 뒤로 보냈다. 서면은 내 날에 없다
    const mine = moveItem(removeItem(base(), 0, 2), 0, 0, 1);
    // 동행은 해운대를 2일차 끝으로 옮겼다
    const latest = latestWith([
      { ...i2, order: 1 },
      { ...i3, order: 2 },
      i4,
      { ...i1, day: 2, order: 2 },
    ]);
    const r = rebaseDraft(base(), mine, latest, { force: true });
    if (r.kind !== 'merged') throw new Error(r.kind);
    const all = toWrite(r.draft).items.flatMap((i) => (i.id ? [i.id] : []));
    expect(new Set(all).size).toBe(all.length);
    expect(ids(r.draft)).toEqual([['p-gwangalli', 'p-haeundae'], ['p-gamcheon']]);
  });

  it('합친 초안은 날마다 순서가 1부터이고 인접 쌍마다 구간이 하나다', () => {
    const mine = moveItem(base(), 0, 0, 1);
    const latest = latestWith([i1, i2, i3, i4, item('i9', busan, 2, 2)]);
    const r = rebaseDraft(base(), mine, latest);
    if (r.kind !== 'merged') throw new Error(r.kind);
    const w = toWrite(r.draft);
    expect(w.items.map((i) => [i.day, i.order])).toEqual([
      [1, 1],
      [1, 2],
      [1, 3],
      [2, 1],
      [2, 2],
    ]);
    expect(w.legs).toHaveLength(3);
  });
});
