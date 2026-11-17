import { describe, expect, it } from '@jest/globals';

import type { Place } from '@/features/place/types';
import type { Region } from '@/features/trip/types';

import {
  applyFix,
  dayDateLabel,
  dayItems,
  formatDistance,
  matchOurPlace,
  pickRegion,
  rangeLabel,
  saidLine,
  shiftItem,
  stepRows,
  toItineraryWrite,
  withDates,
  type AiPlace,
  type TripVoiceDraft,
  type VoiceItem,
} from './voice-trip-rules';

function ai(name: string, lat = 35.16, lng = 129.16): AiPlace {
  return {
    name,
    address: null,
    latitude: lat,
    longitude: lng,
    provider: 'NAVER',
    providerPlaceId: 'n-' + name,
    category: null,
  };
}

function item(key: string, day: number, name: string | null, extra: Partial<VoiceItem> = {}) {
  return {
    key,
    day,
    said: null,
    label: null,
    startTime: null,
    query: name ?? key,
    place: name ? ai(name) : null,
    aiPicked: false,
    ...extra,
  } satisfies VoiceItem;
}

function draft(items: VoiceItem[], extra: Partial<TripVoiceDraft> = {}): TripVoiceDraft {
  return {
    title: '친구들과 부산 2박 3일',
    titleByAi: true,
    destinations: [{ name: '부산', said: '부산 가려고' }],
    startDate: '2026-11-20',
    endDate: '2026-11-22',
    datesSaid: '11월 20일부터 2박 3일',
    dayCount: 3,
    items,
    transcript: '',
    ...extra,
  };
}

const names = (d: TripVoiceDraft, day: number) => dayItems(d, day).map((i) => i.key);

describe('applyFix', () => {
  const base = draft([
    item('a', 1, '해운대'),
    item('b', 1, '국밥'),
    item('c', 2, '감천'),
    item('d', 3, '용궁사'),
  ]);

  it('넣는 곳은 그날 맨 끝에 들어가고 파랗게 표시된다', () => {
    const { draft: next, changed } = applyFix(base, [
      {
        op: 'add',
        key: 'n',
        day: 2,
        place: ai('밀면'),
        label: '점심',
        startTime: '12:30',
        aiPicked: true,
      },
    ]);
    expect(names(next, 2)).toEqual(['c', 'n']);
    expect(next.items.map((i) => i.key)).toEqual(['a', 'b', 'c', 'n', 'd']);
    expect(dayItems(next, 2)[1]).toMatchObject({
      label: '점심',
      startTime: '12:30',
      aiPicked: true,
    });
    expect([...changed.keys]).toEqual(['n']);
  });

  it('끼니나 시각이 있으면 그 때에 맞는 자리에 넣는다', () => {
    const day = draft([
      item('a', 2, '흰여울'),
      item('b', 2, '감천', { label: '오후' }),
      item('c', 2, '자갈치', { label: '저녁' }),
    ]);
    const { draft: next } = applyFix(day, [
      { op: 'add', key: 'n', day: 2, place: ai('밀면'), label: '점심' },
      { op: 'add', key: 'm', day: 2, place: ai('야경'), startTime: '21:00' },
    ]);
    expect(names(next, 2)).toEqual(['a', 'n', 'b', 'c', 'm']);
  });

  it('날짜를 바꾸면 날 수를 맞추고 넘치는 날은 마지막 날로 모은다', () => {
    const { draft: next, changed } = applyFix(base, [
      { op: 'setDates', startDate: '2026-11-21', endDate: '2026-11-22' },
    ]);
    expect(next.dayCount).toBe(2);
    expect(names(next, 2)).toEqual(['c', 'd']);
    expect(next.datesSaid).toBeNull();
    expect(changed.dates).toBe(true);
  });

  it('빼기·옮기기·시각·바꾸기·이름·여행지를 적용한다', () => {
    const { draft: next, changed } = applyFix(base, [
      { op: 'remove', key: 'a' },
      { op: 'move', key: 'd', day: 1 },
      { op: 'setTime', key: 'b', startTime: '13:00' },
      { op: 'replace', key: 'c', place: ai('흰여울'), query: '흰여울마을' },
      { op: 'setTitle', title: '부산 먹방' },
      { op: 'setDestinations', names: ['부산', '경주'] },
      { op: 'remove', key: '없는 key' },
    ]);
    expect(names(next, 1)).toEqual(['b', 'd']);
    expect(dayItems(next, 1)[0].startTime).toBe('13:00');
    expect(dayItems(next, 2)[0].place?.name).toBe('흰여울');
    expect(next.title).toBe('부산 먹방');
    expect(next.titleByAi).toBe(false);
    expect(next.destinations.map((d) => d.name)).toEqual(['부산', '경주']);
    expect([...changed.keys].sort()).toEqual(['b', 'c', 'd']);
    expect(changed.title && changed.destinations).toBe(true);
    // 원래 초안은 그대로(되돌리기에 쓴다)
    expect(base.items).toHaveLength(4);
  });
});

it('withDates는 손으로 고른 기간으로 날 수를 맞춘다', () => {
  const d = withDates(
    draft([item('a', 3, 'x')], { startDate: null, endDate: null }),
    '2026-12-01',
    '2026-12-02',
  );
  expect(d.dayCount).toBe(2);
  expect(d.items[0].day).toBe(2);
});

it('shiftItem은 같은 날 안에서만 움직인다', () => {
  const d = draft([item('a', 1, 'x'), item('b', 2, 'y'), item('c', 1, 'z')]);
  expect(names(shiftItem(d, 'c', -1), 1)).toEqual(['c', 'a']);
  expect(shiftItem(d, 'a', -1)).toBe(d);
});

describe('pickRegion', () => {
  const region = (id: string, name: string, parentId: string | null = null): Region => ({
    id,
    code: id,
    name,
    parentId,
    latitude: null,
    longitude: null,
  });
  const found = [
    region('2', '부산광역시 해운대구', '1'),
    region('1', '부산광역시'),
    region('3', '경상북도 경주시', '9'),
  ];

  it('짧은 이름이 같은 가장 큰 지역을 고른다', () => {
    expect(pickRegion('부산', found)?.id).toBe('1');
    expect(pickRegion('경주', found)?.id).toBe('3');
    expect(pickRegion('해운대', found)?.id).toBe('2');
    expect(pickRegion('제주', found)).toBeNull();
  });
});

it('toItineraryWrite는 우리 장소가 된 항목만 날마다 순서와 구간을 매긴다', () => {
  const d = draft([
    item('a', 1, 'x', { startTime: '12:00' }),
    item('b', 1, null),
    item('c', 1, 'z'),
    item('d', 2, 'w'),
  ]);
  const ids = new Map([
    ['a', 'p1'],
    ['c', 'p3'],
    ['d', 'p4'],
  ]);
  expect(toItineraryWrite(d, ids, 1)).toEqual({
    expectedVersion: 1,
    items: [
      { placeId: 'p1', day: 1, order: 1, startTime: '12:00', stayMinutes: null },
      { placeId: 'p3', day: 1, order: 2, startTime: null, stayMinutes: null },
      { placeId: 'p4', day: 2, order: 1, startTime: null, stayMinutes: null },
    ],
    legs: [{ day: 1, fromOrder: 1, toOrder: 2, transportMode: 'TRANSIT' }],
  });
});

it('stepRows는 지금 단계까지 끝, 지금, 기다림으로 보인다', () => {
  expect(stepRows({ step: 'SEARCHING', searched: 4, toSearch: 7 })).toEqual([
    { label: '말 받아쓰기', state: 'done' },
    { label: '여행지·날짜·날마다 할 일 나누기', state: 'done' },
    { label: '장소 찾기 7곳 중 4곳', state: 'now' },
    { label: '초안 만들기', state: 'wait' },
  ]);
});

it('글자 모양', () => {
  expect(saidLine('해운대 돼지국밥')).toBe('"해운대 돼지국밥"이라고 말했어요');
  expect(saidLine('바다 보이는 카페')).toBe('"바다 보이는 카페"라고 말했어요');
  expect(formatDistance(453)).toBe('450m');
  expect(formatDistance(4658)).toBe('4.7km');
  expect(formatDistance(null)).toBeNull();
  expect(rangeLabel('2026-11-20', '2026-11-22')).toBe('11.20(금) ~ 11.22(일)');
  expect(dayDateLabel(draft([]), 2)).toBe('11.21');
  expect(dayDateLabel(draft([], { startDate: null }), 2)).toBeNull();
});

it('matchOurPlace는 이름이 겹치고 300m 안인 우리 장소를 고른다', () => {
  const ours = (id: string, name: string, lat: number): Place =>
    ({ id, name, latitude: lat, longitude: 129.16 }) as Place;
  const target = ai('오복돼지국밥', 35.16, 129.16);
  expect(
    matchOurPlace(target, [
      ours('far', '오복돼지국밥', 35.2),
      ours('ok', '해운대 오복돼지국밥', 35.161),
    ])?.id,
  ).toBe('ok');
  expect(matchOurPlace(target, [ours('x', '할매국밥', 35.16)])).toBeNull();
});
