import { describe, expect, it } from '@jest/globals';

import {
  deadlineLine,
  destinationOf,
  kindInfo,
  latestCreatedAt,
  notificationTitle,
  pickPopup,
  pollPopupTitle,
  popupTimeLabel,
  timeLabel,
  toLine,
  toSections,
} from './notification-rules';
import { notification, SAMPLE_NOW, sampleNotifications, samplePopupItems } from './testing';

describe('알림 문구', () => {
  it('서버 문장의 끝 마침표만 떼고, 문장이 없으면 종류 이름', () => {
    expect(notificationTitle({ kind: 'POLL_OPENED', message: '새 투표 "강릉"이 열렸어요.' })).toBe(
      '새 투표 "강릉"이 열렸어요',
    );
    expect(notificationTitle({ kind: 'COURSE_CHANGED', message: '  ' })).toBe('코스 변경');
    expect(notificationTitle({ kind: 'SOMETHING_NEW', message: null })).toBe('알림');
  });

  it('모르는 종류는 알림과 종 아이콘', () => {
    expect(kindInfo('SOMETHING_NEW')).toEqual({ label: '알림', icon: 'bell' });
    expect(kindInfo('FOLLOW_REQUESTED').label).toBe('팔로우 요청');
  });

  it('시각은 서울 기준으로 오늘이면 시:분, 아니면 날짜', () => {
    expect(timeLabel('2026-11-18T11:40:00Z', SAMPLE_NOW)).toBe('20:40');
    expect(timeLabel('2026-11-17T03:00:00Z', SAMPLE_NOW)).toBe('11.17(화)');
    expect(timeLabel('2026-10-02T03:00:00Z', SAMPLE_NOW)).toBe('10.02(금)');
    // UTC로는 17일이지만 서울로는 18일 새벽
    expect(timeLabel('2026-11-17T15:30:00Z', SAMPLE_NOW)).toBe('00:30');
    expect(popupTimeLabel('2026-11-18T11:30:00Z', SAMPLE_NOW)).toBe('오늘 20:30');
  });

  it('투표 시작 팝업 제목과 마감 줄', () => {
    expect(pollPopupTitle({ type: 'REGION', closesAt: '' })).toBe('지역 투표가 시작됐어요');
    expect(pollPopupTitle({ type: 'PLACE', closesAt: '' })).toBe('장소 투표가 시작됐어요');
    expect(pollPopupTitle(null)).toBe('투표가 시작됐어요');
    expect(deadlineLine('2026-10-28T12:00:00Z')).toBe('10.28(수) 21:00 마감');
  });
});

describe('알림 목록 묶기', () => {
  it('서버 순서를 지키며 오늘과 이전으로 나눈다', () => {
    const sections = toSections(sampleNotifications(), SAMPLE_NOW, null);
    expect(sections.map((s) => s.title)).toEqual(['오늘', '이전']);
    expect(sections[0].lines.map((l) => l.id)).toEqual(['n-1', 'n-2', 'n-3', 'n-4']);
    expect(sections[1].lines).toHaveLength(5);
  });

  it('빈 묶음은 빼고, 알림이 없으면 묶음도 없다', () => {
    const old = sampleNotifications().slice(4);
    expect(toSections(old, SAMPLE_NOW, null).map((s) => s.title)).toEqual(['이전']);
    expect(toSections([], SAMPLE_NOW, null)).toEqual([]);
  });

  it('안 읽음과 나간 여행을 표시한다. 내 여행 목록을 모르면 나간 여행은 붙이지 않는다', () => {
    const [first, , , , , , , , gone] = sampleNotifications();
    const mine = new Set(['trip-1']);
    expect(toLine(first, SAMPLE_NOW, mine)).toMatchObject({
      title: '겨울 여행 투표가 시작됐어요',
      label: '투표 시작',
      time: '20:40',
      unread: true,
      leftTrip: false,
    });
    expect(toLine(gone, SAMPLE_NOW, mine).leftTrip).toBe(true);
    expect(toLine(gone, SAMPLE_NOW, null).leftTrip).toBe(false);
  });

  it('여행·코스 대상은 대상 번호를 여행으로 본다', () => {
    const course = notification({ id: 'c', target: { type: 'ITINERARY', id: 'trip-x' } });
    expect(toLine(course, SAMPLE_NOW, new Set(['trip-1'])).leftTrip).toBe(true);
  });

  it('모두 읽음 시각은 가장 늦게 만든 알림', () => {
    expect(latestCreatedAt(sampleNotifications())).toBe('2026-11-18T11:40:00Z');
    expect(latestCreatedAt([])).toBeNull();
  });
});

describe('알림을 누르면 갈 곳', () => {
  const of = (type: string, id: string, extra: Partial<Parameters<typeof notification>[0]> = {}) =>
    destinationOf(notification({ id: 'x', target: { type, id }, ...extra }));

  it('대상 종류마다 화면 주소', () => {
    expect(of('TRIP', 'trip-1')).toEqual({ href: '/trips/trip-1', tripId: 'trip-1' });
    expect(of('ITINERARY', 'trip-1')).toEqual({ href: '/trips/trip-1/course', tripId: 'trip-1' });
    expect(of('POLL', 'poll-1', { tripId: 'trip-1' })).toEqual({
      href: '/trips/trip-1/polls/poll-1',
      tripId: 'trip-1',
    });
    expect(of('PROPOSAL', 'job-1', { tripId: 'trip-1' })).toEqual({
      href: '/trips/trip-1/proposal?jobId=job-1',
      tripId: 'trip-1',
    });
    expect(of('USER', 'u-1', { kind: 'FOLLOW_REQUESTED' })).toEqual({
      href: '/friends',
      tripId: null,
    });
    expect(of('USER', 'u-1', { kind: 'FOLLOW_ACCEPTED' })).toEqual({
      href: '/users/u-1',
      tripId: null,
    });
  });

  it('앱 내 여행 초대는 받은 초대 화면으로, 여행은 미리 받지 않는다', () => {
    expect(of('TRIP_INVITATION', 'inv-1', { kind: 'TRIP_INVITED', tripId: null })).toEqual({
      href: '/trip-invitations/inv-1',
      tripId: null,
    });
  });

  it('여행 번호가 필요한데 없으면 여행 탭, 모르는 대상은 없음', () => {
    expect(of('POLL', 'poll-1')).toEqual({ href: '/trips', tripId: null });
    expect(of('PROPOSAL', 'job-1')).toEqual({ href: '/trips', tripId: null });
    expect(of('FEED', 'f-1')).toBeNull();
    expect(destinationOf(notification({ id: 'y', target: null }))).toBeNull();
  });
});

describe('팝업 고르기', () => {
  it('안 읽은 행동 알림이 여럿이면 모아 보기', () => {
    const choice = pickPopup(samplePopupItems(), new Set());
    expect(choice?.kind).toBe('many');
    expect(choice?.kind === 'many' && choice.items.map((n) => n.id)).toEqual(['p-1', 'p-2', 'p-3']);
  });

  it('투표 시작 하나뿐이면 투표 시작 팝업', () => {
    const [opened] = sampleNotifications();
    expect(pickPopup([opened], new Set())).toEqual({ kind: 'poll', item: opened });
  });

  it('행동이 아닌 알림, 읽은 알림, 이미 보여 준 알림은 고르지 않는다', () => {
    const items = sampleNotifications();
    // n-1 투표 시작, n-2 팔로우 요청만 안 읽은 행동 알림
    expect(pickPopup(items, new Set(['n-1', 'n-2']))).toBeNull();
    const choice = pickPopup(items, new Set(['n-1']));
    expect(choice?.kind === 'many' && choice.items.map((n) => n.id)).toEqual(['n-2']);
  });
});
