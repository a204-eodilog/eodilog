import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';

import { devRealtime } from '@/realtime/dev-transport';

import type { Trip, UserCard } from './types';

/**
 * 개발용 테스트 모드의 가짜 채팅 서버(specs/20261105-142623-trip-group-chat/contracts/chat-api.md).
 * 메시지를 저장하면 실시간 이벤트를 메모리 전달(src/realtime/dev-transport.ts)로 바로 보낸다.
 * 여행 목록(dev-mock.ts의 trips)에 없는 여행의 방은 서버처럼 404다. 나가기·삭제·차단 흉내가 여기로 이어진다
 */

type Message = {
  id: string;
  roomId: string;
  sequence: number;
  senderId: string | null;
  type: 'TEXT' | 'SYSTEM';
  text: string | null;
  clientMessageId: string | null;
  eventId: string | null;
  target: { type: string; id: string } | null;
  eventReadAt: string | null;
  createdAt: string;
  deletedAt: string | null;
};

type Room = { id: string; tripId: string; messages: Message[] };

type Helpers = {
  getTrips(): Trip[];
  me: UserCard;
  ok<T>(config: InternalAxiosRequestConfig, data: T, status?: number): AxiosResponse<T>;
  fail(config: InternalAxiosRequestConfig, status: number, code: string, message: string): Error;
};

const CHAT_DESTINATION = '/user/queue/chat';
const MAX_TEXT = 1000;
const MINUTE = 60_000;

export function createChatMock({ getTrips, me, ok, fail }: Helpers) {
  const rooms = new Map<string, Room>();
  let skipNextEvent = false;
  let dropNextResponse = false;

  function roomOf(tripId: string): Room {
    let room = rooms.get(tripId);
    if (!room) {
      room = { id: `room-${tripId}`, tripId, messages: [] };
      rooms.set(tripId, room);
      seed(room);
    }
    return room;
  }

  function add(room: Room, over: Partial<Message> & { createdAt: string }): Message {
    const sequence = room.messages.length + 1;
    const message: Message = {
      id: `msg-${room.id}-${sequence}`,
      roomId: room.id,
      sequence,
      senderId: null,
      type: 'TEXT',
      text: null,
      clientMessageId: null,
      eventId: null,
      target: null,
      eventReadAt: null,
      deletedAt: null,
      ...over,
    };
    room.messages.push(message);
    return message;
  }

  function memberIds(tripId: string): string[] {
    return (
      getTrips()
        .find((t) => t.id === tripId)
        ?.members.map((m) => m.user.id) ?? []
    );
  }

  /** 예시 대화. 날짜가 바뀌는 곳, 내 것·남의 것, 지운 메시지, 나간 사람 메시지가 섞인다 */
  function seed(room: Room) {
    const others = memberIds(room.tripId).filter((id) => id !== me.id);
    if (others.length === 0) return;
    const base = Date.now() - 26 * 60 * MINUTE;
    const at = (minutes: number) => new Date(base + minutes * MINUTE).toISOString();
    // 동행이 많은 방은 지난 대화를 길게 두어 위로 올려 더 받기(30개 다음 50개)를 확인한다
    if (others.length >= 4) {
      for (let i = 0; i < 40; i += 1) {
        add(room, {
          senderId: others[i % others.length],
          text: `지난 대화 ${i + 1}`,
          createdAt: new Date(base - (3 * 24 * 60 - i * 10) * MINUTE).toISOString(),
        });
      }
    }
    const lines: [string | null, string][] = [
      [others[0], '여행 날짜 정해졌네요!'],
      [me.id, '네 이번엔 꼭 가요'],
      ['user-left', '저는 이번엔 못 갈 것 같아요'],
      [others[1] ?? others[0], '숙소는 바다 쪽으로 볼까요?'],
      [others[0], '좋아요. 후보 몇 개 모아 둘게요'],
    ];
    lines.forEach(([senderId, text], i) => add(room, { senderId, text, createdAt: at(i * 3) }));
    add(room, {
      senderId: others[0],
      text: null,
      deletedAt: at(30),
      createdAt: at(20),
    });
    // 시스템 메시지 예시. 서버는 아직 SYSTEM 메시지를 만들지 않는다(채팅 명세 US5). 종류별 카드를 보려고 넣는다
    if (room.tripId === 'trip-1') {
      const system = (target: Message['target'], text: string | null, minutes: number) =>
        add(room, { type: 'SYSTEM', target, text, createdAt: at(minutes) });
      system({ type: 'POLL', id: 'poll-1' }, '투표가 시작됐어요\n후보 3곳 · 내일 21:00 마감', 22);
      system({ type: 'ITINERARY', id: room.tripId }, null, 24);
      system({ type: 'SOMETHING_NEW', id: 'x' }, '새로운 종류의 소식이에요', 25);
      system(null, null, 26);
    }
    const today = Date.now() - 50 * MINUTE;
    const todayLines = ['오늘 저녁에 같이 정해요', '7시 어때요?', '좋아요', '그때 봐요'];
    todayLines.forEach((text, i) =>
      add(room, {
        senderId: i % 2 === 0 ? (others[1] ?? others[0]) : me.id,
        text,
        createdAt: new Date(today + i * 2 * MINUTE).toISOString(),
      }),
    );
  }

  function participants(trip: Trip): UserCard[] {
    return [...trip.members].sort((a, b) => a.joinOrder - b.joinOrder).map((m) => m.user);
  }

  function chatRoom(trip: Trip) {
    const room = roomOf(trip.id);
    return {
      id: room.id,
      type: 'TRIP',
      tripId: trip.id,
      participants: participants(trip),
      lastMessage: room.messages[room.messages.length - 1] ?? null,
    };
  }

  /** 지금 접근할 수 있는 방. 여행 목록에 없거나 내가 멤버가 아니면 없다 */
  function accessibleTrip(roomId: string): Trip | undefined {
    const trip = getTrips().find((t) => `room-${t.id}` === roomId);
    if (!trip || !trip.members.some((m) => m.user.id === me.id)) return undefined;
    return trip;
  }

  function publish(message: Message) {
    if (skipNextEvent) {
      skipNextEvent = false;
      return;
    }
    devRealtime.publish(CHAT_DESTINATION, {
      type: 'MESSAGE_CREATED',
      roomId: message.roomId,
      message,
    });
  }

  function handle(
    config: InternalAxiosRequestConfig,
    method: string,
    url: string,
    params: Record<string, string>,
  ): AxiosResponse | null {
    if (method === 'get' && url === '/chat/rooms') {
      // 방을 만든 역순(여행 목록이 이미 만든 역순이다)
      const data = getTrips()
        .filter((t) => t.members.some((m) => m.user.id === me.id))
        .map(chatRoom);
      return ok(config, { data, page: { nextCursor: null, hasNext: false } });
    }

    const tripRoom = /^\/trips\/([^/]+)\/chat-room$/.exec(url);
    if (method === 'get' && tripRoom) {
      const trip = getTrips().find((t) => t.id === tripRoom[1]);
      if (!trip || !trip.members.some((m) => m.user.id === me.id)) {
        throw fail(config, 404, 'TRIP_NOT_FOUND', '여행을 찾을 수 없습니다.');
      }
      return ok(config, { data: chatRoom(trip) });
    }

    const messagesMatch = /^\/chat\/rooms\/([^/]+)\/messages$/.exec(url);
    if (!messagesMatch) return null;
    const trip = accessibleTrip(messagesMatch[1]);
    if (!trip) throw fail(config, 404, 'CHAT_ROOM_NOT_FOUND', '채팅방을 찾을 수 없습니다.');
    const room = roomOf(trip.id);

    if (method === 'get') {
      if (params.cursor) throw fail(config, 400, 'VALIDATION_ERROR', 'cursor는 쓸 수 없습니다.');
      const limit = Number(params.limit ?? 20);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw fail(config, 400, 'VALIDATION_ERROR', '페이지 크기를 확인해 주세요.');
      }
      const before = params.beforeSequence ? Number(params.beforeSequence) : Infinity;
      const older = room.messages.filter((m) => m.sequence < before);
      const data = older.slice(-limit).reverse();
      const hasNext = older.length > data.length;
      return ok(config, {
        data,
        page: { nextBeforeSequence: hasNext ? data[data.length - 1].sequence : null, hasNext },
      });
    }

    if (method === 'post') {
      const body = JSON.parse(String(config.data ?? '{}')) as {
        clientMessageId?: string;
        text?: string;
      };
      const text = body.text ?? '';
      if (!body.clientMessageId || text.trim() === '' || text.includes('\0')) {
        throw fail(config, 400, 'VALIDATION_ERROR', '메시지를 확인해 주세요.');
      }
      if (Array.from(text).length > MAX_TEXT) {
        throw fail(config, 400, 'VALIDATION_ERROR', '1,000자까지 보낼 수 있습니다.');
      }
      const existing = [...rooms.values()]
        .flatMap((r) => r.messages)
        .find((m) => m.senderId === me.id && m.clientMessageId === body.clientMessageId);
      if (existing) {
        if (existing.roomId !== room.id || existing.text !== text) {
          throw fail(config, 409, 'CLIENT_MESSAGE_ID_REUSED', '이미 쓴 clientMessageId입니다.');
        }
        // 같은 메시지를 다시 보냈다. 처음 메시지를 돌려주고 이벤트는 다시 보내지 않는다
        return ok(config, { data: existing }, 201);
      }
      const message = add(room, {
        senderId: me.id,
        text,
        clientMessageId: body.clientMessageId,
        createdAt: new Date().toISOString(),
      });
      publish(message);
      if (dropNextResponse) {
        dropNextResponse = false;
        throw new AxiosError('Network Error', 'ERR_NETWORK', config);
      }
      return ok(config, { data: message }, 201);
    }
    return null;
  }

  /** 웹 콘솔 globalThis.__devMock.chat.* 로 부른다(contracts/realtime.md "테스트 모드") */
  const controls = {
    /** 끊김 흉내. 다시 연결도 실패한다 */
    dropConnection() {
      devRealtime.drop();
    },
    /** 확인용: 메모리 연결 상태와 방별 메시지 수 */
    debug() {
      return {
        ...devRealtime.debug(),
        rooms: [...rooms.values()].map((r) => [r.id, r.messages.length]),
      };
    },
    /** 다시 연결 흉내 */
    restore() {
      devRealtime.restore();
    },
    /** 다른 동행이 보낸 메시지 흉내 */
    incoming(tripId: string, text = '새 메시지예요') {
      const sender = memberIds(tripId).find((id) => id !== me.id);
      if (!sender) return;
      publish(add(roomOf(tripId), { senderId: sender, text, createdAt: new Date().toISOString() }));
    },
    /** 다음 실시간 이벤트 하나를 빠뜨린다(빈칸 만들기) */
    skipNext() {
      skipNextEvent = true;
    },
    /** 다음 보내기를 저장만 하고 응답은 실패시킨다(다시 보내기 중복 확인) */
    dropResponse() {
      dropNextResponse = true;
    },
    /** 긴 대화 만들기(스크롤 성능 측정) */
    seedLongRoom(tripId: string, count = 1000) {
      const room = roomOf(tripId);
      const sender = memberIds(tripId).find((id) => id !== me.id) ?? me.id;
      const start = Date.now() - count * MINUTE;
      for (let i = 0; i < count; i += 1) {
        add(room, {
          senderId: i % 3 === 0 ? me.id : sender,
          text: `긴 대화 ${i + 1}번째 메시지${i % 7 === 0 ? '. 줄이 길어지면 말풍선 안에서 다음 줄로 넘어가는지 함께 봅니다' : ''}`,
          createdAt: new Date(start + i * MINUTE).toISOString(),
        });
      }
    },
  };

  return { handle, controls };
}
