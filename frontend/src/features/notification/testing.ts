import type { NotificationView } from './types';

/**
 * 테스트와 /dev/notifications 미리보기 예시. Figma S49 기본 201-25921의 줄을 따른다.
 * 기준 시각은 서울 2026-11-18(수) 21:00
 */
export const SAMPLE_NOW = new Date('2026-11-18T12:00:00Z');

export function notification(over: Partial<NotificationView> & { id: string }): NotificationView {
  return {
    eventId: `event-${over.id}`,
    kind: 'COURSE_CHANGED',
    message: null,
    target: { type: 'ITINERARY', id: 'trip-1' },
    tripId: null,
    readAt: null,
    createdAt: SAMPLE_NOW.toISOString(),
    ...over,
  };
}

const READ = '2026-11-18T12:00:00Z';

export function sampleNotifications(): NotificationView[] {
  return [
    notification({
      id: 'n-1',
      kind: 'POLL_OPENED',
      message: '겨울 여행 투표가 시작됐어요.',
      target: { type: 'POLL', id: 'poll-1' },
      tripId: 'trip-1',
      createdAt: '2026-11-18T11:40:00Z',
    }),
    notification({
      id: 'n-2',
      kind: 'FOLLOW_REQUESTED',
      message: '지호님이 팔로우를 요청했어요.',
      target: { type: 'USER', id: 'user-jiho' },
      createdAt: '2026-11-18T10:02:00Z',
    }),
    notification({
      id: 'n-3',
      kind: 'FOLLOW_ACCEPTED',
      message: '도윤님이 팔로우 요청을 수락했어요.',
      target: { type: 'USER', id: 'user-doyun' },
      createdAt: '2026-11-18T09:30:00Z',
    }),
    notification({
      id: 'n-4',
      kind: 'TRIP_INFO_CHANGED',
      message: '겨울 여행의 기간이 바뀌었어요.',
      target: { type: 'TRIP', id: 'trip-1' },
      readAt: READ,
      createdAt: '2026-11-18T07:20:00Z',
    }),
    notification({
      id: 'n-5',
      kind: 'POLL_REMINDER',
      message: '겨울 여행 투표 마감 1시간 전이에요.',
      target: { type: 'POLL', id: 'poll-1' },
      tripId: 'trip-1',
      readAt: READ,
      createdAt: '2026-11-17T03:00:00Z',
    }),
    notification({
      id: 'n-6',
      kind: 'COURSE_CHANGED',
      message: '승기님이 코스를 수정했어요.',
      readAt: READ,
      createdAt: '2026-11-14T05:00:00Z',
    }),
    notification({
      id: 'n-7',
      kind: 'POLL_FINALIZED',
      message: '"겨울 여행" 투표가 마감됐어요. 결과를 확인해 보세요.',
      target: { type: 'POLL', id: 'poll-0' },
      tripId: 'trip-1',
      readAt: READ,
      createdAt: '2026-10-27T03:00:00Z',
    }),
    notification({
      id: 'n-8',
      kind: 'TRIP_MEMBER_JOINED',
      message: '세은님, 승기님이 겨울 여행에 참여했어요.',
      target: { type: 'TRIP', id: 'trip-1' },
      readAt: READ,
      createdAt: '2026-10-26T03:00:00Z',
    }),
    notification({
      id: 'n-9',
      kind: 'POLL_OPENED',
      message: '가을 소풍 투표가 시작됐어요.',
      target: { type: 'POLL', id: 'poll-9' },
      tripId: 'trip-gone',
      readAt: READ,
      createdAt: '2026-10-02T03:00:00Z',
    }),
  ];
}

/** Figma S48 미확인 알림 모아 보기 201-25425의 세 줄 */
export function samplePopupItems(): NotificationView[] {
  return [
    notification({
      id: 'p-1',
      kind: 'POLL_REMINDER',
      message: '겨울 여행 투표 마감 1시간 전이에요.',
      target: { type: 'POLL', id: 'poll-1' },
      tripId: 'trip-1',
      createdAt: '2026-11-18T11:30:00Z',
    }),
    notification({
      id: 'p-2',
      kind: 'FOLLOW_REQUESTED',
      message: '지호님이 팔로우를 요청했어요.',
      target: { type: 'USER', id: 'user-jiho' },
      createdAt: '2026-11-18T11:05:00Z',
    }),
    notification({
      id: 'p-3',
      kind: 'AI_PROPOSAL_READY',
      message: '비 예보로 일정 변경안이 나왔어요.',
      target: { type: 'PROPOSAL', id: 'job-1' },
      tripId: 'trip-1',
      createdAt: '2026-11-18T10:30:00Z',
    }),
  ];
}
