import { describe, expect, it } from '@jest/globals';

import { dayLegs, toDraft } from '@/features/course/course-rules';
import { place, sampleCourse } from '@/features/course/testing';

import {
  basisLine,
  compareDay,
  compareRows,
  proposalDraft,
  stats,
  summary,
} from './proposal-rules';
import { removalContent } from './testing';

const current = () => toDraft(sampleCourse(true), 2);
const proposed = () => proposalDraft(removalContent(), 3, 2);

describe('비교', () => {
  it('바뀐 첫 날을 고른다', () => {
    expect(compareDay(current(), proposed())).toBe(0);
    expect(compareDay(current(), current())).toBe(0);
  });

  it('줄마다 그대로·당겨짐을, 빠진 장소는 따로, 새 쌍 구간은 바뀜', () => {
    const { rows, removed } = compareRows(current().days[0], proposed().days[0]);
    expect(rows.map((r) => [r.item.place.name, r.mark, r.before, r.legChanged])).toEqual([
      ['해운대 해변', 'same', null, false],
      ['서면 돼지국밥집', 'earlier', '19:00', true],
    ]);
    expect(removed.map((r) => r.place.name)).toEqual(['광안리 바다뷰 카페']);
  });

  it('새 장소와 늦춰짐', () => {
    const now = current().days[0];
    const later = [
      { ...now[0], startTime: '11:00' },
      { ...now[1], place: place('p-new', '새 카페') },
    ];
    const { rows } = compareRows(now, later);
    expect(rows.map((r) => r.mark)).toEqual(['later', 'new']);
  });
});

describe('summary', () => {
  it('장소 하나를 빼면 을·를을 붙여 빼요와 위치', () => {
    expect(summary(current(), proposed(), null)).toEqual({
      title: '광안리 바다뷰 카페를 빼요',
      sub: '1일차 2번째 장소',
    });
  });

  it('하나를 바꾸면 바꿔요, 시각만 바뀌면 시간을 바꿔요, 그 밖에는 설명', () => {
    const swapped = current();
    swapped.days[0] = swapped.days[0].map((i) =>
      i.place.id === 'p-haeundae' ? { ...i, place: place('p-aqua', '해운대 실내 수족관') } : i,
    );
    expect(summary(current(), swapped, null).title).toBe(
      '해운대 해변을 해운대 실내 수족관으로 바꿔요',
    );

    const shifted = current();
    shifted.days[0] = shifted.days[0].map((i) =>
      i.place.id === 'p-haeundae' ? { ...i, startTime: '14:00' } : i,
    );
    expect(summary(current(), shifted, null)).toEqual({
      title: '해운대 해변 시간을 바꿔요',
      sub: '10:00 → 14:00',
    });
    expect(summary(current(), current(), '설명')).toEqual({ title: '설명', sub: null });
  });
});

describe('숫자 칸과 기준 줄', () => {
  it('장소 수, 기존 이동 시간, 마지막 일정', () => {
    const c = current();
    expect(stats(c.days[0], dayLegs(c, 0), proposed().days[0])).toEqual([
      { label: '장소', value: '2곳', before: '기존 3곳' },
      { label: '이동', value: '계산 전', before: '기존 47분' },
      { label: '마지막 일정', value: '13:00', before: '기존 19:00' },
    ]);
  });

  it('기준 수단과 계산 시각', () => {
    expect(basisLine(proposed(), '2026-11-14T12:05:00')).toBe(
      '대중교통 기준 · 11.14(토) 12:05 계산',
    );
    expect(basisLine(proposed(), null)).toBeNull();
  });
});
