import { describe, expect, it } from '@jest/globals';
import { addDays, daysBetween, formatDay, formatRange, seoulToday } from './seoul-date';

describe('seoulToday', () => {
  it('UTC 14:59는 서울로 같은 날 23:59다', () => {
    expect(seoulToday(new Date('2026-11-13T14:59:59Z'))).toBe('2026-11-13');
  });

  it('UTC 15:00부터 서울은 다음 날이다', () => {
    expect(seoulToday(new Date('2026-11-13T15:00:00Z'))).toBe('2026-11-14');
  });

  // TZ를 바꿔 돌려도 같아야 한다: TZ=PST8PDT npx jest src/lib/seoul-date.test.ts (Git Bash)
  // Windows Git Bash는 'America/Los_Angeles'처럼 '/'가 든 값을 경로로 바꿔 버려 적용되지 않는다
  it('기기 시간대와 상관없이 서울 날짜다', () => {
    expect(seoulToday(new Date('2026-11-13T15:30:00Z'))).toBe('2026-11-14');
  });
});

describe('daysBetween', () => {
  it('뒤 날짜면 양수, 같으면 0', () => {
    expect(daysBetween('2026-10-28', '2026-11-14')).toBe(17);
    expect(daysBetween('2026-11-14', '2026-11-14')).toBe(0);
    expect(daysBetween('2026-11-15', '2026-11-14')).toBe(-1);
  });

  it('기기 시간대의 서머타임 전환일을 지나도 하루씩 센다', () => {
    // 미국 서머타임은 2026-11-01에 끝난다. 그 시간대에서도 23·25시간짜리 날을 하루로 센다
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2);
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
  });
});

describe('formatDay / formatRange', () => {
  it('월.일(요일)로 쓴다', () => {
    expect(formatDay('2026-11-14')).toBe('11.14(토)');
  });

  it('기간은 – 로 잇고, 당일이면 하루만 쓴다', () => {
    expect(formatRange('2026-11-14', '2026-11-15')).toBe('11.14(토) – 11.15(일)');
    expect(formatRange('2026-11-14', '2026-11-14')).toBe('11.14(토)');
  });

  it('addDays는 달을 넘어간다', () => {
    expect(addDays('2026-11-30', 2)).toBe('2026-12-02');
  });
});
