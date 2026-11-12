import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';

/**
 * 개발용 테스트 모드의 가짜 알림 서버(specs/20261109-155422-notifications/contracts/routes.md).
 * 알림 시각은 처음 받을 때의 지금을 기준으로 만든다. 'trip-gone'은 여행 목록에 없는 나간 여행이다.
 * 웹 콘솔: globalThis.__devMock.notification.push('POLL_OPENED') 새 알림, failNext() 다음 목록 실패
 */

type Item = {
  id: string;
  eventId: string;
  kind: string;
  message: string;
  target: { type: string; id: string } | null;
  tripId: string | null;
  readAt: string | null;
  createdAt: string;
};

type Helpers = {
  ok<T>(config: InternalAxiosRequestConfig, data: T, status?: number): AxiosResponse<T>;
  fail(config: InternalAxiosRequestConfig, status: number, code: string, message: string): Error;
};

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

type Seed = Omit<Item, 'id' | 'eventId' | 'readAt' | 'createdAt'> & { ago: number; read?: boolean };

/** 겨울 여행은 가짜 서버의 trip-5 */
const SEEDS: Seed[] = [
  {
    kind: 'POLL_OPENED',
    message: '겨울 여행 투표가 시작됐어요.',
    target: { type: 'POLL', id: 'poll-1' },
    tripId: 'trip-5',
    ago: 20 * MINUTE,
  },
  {
    kind: 'FOLLOW_REQUESTED',
    message: '지호님이 팔로우를 요청했어요.',
    target: { type: 'USER', id: 'user-2' },
    tripId: null,
    ago: 95 * MINUTE,
  },
  {
    kind: 'FOLLOW_ACCEPTED',
    message: '도윤님이 팔로우 요청을 수락했어요.',
    target: { type: 'USER', id: 'user-3' },
    tripId: null,
    ago: 130 * MINUTE,
  },
  {
    kind: 'TRIP_INFO_CHANGED',
    message: '겨울 여행의 기간이 바뀌었어요.',
    target: { type: 'TRIP', id: 'trip-5' },
    tripId: 'trip-5',
    ago: 4 * 60 * MINUTE,
    read: true,
  },
  {
    kind: 'POLL_REMINDER',
    message: '겨울 여행 투표 마감 1시간 전이에요.',
    target: { type: 'POLL', id: 'poll-1' },
    tripId: 'trip-5',
    ago: DAY + 3 * 60 * MINUTE,
    read: true,
  },
  {
    kind: 'COURSE_CHANGED',
    message: '승기님이 코스를 수정했어요.',
    target: { type: 'ITINERARY', id: 'trip-1' },
    tripId: 'trip-1',
    ago: 4 * DAY,
    read: true,
  },
  {
    kind: 'POLL_FINALIZED',
    message: '"겨울 여행" 투표가 마감됐어요. 결과를 확인해 보세요.',
    target: { type: 'POLL', id: 'poll-0' },
    tripId: 'trip-5',
    ago: 22 * DAY,
    read: true,
  },
  {
    kind: 'TRIP_MEMBER_JOINED',
    message: '세은님, 승기님이 겨울 여행에 참여했어요.',
    target: { type: 'TRIP', id: 'trip-5' },
    tripId: 'trip-5',
    ago: 23 * DAY,
    read: true,
  },
  {
    kind: 'POLL_OPENED',
    message: '가을 소풍 투표가 시작됐어요.',
    target: { type: 'POLL', id: 'poll-9' },
    tripId: 'trip-gone',
    ago: 47 * DAY,
    read: true,
  },
];

const PUSH_SAMPLES: Record<string, Omit<Seed, 'ago'>> = {
  POLL_OPENED: {
    kind: 'POLL_OPENED',
    message: '부산 바다 여행 투표가 시작됐어요.',
    target: { type: 'POLL', id: 'poll-2' },
    tripId: 'trip-1',
  },
  AI_PROPOSAL_READY: {
    kind: 'AI_PROPOSAL_READY',
    message: '비 예보로 일정 변경안이 나왔어요.',
    target: { type: 'PROPOSAL', id: 'job-1' },
    tripId: 'trip-1',
  },
  COURSE_CHANGED: {
    kind: 'COURSE_CHANGED',
    message: '세은님이 코스를 수정했어요.',
    target: { type: 'ITINERARY', id: 'trip-1' },
    tripId: 'trip-1',
  },
};

export function createNotificationMock({ ok, fail }: Helpers) {
  let items: Item[] | null = null;
  let seq = 0;
  let failNext = false;

  function make(seed: Omit<Seed, 'ago'>, createdAt: Date, read: boolean): Item {
    seq += 1;
    return {
      id: `noti-${seq}`,
      eventId: `event-${seq}`,
      kind: seed.kind,
      message: seed.message,
      target: seed.target,
      tripId: seed.tripId,
      readAt: read ? new Date().toISOString() : null,
      createdAt: createdAt.toISOString(),
    };
  }

  function list(): Item[] {
    if (!items) {
      const now = Date.now();
      items = SEEDS.map((s) => make(s, new Date(now - s.ago), s.read === true));
    }
    return items;
  }

  function handle(
    config: InternalAxiosRequestConfig,
    method: string,
    url: string,
    params: Record<string, string>,
  ): AxiosResponse | null {
    if (method === 'get' && url === '/me/notification-summary') {
      const unreadCount = list().filter((n) => n.readAt === null).length;
      return ok(config, { data: { unreadCount, asOf: new Date().toISOString() } });
    }
    if (method === 'get' && url === '/me/notifications') {
      if (failNext) {
        failNext = false;
        throw fail(config, 503, 'SERVICE_UNAVAILABLE', '잠시 후 다시 시도해 주세요.');
      }
      const unreadOnly = String(params.unreadOnly) === 'true';
      const limit = Number(params.limit ?? 20);
      const start = Number(params.cursor ?? 0);
      const all = list().filter((n) => !unreadOnly || n.readAt === null);
      const page = all.slice(start, start + limit);
      const next = start + limit < all.length ? String(start + limit) : null;
      return ok(config, { data: page, page: { nextCursor: next, hasNext: next !== null } });
    }
    if (method === 'post' && url === '/me/notifications/read-all') {
      const body = JSON.parse(String(config.data ?? '{}')) as { through?: string };
      const through = body.through ? new Date(body.through).getTime() : Date.now();
      let updatedCount = 0;
      for (const n of list()) {
        if (n.readAt === null && new Date(n.createdAt).getTime() <= through) {
          n.readAt = new Date().toISOString();
          updatedCount += 1;
        }
      }
      return ok(config, { data: { updatedCount } });
    }
    // 같은 소식(eventId)의 알림을 읽음으로. 채팅 시스템 카드를 열 때 쓴다
    const event = /^\/me\/events\/([^/]+)\/read$/.exec(url);
    if (event && method === 'post') {
      const found = list().find((n) => n.eventId === event[1]);
      if (!found) throw fail(config, 404, 'EVENT_NOT_FOUND', '이벤트를 찾을 수 없습니다.');
      found.readAt = found.readAt ?? new Date().toISOString();
      return ok(config, { data: { eventId: found.eventId, readAt: found.readAt } });
    }
    const one = /^\/me\/notifications\/([^/]+)$/.exec(url);
    if (one) {
      const found = list().find((n) => n.id === one[1]);
      if (!found) throw fail(config, 404, 'NOTIFICATION_NOT_FOUND', '알림을 찾을 수 없습니다.');
      if (method === 'patch') {
        found.readAt = found.readAt ?? new Date().toISOString();
        return ok(config, { data: found });
      }
      if (method === 'delete') {
        items = list().filter((n) => n !== found);
        return ok(config, null, 204);
      }
    }
    return null;
  }

  const controls = {
    /** 맨 위에 새 안 읽은 알림을 더한다. 앱을 다시 보면 팝업으로 뜬다 */
    push(kind: keyof typeof PUSH_SAMPLES = 'POLL_OPENED') {
      list().unshift(make(PUSH_SAMPLES[kind], new Date(), false));
    },
    /** 다음 목록 요청 하나를 503으로 */
    failNext() {
      failNext = true;
    },
    peek() {
      return list();
    },
  };

  return { handle, controls };
}
