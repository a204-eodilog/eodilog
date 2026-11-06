import { describe, expect, it } from '@jest/globals';

import {
  dayLabel,
  membersLabel,
  minutesLabel,
  nightsLabel,
  periodLabel,
  toFeedDetail,
  transportKind,
  wonShort,
} from './feed-rules';
import { sampleFeed } from './preview-data';

describe('날짜 글자', () => {
  it('기간은 "01.17 – 01.18", 하루면 하나, 모르면 null', () => {
    expect(periodLabel('2026-01-17', '2026-01-18')).toBe('01.17 – 01.18');
    expect(periodLabel('2026-01-17', '2026-01-17')).toBe('01.17');
    expect(periodLabel(null, null)).toBeNull();
  });
  it('박수와 일차 날짜', () => {
    expect(nightsLabel('2026-01-17', '2026-01-18')).toBe('1박 2일');
    expect(nightsLabel('2026-01-17', '2026-01-17')).toBe('당일');
    expect(dayLabel('2026-01-17', 1)).toBe('01.17(토)');
    expect(dayLabel('2026-01-17', 2)).toBe('01.18(일)');
    expect(dayLabel(null, 1)).toBeNull();
  });
});

describe('짧은 글자', () => {
  it('경비는 만 원 단위', () => {
    expect(wonShort(180_000)).toBe('18만 원');
    expect(wonShort(52_000)).toBe('5.2만 원');
    expect(wonShort(9_000)).toBe('9,000원');
  });
  it('이동 시간과 수단', () => {
    expect(minutesLabel(12)).toBe('12분');
    expect(minutesLabel(65)).toBe('1시간 5분');
    expect(minutesLabel(null)).toBeNull();
    expect(transportKind('WALK')).toBe('walk');
    expect(transportKind('taxi')).toBe('car');
    expect(transportKind('BUS')).toBe('transit');
    expect(transportKind('BIKE')).toBe('other');
  });
  it('동행 이름', () => {
    expect(membersLabel(['하늘', '가람', '나래'])).toBe('하늘 외 2명');
    expect(membersLabel(['하늘'])).toBe('하늘');
    expect(membersLabel([])).toBeNull();
  });
});

describe('toFeedDetail', () => {
  const detail = toFeedDetail(sampleFeed());

  it('일차별로 묶고 번호는 일차를 넘어 이어진다', () => {
    expect(detail.days.map((d) => d.day)).toEqual([1, 2]);
    expect(detail.days[1].stops.map((s) => s.number)).toEqual([4, 5]);
    expect(detail.days[0].dateLabel).toBe('01.17(토)');
  });
  it('평점은 평균, 한 줄 평가는 먼저 쓴 것', () => {
    const first = detail.days[0].stops[0];
    expect(first.score).toBe(4.5);
    expect(first.review).toBe('겨울 바다가 맑아서 오래 걸었어요');
    expect(first.reviewAuthor).toBe('하늘');
    expect(detail.days[1].stops[1].score).toBe(3.5);
  });
  it('같은 날 다음 장소까지 이동만 붙고, 날의 마지막 장소에는 없다', () => {
    const [a, b, c] = detail.days[0].stops;
    expect(a.next).toEqual({ mode: 'walk', minutes: 12 });
    expect(b.next).toEqual({ mode: 'car', minutes: 15 });
    expect(c.next).toBeNull();
  });
  it('사진은 앞 3장과 남은 수, 경비 합계, 동행', () => {
    expect(detail.photos).toHaveLength(3);
    expect(detail.morePhotos).toBe(9);
    expect(detail.expenseTotal).toBe(180_000);
    expect(detail.members.map((m) => m.name)).toEqual(['하늘', '가람', '나래']);
  });
  it('공개 일정·경비·동행이 없으면 비운다', () => {
    const bare = toFeedDetail({
      ...sampleFeed(),
      publicItinerary: null,
      expenseSummary: null,
      members: undefined,
    });
    expect(bare.days).toEqual([]);
    expect(bare.expenseTotal).toBeNull();
    expect(bare.members).toEqual([]);
  });
});
