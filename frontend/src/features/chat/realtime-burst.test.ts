import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { InfiniteQueryObserver, QueryClient, QueryObserver } from '@tanstack/react-query';

import type { PageResponse, UserCard } from '@/api/types';
import { ME_QUERY_KEY } from '@/hooks/use-me';

import { getChatRooms, getTripChatRoom } from './api';
import { CHAT_ROOMS_KEY, chatMessagesKey, chatRoomKey } from './hooks/chat-keys';
import { emptyWindow, mergeMessages } from './message-merge';
import { applyChatEvent } from './realtime-chat';
import { clearRoomIndex, rememberRooms } from './room-index';
import { msg, range } from './testing';
import type { ChatRoom, Message } from './types';

/**
 * 실시간 메시지가 몰릴 때 대화방 목록·방 정보 요청이 몇 번 나가는지(트러블슈팅 D2).
 * 앱이 모르는 방(새로 초대된 여행)이나 모르는 보낸 사람(새 동행)의 메시지가 오면 목록·방 정보를 다시 받는다.
 * 메시지가 연달아 오면 그때마다 다시 받기를 시작해 요청이 메시지 수만큼 나갈 수 있다
 */

jest.mock('@/config/env', () => ({
  env: { appEnv: 'local', apiBaseUrl: 'http://test', kakaoRedirectUri: null, devMock: false },
}));
jest.mock('@/realtime', () => ({ realtime: { subscribe: jest.fn() } }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'cid-1' }));
jest.mock('./api', () => ({
  getChatRooms: jest.fn(),
  getTripChatRoom: jest.fn(),
  getMessages: jest.fn(),
  sendMessage: jest.fn(),
  CATCH_UP_LIMIT: 100,
}));

const mockRooms = jest.mocked(getChatRooms);
const mockRoom = jest.mocked(getTripChatRoom);

const person = (id: string): UserCard => ({
  id,
  nickname: id,
  profileImageUrl: null,
  accountVisibility: 'PUBLIC',
  followingStatus: 'NONE',
  followedByStatus: 'NONE',
});

const ROOM_1: ChatRoom = {
  id: 'room-1',
  type: 'TRIP',
  tripId: 'trip-1',
  participants: [person('me'), person('b')],
  lastMessage: msg(10),
};
const ROOM_9: ChatRoom = {
  id: 'room-9',
  type: 'TRIP',
  tripId: 'trip-9',
  participants: [person('me'), person('c')],
  lastMessage: null,
};

const event = (m: Message) => ({ type: 'MESSAGE_CREATED', roomId: m.roomId, message: m });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** 서버 응답 시간(가짜). 이 사이에 메시지가 더 온다 */
const SERVER_MS = 60;

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  qc.setQueryData(ME_QUERY_KEY, { id: 'me' });
  clearRoomIndex();
  rememberRooms([ROOM_1]);
  qc.setQueryData(chatMessagesKey('trip-1'), mergeMessages(emptyWindow('room-1'), range(1, 10)));
  // 채팅 탭과 대화방 화면이 떠 있는 것처럼 목록·방 정보 쿼리를 지켜본다(지켜보는 쿼리만 다시 받는다)
  const rooms = new InfiniteQueryObserver(qc, {
    queryKey: CHAT_ROOMS_KEY,
    queryFn: ({ pageParam }) => getChatRooms(pageParam as string | null),
    initialPageParam: null as string | null,
    getNextPageParam: (last: PageResponse<ChatRoom>) =>
      last.page.hasNext ? last.page.nextCursor : undefined,
  });
  const room = new QueryObserver(qc, {
    queryKey: chatRoomKey('trip-1'),
    queryFn: () => getTripChatRoom('trip-1'),
  });
  const unsubs = [rooms.subscribe(() => undefined), room.subscribe(() => undefined)];
  return { qc, stop: () => unsubs.forEach((u) => u()) };
}

beforeEach(() => {
  mockRooms.mockReset();
  mockRoom.mockReset();
});

afterEach(() => {
  clearRoomIndex();
});

describe('실시간 메시지가 몰릴 때 목록 요청', () => {
  it('모르는 방에서 메시지 20개가 연달아 와도 대화방 목록 요청은 한 번이다', async () => {
    // 서버는 처음엔 room-1만, 새 방이 생긴 뒤에는 room-9도 준다
    let invited = false;
    mockRooms.mockImplementation(async () => {
      const data = invited ? [ROOM_1, ROOM_9] : [ROOM_1];
      await sleep(SERVER_MS);
      return { data, page: { nextCursor: null, hasNext: false } };
    });
    mockRoom.mockImplementation(async () => ROOM_1);
    const { qc, stop } = setup();
    await sleep(SERVER_MS + 20); // 처음 목록 받기
    mockRooms.mockClear();

    // 새 여행에 초대됐고, 그 단톡방에서 메시지 20개가 5ms 간격으로 온다
    invited = true;
    for (let s = 1; s <= 20; s += 1) {
      applyChatEvent(qc, event(msg(s, { roomId: 'room-9', senderId: 'c' })));
      await sleep(5);
    }
    await sleep(SERVER_MS * 3);
    const requests = mockRooms.mock.calls.length;
    console.log(`[measure] 모르는 방 메시지 20개 → 대화방 목록 요청 ${requests}번`);
    stop();
    expect(requests).toBe(1);
  });

  it('새 동행이 메시지 20개를 연달아 보내도 방 정보·목록 요청은 각각 한 번이다', async () => {
    mockRooms.mockImplementation(async () => {
      await sleep(SERVER_MS);
      return { data: [ROOM_1], page: { nextCursor: null, hasNext: false } };
    });
    // 방 정보 응답이 오면 새 동행(newbie)이 참여자에 들어 있다
    mockRoom.mockImplementation(async () => {
      await sleep(SERVER_MS);
      return { ...ROOM_1, participants: [...ROOM_1.participants, person('newbie')] };
    });
    const { qc, stop } = setup();
    await sleep(SERVER_MS + 20);
    mockRooms.mockClear();
    mockRoom.mockClear();
    qc.setQueryData(chatRoomKey('trip-1'), ROOM_1);

    for (let s = 11; s <= 30; s += 1) {
      applyChatEvent(qc, event(msg(s, { senderId: 'newbie' })));
      await sleep(5);
    }
    await sleep(SERVER_MS * 3);
    const roomRequests = mockRoom.mock.calls.length;
    const listRequests = mockRooms.mock.calls.length;
    console.log(
      `[measure] 새 동행 메시지 20개 → 방 정보 요청 ${roomRequests}번, 목록 요청 ${listRequests}번`,
    );
    stop();
    expect(roomRequests).toBe(1);
    expect(listRequests).toBe(1);
  });
});
