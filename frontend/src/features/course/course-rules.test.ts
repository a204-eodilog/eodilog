import { describe, expect, it } from '@jest/globals';

import {
  addPlace,
  basisLine,
  dayCount,
  dayDate,
  dayLegs,
  dayRegions,
  editedLine,
  emptyDraft,
  hasUnavailable,
  legLabel,
  moveItem,
  proposalToDraft,
  removeItem,
  replacePlace,
  sameContent,
  setLegMode,
  toDraft,
  toWrite,
  type CourseDraft,
} from './course-rules';
import { item, itinerary, leg, place, sampleCourse } from './testing';
import type { ItineraryWrite } from './types';

/** 서버 규칙: 날마다 order 1부터 빈틈없음, 같은 날 인접 쌍마다 구간 정확히 하나 */
function expectValid(write: ItineraryWrite) {
  const days = new Map<number, number[]>();
  for (const i of write.items) days.set(i.day, [...(days.get(i.day) ?? []), i.order]);
  for (const [day, orders] of days) {
    expect(orders).toEqual(orders.map((_, k) => k + 1));
    const legs = write.legs.filter((l) => l.day === day);
    expect(legs.map((l) => [l.fromOrder, l.toOrder])).toEqual(
      orders.slice(1).map((o) => [o - 1, o]),
    );
  }
  expect(write.legs.every((l) => days.has(l.day))).toBe(true);
}

describe('초안 변환', () => {
  it('서버 코스를 날짜별 칸으로 바꾸고 그대로 저장 본문을 만들면 같은 내용이다', () => {
    const saved = sampleCourse();
    const draft = toDraft(saved, 2);
    expect(draft.days.map((d) => d.map((x) => x.place.name))).toEqual([
      ['해운대 해변', '광안리 바다뷰 카페', '서면 돼지국밥집'],
      ['감천문화마을'],
    ]);
    const write = toWrite(draft);
    expectValid(write);
    expect(write.expectedVersion).toBe(3);
    expect(write.items[0]).toEqual({
      id: 'i1',
      placeId: 'p-haeundae',
      day: 1,
      order: 1,
      startTime: '10:00',
      stayMinutes: null,
    });
    expect(sameContent(draft, saved)).toBe(true);
  });

  it('기간보다 뒤 날짜의 장소는 마지막 날 끝으로 옮긴다', () => {
    const draft = toDraft(sampleCourse(), 1);
    expect(draft.days).toHaveLength(1);
    expect(draft.days[0].map((x) => x.place.name).at(-1)).toBe('감천문화마을');
  });

  it('자동 추천 결과를 새 칸으로 바꾸고 구간 수단을 이어 받는다', () => {
    let n = 0;
    const p1 = place('a', 'A');
    const p2 = place('b', 'B');
    const draft = proposalToDraft(
      {
        items: [
          { day: 1, order: 1, place: p1, startTime: null, stayMinutes: null },
          { day: 1, order: 2, place: p2, startTime: null, stayMinutes: null },
        ],
        legs: [{ day: 1, fromOrder: 1, toOrder: 2, transportMode: 'CAR' }],
      },
      5,
      2,
      () => `k${++n}`,
    );
    expect(draft.days[0].map((d) => d.id)).toEqual([null, null]);
    expect(dayLegs(draft, 0)[0].mode).toBe('CAR');
    expect(toWrite(draft).items.every((i) => !('id' in i))).toBe(true);
  });
});

describe('고치기', () => {
  const base = () => toDraft(sampleCourse(), 2);

  it('순서를 바꾸면 번호를 다시 매기고 구간을 새로 만든다', () => {
    const moved = moveItem(base(), 0, 1, -1);
    expect(moved.days[0].map((x) => x.id)).toEqual(['i2', 'i1', 'i3']);
    expectValid(toWrite(moved));
    expect(moveItem(base(), 0, 0, -1)).toEqual(base());
    expect(moveItem(base(), 0, 2, 1)).toEqual(base());
  });

  it('빼면 앞뒤 사이에 기본 수단 구간이 생긴다', () => {
    const removed = removeItem(base(), 0, 1);
    const write = toWrite(removed);
    expectValid(write);
    expect(write.legs.find((l) => l.day === 1)).toEqual({
      day: 1,
      fromOrder: 1,
      toOrder: 2,
      transportMode: 'TRANSIT',
    });
  });

  it('장소를 바꾸면 새 항목이 되고 이어지던 수단은 남는다', () => {
    const withCar = setLegMode(base(), 'i1>i2', 'CAR');
    const replaced = replacePlace(withCar, 0, 1, place('p-new', '새 장소'), 'k-new');
    expect(replaced.days[0][1]).toMatchObject({ key: 'k-new', id: null });
    expect(dayLegs(replaced, 0)[0]).toMatchObject({ key: 'i1>k-new', mode: 'CAR' });
    expectValid(toWrite(replaced));
  });

  it('수단을 바꾸면 그 구간의 지난 시간은 보이지 않는다', () => {
    const draft = base();
    expect(legLabel(dayLegs(draft, 0)[0])).toBe('대중교통 22분');
    const car = setLegMode(draft, 'i1>i2', 'CAR');
    expect(legLabel(dayLegs(car, 0)[0])).toBeNull();
  });

  it('어떤 고치기를 이어 해도 저장 본문은 서버 규칙을 지킨다', () => {
    let draft: CourseDraft = base();
    let k = 0;
    const ops = [
      (d: CourseDraft) => moveItem(d, 0, 2, -1),
      (d: CourseDraft) => addPlace(d, 1, place(`x${k}`, 'X'), `n${++k}`),
      (d: CourseDraft) => removeItem(d, 0, 0),
      (d: CourseDraft) => addPlace(d, 0, place(`y${k}`, 'Y'), `n${++k}`),
      (d: CourseDraft) => moveItem(d, 1, 0, 1),
      (d: CourseDraft) => replacePlace(d, 1, 0, place('z', 'Z'), `n${++k}`),
      (d: CourseDraft) => removeItem(d, 1, 1),
    ];
    for (let round = 0; round < 3; round += 1) {
      for (const op of ops) {
        draft = op(draft);
        expectValid(toWrite(draft));
      }
    }
  });

  it('빈 초안에 놓은 장소로 바로 저장할 수 있다', () => {
    let draft = emptyDraft(1, 2);
    draft = addPlace(draft, 0, place('a', 'A'), 'a');
    draft = addPlace(draft, 0, place('b', 'B'), 'b');
    draft = addPlace(draft, 1, place('c', 'C'), 'c');
    const write = toWrite(draft);
    expectValid(write);
    expect(write.legs).toHaveLength(1);
  });

  it('하루에 장소가 하나면 그 날은 구간이 없다', () => {
    expect(toWrite(base()).legs.filter((l) => l.day === 2)).toHaveLength(0);
  });
});

describe('문구', () => {
  it('일수와 날짜', () => {
    expect(dayCount('2026-11-14', '2026-11-15')).toBe(2);
    expect(dayCount(null, null)).toBeNull();
    expect(dayDate('2026-11-14', 2)).toBe('11.15(일)');
  });

  it('서울 시각으로 고친 사람과 기준 시각', () => {
    expect(editedLine('2026-10-26T11:40:00Z', '세은')).toBe(
      '10.26(월) 세은님이 마지막으로 고쳤어요',
    );
    expect(basisLine('2026-10-26T11:40:00Z')).toBe('10.26(월) 20:40 기준');
  });

  it('시간을 구하지 못한 구간이 있는지', () => {
    expect(hasUnavailable(sampleCourse(true))).toBe(false);
    expect(hasUnavailable(sampleCourse(false))).toBe(true);
    expect(hasUnavailable(itinerary({ legs: [] }))).toBe(false);
  });
});

describe('날짜별 지역', () => {
  it('그 날 장소 지역 중 많은 곳, 없으면 여행지 순서로 나눈다', () => {
    const busan = place('a', 'A', { regionId: 'busan' });
    const gangneung = place('b', 'B', { regionId: 'gangneung' });
    const draft = toDraft(
      itinerary({
        items: [item('1', gangneung, 1, 1), item('2', gangneung, 1, 2), item('3', busan, 2, 1)],
        legs: [leg('1', '2')],
      }),
      3,
    );
    expect(dayRegions(draft, ['busan', 'gangneung'])).toEqual(['gangneung', 'busan', 'gangneung']);
  });
});
