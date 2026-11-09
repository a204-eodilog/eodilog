import { describe, expect, it } from '@jest/globals';

import {
  courseDays,
  dayLabel,
  filterByTopic,
  groupByPlace,
  sectionMeta,
  topicChips,
  uploadSummaryText,
} from './photo-list-rules';
import type { CoursePlace, PhotoTopic, TripPhoto } from './types';

const photo = (
  id: string,
  placeId: string | null,
  topics: PhotoTopic[] = [],
  uploader = 'm1',
): TripPhoto => ({
  id,
  assetId: `a-${id}`,
  tripId: 't1',
  batchId: null,
  uploaderMemberId: uploader,
  placeId,
  capturedAt: null,
  topics,
  groupId: null,
  version: 1,
});

const stop = (id: string, name: string, day: number, order: number): CoursePlace => ({
  id: `it-${id}`,
  place: { id, name },
  day,
  order,
});

const COURSE = [stop('p2', '서면', 1, 2), stop('p1', '해운대', 1, 1), stop('p3', '감천', 2, 1)];

describe('topicChips / filterByTopic', () => {
  it('전체와 네 주제를 순서대로, 없는 주제는 0', () => {
    expect(
      topicChips({
        totalCount: 5,
        unplacedCount: 1,
        topics: [
          { topic: 'FOOD', count: 2 },
          { topic: 'LANDSCAPE', count: 3 },
        ],
        places: [],
      }).map((c) => `${c.label}${c.count}`),
    ).toEqual(['전체5', '풍경3', '음식2', '사람0', '기타0']);
  });

  it('주제로 거르면 그 주제가 붙은 사진만', () => {
    const list = [
      photo('a', 'p1', ['FOOD']),
      photo('b', 'p1', ['FOOD', 'PEOPLE']),
      photo('c', null),
    ];
    expect(filterByTopic(list, 'PEOPLE').map((p) => p.id)).toEqual(['b']);
    expect(filterByTopic(list, 'ALL')).toHaveLength(3);
  });
});

describe('groupByPlace', () => {
  it('코스 장소는 코스 순서, 코스에 없는 장소는 뒤에 최근 올린 순. 장소 없는 사진은 빠진다', () => {
    const sections = groupByPlace(
      [
        photo('x', 'other-b'),
        photo('a', 'p3'),
        photo('b', 'p1'),
        photo('c', null),
        photo('d', 'other-a'),
        photo('e', 'p1'),
      ],
      COURSE,
      { 'other-a': '부산역' },
    );
    expect(sections.map((s) => [s.name, s.day, s.photos.map((p) => p.id).join('')])).toEqual([
      ['해운대', 1, 'be'],
      ['감천', 2, 'a'],
      [null, null, 'x'],
      ['부산역', null, 'd'],
    ]);
  });

  it('묶음 제목 오른쪽 글', () => {
    const [course, other] = groupByPlace(
      [photo('a', 'p1'), photo('b', 'p1'), photo('c', 'q')],
      COURSE,
      {},
    );
    expect(sectionMeta(course)).toBe('1일차 · 2장');
    expect(sectionMeta(other)).toBe('1장');
  });
});

describe('courseDays / dayLabel', () => {
  it('일차별로 코스 순서, 같은 장소는 처음만', () => {
    const days = courseDays([...COURSE, stop('p1', '해운대', 2, 2)], '2026-11-14');
    expect(days.map((d) => [d.label, d.stops.map((s) => s.place.name)])).toEqual([
      ['1일차 · 11.14(토)', ['해운대', '서면']],
      ['2일차 · 11.15(일)', ['감천']],
    ]);
  });

  it('시작일을 모르면 일차만', () => {
    expect(dayLabel(3, null)).toBe('3일차');
  });
});

describe('uploadSummaryText', () => {
  it('사진 수와 올린 사람 수', () => {
    expect(
      uploadSummaryText([photo('a', null, [], 'm1'), photo('b', null, [], 'm2'), photo('c', null)]),
    ).toBe('사진 3장 · 2명이 올렸어요');
  });
});
